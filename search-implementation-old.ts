// Simple search service (starter code)
class SearchServiceOld {
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

const sampleOrganizationsOld: Organization[] = [
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
