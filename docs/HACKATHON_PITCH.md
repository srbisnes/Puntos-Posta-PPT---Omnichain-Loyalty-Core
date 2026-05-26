# Hackathon Pitch (3-5 minutos)

## 1) Problema (30s)
Los programas de puntos tradicionales son cerrados, opacos y costosos de integrar.

## 2) Solución (45s)
Puntos Posta convierte puntos Web2 en `POSTA` on-chain en Arbitrum con:
- emisión idempotente
- límites de riesgo (`maxMintPerTx`, `dailyMintCap`, `MAX_SUPPLY`)
- controles de incident response (`pause`)
- reconciliación auditable (digest + firma opcional HMAC)

## 3) Arquitectura (45s)
1. Evento Web2 firmado por webhook.
2. Bridge worker valida firma, esquema, timestamp y red.
3. Preflight on-chain con `mintCheck` + `staticCall`.
4. Broadcast controlado (o dry-run con `BROADCAST_ENABLED=false`).
5. Reconciliación de ledger Web2 vs on-chain.

## 4) Demo en vivo (90s)
- `npm run validate:config`
- `BROADCAST_ENABLED=false npm run worker:demo`
- `npm run report:reconciliation`
Mostrar:
- Correlation ID
- resultado preflight
- digest del reporte

## 5) Diferenciadores (30s)
- Diseño enterprise-ready desde el día 1.
- Seguridad operativa y runbooks reales.
- Camino claro a firma institucional (KMS/HSM).

## 6) Roadmap (30s)
- Integrar signer KMS/HSM real.
- Integración Sepolia real en CI segura.
- Firma institucional del reporte + archivo inmutable.
