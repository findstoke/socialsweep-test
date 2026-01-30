# Senior Search Engineer - Test Project
## Overview
This test project evaluates your ability to:

Design scalable integration architectures for new data sources
Build and improve search systems from the ground up

You'll have 5 days to complete both parts. We're looking for thoughtful design decisions, clean code, and practical solutions that demonstrate senior-level engineering judgment.


## Part 1: PitchBook API Integration Architecture
Scenario
You're designing a data enrichment system for a social networking platform. The system needs to aggregate person and company data from multiple external providers and make it searchable.

Current Providers:

PDL (People Data Labs) - Person and company enrichment
Apollo - Contact and company data
Apify - Instagram profile scraping
RapidAPI - Twitter/X profile data

New Provider to Integrate:

PitchBook - Private market data (companies, funding rounds, investors, executives)
System Requirements
The enrichment system must:

Normalize Data: Convert PitchBook's API format into a unified fact model
Handle Data Quality: Deal with incomplete or missing data gracefully
Optimize Costs: Minimize API calls while maximizing data quality ($0.10 per call)
Rate Limit Management: Respect PitchBook's rate limits (100 requests/minute, 10,000/day)
Make Data Searchable: Enriched data must be indexed for fast search
Track Provenance: Know which provider provided which fact and when
Handle Relationships: Store and index relationships (investor → company, executive → company)
Core Interfaces
Here are the key interfaces your design should work with:

// Input to enrichment system
interface EnrichmentInput {
  person?: {
    email?: string;
    linkedinUrl?: string;
    twitterHandle?: string;
    instagramHandle?: string;
    fullName?: string;
    company?: string;
    companyDomain?: string;
  };
  organization?: {
    name?: string;
    domain?: string;
    linkedinUrl?: string;
  };
}

// Output from enrichment system
interface EnrichmentFact {
  path: string;              // e.g., "person.fullName", "organization.funding.totalRaised"
  value: string | number;     // The fact value
  source: string;              // Provider code (e.g., "pitchbook")
  confidence?: number;        // 0.0 to 1.0
  observedAt: Date;           // When this fact was observed
  metadata?: Record<string, any>; // Additional context
}

// Provider adapter interface
interface ProviderAdapter {
  code: string;                    // Unique provider identifier
  entity: "person" | "organization" | "both";
  accepts: string[];                // What input fields it can use (e.g., ["email", "linkedinUrl"])
  priorityFor: Record<string, number>; // Field priority scores 0-100
  fetch(input: EnrichmentInput): Promise<EnrichmentResult>;
  normalize(data: any): EnrichmentFact[];
}

interface EnrichmentResult {
  facts: EnrichmentFact[];
  raw?: any;                        // Original API response
  cost: { units: number };          // Cost units consumed
  identifiers?: Record<string, string>; // New identifiers discovered
}
PitchBook API Specifications
Rate Limits & Pricing
Per Minute: 100 requests/minute
Per Day: 10,000 requests/day
Pricing: $0.10 per API call
Timeout: 30 seconds per request
Input Requirements
Company Lookup: Requires exact domain (e.g., "google.com") or exact company name match
Person Lookup: Can use:
Email address
LinkedIn URL
Name + company (less reliable, may return multiple matches)
Validation: PitchBook validates inputs before processing (invalid inputs return 400)
Output Data Structure
Company Data:

{
  "company": {
    "name": "Acme Corp",
    "domain": "acme.com",
    "industry": "Software",
    "employees": 150,
    "founded": "2020-01-15",
    "headquarters": {
      "city": "San Francisco",
      "state": "CA",
      "country": "USA"
    },
    "funding": {
      "totalRaised": 15000000,
      "valuation": 50000000,
      "rounds": [
        {
          "type": "Series A",
          "amount": 10000000,
          "date": "2023-06-15",
          "leadInvestor": "Sequoia Capital",
          "investors": ["Sequoia Capital", "Andreessen Horowitz", "Accel Partners"]
        },
        {
          "type": "Seed",
          "amount": 5000000,
          "date": "2022-01-10",
          "leadInvestor": "Y Combinator",
          "investors": ["Y Combinator"]
        }
      ],
      "latestRound": {
        "type": "Series A",
        "amount": 10000000,
        "date": "2023-06-15"
      }
    },
    "executives": [
      {
        "name": "John Doe",
        "title": "CEO",
        "email": "john@acme.com",
        "linkedinUrl": "https://linkedin.com/in/johndoe"
      },
      {
        "name": "Jane Smith",
        "title": "CTO",
        "email": "jane@acme.com"
      }
    ],
    "investors": [
      {
        "name": "Sequoia Capital",
        "type": "VC",
        "investedRounds": ["Series A"]
      }
    ]
  }
}

Person Data:

{
  "person": {
    "name": "John Doe",
    "email": "john@acme.com",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "currentRole": {
      "title": "CEO",
      "company": "Acme Corp",
      "startDate": "2020-01-15"
    },
    "boardPositions": [
      {
        "company": "StartupXYZ",
        "role": "Board Member",
        "startDate": "2021-03-01"
      }
    ],
    "investmentHistory": {
      "isInvestor": true,
      "portfolioCompanies": [
        {
          "name": "TechStart Inc",
          "investmentType": "Angel",
          "investmentDate": "2022-05-10"
        }
      ],
      "totalInvestments": 5
    }
  }
}
## Special Considerations
Data Completeness:

Early-stage companies may have incomplete funding data
Some executives may not have email addresses
Investment history may be incomplete for private investors

Relationship Data:

Rich relationship data (investor → company, executive → company)
Can discover new people through company executives
Can discover new companies through investor portfolios

Data Freshness:

Funding data is typically updated within 24-48 hours of announcements
Executive data may be stale (updated quarterly)
Investment history may be incomplete for private deals

Error Handling:

400: Invalid input (e.g., company not found, invalid email format)
429: Rate limit exceeded (retry after delay)
500: Server error (retry with exponential backoff)
Timeout: Request takes >30s (retry once)
Your Task
Design a complete architecture for integrating PitchBook into the existing enrichment system. Your design should address:

Adapter Design

How would you structure the PitchBook adapter?
What inputs does it accept and in what priority?
How do you handle PitchBook's data model and errors?
How do you discover new identifiers (e.g., PitchBook returns LinkedIn URLs for executives)?

Data Normalization

How do you map PitchBook responses to EnrichmentFact paths?
What new fact paths do you need? (e.g., organization.funding.seriesA.amount, person.investor.portfolioCount)
How do you handle relationships? (person → company, company → investors)
How do you handle nested/complex data? (funding rounds with dates, amounts, investors)

Orchestration Strategy

When should PitchBook be called? (before/after other providers?)
When should you stop fetching? (all required fields collected? cost threshold?)
How do you handle adapter failures gracefully?
How do you handle partial data (e.g., company found but no funding data)?

Rate Limiting & Cost Optimization

How do you prevent exceeding rate limits (100/min, 10k/day)?
How do you minimize costs? (cache results? skip if data exists? batch requests?)
How do you implement sliding window rate limiting?
How do you handle daily quota exhaustion?

Search Integration

How do PitchBook facts improve search? (e.g., "find Series A companies", "find investors")
What new search capabilities become possible?
How do you index relationship data? (person → company → investors)
How do you handle funding-based queries? (e.g., "companies that raised >$10M")

Scalability & Reliability

How do you handle PitchBook downtime?
How do you handle batch enrichment (1000s of companies at once)?
How do you ensure the system remains performant?
How do you handle data freshness (when to re-fetch)?

Data Quality & Confidence

How do you assign confidence scores to PitchBook data?
How do you handle incomplete data (missing funding rounds, partial executive lists)?
How do you validate data quality before storing?
Deliverable
Write a design document (3-5 pages) that includes:

Architecture Overview

High-level system diagram showing components and data flow
How PitchBook integrates with existing system
Key design patterns and principles

Adapter Specification

Detailed design for PitchBook adapter
Input/output mappings
Fact path schemas
Error handling strategies

Orchestration Logic

How the broker selects and executes PitchBook adapter
Priority and execution order
Cost and rate limit management

Data Model

New fact paths needed for PitchBook data
How relationships are stored
Schema for funding rounds, investments, executives, etc.

Implementation Plan

Phased approach (what to build first)
Testing strategy
Rollout plan

Trade-offs & Decisions

Key design decisions and rationale
What you optimized for (cost, speed, accuracy, etc.)
Limitations and future improvements

Format: Markdown document with diagrams (ASCII art, mermaid, or images)


## Part 2: Search Quality Implementation
Scenario
You're building a search system for finding people and companies. Users can search with natural language queries like:

"Find software engineers in San Francisco"
"Show me CTOs at Series A startups"
"Find investors who backed companies in my network"
"Show me companies that raised over $10M"
Provided Codebase
You'll work with a simplified search system. Here's the starter code:
Core Types
// Person entity
interface Person {
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
interface Organization {
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
interface SearchQuery {
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
interface SearchResult {
  person?: Person;
  organization?: Organization;
  score: number;                    // 0.0 to 1.0
  matchGrade: "perfect" | "strong" | "moderate" | "weak";
  explanation?: string;             // Why this result matches
}
Starter Implementation
// Simple search service (starter code)
class SearchService {
  private people: Person[] = [];
  private organizations: Organization[] = [];

  constructor(people: Person[], organizations: Organization[] = []) {
    this.people = people;
    this.organizations = organizations;
  }

  /**
   * Simple keyword search - this is what you'll improve
   */
  search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const entityType = query.entityType || "person";

    // Search people
    if (entityType === "person" || entityType === "both") {
      for (const person of this.people) {
        const result = this.searchPerson(person, query);
        if (result) results.push(result);
      }
    }

    // Search organizations
    if (entityType === "organization" || entityType === "both") {
      for (const org of this.organizations) {
        const result = this.searchOrganization(org, query);
        if (result) results.push(result);
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  private searchPerson(person: Person, query: SearchQuery): SearchResult | null {
    let score = 0.0;
    const matches: string[] = [];

    // Simple text matching
    const queryLower = query.text.toLowerCase();
    if (person.fullName.toLowerCase().includes(queryLower)) {
      score += 0.3;
      matches.push("name match");
    }
    if (person.title?.toLowerCase().includes(queryLower)) {
      score += 0.4;
      matches.push("title match");
    }
    if (person.bio?.toLowerCase().includes(queryLower)) {
      score += 0.2;
      matches.push("bio match");
    }

    // Filter matching
    if (query.filters?.location) {
      const loc = query.filters.location.toLowerCase();
      if (person.location?.city?.toLowerCase().includes(loc) ||
          person.location?.state?.toLowerCase().includes(loc) ||
          person.location?.country?.toLowerCase().includes(loc)) {
        score += 0.1;
        matches.push("location match");
      } else {
        return null; // Hard filter - no match = exclude
      }
    }

    if (query.filters?.role) {
      const role = query.filters.role.toLowerCase();
      if (person.title?.toLowerCase().includes(role)) {
        score += 0.2;
        matches.push("role match");
      } else {
        return null; // Hard filter
      }
    }

    if (score > 0) {
      return {
        person,
        score,
        matchGrade: this.assignGrade(score),
        explanation: matches.join(", "),
      };
    }

    return null;
  }

  private searchOrganization(org: Organization, query: SearchQuery): SearchResult | null {
    let score = 0.0;
    const matches: string[] = [];

    // Simple text matching
    const queryLower = query.text.toLowerCase();
    if (org.name.toLowerCase().includes(queryLower)) {
      score += 0.4;
      matches.push("name match");
    }
    if (org.industry?.toLowerCase().includes(queryLower)) {
      score += 0.3;
      matches.push("industry match");
    }

    // Funding filters
    if (query.filters?.fundingStage) {
      const stage = query.filters.fundingStage.toLowerCase();
      if (org.funding?.latestRound?.type?.toLowerCase().includes(stage)) {
        score += 0.3;
        matches.push("funding stage match");
      } else {
        return null; // Hard filter
      }
    }

    if (query.filters?.minFunding) {
      if (org.funding?.totalRaised && org.funding.totalRaised >= query.filters.minFunding) {
        score += 0.2;
        matches.push("funding amount match");
      } else {
        return null; // Hard filter
      }
    }

    if (score > 0) {
      return {
        organization: org,
        score,
        matchGrade: this.assignGrade(score),
        explanation: matches.join(", "),
      };
    }

    return null;
  }

  private assignGrade(score: number): "perfect" | "strong" | "moderate" | "weak" {
    if (score >= 0.8) return "perfect";
    if (score >= 0.6) return "strong";
    if (score >= 0.4) return "moderate";
    return "weak";
  }
}
Sample Data
const samplePeople: Person[] = [
  {
    id: "1",
    fullName: "Sarah Chen",
    title: "Senior Software Engineer",
    company: "Google",
    location: { city: "San Francisco", state: "CA", country: "USA" },
    bio: "Full-stack engineer with 10 years experience. Passionate about distributed systems.",
    tags: ["engineer", "backend"],
    enrichedAt: new Date("2024-01-15"),
    factCount: 15,
  },
  {
    id: "2",
    fullName: "Michael Rodriguez",
    title: "Chief Technology Officer",
    company: "TechStart Inc",
    location: { city: "San Francisco", state: "CA", country: "USA" },
    bio: "CTO and co-founder. Led engineering at 3 startups. Expert in scaling systems.",
    tags: ["cto", "founder", "engineer"],
    enrichedAt: new Date("2024-01-20"),
    factCount: 22,
  },
  {
    id: "3",
    fullName: "Emily Johnson",
    title: "Software Engineer",
    company: "Meta",
    location: { city: "Menlo Park", state: "CA", country: "USA" },
    bio: "Frontend engineer specializing in React and TypeScript.",
    tags: ["engineer", "frontend"],
    enrichedAt: new Date("2023-12-10"),
    factCount: 8,
  },
];

const sampleOrganizations: Organization[] = [
  {
    id: "org1",
    name: "TechStart Inc",
    domain: "techstart.com",
    industry: "Software",
    location: { city: "San Francisco", state: "CA", country: "USA" },
    funding: {
      totalRaised: 15000000,
      valuation: 50000000,
      latestRound: {
        type: "Series A",
        amount: 10000000,
        date: "2023-06-15",
      },
      rounds: [
        {
          type: "Series A",
          amount: 10000000,
          date: "2023-06-15",
          investors: ["Sequoia Capital", "Andreessen Horowitz"],
        },
        {
          type: "Seed",
          amount: 5000000,
          date: "2022-01-10",
          investors: ["Y Combinator"],
        },
      ],
    },
    investors: ["Sequoia Capital", "Andreessen Horowitz", "Y Combinator"],
    executives: [
      { name: "Michael Rodriguez", title: "CTO", email: "michael@techstart.com" },
      { name: "John Smith", title: "CEO", email: "john@techstart.com" },
    ],
    enrichedAt: new Date("2024-01-20"),
    factCount: 25,
  },
  {
    id: "org2",
    name: "StartupXYZ",
    domain: "startupxyz.com",
    industry: "SaaS",
    location: { city: "New York", state: "NY", country: "USA" },
    funding: {
      totalRaised: 5000000,
      valuation: 15000000,
      latestRound: {
        type: "Seed",
        amount: 5000000,
        date: "2023-12-01",
      },
    },
    investors: ["Y Combinator"],
    enrichedAt: new Date("2024-01-10"),
    factCount: 12,
  },
];
Problems with Current Implementation
The starter code has several issues:

Poor Query Understanding

"software engineers" doesn't match "Software Engineer" well
"CTO" doesn't match "Chief Technology Officer"
"Series A" query doesn't understand funding stages
No semantic understanding (synonyms, related terms)

Weak Scoring

Simple addition doesn't reflect importance
No consideration of data quality (stale data, missing fields)
Hard filters are too strict (exact match required)
Funding amount matching is binary (no partial credit)

No Ranking Intelligence

Doesn't consider recency (recently enriched data is better)
Doesn't consider completeness (more facts = higher confidence)
No relationship-based ranking (e.g., executives at funded companies)
No personalization or context

Limited Matching

Location matching is too strict ("San Francisco" doesn't match "SF" or "Bay Area")
Company name variations not handled ("Google" vs "Alphabet")
Funding stage matching is exact only ("Series A" doesn't match "series-a" or "Series A Round")
No fuzzy matching for typos

Missing Features

Can't search by investor relationships
Can't find executives at companies matching criteria
Can't do complex queries like "CTOs at Series A companies in SF"
Your Task
Improve the search system to address these issues. You can:

Enhance query understanding: Add query expansion, synonym handling, entity extraction (especially for funding terms)
Improve scoring: Better algorithms, weighted components, data quality factors
Better matching: Fuzzy matching, location normalization, company name resolution, funding stage normalization
Smarter ranking: Recency, completeness, relationship-based boosts
Add features: Relationship queries (investors, executives), complex filters, result explanations
Requirements
Implement Improvements

Write production-quality TypeScript/JavaScript code
Keep it self-contained (no external dependencies unless necessary)
Include clear comments and documentation

Provide Test Cases

Unit tests demonstrating improvements
Before/after examples showing better results
Edge cases handled (missing funding data, incomplete profiles, etc.)

Measure Improvement

Define metrics (precision, recall, user satisfaction proxies)
Show quantitative improvements where possible
Explain why your solution is better

Documentation

Explain your approach and design decisions
Describe algorithms and data structures used
Discuss trade-offs and limitations
Deliverable
Code: Your improved search implementation
Tests: Test cases showing improvements
Documentation: SEARCH_IMPROVEMENT.md (2-3 pages) covering:
What problems you solved
How your solution works
Algorithms and techniques used
Before/after examples
Performance considerations
Future improvements
Evaluation Criteria
We'll evaluate:

Problem Solving: Did you identify and solve real search quality issues?
Technical Depth: Algorithms, data structures, and engineering decisions
Code Quality: Clean, maintainable, well-tested code
Practical Solutions: Solutions that work, not just theoretical
Communication: Clear documentation and explanations


## Submission Guidelines
Part 1: Architecture Design
File: PITCHBOOK_INTEGRATION_ARCHITECTURE.md
Include diagrams (ASCII art, mermaid, or images)
Be specific and detailed
Show your thought process
Part 2: Search Implementation
Code files (TypeScript/JavaScript)
Test files
File: SEARCH_IMPROVEMENT.md explaining your approach
Can be a GitHub repo, zip file, or shared folder
How to Submit
Submit via:

GitHub repository (preferred)
Zip file with all files
Google Drive/Dropbox link

Include a brief README.md with:

How to run the code (Part 2)
Any setup instructions
Your contact information


## Timeline
Duration: 5 days from when you receive this
Estimated Time: 8-12 hours total
Part 1: 4-6 hours (design and documentation)
Part 2: 4-6 hours (implementation and testing)


## Evaluation
We're looking for:

✅ Senior-level thinking: Understanding trade-offs, making pragmatic decisions
✅ Production-ready code: Clean, tested, maintainable
✅ Clear communication: Well-documented design and implementation
✅ Problem-solving: Identifying real issues and solving them effectively
✅ Technical depth: Demonstrating expertise in search and systems design

This isn't about getting everything perfect—it's about showing how you think, design, and build. We're excited to see what you create!

Good luck! 🚀
