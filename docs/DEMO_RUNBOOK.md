# Demo Runbook (paso a paso)

## Requisitos
- `.env` completado desde `.env.example`
- Dependencias instaladas (`npm install`)

## Paso 1: Validación de configuración
```bash
npm run validate:config
```
Resultado esperado: `{"ok": true, ...}`.

## Paso 2: Dry-run de bridge (sin enviar tx)
```bash
BROADCAST_ENABLED=false npm run worker:demo
```
Resultado esperado:
- logs de validación OK
- `Broadcast disabled ... transaction not submitted.`

## Paso 3: Reconciliación
```bash
npm run report:reconciliation
```
Resultado esperado:
- JSON de reporte
- `reportDigest`
- `reportSignature` si `REPORT_HMAC_SECRET` está configurado

## Paso 4: Mensaje de cierre para jueces
- Seguridad: roles, caps, idempotencia, pause.
- Operación: preflight determinístico con `mintCheck`.
- Auditoría: reconciliación con digest y firma opcional.
