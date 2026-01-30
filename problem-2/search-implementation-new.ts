import { 
  Person, 
  Organization, 
  SearchQuery, 
  SearchResult, 
  MatchGrade,
  ProcessedPerson, 
  ProcessedOrganization 
} from './types';
import { parseAndNormalizeQuery, ParsedQuery } from './utils/query-parser';
import { levenshteinDistance } from './utils/normalization';

// Re-export sample data for backward compatibility
export { samplePeople, sampleOrganizations } from './data/sample-data';

/**
 * Enhanced Search Service for finding people and organizations.
 * 
 * Features:
 * - Fuzzy matching on names, titles, roles, locations
 * - Synonym expansion for common terms
 * - Hard filters for location, role, funding stage, and company
 * - Soft scoring for relevance ranking
 * - Recency and completeness boosts
 * - Investor relationship search
 * - Tags-based matching
 * 
 * @example
 * ```typescript
 * const service = new SearchService(people, organizations);
 * const results = service.search({ text: 'software engineer in SF' });
 * ```
 */
export class SearchService {
  private readonly people: readonly Person[];
  private readonly organizations: readonly Organization[];
  private readonly processedPeople: ProcessedPerson[];
  private readonly processedOrganizations: ProcessedOrganization[];
  private readonly orgMap: Map<string, Organization>;

  /**
   * Create a new SearchService instance.
   * @param people - Array of Person entities to search
   * @param organizations - Array of Organization entities to search
   */
  constructor(people?: Person[], organizations?: Organization[]) {
    this.people = Object.freeze(people ?? []);
    this.organizations = Object.freeze(organizations ?? []);
    this.orgMap = new Map();
    this.organizations.forEach(org => this.orgMap.set(org.name.toLowerCase(), org));
    this.processedPeople = this.preProcessPeople();
    this.processedOrganizations = this.preProcessOrganizations();
  }

  private preProcessPeople(): ProcessedPerson[] {
    return this.people.map(person => {
      const titleLower = person.title?.toLowerCase() || '';
      return {
        original: person,
        fullNameLower: person.fullName.toLowerCase(),
        titleLower,
        bioLower: person.bio?.toLowerCase() || '',
        cityLower: person.location?.city?.toLowerCase() || '',
        stateLower: person.location?.state?.toLowerCase() || '',
        countryLower: person.location?.country?.toLowerCase() || '',
        companyLower: person.company?.toLowerCase() || '',
        tagsLower: person.tags?.map(t => t.toLowerCase()) || [],
        titleTokens: titleLower.split(/\s+/).filter(t => t.length > 0),
        companyOrg: person.company ? this.orgMap.get(person.company.toLowerCase()) : undefined
      };
    });
  }

  private preProcessOrganizations(): ProcessedOrganization[] {
    return this.organizations.map(org => ({
      original: org,
      nameLower: org.name.toLowerCase(),
      industryLower: org.industry?.toLowerCase() || '',
      investorsLower: org.investors?.map(inv => inv.toLowerCase()) || []
    }));
  }

  /**
   * Search for people and organizations matching the given query.
   * 
   * @param query - Search query with text and optional filters
   * @returns Array of search results sorted by score (descending)
   * @throws Error if query text is empty or invalid
   * 
   * @example
   * ```typescript
   * // Simple text search
   * service.search({ text: 'software engineer' });
   * 
   * // With filters
   * service.search({
   *   text: 'CTO',
   *   filters: { location: 'SF', fundingStage: 'Series A' },
   *   entityType: 'person'
   * });
   * ```
   */
  search(query: SearchQuery): SearchResult[] {
    // Input validation
    if (!query) {
      throw new Error('Search query is required');
    }
    if (!query.text || typeof query.text !== 'string') {
      throw new Error('Search query text is required and must be a string');
    }
    if (query.text.trim().length === 0) {
      throw new Error('Search query text cannot be empty');
    }
    if (query.filters?.minFunding !== undefined && query.filters.minFunding < 0) {
      throw new Error('minFunding filter cannot be negative');
    }

    const enrichedQuery: ParsedQuery = parseAndNormalizeQuery(query);

    // Merge normalized filters
    if (enrichedQuery.normalizedFilters) {
      enrichedQuery.filters = { ...enrichedQuery.filters, ...enrichedQuery.normalizedFilters };
    }

    return this.executeSearch(enrichedQuery);
  }

  private executeSearch(query: ParsedQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const entityType = query.entityType || 'person';

    if (entityType === 'person' || entityType === 'both') {
      for (const processedPerson of this.processedPeople) {
        const result = this.searchPerson(processedPerson, query);
        if (result) results.push(result);
      }
      
      // Also search for people via organization executives
      // This enables queries like "find executives at TechStart"
      for (const org of this.organizations) {
        if (org.executives) {
          for (const exec of org.executives) {
            const execResult = this.searchExecutive(exec, org, query);
            if (execResult) {
              // Avoid duplicates - check if person already in results
              const isDuplicate = results.some(r => 
                r.person?.fullName.toLowerCase() === exec.name.toLowerCase()
              );
              if (!isDuplicate) {
                results.push(execResult);
              }
            }
          }
        }
      }
    }

    if (entityType === 'organization' || entityType === 'both') {
      for (const processedOrg of this.processedOrganizations) {
        const result = this.searchOrganization(processedOrg, query);
        if (result) results.push(result);
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Search for an executive from an organization's executive list.
   * Creates a synthetic Person result from executive data.
   */
  private searchExecutive(
    exec: { name: string; title: string; email?: string },
    org: Organization,
    query: ParsedQuery
  ): SearchResult | null {
    let score = 0;
    const matches: string[] = [];
    const expandedTextsLower = query.expandedText || [query.text.toLowerCase()];

    const nameLower = exec.name.toLowerCase();
    const titleLower = exec.title.toLowerCase();

    // Match on executive name
    for (const textLower of expandedTextsLower) {
      if (nameLower.includes(textLower)) {
        score += 0.4;
        matches.push(`executive name match`);
        break;
      }
    }

    // Match on executive title
    for (const textLower of expandedTextsLower) {
      const titleScore = this.calculateFuzzyScore(textLower, titleLower);
      if (titleScore > 0) {
        score += titleScore * 0.5;
        matches.push(`executive title match (${exec.title})`);
        break;
      }
    }

    // Company filter - if specified, must match this org
    if (query.filters?.company) {
      const companyFilter = query.filters.company.toLowerCase();
      const orgNameLower = org.name.toLowerCase();
      const companyScore = this.calculateFuzzyScore(companyFilter, orgNameLower);
      if (companyScore < 0.5) {
        return null; // Doesn't match company filter
      }
      score += companyScore * 0.3;
      matches.push(`company match (${org.name})`);
    } else {
      // Still boost for having company context
      score += 0.1;
      matches.push(`at ${org.name}`);
    }

    // Apply funding stage filter to the organization
    if (query.filters?.fundingStage) {
      if (!org.funding?.latestRound?.type) {
        return null;
      }
      const stageScore = this.calculateFuzzyScore(
        query.filters.fundingStage.toLowerCase(),
        org.funding.latestRound.type.toLowerCase()
      );
      if (stageScore < 0.5) {
        return null;
      }
      score += stageScore * 0.3;
      matches.push(`company funding stage (${org.funding.latestRound.type})`);
    }

    // Location filter
    if (query.filters?.location) {
      const loc = query.filters.location.toLowerCase();
      const cityMatch = org.location?.city?.toLowerCase().includes(loc) ? 1 : 0;
      const stateMatch = org.location?.state?.toLowerCase().includes(loc) ? 1 : 0;
      const countryMatch = org.location?.country?.toLowerCase().includes(loc) ? 1 : 0;
      const best = Math.max(cityMatch, stateMatch, countryMatch);
      if (best < 0.5) {
        return null;
      }
      score += 0.2;
      matches.push(`location match`);
    }

    // Role filter
    if (query.filters?.role) {
      const roleScore = this.calculateFuzzyScore(query.filters.role.toLowerCase(), titleLower);
      if (roleScore < 0.3) {
        return null;
      }
      score += roleScore * 0.3;
      matches.push(`role match (${exec.title})`);
    }

    if (score > 0) {
      // Create a synthetic Person from executive data
      const syntheticPerson: Person = {
        id: `exec-${org.id}-${exec.name.replace(/\s+/g, '-').toLowerCase()}`,
        fullName: exec.name,
        title: exec.title,
        company: org.name,
        location: org.location,
      };

      return {
        person: syntheticPerson,
        score,
        matchGrade: this.assignGrade(score),
        explanation: matches.join(', ')
      };
    }

    return null;
  }

  private calculateFuzzyScore(queryLower: string, targetLower: string): number {
    if (targetLower.includes(queryLower)) return 1.0;

    const maxDist = Math.max(2, Math.floor(queryLower.length * 0.3));
    const dist = levenshteinDistance(queryLower, targetLower, maxDist);
    if (dist <= maxDist) return Math.max(0, 0.8 - dist * 0.1);
    return 0;
  }

  private scoreMatch(expandedTextsLower: string[], targetLower: string, tokens: string[], weight: number): number {
    if (!targetLower) return 0;

    let maxScore = 0;
    for (const textLower of expandedTextsLower) {
      if (targetLower.includes(textLower)) {
        maxScore = Math.max(maxScore, 1.0);
      } else {
        const fuzzyScore = this.calculateFuzzyScore(textLower, targetLower);
        maxScore = Math.max(maxScore, fuzzyScore);
        
        // Check token-level fuzzy matching only if we don't already have a perfect match
        if (maxScore < 1.0) {
          for (const token of tokens) {
            maxScore = Math.max(maxScore, this.calculateFuzzyScore(textLower, token) * 0.9);
          }
        }
      }
      
      // Early exit if we find a perfect match
      if (maxScore >= 1.0) break;
    }

    return maxScore * weight;
  }

  private searchPerson(processedPerson: ProcessedPerson, query: ParsedQuery): SearchResult | null {
    const { original: person } = processedPerson;
    let score = 0;
    const matches: string[] = [];
    const expandedTextsLower = query.expandedText || [query.text.toLowerCase()];

    // Name, Title, Bio
    const nameScore = this.scoreMatch(expandedTextsLower, processedPerson.fullNameLower, [], 0.4);
    if (nameScore > 0) { score += nameScore; matches.push(`name match (${nameScore.toFixed(2)})`); }

    const titleScore = this.scoreMatch(expandedTextsLower, processedPerson.titleLower, processedPerson.titleTokens, 0.5);
    if (titleScore > 0) { score += titleScore; matches.push(`title match (${titleScore.toFixed(2)})`); }

    const bioScore = this.scoreMatch(expandedTextsLower, processedPerson.bioLower, [], 0.3);
    if (bioScore > 0) { score += bioScore; matches.push(`bio match (${bioScore.toFixed(2)})`); }

    // Filters: Location (hard filter with fuzzy match)
    if (query.filters?.location) {
      const loc = query.filters.location.toLowerCase();
      const cityScore = this.calculateFuzzyScore(loc, processedPerson.cityLower);
      const stateScore = this.calculateFuzzyScore(loc, processedPerson.stateLower);
      const countryScore = this.calculateFuzzyScore(loc, processedPerson.countryLower);
      const best = Math.max(cityScore, stateScore, countryScore);
      if (best < 0.5) {
        // Hard filter - location must match with reasonable confidence
        return null;
      }
      score += best * 0.2;
      matches.push(`location match (${best.toFixed(2)})`);
    }

    // Role (hard filter with fuzzy match)
    if (query.filters?.role) {
      const roleLower = query.filters.role.toLowerCase();
      const roleScore = this.scoreMatch([roleLower], processedPerson.titleLower, processedPerson.titleTokens, 0.3);
      if (roleScore < 0.1) {
        // Hard filter - role must match
        return null;
      }
      score += roleScore;
      matches.push(`role match (${roleScore.toFixed(2)})`);
    }

    // Company-related filters using pre-processed organization data
    const company = processedPerson.companyOrg;

    // Funding stage filter (hard filter for people at companies)
    if (query.filters?.fundingStage) {
      const stageFilter = query.filters.fundingStage.toLowerCase();
      // If person's company is not in our org data, or company doesn't have matching funding, exclude
      if (!company?.funding?.latestRound?.type) {
        return null; // No funding data available - can't match
      }
      const stageScore = this.calculateFuzzyScore(stageFilter, company.funding.latestRound.type.toLowerCase());
      if (stageScore < 0.5) {
        return null; // Funding stage doesn't match
      }
      score += stageScore * 0.3;
      matches.push(`company funding stage match (${company.funding.latestRound.type})`);
    }

    if (query.filters?.minFunding && company?.funding?.totalRaised) {
      const amt = Math.min(1, company.funding.totalRaised / query.filters.minFunding) * 0.2;
      score += amt;
      if (amt > 0) matches.push(`company funding amount match (${company.funding.totalRaised})`);
    }

    // Company filter (hard filter)
    if (query.filters?.company) {
      const companyFilter = query.filters.company.toLowerCase();
      const companyMatchScore = this.calculateFuzzyScore(companyFilter, processedPerson.companyLower);
      if (companyMatchScore > 0) {
        score += companyMatchScore * 0.4;
        matches.push(`company match (${companyMatchScore.toFixed(2)})`);
        
        // When "at [company]" pattern is used, the query text is typically a role/name.
        // Require at least one of: name, title, bio, or tag match on the query text.
        // Without this, "cto at meta" would match any person at Meta regardless of role.
        const hasContentMatch = nameScore > 0 || titleScore > 0 || bioScore > 0;
        if (!hasContentMatch) {
          // Check if any tag matches the query
          const hasTagMatch = expandedTextsLower.some(textLower =>
            processedPerson.tagsLower.some(tag => 
              tag.includes(textLower) || textLower.includes(tag)
            )
          );
          if (!hasTagMatch) {
            return null; // Company matches but query text (role/name) doesn't match anything
          }
        }
      } else {
        // Hard filter - if company is specified but doesn't match, exclude
        return null;
      }
    }

    // Tags matching (text search)
    for (const textLower of expandedTextsLower) {
      for (const tag of processedPerson.tagsLower) {
        if (tag.includes(textLower) || textLower.includes(tag)) {
          score += 0.25;
          matches.push(`tag match (${tag})`);
          break; // Only count once per tag
        }
      }
    }

    // Tags filter (hard filter - if specified, must have at least one matching tag)
    if (query.filters?.tags && query.filters.tags.length > 0) {
      const filterTagsLower = query.filters.tags.map(t => t.toLowerCase());
      const hasMatchingTag = filterTagsLower.some(filterTag =>
        processedPerson.tagsLower.some(personTag => 
          personTag.includes(filterTag) || filterTag.includes(personTag)
        )
      );
      if (!hasMatchingTag) {
        return null; // Hard filter - must have at least one matching tag
      }
      score += 0.2;
      matches.push(`tags filter match`);
    }

    // Require at least one meaningful match before showing results
    // This prevents results that only have recency/completeness scores with empty explanations
    if (matches.length === 0) {
      return null;
    }

    // Completeness & recency boost (only applied if there's at least one match)
    score += Math.min(0.1, (person.factCount || 0) / 50); // completeness
    const enrichedAt = person.enrichedAt || new Date();
    const ageMonths = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    score += Math.min(0.05, 12 / (ageMonths + 1)); // recent data boost

    if (score > 0) {
      return { person, score, matchGrade: this.assignGrade(score), explanation: matches.join(', ') };
    }
    return null;
  }

  private searchOrganization(processedOrg: ProcessedOrganization, query: ParsedQuery): SearchResult | null {
    const { original: org } = processedOrg;
    let score = 0;
    const matches: string[] = [];
    const expandedTextsLower = query.expandedText || [query.text.toLowerCase()];

    const nameScore = this.scoreMatch(expandedTextsLower, processedOrg.nameLower, [], 0.4);
    if (nameScore > 0) { score += nameScore; matches.push(`name match (${nameScore.toFixed(2)})`); }

    const industryScore = this.scoreMatch(expandedTextsLower, processedOrg.industryLower, [], 0.3);
    if (industryScore > 0) { score += industryScore; matches.push(`industry match (${industryScore.toFixed(2)})`); }

    // Industry filter (hard filter)
    if (query.filters?.industry) {
      const industryFilter = query.filters.industry.toLowerCase();
      const industryMatchScore = this.calculateFuzzyScore(industryFilter, processedOrg.industryLower);
      if (industryMatchScore < 0.5) {
        return null; // Hard filter - must match industry
      }
      score += industryMatchScore * 0.2;
      matches.push(`industry filter match (${org.industry})`);
    }

    // Investor search - check if query matches any investor names
    for (const textLower of expandedTextsLower) {
      for (const investor of processedOrg.investorsLower) {
        const investorScore = this.calculateFuzzyScore(textLower, investor);
        if (investorScore > 0.6) { // Only count strong matches
          score += investorScore * 0.35;
          matches.push(`investor match (${investor})`);
          break; // Only count once per investor
        }
      }
    }

    if (query.filters?.fundingStage && org.funding?.latestRound?.type) {
      const stageScore = this.calculateFuzzyScore(query.filters.fundingStage.toLowerCase(), org.funding.latestRound.type.toLowerCase()) * 0.3;
      score += stageScore;
      if (stageScore > 0) matches.push(`funding stage match (${org.funding.latestRound.type})`);
    }

    // Funding amount filter (hard filter)
    if (query.filters?.minFunding) {
      if (!org.funding?.totalRaised || org.funding.totalRaised < query.filters.minFunding) {
        // Hard filter - must meet minimum funding threshold
        return null;
      }
      const amt = Math.min(1, org.funding.totalRaised / query.filters.minFunding) * 0.2;
      score += amt;
      matches.push(`funding amount match (${org.funding.totalRaised})`);
    }

    // Completeness & recency
    score += Math.min(0.1, (org.factCount || 0) / 50);
    const enrichedAt = org.enrichedAt || new Date();
    const ageMonths = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
    score += Math.min(0.05, 12 / (ageMonths + 1));

    if (score > 0) {
      return { organization: org, score, matchGrade: this.assignGrade(score), explanation: matches.join(', ') };
    }
    return null;
  }

  private assignGrade(score: number): MatchGrade {
    if (score >= 0.8) return 'perfect';
    if (score >= 0.6) return 'strong';
    if (score >= 0.4) return 'moderate';
    return 'weak';
  }
}
