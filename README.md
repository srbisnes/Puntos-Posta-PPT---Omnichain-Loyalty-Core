# Puntos Posta (PPT) — Arbitrum Loyalty Core

Infraestructura de fidelización Web3 para emitir y reconciliar puntos de lealtad en Arbitrum con seguridad empresarial, idempotencia y UX gasless.

## Objetivo

Convertir puntos de lealtad Web2 en activos digitales programables en Arbitrum, manteniendo paridad contable con el sistema central.

## Stack

- **Smart contracts:** Solidity `0.8.24` + OpenZeppelin
- **Red:** Arbitrum Sepolia (test) / Arbitrum One (prod)
- **Tooling:** Hardhat + TypeScript + Ethers v6
- **Backend bridge:** Node.js worker con KMS-ready signing
- **UX:** ERC-4337 + Paymaster (integración externa)

## Qué incluye este repositorio

- Contrato `PostaLoyaltyToken` con:
  - `AccessControl` (roles separados)
  - `Pausable`
  - límites de emisión (`maxMintPerTx`, `dailyMintCap`)
  - supply máximo fijo de `21,000,000 POSTA` (como política monetaria del programa)
  - idempotencia por `eventId`
  - pausa operativa que bloquea mint y transferencias
  - validación opcional de vínculo `rutHash -> wallet`
  - mint directo por identidad registrada con `mintPointsToRegisteredUser`
  - eventos para auditoría y reconciliación
- Script de despliegue para Arbitrum
- Worker de ejemplo para sincronizar eventos de negocio y mintear puntos on-chain
- Tests unitarios críticos

## Arquitectura resumida

1. **Sistema fuente (Web2)** genera evento `shipment_completed`.
2. **Bridge worker** valida reglas de negocio, calcula `eventId` determinístico y firma tx.
3. **Contrato** valida límites + idempotencia y ejecuta `mintPoints`.
4. **Ledger** se reconcilia con eventos `PointsMinted` y métricas Web2.

## Instalación

```bash
npm install
cp .env.example .env
```

## Variables de entorno

Revisar `.env.example`.

`MINT_MODE` en el worker acepta:
- `registered` (recomendado): usa `mintPointsToRegisteredUser`
- `direct`: usa `mintPoints` con wallet explícita

Variables opcionales de deploy:
- `ADMIN_ADDRESS`
- `MINTER_ADDRESS`
- `MAX_MINT_PER_TX`
- `DAILY_MINT_CAP`

Variables opcionales del worker:
- `POINTS_TO_MINT`
- `SHIPMENT_ID`
- `RUT_HASH`
- `USER_WALLET`
- `SOURCE_TIMESTAMP`
- `EXPECTED_CHAIN_ID` (default: `421614` para Arbitrum Sepolia)
- `MAX_TIMESTAMP_SKEW_SEC` (default: `86400`, máximo recomendado: `604800`) para bloquear eventos con timestamp anómalo
- `EVENT_PAYLOAD_JSON`, `WEBHOOK_SIGNATURE`, `WEBHOOK_SECRET` para validar autenticidad del payload entrante
- `SIGNER_MODE` (`private_key`, `kms_placeholder` o `ci_hmac`) para preparar migración a firma institucional
- `KMS_SIGNER_ADDRESS` (obligatorio cuando `SIGNER_MODE=kms_placeholder`)
- `BROADCAST_ENABLED` (`true`/`false`) para ejecutar solo preflight sin transmitir tx

## Comandos

```bash
npm run build
npm run test
npm run lint
npm run typecheck
npm run deploy:arb-sepolia
npm run worker:demo
npm run report:reconciliation
npm run validate:config
```

## Seguridad recomendada para producción

- `DEFAULT_ADMIN_ROLE` en multisig (Safe)
- signer del bridge en KMS/HSM
- monitoreo de alertas (anomalías de mint)
- rotación de claves y separación de responsabilidades

## Licencia

MIT


## Endpoints on-chain útiles

- `mintPoints(user, amount, eventId, rutHash)`: mint estándar con validación de idempotencia y caps.
- `mintPointsToRegisteredUser(rutHash, amount, eventId)`: evita ambigüedad de wallet usando registro interno.
- `remainingDailyCapacity()`: capacidad diaria disponible para emisión.
- `totalMinted`, `totalBurned`, `outstandingLiability()`: métricas on-chain para reconciliación contable.
- `mintCheck(...)`: preflight view para saber si un mint sería aceptado y por qué podría fallar (códigos de estado).


## Calidad de código

- `npm run lint`: ejecuta ESLint (flat config) sobre TypeScript.
- `npm run typecheck`: validación estricta de tipos sin emitir artefactos.
- `npm run clean`: elimina `artifacts` y `cache` de Hardhat.


## Preparación Enterprise

- Checklist operativo y de compliance en `docs/ENTERPRISE_READINESS.md`.
- Reporte de reconciliación on-chain con `npm run report:reconciliation
npm run validate:config` (usa `REPORT_FROM_BLOCK`/`REPORT_TO_BLOCK`).
- `REPORT_FROM_BLOCK`/`REPORT_TO_BLOCK` se validan para evitar rangos inválidos.
- Soporta salida a archivo con `REPORT_OUTPUT_PATH` y digest SHA-256 del reporte para evidencia auditable.
- `REPORT_HMAC_SECRET` opcional para emitir firma HMAC del reporte (evidencia adicional no repudiable a nivel operativo).


## CI/CD

- Pipeline en `.github/workflows/ci.yml` ejecuta `typecheck`, `lint`, `build` y `test` en cada push/PR.
- Política de seguridad y reporte responsable en `SECURITY.md`.


## Operación e Incidentes

- Runbook operativo en `docs/INCIDENT_RUNBOOK.md` para respuesta SEV-1/2/3.


## Endurecimiento urgente aplicado

- Se bloqueó `renounceRole` para roles críticos (`DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`) y así evitar pérdida accidental de control operativo.
- El worker ahora ejecuta `staticCall` previo al envío para detectar reverts antes de broadcast.


## Firma de webhook (enterprise)

El worker soporta un modo de ingesta firmado con HMAC-SHA256:
- Se envía el JSON en `EVENT_PAYLOAD_JSON`.
- Se valida `WEBHOOK_SIGNATURE` (hex) con `WEBHOOK_SECRET`.
- Si la firma falla, no se transmite ninguna transacción on-chain.


## Go-live

- Checklist de salida a producción en `docs/PRODUCTION_GO_LIVE_CHECKLIST.md`.
- El reporte de reconciliación valida `REPORT_EXPECTED_CHAIN_ID` para prevenir lecturas en red incorrecta.


## Validación estricta de payload

El worker valida estructura y tipos del payload firmado (`shipmentId`, `rutHash`, `pointsToMint`, `sourceTimestamp`, `userWallet` opcional) y rechaza direcciones inválidas antes del `staticCall` y del broadcast on-chain.


## Plan institucional

- Guía paso a paso para revisar, entender, preparar, armar, diseñar y orquestar la operación: `docs/INSTITUTIONAL_IMPLEMENTATION_PLAN.md`.


### Códigos `mintCheck`

- `0` `MINT_CHECK_OK`
- `1` `MINT_CHECK_PAUSED`
- `2` `MINT_CHECK_ZERO_USER`
- `3` `MINT_CHECK_INVALID_AMOUNT`
- `4` `MINT_CHECK_EVENT_PROCESSED`
- `5` `MINT_CHECK_PER_TX_CAP`
- `6` `MINT_CHECK_MAX_SUPPLY`
- `7` `MINT_CHECK_REGISTRY_MISMATCH`
- `8` `MINT_CHECK_DAILY_CAP`


## Seguridad de signer

- `kms_placeholder` ahora opera en modo **fail-closed**: no transmite transacciones hasta que exista implementación real KMS/HSM.


## Ruta de migración institucional de firma

Además de `PrivateKeyBridgeSigner` y `KmsPlaceholderBridgeSigner`, existe `ExternalServiceBridgeSigner` para integrar un servicio corporativo de firma (KMS/HSM proxy) sin reescribir la lógica de orquestación del worker.


## Estabilidad de integración

- `mintCheck` expone **constantes públicas de estado** (`MINT_CHECK_*`) para evitar dependencias frágiles con códigos mágicos en servicios externos.


## Modo dry-run operativo

Con `BROADCAST_ENABLED=false`, el worker ejecuta todas las validaciones y preflights (`mintCheck` + `staticCall`) pero no envía la transacción. Útil para pruebas operativas y validaciones previas a ventanas de cambio.


## Trazabilidad operativa

El worker genera un `Correlation ID` por ejecución para facilitar debugging, auditoría y correlación entre logs de bridge, monitoreo y tx on-chain.


## Validaciones adicionales aplicadas

- `EXPECTED_CHAIN_ID` y `REPORT_EXPECTED_CHAIN_ID` ahora exigen enteros positivos válidos.
- `REPORT_FROM_BLOCK` y `REPORT_TO_BLOCK` se validan como enteros no negativos coherentes.


- La suite de tests también valida explícitamente escenarios `MINT_CHECK_EVENT_PROCESSED` y `MINT_CHECK_MAX_SUPPLY` para garantizar estabilidad de preflight en edge-cases de replay y tope de supply.


## Validación de configuración

- `npm run validate:config` valida parámetros críticos de entorno antes de ejecutar el bridge.
- Ayuda a evitar incidentes por config inválida (chain id, signer mode, keys/addresses, skew, broadcast flag).


## Presentación

- Pitch listo para jurado: `docs/HACKATHON_PITCH.md`.
- Guion técnico de demo en vivo: `docs/DEMO_RUNBOOK.md`.


## Firma institucional de artefactos

El reporte soporta `ARTIFACT_SIGNING_MODE`:
- `none`: sin firma adicional
- `hmac`: firma HMAC sobre el JSON (requiere `REPORT_HMAC_SECRET`)

Campos auxiliares:
- `ARTIFACT_SIGNER`: identificador del firmante institucional (ej. KMS key id lógico).


## Integración CI en red real

El workflow incluye `integration-sepolia-preflight-real` (manual) usando secretos de CI y `SIGNER_MODE=ci_hmac` con `BROADCAST_ENABLED=false` para validar preflights reales en Sepolia sin transmitir transacciones.
