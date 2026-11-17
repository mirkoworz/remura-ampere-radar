# Ampere Radar v0.7 LAB — 17 November 2026 (Europe/Rome)
Offline development only. Nothing is scheduled, no credentials, no live requests.
 
## Reproduce
Node.js 22 or later, no packages:
    node radar.mjs
    node state.mjs
    node coordinator.mjs
    node store.mjs
    node transport.mjs
    node integration.mjs
Parser 26 checks, state helpers 30 checks, coordinator 23 checks, store 18 checks, transport 19 checks, simulated integration 11 checks (127 assertions total). These are synthetic cases, not end-to-end tests.

The parser differentiates AVAILABLE with positive integer count from AVAILABLE with null count (unquantified candidate); contradictory, duplicate, missing or unknown data fail closed. Priority 2 OCPU / 12 GB then 1 / 6. Candidate is not a reservation, quota proof or authorization to provision.

State helpers model 30 minute minimum interval, one hour for rate/API/unknown errors, 24 hours for auth/access/quota errors, pending notification and acknowledgement. They do not yet implement durable storage, locking, notification transport or network calls. The queue now holds one observation per target (at most two), acknowledges by target and observation timestamp, and backs off on incomplete or unknown results. Actual durable delivery and restart behavior still require integration tests. The state format changed from a single object to an array; there is no deployed state to migrate. Never run a second request after an ambiguous timeout.

## Release gates
- Dedicated API identity, only capacity-report permission; separate test and production keys. No credentials in source, issues, artifacts, caches, stdout or command arguments.
- Design durable state with concurrency lock, pre-call reservation and recovery; no public account-specific state.
- Choose private notification transport and verify cost, rate limits and delivery acknowledgement. No auto provisioning, no reservations.
- Pin and audit runtime and dependencies; workflow permissions least privilege, no untrusted PR execution with credentials, no paid runners.
- Confirm repository Actions policy and standard hosted runner eligibility. Schedules only on default branch; may be delayed or disabled after 60 days inactivity in public repositories.
- Manually validate one sanitized live run, then only enable schedule after explicit release gate.
- Never move test private keys through chat or commit them, even temporarily.

## v0.6 state adapter
Injected transport implements conditional GitHub Contents API updates with prior blob SHA, monotonic revision, bounded schema, disabled gate, and no retry on ambiguous writes. Acknowledged reservation is re-read before probe. Private state initialized disabled. Actual HTTPS transport, CAS integration and end-to-end verification still required. Never include account identifiers or state in public logs. Separate fine-grained token for state repo only, Contents read/write, no Workflows. Disable Actions in state repository. No live calls or schedules.

## v0.7 transport
HTTPS adapter restricts requests to GitHub API state.json GET/main and conditional PUT/main, rejects redirects, bounds response size, uses timeout and never retries. Errors are sanitized. All 127 assertions rerun against retrieved source using injected mock transport/codec/timeout in JS. Node real fetch, UTF-8 decoding, base64 codec and actual API integration remain unvalidated. State PAT secret added by operator report, not accessed or tested. No workflow or scheduling, state remains disabled. Before real use review secret-scoped workflow on trusted ref, pin actions, prevent PR secret exposure, and exercise read-only access before any write. Token restricted to repository contents, not just one file; adapter enforces narrower path.
