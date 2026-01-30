// Person entity
export interface Person {
  id: string;
  fullName: string;
  title?: string;
  company?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  bio?: string;                    // Short bio/description
  tags?: string[];                 // e.g., ["engineer", "founder", "investor"]
  enrichedAt?: Date;               // When data was last updated
  factCount?: number;               // Number of facts we have about them
}

// Organization entity (new - for companies with PitchBook data)
export interface Organization {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  funding?: {
    totalRaised?: number;           // In USD
    valuation?: number;             // In USD
    latestRound?: {
      type?: string;                // "Series A", "Seed", etc.
      amount?: number;
      date?: string;                // ISO date
    };
    rounds?: Array<{
      type: string;
      amount: number;
      date: string;
      investors?: string[];
    }>;
  };
  investors?: string[];             // Investor names
  executives?: Array<{
    name: string;
    title: string;
    email?: string;
  }>;
  enrichedAt?: Date;
  factCount?: number;
}

// Search query
export interface SearchQuery {
  text: string;                    // User's natural language query
  filters?: {
    location?: string;             // City, state, or country
    role?: string;                  // Job title or role
    company?: string;               // Company name
    industry?: string;              // Industry
    tags?: string[];                // Tags to match
    fundingStage?: string;         // "Seed", "Series A", etc.
    minFunding?: number;            // Minimum funding raised
  };
  scope?: "all" | "connections";   // Search scope
  entityType?: "person" | "organization" | "both"; // What to search for
}

// Search result
export interface SearchResult {
  person?: Person;
  organization?: Organization;
  score: number;                    // 0.0 to 1.0
  matchGrade: MatchGrade;
  explanation?: string;             // Why this result matches
}

/** Match quality grade */
export type MatchGrade = 'perfect' | 'strong' | 'moderate' | 'weak';

/**
 * Pre-processed person data for efficient searching.
 * Caches lowercase versions of frequently searched fields.
 */
export interface ProcessedPerson {
  original: Person;
  fullNameLower: string;
  titleLower: string;
  bioLower: string;
  cityLower: string;
  stateLower: string;
  countryLower: string;
  companyLower: string;
  tagsLower: string[];
  titleTokens: string[];
  companyOrg?: Organization;
}

/**
 * Pre-processed organization data for efficient searching.
 * Caches lowercase versions of frequently searched fields.
 */
export interface ProcessedOrganization {
  original: Organization;
  nameLower: string;
  industryLower: string;
  investorsLower: string[];
}
