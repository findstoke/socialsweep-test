/**
 * Comprehensive test suite for the new search implementation.
 *
 * Test Organization:
 * - Basic Search: Core text matching and result formatting
 * - Filters: Location, role, company, funding, industry, tags
 * - Query Parsing: Natural language extraction and normalization
 * - Advanced Features: Executive search, investor relationships
 * - Edge Cases: Typos, synonyms, fuzzy matching
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SearchService,
  samplePeople,
  sampleOrganizations,
} from "../search-implementation-new";

describe("SearchService", () => {
  let service: SearchService;

  beforeEach(() => {
    service = new SearchService(samplePeople, sampleOrganizations);
  });

  // ============================================================
  // BASIC SEARCH
  // ============================================================
  describe("Basic Search", () => {
    it("finds a person by name", () => {
      const results = service.search({ text: "Sarah" });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].person?.fullName).toBe("Sarah Chen");
    });

    it("finds an organization by name", () => {
      const results = service.search({
        text: "StartupXYZ",
        entityType: "organization",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].organization?.name).toBe("StartupXYZ");
    });

    it("returns results sorted by score (descending)", () => {
      const results = service.search({
        text: "Engineer",
        entityType: "person",
      });
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it("includes explanation for matches", () => {
      const results = service.search({ text: "Sarah Chen" });
      expect(results[0].explanation).toBeDefined();
      expect(results[0].explanation?.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // FILTERS
  // ============================================================
  describe("Filters", () => {
    describe("Location Filter", () => {
      it("filters people by location (hard filter)", () => {
        const results = service.search({
          text: "Engineer",
          filters: { location: "San Francisco" },
        });

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeDefined(); // Sarah is in SF

        const emily = results.find(
          (r) => r.person?.fullName === "Emily Johnson",
        );
        expect(emily).toBeUndefined(); // Emily is in Menlo Park
      });

      it("supports location normalization (SF → San Francisco)", () => {
        const results = service.search({
          text: "Engineer",
          filters: { location: "sf" },
        });

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeDefined();
      });
    });

    describe("Role Filter", () => {
      it("filters people by role (hard filter)", () => {
        const results = service.search({
          text: "Engineer",
          filters: { role: "CTO" },
          entityType: "person",
        });

        const michael = results.find(
          (r) => r.person?.fullName === "Michael Rodriguez",
        );
        expect(michael).toBeDefined();

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeUndefined();
      });
    });

    describe("Funding Filters", () => {
      it("filters organizations by minimum funding", () => {
        const results = service.search({
          text: "TechStart",
          filters: { minFunding: 10000000 },
          entityType: "organization",
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].organization?.name).toBe("TechStart Inc");

        const smallOrgResults = service.search({
          text: "StartupXYZ",
          filters: { minFunding: 10000000 },
          entityType: "organization",
        });
        const startupXYZ = smallOrgResults.find(
          (r) => r.organization?.name === "StartupXYZ",
        );
        expect(startupXYZ).toBeUndefined(); // Only $5M raised
      });

      it("filters people by company funding stage", () => {
        const results = service.search({
          text: "CTO",
          filters: { fundingStage: "Series A" },
        });

        const michael = results.find(
          (r) => r.person?.fullName === "Michael Rodriguez",
        );
        expect(michael).toBeDefined();

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeUndefined(); // Google not in our org data
      });
    });

    describe("Industry Filter", () => {
      it("filters organizations by industry", () => {
        const results = service.search({
          text: "startup",
          filters: { industry: "Software" },
          entityType: "organization",
        });

        const techStart = results.find(
          (r) => r.organization?.name === "TechStart Inc",
        );
        expect(techStart).toBeDefined();

        const startupXYZ = results.find(
          (r) => r.organization?.name === "StartupXYZ",
        );
        expect(startupXYZ).toBeUndefined(); // SaaS, not Software
      });
    });

    describe("Tags Filter", () => {
      it("filters people by required tags", () => {
        const results = service.search({
          text: "engineer",
          filters: { tags: ["founder"] },
        });

        const michael = results.find(
          (r) => r.person?.fullName === "Michael Rodriguez",
        );
        expect(michael).toBeDefined(); // Has "founder" tag

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeUndefined(); // No "founder" tag
      });

      it("supports partial tag matching", () => {
        const results = service.search({
          text: "developer",
          filters: { tags: ["front"] },
        });

        const emily = results.find(
          (r) => r.person?.fullName === "Emily Johnson",
        );
        expect(emily).toBeDefined(); // Has "frontend" tag
      });
    });

    describe("Company Filter", () => {
      it("filters people by company", () => {
        const results = service.search({ text: "software dev at meta" });

        const emily = results.find(
          (r) => r.person?.fullName === "Emily Johnson",
        );
        expect(emily).toBeDefined();
        expect(emily?.explanation).toContain("company match");

        const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
        expect(sarah).toBeUndefined();
      });
    });
  });

  // ============================================================
  // QUERY PARSING & NORMALIZATION
  // ============================================================
  describe("Query Parsing", () => {
    it("extracts location from natural language (in San Francisco)", () => {
      const results = service.search({ text: "Engineer in San Francisco" });

      const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
      expect(sarah).toBeDefined();

      const emily = results.find((r) => r.person?.fullName === "Emily Johnson");
      expect(emily).toBeUndefined(); // Menlo Park, not SF
    });

    it('extracts company from "at [Company]" pattern', () => {
      const results = service.search({ text: "software dev at meta" });

      const emily = results.find((r) => r.person?.fullName === "Emily Johnson");
      expect(emily).toBeDefined();
    });

    it("extracts funding stage from natural language", () => {
      const results = service.search({ text: "CTO at Series A" });

      const michael = results.find(
        (r) => r.person?.fullName === "Michael Rodriguez",
      );
      expect(michael).toBeDefined();

      const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
      expect(sarah).toBeUndefined();
    });
  });

  // ============================================================
  // SYNONYM EXPANSION
  // ============================================================
  describe("Synonyms", () => {
    it("expands CTO → Chief Technology Officer", () => {
      const results = service.search({ text: "CTO" });

      const michael = results.find(
        (r) => r.person?.fullName === "Michael Rodriguez",
      );
      expect(michael).toBeDefined();
    });

    it("expands developer → software engineer", () => {
      const results = service.search({ text: "developer" });

      const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
      expect(sarah).toBeDefined();
      expect(sarah?.explanation).toContain("title match");
    });

    it('matches "software dev" to "Software Engineer"', () => {
      const results = service.search({
        text: "software dev",
        filters: { location: "san francisco" },
      });
      const sarah = results.find((r) => r.person?.fullName === "Sarah Chen");
      expect(sarah).toBeDefined();
      expect(sarah?.score).toBeGreaterThan(0.2);
    });
  });

  // ============================================================
  // FUZZY MATCHING
  // ============================================================
  describe("Fuzzy Matching", () => {
    it("handles typos in search terms", () => {
      const results = service.search({
        text: "TechStrt",
        entityType: "organization",
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].organization?.name).toBe("TechStart Inc");
    });

    it("handles typos in location filters", () => {
      const results = service.search({ text: "people in san francisoc" });
      const match = results.find(
        (r) => r.person?.location?.city === "San Francisco",
      );
      expect(match).toBeDefined();
    });
  });

  // ============================================================
  // EXECUTIVE SEARCH
  // ============================================================
  describe("Executive Search", () => {
    it("finds executives from organization data", () => {
      const results = service.search({ text: "CEO at TechStart" });

      const john = results.find((r) => r.person?.fullName === "John Smith");
      expect(john).toBeDefined();
      expect(john?.explanation).toContain("executive title match");
    });

    it("finds CEO by title search", () => {
      const results = service.search({ text: "CEO" });

      const john = results.find((r) => r.person?.fullName === "John Smith");
      expect(john).toBeDefined();
      expect(john?.explanation).toContain("CEO");
    });

    it("applies funding stage filter to executives", () => {
      const results = service.search({
        text: "CTO",
        filters: { fundingStage: "Series A" },
      });

      const michaelResults = results.filter(
        (r) => r.person?.fullName === "Michael Rodriguez",
      );
      expect(michaelResults.length).toBeGreaterThan(0);
    });

    it("does not duplicate executives already in samplePeople", () => {
      const results = service.search({ text: "Michael Rodriguez" });

      const michaelCount = results.filter(
        (r) => r.person?.fullName === "Michael Rodriguez",
      ).length;
      expect(michaelCount).toBe(1);
    });

    it("applies location filter to executives", () => {
      const results = service.search({
        text: "CEO",
        filters: { location: "San Francisco" },
      });

      const john = results.find((r) => r.person?.fullName === "John Smith");
      expect(john).toBeDefined();
      expect(john?.person?.company).toBe("TechStart Inc");
    });
  });

  // ============================================================
  // INVESTOR RELATIONSHIPS
  // ============================================================
  describe("Investor Relationships", () => {
    it("finds organizations by investor name", () => {
      const results = service.search({
        text: "Sequoia",
        entityType: "organization",
      });

      const techStart = results.find(
        (r) => r.organization?.name === "TechStart Inc",
      );
      expect(techStart).toBeDefined();
      expect(techStart?.explanation).toContain("investor match");
    });
  });

  // ============================================================
  // COMBINED FILTERS
  // ============================================================
  describe("Combined Filters", () => {
    it("combines industry + minFunding filters", () => {
      const results = service.search({
        text: "company",
        filters: {
          industry: "Software",
          minFunding: 10000000,
        },
        entityType: "organization",
      });

      const techStart = results.find(
        (r) => r.organization?.name === "TechStart Inc",
      );
      expect(techStart).toBeDefined();

      const startupXYZ = results.find(
        (r) => r.organization?.name === "StartupXYZ",
      );
      expect(startupXYZ).toBeUndefined();
    });

    it('supports "funded company founder" query', () => {
      const results = service.search({
        text: "funded company founder",
        filters: { location: "sf" },
      });

      const michael = results.find(
        (r) => r.person?.fullName === "Michael Rodriguez",
      );
      expect(michael).toBeDefined();
      expect(michael?.explanation).toContain("founder");
    });
  });

  // ============================================================
  // INPUT VALIDATION
  // ============================================================
  describe("Input Validation", () => {
    it("throws on empty query text", () => {
      expect(() => service.search({ text: "" })).toThrow();
    });

    it("throws on whitespace-only query", () => {
      expect(() => service.search({ text: "   " })).toThrow();
    });

    it("throws on negative minFunding", () => {
      expect(() =>
        service.search({
          text: "test",
          filters: { minFunding: -1000 },
        }),
      ).toThrow();
    });
  });
});
