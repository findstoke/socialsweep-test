# Architecture Overview

System Diagram: /problem1/PITCHBOOK_INTEGRATION_ARCHITECTURE_HIGHLEVEL_DIAGRAM.png

This design focuses on creating a data enrichment system for a social networking platform, capable of aggregating personal and company data from multiple external providers (PDL, Apollo, Apify, RapidAPI, PitchBook) and making it searchable.

I've optimized for extensibility and scalability while considering cost, rate limiting, and agility.

The architecture consists of stateless services that use an asynchronous, event-driven pipeline for data ingestion. Cache hits are served synchronously; cache misses trigger async enrichment and return immediately with a request ID for polling.

The design is provider agnostic, with the core architecture supporting n data providers. The addition of a new provider requires implementing two interfaces: provider adapter (fetch logic) and normalization (transform logic).

The rest of the architecture (orchestration, storage, caching, rate limiting) is reusable.

The addition of separate cloud task queues per provider enables different rate limits and independent failure isolation.

This integration design document is scoped to PitchBook (PB).

## Design Patterns

**Adapter Pattern:**

Each provider implements a common module, isolating provider-specific API and normalization logic from the core enrichment pipeline.

**Asynchronous ETL Pipeline:**

Extract (fetch), Transform (normalize), and Load (store) stages are decoupled via message queues, enabling independent scaling and retry logic.

**Separation of Concerns:**

I/O-bound work (fetching) is separated from CPU-bound work (normalization), allowing for independent scaling and preventing blocking.

**Raw Data Storage:**

API responses are stored before transformation, enabling reprocessing without re-fetching (saves: $0.10 per PB call)

**Facts Model with Provenance:**

Unified data representation with source tracking enables multi-provider aggregation and conflict resolution.

## Design Principles

- Cost First Design
- Separation of Concerns
- Failure Isolation and Safe Retries
- Schema Flexibility
- Operational Simplicity

## Adapter Specification

The adapter is a shared typescript module used by the fetch service for ingestion and by the normalization service for transforming raw PB payloads into enrichment facts.

The adapter implements a provider-agnostic interface:

```typescript
// Provider adapter interface
interface ProviderAdapter {
  code: string; // Unique provider identifier
  entity: "person" | "organization" | "both";
  accepts: string[]; // What input fields it can use (e.g., ["email", "linkedinUrl"])
}
```

**Identifier Discovery:**

When PB returns executives or investors with `linkedinUrl` or `email`, these are emitted in the `EnrichmentResult.identifiers` map. The broker can then queue follow-up enrichment requests for newly-discovered persons, enabling graph expansion without additional PB calls (use PDL/Apollo for the follow-up).

### Adapter Spec

**`Adapter.validate()`:**

Accepts an `<EnrichmentInput>` object and validates the required fields using Zod.

For company lookup, it validates that the exact domain or company name is there.
The person lookup validates that the email address, LinkedIn URL, or name and company are there.

If required inputs are missing, the adapter returns a non-retryable validation failure. The worker logs the issue and returns 200 OK to Cloud Tasks; this avoids wasting API calls on requests that will never succeed.

**`Adapter.fetch()`:**

Accepts validated input and performs the PB API request, handling authentication and headers.

Retryable errors (429, 5xx) are surfaced to the worker so Cloud Tasks can retry.
Fatal errors (400, 401, 404), the worker logs the error and returns success to Cloud Tasks to prevent retries.

Only failures that have the potential to succeed on retry are allowed to propagate as errors.

**`Adapter.normalize()`:**

Accepts raw PB response payloads and outputs normalized enrichment facts using the `<EnrichmentFact>` interface.

```typescript
// Output from enrichment system
interface EnrichmentFact {
  path: string; // e.g., "person.fullName", "organization.funding.totalRaised"
  value: string | number; // The fact value
  source: string; // Provider code (e.g., "pitchbook")
  confidence?: number; // 0.0 to 1.0
  observedAt: Date; // When this fact was observed
  metadata?: Record<string, any>; // Additional context
}
```

**Normalization Logic:**

Nested objects are flattened using dot notation (e.g., `organization.funding.totalRaised`).

Arrays (funding rounds, executives, investors) are split into independent facts keyed by stable identifiers:

- Funding rounds: `{date}_{type}` (e.g., "20220523_seriesA")
- Executives: `{email}` (e.g., "jdoe@example.com")
- Investors: `{companyName}` (e.g., "sequoia_capital")

Relationships are extracted as facts with foreign key metadata. Executives generate person facts with `metadata.organizationId` and `metadata.organizationName`, which enables bidirectional traversal.

Each fact includes `observedAt` timestamp (when fetched) and `source: "pitchbook"` for provenance tracking.

**Error Handling:**

Normalization allows for reprocessing without re-fetching from PB.

- Retryable errors (e.g., network timeout) are surfaced to the worker so Cloud Tasks can retry.
- Fatal errors (e.g., invalid response format) are logged, and the worker returns 200 OK to the queue to prevent retries.

## Orchestration Logic

The orchestration logic is contained within the broker service, handling adapter selection and execution. It uses caching, provider prioritization, and conditional calling to minimize cost.

It exposes a HTTP API for enrichment requests:

```
POST /api/v1/enrich/individual - Enriches an individual by email, linkedinUrl, or name
POST /api/v1/enrich/company - Enriches a company by domain or name
POST /api/v1/enrich/batch - Enriches multiple individuals or companies in a batch
GET /api/v1/requests/{id} - Poll enrichment status
```

### Request Flow

1. **Cache Check:** query cached enrichment facts
   - Cache Hit: return cached facts
   - Cache Miss: continue to the next step

2. **Quota Check:** checks if daily budget is used up
   - Available: Continue to provider selection
   - Unavailable: Return 429 with retry after header

3. **Provider Selection**
   - PDL/Apollo first - PDL is cheaper with broader coverage, Apollo for contact data (e.g., instagram)
   - PB if ANY condition met:
     - No funding data OR cached data is older than 7 days (companies) / 30 days (individuals)
     - Request requires investor/executive data (e.g., query contains: "investor", "executive", "director", "officer")
     - In a relevant sector (e.g., query contains: "healthcare", "technology", "finance")

4. **Asynchronous Execution**
   - Set cache status to "pending" (prevents duplicate requests, 5-minute TTL to prevent lockout)
   - Return `202 Accepted` with request id
   - Enqueue task to fetch data

### Cost Management and Rate Limiting

- **Rate Limiting:** API rate limits are enforced via Cloud Tasks (`max_dispatches_per_second`)
- **Cost Control:** Daily rate limit tracked via a centralized counter in cache. The broker checks this before eadding new tasks to make sure we never exceed the daily cap rate: 10,000/day.

> **Note:** The retry behaviour is handled by Cloud Tasks via configuration: [RetryConfig](https://docs.cloud.google.com/php/docs/reference/cloud-tasks/latest/V2.RetryConfig)

### Stop Conditions

The broker stops attempting enrichment when any of the following occur:

1. **Explicit Failure:** PB returns 400 (invalid input) or 404 (not found)—non-retryable, task marked complete
2. **Cost Threshold Exceeded:** Daily quota exhausted (10k calls), return 429 to client with retry-after header
3. **Retry Exhaustion:** Cloud Tasks exponential backoff exhausted (configured: max 3 retries, 30s → 60s → 120s delays)

### Batch Enrichment

Batch requests (`POST /api/v1/enrich/batch`) are sent to a low-priority queue:

- **Rate:** Lower rate to preserve PB quota for high-priority requests
- **Deduplication:** Batch items are deduplicated against the cache before enqueuing

This ensures that high-priority enrichment requests aren't blocked by large batch jobs.

> **Note:** For large batch requests, creating tasks is chunked in groups (e.g., 100)

### PitchBook Downtime

Cloud Tasks handles transient failures via exponential backoff. For sustained outages:

- **Circuit Breaker:** To avoid excessive API costs during sustained outages, a circuit breaker stops the broker from enqueueing new PB tasks if the error rate exceeds (e.g., 50% over 5 minutes).
- **Recovery:** Tasks already in the queue remain and will be completed automatically when PB recovers.

## Data Model

### Fact Path Taxonomy

PB's nested JSON response is flattened to the dot notation schema using the following namespaces:

**Organization Facts:**

- `organization.profile.foundingYear`
- `organization.profile.industry`
- `organization.profile.employees`
- `organization.location.city`
- `organization.financials.valuation.postMoney`
- `organization.financials.totalRaised`

**Funding Rounds:**

- `organization.funding.latest.type`
- `organization.funding.latest.date`
- `organization.funding.latest.amount`
- `organization.funding.rounds.{roundId}.amount`
- `organization.funding.rounds.{roundId}.leadInvestor`

**People Facts:**

- `person.profile.email`
- `person.employment.current.title`
- `person.employment.current.company`
- `person.investor.isActive`
- `person.investor.totalInvestments`

### Relationship Storage

Relationships are stored as facts; they represent graph edges via foreign-key metadata.

**Example:**

- `person.employment.current.company`
  - metadata: `{ organizationId, organizationDomain }`

This enables bidirectional traversal and relationship-based search.

### Array Handling

Arrays (e.g., funding rounds, investors) are flattened into independent fact entries keyed by a stable identifier (e.g., `{date_type}` so `20240521_series_a`) instead of relying on the index. This allows individual elements to be indexed, updated, and queried independently.

### Data Confidence

PB is a primary data source and is assigned a base confidence score of 0.95. However, confidence varies by data type and completeness:

| Fact Category             | Confidence | Notes                                                              |
| ------------------------- | ---------- | ------------------------------------------------------------------ |
| Funding rounds (verified) | 0.95       | PB is authoritative; data is typically verified within 24-48 hours |
| Company profile           | 0.90       | Generally reliable but may lag behind recent changes               |
| Executive data            | 0.80       | Updated quarterly; may be stale for fast-growing companies         |
| Investment history        | 0.75       | Often incomplete for private/angel investments                     |

**Incomplete Data Handling:**

When PB returns partial data (e.g., company found but missing funding details), facts are stored with reduced confidence and flagged via `metadata.incomplete: true`. This signals to consumers that additional enrichment may be needed.

### New Search Capabilities

The addition of PB fact paths enables search queries that were previously not possible:

**Funding-Based Queries:**

- "Series A companies in healthcare with > $10M raised"
- "Companies that raised funding in the last 90 days"
- "Startups with valuations between $50M and $100M"

**Investor & Executive Queries:**

- "Companies backed by Sequoia Capital"
- "CTOs who previously worked at Google"
- "Active angel investors in the fintech space"

**Relationship Traversal:**

- "Find all companies where a specific investor has board positions"
- "Executives connected to a given portfolio company"

These queries combine PB facts with existing provider data (PDL, Apollo) to enable richer filtering and discovery.

### Indexing Strategy

The enrichment pipeline writes to three databases in sequence:

1. **raw-response-db:** Stores unmodified PB API responses for reprocessing and audit
2. **facts-db:** Stores normalized `EnrichmentFact` records with provenance
3. **index-db:** Stores search-optimized representations for fast querying

**Indexing by Fact Path:**

Facts are indexed by path prefix to enable efficient queries:

- `organization.funding.*` — enables funding stage and amount filters
- `organization.funding.rounds.{roundId}.*` — enables per-round queries (lead investor, date, amount)
- `person.investor.*` — enables investor activity searches
- `person.employment.current.*` — enables title and company-based filtering

**Relationship Indexing:**

Facts with relationship metadata (e.g., `person.employment.current.company` with `metadata.organizationId`) are indexed bidirectionally. This allows queries like "find all executives of company X" without additional joins.

**Numeric Fields:**

Funding amounts, valuations, and investment counts are indexed as numeric types to support range queries (e.g., `totalRaised > 10000000`).

**Freshness:**

The index is updated asynchronously after facts are written. A `lastIndexedAt` timestamp on each fact ensures stale index entries can be identified and refreshed.

### Schema Evolution

The facts-based data model provides natural schema evolution without migrations:

**Adding New Fields:**
When PB adds new fields to their API response, we simply add new fact paths in `Adapter.normalize()`. Existing data remains valid; no backfill required unless historical enrichment is needed.

**Backfilling Historical Data:**
Raw responses stored in PostgreSQL can be re-normalized to extract newly-mapped fields without re-fetching from PB. This is critical given the $0.10/call cost.

**Deprecating Fields:**
Deprecated fact paths are soft-deleted by excluding them from new normalization runs. Historical facts remain queryable for audit purposes.

**Breaking Changes:**
If PB changes field semantics (e.g., `totalRaised` currency format), we version the fact path (e.g., `organization.financials.totalRaised.v2`) and migrate consumers incrementally.

**Compatibility Guarantees:**

- Fact paths are append-only (new paths added, never renamed)
- Consumers query by path prefix, tolerating new nested paths
- Cache TTLs ensure stale schema facts expire naturally

## Implementation Plan

The distributed nature of this architecture supports a phased approach with component-based rollout. The implementation plan follows a vertical delivery approach for the MVP, prioritizing an end-to-end pipeline for the company entity first to deliver immediate value (filtering by financials) before extending to individual entities in later phases.

### Phase 1 (Ingestion and Raw Storage)

- **Infrastructure:** pitchbook-fetch and raw-response-db are configured via IAC
- **Adapter:** implement `Adapter.fetch()`, which handles authentication, API calls, and basic error handling
- **Storage:** store the entire raw response into raw-response-db, keyed with the PB id

### Phase 2 (Normalization and Pipeline Integration)

- **Infrastructure:** cache, pitchbook-normalize, cloud tasks for messaging configured via IAC
- **Adapter:** write the `Adapter.normalize()`
- **Orchestration:** Implement the orchestration logic in the broker service
- **Queueing:** set up Cloud Tasks to handle queuing for pitchbook-fetch and pitchbook-normalize, with rate limiting enforced via queue configuration

### Phase 3 (Adding Person Entity)

- **Adapter:** extend `Adapter.fetch()` and `Adapter.normalize()` to handle the Person entity

### Success Metrics

- **Phase 1 Success:** Can fetch and store raw PB company data
- **Phase 2 Success:** Can normalize and store raw PB company data
- **Phase 3 Success:** Can fetch, store, and normalize PB person data

### Infrastructure and Rollout

- **IaC First:** the components will be defined in tf/iac before deployment to ensure environment parity

### Testing

- **Unit Tests:** Coverage for Worker Services, Adapter, and Broker Service.
- **Integration Tests:** Record PB API responses and for replaying during tests. This allows for testing `Adapter.fetch()` without hitting the live API
- **Security:** Integrate vulnerability scanning tools (e.g., Snyk) into the CI/CD pipeline to automatically scan new code for vulnerabilities

## Trade-offs and Decisions

### Store Raw Data vs. Transform Right Away

**Decision:** The raw payload responses from PB are stored in a separate PostgreSQL instance.

**Trade-Offs:**

|         |                                                                                          |
| ------- | ---------------------------------------------------------------------------------------- |
| **Con** | Added database storage costs                                                             |
| **Con** | Added complexity with a two-phase pipeline                                               |
| **Con** | Added database I/O overhead                                                              |
| **Pro** | Reprocess without refetching data from PB                                                |
| **Pro** | Free schema evolution, can add new facts by re-normalizing existing data                 |
| **Pro** | Normalization service reads directly from PostgreSQL                                     |
| **Pro** | Auditable trail for data quality issues, can compare raw directly with normalized output |

**Rationale:**

The cost of making a query to PB is $0.10 per request; the cost of storing raw data is nominal.

We allow for replayability; if normalization fails, the process can be retried with no additional cost being incurred. In development, or if we discover a new field, we don't need to make additional expensive calls to PB.

---

### Rate Limiting: Configuration vs. Code

**Decision:** Rate Limiting via Configuration (Cloud Tasks)

**Trade-Offs:**

|         |                                                                      |
| ------- | -------------------------------------------------------------------- |
| **Con** | Vendor lock-in to Cloud Tasks; migration requires rework             |
| **Con** | Less granular control over retry backoff and priority logic          |
| **Con** | Debugging queue behavior requires GCP console access                 |
| **Pro** | No custom rate-limiting code to maintain                             |
| **Pro** | Update limits without code deployment (infrastructure config only)   |
| **Pro** | Built-in exponential backoff and dead-letter queue support           |
| **Pro** | Native integration with GCP observability (Cloud Monitoring metrics) |

**Rationale:**

For a small team, operational simplicity outweighs flexibility. Cloud Tasks handles the hard parts (distributed rate limiting, retries, dead-letters) out of the box. If we outgrow Cloud Tasks or need multi-cloud, we can swap to Kafka/Pub-Sub.

---

### Separation: Fetch and Normalize vs. Single Service

**Decision:** Separate Services for Fetch and Normalize

**Trade-Offs:**

|         |                                                               |
| ------- | ------------------------------------------------------------- |
| **Con** | Added infrastructure complexity (two services, two queues)    |
| **Con** | Increased latency from inter-service communication            |
| **Pro** | Independent scaling (I/O-bound fetch vs. CPU-bound normalize) |
| **Pro** | Failure isolation (normalization bugs don't block fetching)   |
| **Pro** | Enables raw data storage between stages for replayability     |

**Rationale:**

The separation of concerns between the fetch and normalize services aligns with storing raw responses. It allows fetch workers to stay lean (just HTTP calls) while normalize workers can be optimized for JSON parsing.

---

### Raw Data Storage: PostgreSQL vs. GCS vs. Firestore

**Decision:** Raw Data stored in PostgreSQL

**Trade-Offs:**

| Option         | Pros                                                                                                   | Cons                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **PostgreSQL** | JSONB querying for debugging, transactional consistency with normalized data, single operational stack | Higher storage cost than GCS, requires DB maintenance                     |
| **GCS**        | Cheapest storage, unlimited scale, built-in lifecycle policies                                         | Requires separate query layer, no transactional guarantees with DB        |
| **Firestore**  | Serverless, auto-scaling reads/writes                                                                  | Expensive at scale, document size limits (1MB), no SQL joins for analysis |

**Rationale:**

PostgreSQL provides queryable raw data for development and debugging, while remaining cost-effective at scale.

## Limitations and Future Improvements

### Cloud Tasks

**Limitation:**

Cloud Tasks supports ~500 tasks/second per queue. This is not a constraint for PB (limited to 100/m); it could become a bottleneck at a larger scale.

**Future Improvements:**

Triggered when queue throughput is consistently > 80%.

**Solution:**

1. **Short-term:** Create multiple Cloud Task queues per provider with round-robin dispatch from the broker. Each queue handles ~500 tasks/sec, so 3 queues = 1,500 tasks/sec capacity.
2. **Long-term:** Migrate to Pub/Sub with Cloud Run for horizontal scaling beyond Cloud Tasks limits. Pub/Sub supports 10,000+ messages/second per topic. The adapter abstraction makes this swap low-risk—only the broker's enqueue logic changes.

### Daily Cap for Rate Limiting

**Limitation:** The simple centralized counter for daily rate limiting has a race condition where, at scale, with the horizontal scaling of the brokers, multiple brokers could enqueue tasks simultaneously, leading to a potential violation of the daily rate limit.

**Future Improvements:**

Triggered when daily rate limiting is consistently > 80%.

**Solution:** Use a distributed atomic counter (e.g., Redis INCR).

### Provider Priority Scoring

**Future Improvement:**

Implement priority-based provider selection using scored fact paths. PB excels at funding and investor data, and priority scores could guide when to call PB vs. cheaper providers:

| Fact Path                 | Priority | Rationale                              |
| ------------------------- | -------- | -------------------------------------- |
| `organization.funding.*`  | 95       | PB is authoritative for funding rounds |
| `person.investor.*`       | 90       | Strong coverage of investor activity   |
| `organization.executives` | 80       | Good but may be quarterly-stale        |
| `organization.profile.*`  | 70       | PDL/Apollo often sufficient            |

This would enable dynamic provider selection based on which facts are missing and which provider is most cost-effective for filling them.

## Production Readiness

### Security

The design approaches security holistically:

- Internal services authenticate using service accounts with scoped IAM roles
- API keys and secrets are stored in Secrets Manager and rotated regularly
- Data is encrypted in transit using TLS 1.3 and at rest across all storage layers
- Enrichment requests are validated in the adapter to prevent injection or malformed data
- Code and container images are scanned automatically with a vulnerability scanner

### Observability

The architecture uses GCP's native observability stack (Cloud Monitoring, Cloud Logging, and Cloud Trace) for operational simplicity. Key metrics: cost per enrichment, quota usage for PB (alert at 8k/10k daily), cache hit rate, queue depth, and error rates. Alerts trigger on quota > 80%, errors > 5%, or queue depth > 1000. Optional: Monitoring (e.g., PostHog) for user-facing metrics (search latency, enrichment completion time) to connect performance to business outcomes.
