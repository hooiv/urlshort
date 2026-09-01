# Incident runbook

1. Check `/status` and `/api/status/metrics`.
2. Inspect p95/p99 latency and error budget before changing traffic.
3. Disable a feature flag before rolling back a whole deployment when safe.
4. Revoke compromised API keys and rotate webhook secrets.
5. Preserve audit events and timestamps.
6. Roll back using the previous immutable release.
7. Communicate impact, start/end times, affected workspaces, and remediation.
8. Open a postmortem within one business day.

