# Security Policy

## Supported Versions

This repository is pre-1.0 and under active hardening. Report issues against the latest `main` branch.

## Reporting a Vulnerability

Please do **not** open public issues for vulnerabilities involving mint authorization, replay/idempotency bypass, cap bypass, or key management.

Send a private report including:
- impact summary
- affected files and function names
- proof-of-concept steps
- mitigation recommendation

Temporary contact process for this repository:
1. Open a private security advisory in GitHub (preferred).
2. If unavailable, notify project maintainers through private channels used for production operations.

## Severity Guidance

High severity examples:
- unauthorized minting
- replay of processed `eventId`
- bypass of daily/per-tx caps
- privilege escalation of admin/minter/pauser roles

Medium severity examples:
- reconciliation mismatch that can desync accounting
- worker config weaknesses that can trigger wrong mint path

## Hardening Baseline

- Multisig administration for `DEFAULT_ADMIN_ROLE`
- KMS/HSM-backed bridge signer
- 24/7 monitoring for mint anomalies
- pause runbook tested via game-day exercises
