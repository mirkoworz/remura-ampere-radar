# REMURA Ampere Radar v0.28 LAB — release and emergency runbook
17 November 2026 — Europe/Rome. DRAFT; no production workflow or activation yet.

## Release prerequisites
- Owner explicitly authorizes release/activation; no automatic merge, provisioning or paid runner.
- Read back public default-branch workflow and pinned source, verify CI for exact runtime source. No third-party actions, no pull_request execution with secrets, no stored credentials in logs.
- All operational invocations and maintenance use the same radar-global concurrency group. GitHub concurrency is not a durable queue or strict ordering guarantee.
- State repository remains private, Actions disabled. Private scoped PAT accesses only state repository Contents RW. Temporary RADAR_OCI_CONFIG_CHECK may be removed after successful diagnosis; cleanup not assumed until confirmed. Keep current Oracle signing key; revoke specifically identified obsolete key only after verifying no other dependency.
- Initial state activation is a separate owner-authorized CAS, never automatic. Do not enable or initialize a state that contains unresolved delivery or pending alerts.
- Standard public Linux runners; no paid broadcast; 30-minute minimum between successful reservations, not an exact schedule. GitHub may delay or drop scheduled runs. Free service subject to policy/limits.
- Production workflow must validate actor for manual dispatch, default branch/pinned source, explicit gate, first attempt and lock. Critical outcomes fail visibly; do not log secret values.

## Health and incident behavior
- Valid successful report records lastProbeAt and lastGoodAt, resets failures; absence of capacity is normal.
- Critical AUTH/ACCESS/QUOTA: no Telegram availability message, retry backoff at least 24h, fail actual probe job visibly.
- API/RATE_LIMIT/UNKNOWN/incomplete: backoff at least 1h. Second consecutive failure or changed fault after persistence triggers HEALTH_PERSISTENT; subsequent same error reports HEALTH_BACKOFF. No separate automatic Telegram fault messaging, no false availability. Health counters capped at 100.
- NOT_DUE and DISABLED produce no probe. DELIVERY_REVIEW_REQUIRED, CLAIM_UNCERTAIN, ACK_UNCERTAIN, reservation/result/state uncertainty require operator review (not auto-retry). GitHub job failure notices depend on owner notification settings; workflow silence itself is not detected by this runtime.
- Last good time is historical, never a promise of current capacity. A separate independent heartbeat/watchdog is future work.
- Do not rerun integrated fixture: it has been consumed and closed.

## Emergency stop (future production, manual)
1. Disable the production workflow in GitHub Actions, then cancel queued/running instances of that workflow. Ensure all run statuses are terminal. An already transmitted notification cannot be recalled by stopping a runner; an interrupted delivery can be ambiguous.
2. Inspect private state.json at current SHA. Under exclusive maintenance (no active or queued runtime), write enabled=false and nextAt=9007199254740991 with revision incremented once and exact prior SHA. Preserve pending, delivery intent, last and health; never reset to initial state. If write response uncertain, reread; do not repeat blindly.
3. Read back state; verify disabled, expected revision and preserved intent. If unable to access GitHub and immediate containment is needed, revoke dedicated Oracle key or scoped PAT only after identifying correct credential; this affects capability, not production VPS. Do not revoke other user's credentials. Do not broaden IAM.
4. For unresolved Telegram intent, inspect actual receipt first. Use exact SHA/intent and recovery decision after >=30 minutes, no automatic resend. Existing recovery helper expects enabled state and exclusive maintenance; separate reviewed maintenance workflow is required before using it on operational state. Never toggle enabled just to bypass a safety gate.
5. Restart requires explicit owner authorization, reconciled delivery, fresh credentials and quota review, no active runs, reviewed CAS change and workflow enable. Never auto-rearm after stop. Confirm new first run actual observation.
