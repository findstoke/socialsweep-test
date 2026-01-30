# Search Improvement

## Summary:

### Key Improvements:

- Synonym expansion
- Fuzzy matching
- Weighted scoring system
- Natural language filter extraction
- Executive and investor relationship search
- 95% test coverage across 48 tests

### Implementation:

The improvements are in:

- search-implementation-new.ts
- utils/normalization.ts
- utils/query-parser.ts

## Problem Analysis

The assessment provide starter code and

The initial starter code had a number of issues that were detailed in the requirements:

- Poor query understanding
- weak scoring
- no ranking intelligence
- limited matching
- missing features:
  - no searching based on investor relationships`
  - can’t find executives at companies matching the criteria
  - can’t do complex queries with multiple criteria

To breakdown the problem into addressable areas,

1. Query Parsing
2. Search and Scoring

## Query Parsing

Query parsing addresses these original problems:

- Poor Query Understanding
- Limited Matching (via normalization)
- Complex Queries

### Synonym Expansion

To handle abbreviations, nicknames, and role variations, queries are expanded using a dictionary of synonyms.

// Example mappings
"cto": ["cto", "chief technology officer"],
"developer": ["developer", "software engineer", "engineer", "coder", "swe"],

When a user searches for "CTO", the system also matches "Chief Technology Officer" in titles.

Note: For this project, the synonym dictionary is static and manually curated. In production, this could be extended using learned embeddings or role ontologies.

### Natural Language Extraction

The parser extracts structured filters from natural language queries using pattern matching.

Supported patterns:

- "in [location]" → extracts location filter
- "at [company]" → extracts company filter
- "Series A", "Seed" → extracts funding stage filter.

// "software engineer in SF" becomes:
{
text: "software engineer",
filters: { location: "San Francisco" } // SF normalized
}

### Location Normalization

Common abbreviations are normalized to full names:

Column 1 Column 2
Input Normalized
SF, San Fran San Francisco
NYC New York
LA Los Angeles

### Complex Queries

The parser handles multiple filters in a single query by extracting each pattern sequentially:

// "CTOs at Series A startups in SF" →
{ text: "CTOs", filters: { fundingStage: "Series A", location: "San Francisco" } }

## Search and Scoring

The improvements made to search and scoring address:

- Weak Scoring
- No Ranking Intelligence
- Limited Matching (fuzzy)
- Missing Features (investor/executive search)

## Data Structures

Pre-processed entities - On initialization, all entities are pre-processed into lowercase strings to avoid repeated .toLowerCase() calls during search:

interface ProcessedPerson {
original: Person;
fullNameLower: string;
titleLower: string;
titleTokens: string[]; // For token-level matching
companyOrg?: Organization; // Pre-linked for funding filters
}

Organization Map - Map<string, Organization> for O(1) company lookups when applying funding filters to people.

## Algorithms

### Fuzzy Matching (Levenshtein Distance)

- Tolerates typos up to 30% of query length
- Early exit when an exact match is found
- Threshold tuned to avoid false positives.

const maxDist = Math.max(2, Math.floor(query.length \* 0.3));
if (levenshteinDistance(query, target, maxDist) <= maxDist) → match

Weighted Scoring - Different match types have different weights:

Column 1 Column 2 Column 3
Match Type Weight Rationale
Title 0.50 Most relevant for role searches
Name 0.40 Direct matches are important
Investor 0.35 Relationship searches valuable
Bio 0.30 Context, less precise
Tag 0.25 Categorical match
Location 0.20 Filter boost

### Ranking Boosts:

- Completeness: Math.min(0.1, factCount / 50) more facts = higher confidence
- Recency: Math.min(0.05, 12 / (ageMonths + 1)) recent data preferred

### Executive Search

The executive search earches organization.executives[] and creates synthetic Person results, enabling queries like “CEO at TechStart” to find people not in the person database.

## Limitations

Column 1 Column 2 Column 3
Limitation Impact Potential Solution
Static synonym dictionary Won’t catch new slang or industry terms Use embeddings or ML-based expansion
Simple regex parsing "in" in company names may false-match Use NLP/NER for entity extraction
Linear scan O(n) per query Use inverted index (Elasticsearch, Tantivy)
No semantic search "machine learning" won’t match "AI" Add vector embeddings
Hardcoded weights May not suit all use cases Learn weights from click data
No caching Repeated queries recompute Add LRU cache for frequent queries

## Tradeoffs

Column 1 Column 2
Decision Tradeoff
Fuzzy matching threshold (30%) Balance between catching typos vs false positives
Pre-processing on init Slower startup, faster queries
Synthetic executive results Enables cross-entity search, but may duplicate if person exists elsewhere
Hard filters for location/role Precise results, but no “soft” partial matches

## Performance Considerations

- O(n) search: Linear scan is acceptable for small datasets (<10k), but would need inverted index for scale
- Pre-processing amortization: Initialization cost (O(n)) paid once, queries benefit from O(1) lookups
- Memory: Pre-processed data doubles memory footprint; acceptable tradeoff for speed
- Fuzzy matching cost: Levenshtein is O(m×n) per comparison, early-exit optimization limits overhead

## Metrics

The comparison tests run identical queries against both old and new implementations.

### Recall Improvements (Query Understanding & Matching)

Column 1 Column 2 Column 3 Column 4
Query Old New Problem Addressed
CTO 1 2 Poor Query Understanding (synonym)
developer 0 4 Poor Query Understanding (synonym)
software dev 0 4 Poor Query Understanding (synonym)
TechStrt (typo) 0 2 Limited Matching (fuzzy)
Sarh Chen (typo) 0 3 Limited Matching (fuzzy)
Engineer + SF filter 0 3 Limited Matching (location norm)
Sequoia (investor) 0 2 Missing Feature (investor search)
CEO 0 2 Missing Feature (exec search)

### Scoring & Ranking Improvements

Column 1 Column 2
Test Improvement Demonstrated
Title vs Bio scoring Title matches score 0.50 vs bio 0.30 (weighted, not simple add)
Multiple match accumulation 3 match types combine for score of 1.20
Detailed explanations NEW: "title match (0.50)" vs OLD: "title match"
Completeness boost More facts (factCount) = higher ranking
Recency boost Recent data (enrichedAt) = higher ranking

## Testing

The tests are located in the /test directory and are written using vitest. To run the tests, use npm run test.

There are 48 tests total, 16 tests are for comparison metrics between the old and new search implementations, and the rest cover the following:

- Basic Search
- Filters
- Query Parsing
- Advanced Features
- Edge Cases

### Test Coverage

Test coverage can be found in the coverage directory.

For the scope of this project, I aimed to achieve 80% overall test coverage.

Statements: 95%
Branches: 81%
Functions: 100%
Lines: 95%

### External Dependencies

The code uses the following external dependencies for development only:

- @types/node for TypeScript node support
- @vitest/coverage-v8 for vitest coverage
- typescript for TypeScript
- vite for vite
- vitest for vitest
