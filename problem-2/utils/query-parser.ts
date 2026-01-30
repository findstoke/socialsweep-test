import { normalizeLocation, normalizeTitle, normalizeFundingStage, normalizeText } from './normalization';
import { SearchQuery } from '../types';

/** Extended query interface with parsed and normalized fields */
export interface ParsedQuery extends SearchQuery {
  /** Expanded text variations for synonym matching */
  expandedText: string[];
  /** Normalized filter values */
  normalizedFilters?: {
      location?: string;
      role?: string;
      fundingStage?: string;
      company?: string;
      industry?: string;
      minFunding?: number;
      tags?: string[];
  };
}

/**
 * Parse and normalize a search query for improved matching.
 * Extracts filters from natural language, expands synonyms, and normalizes values.
 */
export const parseAndNormalizeQuery = (query: SearchQuery): ParsedQuery => {
    const enrichedQuery = { ...query };
    
    // 1. Normalize Text
    enrichedQuery.text = normalizeText(enrichedQuery.text);

    // 2. Infer Entity Type if not set
    if (!enrichedQuery.entityType || enrichedQuery.entityType === 'both') {
      const text = enrichedQuery.text;
      if (/\b(engineer|developer|cto|ceo|founder|people|person)\b/.test(text)) {
        enrichedQuery.entityType = 'person';
      } else if (/\b(company|startup|firm|agency)s?\b/.test(text)) {
        enrichedQuery.entityType = 'organization';
      }
    }

    // 3. Infer Filters from Text
    if (!enrichedQuery.filters) enrichedQuery.filters = {};

    // "in [Location]" pattern
    // Only if not explicitly set
    if (!enrichedQuery.filters.location) {
        const locationMatch = enrichedQuery.text.match(/\bin\s+([a-z\s]{2,30})\b/);
        if (locationMatch) {
            const candidate = locationMatch[1].trim();
            // Guard against non-locations
            if (!/\b(startup|company|series)\b/.test(candidate)) {
                enrichedQuery.filters.location = candidate;
                enrichedQuery.text = enrichedQuery.text.replace(locationMatch[0], "").trim();
            }
        }
    }

    // Extract Funding Stage FIRST (e.g. "Series A", "Seed")
    // This must run before "at [Company]" pattern to avoid "at Series A" being parsed as company
    if (!enrichedQuery.filters.fundingStage) {
        const fundingMatch = enrichedQuery.text.match(/\b(series [a-e]|seed|pre-?seed|ipo)\b/i);
        if (fundingMatch) {
            enrichedQuery.filters.fundingStage = fundingMatch[0];
            // Remove "at" before funding stage if present (e.g., "at Series A" -> "")
            const atFundingPattern = new RegExp(`\\bat\\s+${fundingMatch[0]}\\b`, 'i');
            if (atFundingPattern.test(enrichedQuery.text)) {
                enrichedQuery.text = enrichedQuery.text.replace(atFundingPattern, "").trim();
            } else {
                enrichedQuery.text = enrichedQuery.text.replace(fundingMatch[0], "").trim();
            }
        }
    }

    // "at [Company]" pattern (runs after funding stage extraction)
    if (!enrichedQuery.filters.company) {
        // Match "at [Company]" where Company is 2 words max to avoid over-matching
        // e.g. "at Meta", "at TechStart Inc"
        const companyMatch = enrichedQuery.text.match(/\bat\s+([a-zA-Z0-9\s]{2,30})\b/);
        if (companyMatch) {
            const candidate = companyMatch[1].trim().toLowerCase();
            // Guard against common non-company words/phrases
            const ignoredWords = [
                'least', 'most', 'the', 'home', 'work', 'school', 'university', 'series',
                'funded', 'company', 'funded company', 'startup', 'startups', 'a'
            ];
            // Also check if candidate is just generic descriptors
            const isGenericDescriptor = /^(funded|a|the|any|some)\s+(company|startup|firm|org)s?$/.test(candidate);
            if (!ignoredWords.includes(candidate) && !isGenericDescriptor) {
                 enrichedQuery.filters.company = companyMatch[1].trim();
                 enrichedQuery.text = enrichedQuery.text.replace(companyMatch[0], "").trim();
            }
        }
    }

    // 4. Normalize filters
    const normalizedFilters = { ...enrichedQuery.filters };
    if (normalizedFilters.location) {
        normalizedFilters.location = normalizeLocation(normalizedFilters.location);
    }
    if (normalizedFilters.role) {
        normalizedFilters.role = normalizeTitle(normalizedFilters.role);
    }
    if (normalizedFilters.fundingStage) {
        normalizedFilters.fundingStage = normalizeFundingStage(normalizedFilters.fundingStage);
    }

    // 5. Expand Search Text (Synonyms)
    const expandedText = expandSearchText(enrichedQuery.text);

    return {
        ...enrichedQuery,
        normalizedFilters,
        expandedText
    };
};

const expandSearchText = (text: string): string[] => {
    const textLower = text.toLowerCase().trim();
    const variations = new Set<string>();
    variations.add(textLower);

    // Simple synonym dictionary for expansion
    // In a real system, this might come from an external graph or embedding
    const synonyms: Record<string, string[]> = {
        // Role/title synonyms
        "software engineer": ["developer", "coder", "programmer", "swe", "dev", "software developer"],
        "developer": ["software engineer", "coder", "programmer", "dev", "software developer"],
        "software developer": ["software engineer", "developer", "coder", "dev"],
        "dev": ["software engineer", "developer", "coder", "software developer"],
        "cto": ["chief technology officer", "tech lead"],
        "ceo": ["chief executive officer", "founder"],
        "startup": ["new company", "tech company", "venture"],
        "vc": ["venture capital", "investor"],
        "marketing": ["growth", "brand"],
        // Nickname expansions
        "mike": ["michael"],
        "michael": ["mike"],
        "matt": ["matthew"],
        "matthew": ["matt"],
        "dan": ["daniel"],
        "daniel": ["dan"],
        "sam": ["samuel", "samantha"],
        "bob": ["robert"],
        "robert": ["bob", "rob"],
        "bill": ["william"],
        "william": ["will", "bill"],
        "joe": ["joseph"],
        "joseph": ["joe"],
        "jen": ["jennifer"],
        "jennifer": ["jen", "jenny"],
        "alex": ["alexander", "alexandra"],
    };

    // Check for exact phrases
    if (synonyms[textLower]) {
        synonyms[textLower].forEach(v => variations.add(v));
    }

    // Check for word-level synonyms (naïve approach)
    const words = textLower.split(/\s+/);
    words.forEach(word => {
        if (synonyms[word]) {
            synonyms[word].forEach(syn => {
                // simple expansion: add the synonym as a separate search term check
                variations.add(syn);
            });
        }
    });

    return Array.from(variations);
};
