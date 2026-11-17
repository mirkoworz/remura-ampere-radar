# Ampere Radar v0.4 LAB — 17 November 2026 (Europe/Rome)
Offline development only. Nothing is scheduled, no credentials, no live requests.
 
## Reproduce
Node.js 22 or later, no packages:
    node radar.mjs
    node state.mjs
Parser 26 checks, state helpers 30 checks. These are synthetic cases, not end-to-end tests.

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
