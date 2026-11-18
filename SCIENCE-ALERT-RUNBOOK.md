# REMURA Science — capacity alert response v0.1 PLAN
18 November 2026, Europe/Rome. Planning only; no provision or infrastructure change.

## Before the alert
- Confirm tenancy remains Free, home region Milan, active A1 quota and consumed storage by read-only console. Official current public Always Free allowance: 2 OCPU and 12 GB total A1, 1,500 OCPU-hours / 9,000 GB-hours monthly; 200 GB combined boot/block storage and five volume backups. Prior tenant census 47 GB used and 2/12 remaining is historical; revalidate.
- Prepare dedicated SSH key pair on trusted device (private stays local, public key available for upload); verify recovery copy. Never reuse OCI signing or Telegram keys.
- Keep console link and parameters handy; no reservation or automated creation.
## When Telegram alerts
- Treat capacity report as indication, not quota/reservation. Open OCI Compute Instances in Milan and check no remura-science instance is already provisioning/running.
- Preferred 2 OCPU/12 GB; fallback 1 OCPU/6 GB only if available and within actual free limits.
- Name remura-science, root compartment per previous plan; VM.Standard.A1.Flex; Ubuntu 24.04 Minimal aarch64 official image, no paid marketplace; existing remura-arm-vcn and prepared private science subnet in network compartment; no public IP or public route; upload dedicated public SSH key.
- Select standard boot disk 50 GB, default/free performance, no extras. Prior 47 GB + 50 GB = 97 GB used (103 GB free) if census unchanged.
- Inspect all charges and tenancy limits (not just estimate); stop if unclear or nonzero, paid plan requested, existing instance detected, or network mismatch. User manually presses Create once. If host capacity fails, do not loop; check listing for partially created resources and return to monitoring. No upgrade or touching existing VPS.
## After success
- Verify RUNNING, exact shape, boot volume, no public IP and resource cost before any further change. Confirm instance is reachable through approved restricted management path; private subnet currently isolated, so Bastion is not preconfigured. Evaluate free Bastion/session and required service gateway/routes/security only on science network, separately authorized. Controlled outbound updates/data access may need separate plan.
- Install minimal supported packages, nonroot jobs, resource budgets, logging, backup and restore test. No production credentials or direct production writes. Use approved sanitized snapshots, read-only data exchange and checksums.
- Phase 1 historical replay, chronology-safe feature computation, costs/slippage. Phase 2 walk-forward, out-of-sample validation and ablation of COT/sentiment/volume signals. Phase 3 paper shadow and promotion only after results/robustness review, no automatic orders or profit guarantees. 1/6 fallback: sequential bounded experiments; 2/12: modest parallelism subject to measured resources.
- Use real scientific workload (no artificial utilization); Oracle may reclaim idle Always Free instances. Keep reproducible code and recoverable data outside VPS.
- After confirmed acquisition disarm or retarget Radar as separately agreed; do not stop it on a mere alert. Verify no duplicate creates. No automatic provision.
Sources: https://docs.oracle.com/it-it/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm ; https://www.oracle.com/cloud/free/ ; https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm ; https://docs.oracle.com/en-us/iaas/Content/Bastion/Concepts/bastionoverview.htm
