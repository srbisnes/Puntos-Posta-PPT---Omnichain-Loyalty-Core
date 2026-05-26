# Enterprise Readiness Checklist (Puntos Posta / Arbitrum)

## 1) Gobernanza y Control de Cambios

- `DEFAULT_ADMIN_ROLE` debe vivir en una multisig (Safe 2/3 o 3/5).
- Rotación trimestral de claves de operadores de bridge.
- Toda actualización de caps (`setMintCaps`) debe tener change-ticket + aprobación dual.

## 2) Seguridad Operacional

- Claves de firma en KMS/HSM (nunca en texto plano ni en CI).
- Alertas en tiempo real por:
  - spikes de mint > umbral
  - intentos de replay (`EventAlreadyProcessed`)
  - consumo de `remainingDailyCapacity` > 80%
- Procedimiento de incidente con `pause()` en menos de 5 minutos.

## 3) Reconciliación Contable

- Verificar diariamente:
  - `totalMinted`
  - `totalBurned`
  - `outstandingLiability()`
- Comparar contra ledger Web2 y guardar evidencia auditable (CSV/JSON firmado).

## 4) SLO/SLA sugeridos

- Disponibilidad del bridge: >= 99.9%
- Latencia p95 (evento Web2 -> tx submit): < 30s
- Latencia p95 (submit -> confirmación): < 90s
- Error rate mensual de mints válidos: < 0.1%

## 5) Cumplimiento y Privacidad

- Nunca persistir RUT en claro en sistemas de observabilidad.
- Usar hash con salt/pepper en el backend.
- Política de minimización de datos y retención definida por legal/compliance.

## 6) Recomendaciones previas a producción

- Auditoría externa del contrato y del backend bridge.
- Simulacro game-day de incident response (replay masivo / clave comprometida).
- Prueba de carga de bridge con volumen de campaña pico.
