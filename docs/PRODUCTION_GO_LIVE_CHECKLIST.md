# Production Go-Live Checklist

## Contract & Roles
- [ ] `DEFAULT_ADMIN_ROLE` assigned to multisig (Safe).
- [ ] `MINTER_ROLE` assigned to bridge signer only.
- [ ] `PAUSER_ROLE` assigned to incident-response operator wallet(s).
- [ ] `setMintCaps` reviewed and approved by dual-control process.

## Bridge Security
- [ ] `BRIDGE_PRIVATE_KEY` replaced by KMS/HSM signer in production runtime.
- [ ] `WEBHOOK_SECRET` rotated and vaulted.
- [ ] `EXPECTED_CHAIN_ID` matches production network.
- [ ] `MAX_TIMESTAMP_SKEW_SEC` approved by risk team.

## Monitoring & Alerting
- [ ] Alerts for mint volume anomalies configured.
- [ ] Alerts for replay/idempotency violations configured.
- [ ] Alerts for low `remainingDailyCapacity()` configured.
- [ ] Alerts for chain mismatch and signature failures configured.

## Reconciliation
- [ ] Daily `report:reconciliation` executed and archived.
- [ ] `reportDigest` stored in immutable audit record.
- [ ] Web2 ledger parity checks signed off by finance.

## DR / Incident Readiness
- [ ] SEV-1 drill completed in last 30 days.
- [ ] `pause()` tested from PAUSER wallet.
- [ ] Recovery and communication runbook approved.

## Release Gates
- [ ] CI green on default branch.
- [ ] External security review completed.
- [ ] Change ticket approved by security + engineering + product.
