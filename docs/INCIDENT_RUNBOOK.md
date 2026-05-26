# Incident Runbook (Bridge + Token)

## Objetivo
Responder rápidamente ante incidentes de emisión anómala o riesgo operativo sin perder trazabilidad.

## Severidades
- **SEV-1**: posible mint no autorizado / riesgo de pérdida financiera.
- **SEV-2**: degradación operativa relevante (retries masivos, latencia alta, cola atascada).
- **SEV-3**: problema menor sin impacto financiero inmediato.

## Playbook SEV-1 (minting riesgo alto)
1. Ejecutar `pause()` desde wallet con `PAUSER_ROLE`.
2. Detener worker de bridge y bloquear nuevas corridas CI/CD de deploy.
3. Capturar evidencia:
   - tx hashes recientes
   - rango de bloques afectado
   - salida de `npm run report:reconciliation`
4. Reconciliar:
   - `totalMinted`, `totalBurned`, `outstandingLiability()`
   - ledger Web2 vs on-chain
5. Definir remediación:
   - rollback operativo en Web2
   - burn/corrección controlada en Web3 (si aplica)
6. Postmortem en <72h con acciones preventivas.

## Señales de alerta recomendadas
- >N mints/minuto por encima de baseline.
- aumento de errores `EventAlreadyProcessed`.
- `remainingDailyCapacity()` por debajo de umbral crítico.
- chain mismatch detectado por `EXPECTED_CHAIN_ID`.

## Evidencia mínima para auditoría
- Fecha/hora UTC del incidente.
- Persona on-call y aprobadores.
- Comandos ejecutados y resultados.
- Lista de tx afectadas y balance final reconciliado.
