# Plan Institucional de Implementación (Revisar · Entender · Preparar · Armar · Diseñar · Orquestar)

Este documento aterriza el camino para pasar de un prototipo técnico a una operación institucional en producción.

## 1) Revisar (Assessment inicial)

### 1.1 Revisión técnica
- Contrato desplegado con roles correctos (`DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`).
- Configuración de caps (`maxMintPerTx`, `dailyMintCap`) validada por negocio + riesgo.
- Cobertura de test y CI verde en rama base.

### 1.2 Revisión de seguridad
- Claves y secretos en vault/KMS/HSM (sin texto plano en runtime).
- Validez de firmas HMAC en ingestión (`WEBHOOK_SIGNATURE`).
- Verificación de chain pinning y timestamp skew.

### 1.3 Revisión de cumplimiento
- Política de datos personales (RUT hash + retención mínima).
- Trazabilidad auditable de reconciliación diaria.
- Aprobación legal/compliance para flujos de tokenización.

---

## 2) Entender (Modelo operativo y de riesgo)

### 2.1 Modelo de responsabilidad (RACI)
- **Security**: custodia de claves, rotación de secretos, respuesta a incidentes.
- **Engineering**: operación de bridge, CI/CD, observabilidad.
- **Finance/Ops**: reconciliación Web2 vs on-chain, aprobación de excepciones.
- **Product**: definición de campañas/caps de negocio.

### 2.2 Riesgos principales
- Mint no autorizado por compromiso de credenciales.
- Emisión en red incorrecta por error de entorno.
- Reprocesamiento de eventos upstream o payloads malformados.
- Desalineación contable entre ledger Web2 y on-chain.

---

## 3) Preparar (Pre-producción)

### 3.1 Ambientes
- `dev` / `staging` / `prod` aislados por secretos, RPC y wallets.
- Variables críticas segregadas por entorno.

### 3.2 Integración de seguridad
- Sustituir signer EOA por firma KMS/HSM en worker.
- Habilitar rotación de `WEBHOOK_SECRET` con procedimiento documentado.
- Definir ventana de skew por política de riesgo.

### 3.3 Observabilidad
- Dashboard con:
  - mints por minuto
  - % consumo de daily cap
  - errores por tipo (firma, chain mismatch, replay)
- Alertas con escalamiento SEV-1/SEV-2.

---

## 4) Armar (Blueprint de componentes)

### 4.1 Componentes mínimos
1. **Webhook Ingestion Layer** (validación firma + schema)
2. **Bridge Decision Engine** (reglas de negocio, idempotencia lógica)
3. **Signer Service** (KMS/HSM)
4. **Tx Relay** (envío + confirmación)
5. **Reconciliation Job** (reporte + digest + archivo)
6. **Audit Storage** (evidencias inmutables)

### 4.2 Datos de auditoría por evento
- `eventId`
- `shipmentId`
- `rutHash`
- `pointsToMint`
- `txHash`
- `blockNumber`
- `status`
- `createdAt` / `confirmedAt`

---

## 5) Diseñar (Arquitectura objetivo)

### 5.1 Patrón de flujo
`Webhook firmado -> Validación -> Regla negocio -> StaticCall -> Sign -> Broadcast -> Confirm -> Reconciliación`

### 5.2 Principios
- Fail-fast ante inconsistencia de red/firma/timestamp.
- Separación de funciones (quien aprueba caps != quien opera worker).
- Idempotencia extremo a extremo (`eventId` on-chain + dedupe off-chain).
- Auditoría by-design (hashes, reportes, trazas de aprobación).

---

## 6) Orquestar (Ejecución y gobierno continuo)

### 6.1 Cadencia operativa
- Reconciliación diaria con evidencia.
- Revisión semanal de alertas y anomalías.
- Revisión mensual de roles y accesos.
- Simulacro trimestral de incidente SEV-1.

### 6.2 Gates de cambio
Todo cambio en contrato/caps/bridge debe pasar por:
1. Ticket + threat assessment
2. Aprobación dual (Security + Engineering)
3. Validación en staging
4. Ventana de despliegue controlada
5. Validación post-deploy (smoke + reconciliación)

### 6.3 KPIs institucionales
- p95 evento->tx submit
- p95 tx submit->confirmado
- % mints fallidos por causa
- % reconciliaciones con `parityOk=true`
- tiempo medio de contención SEV-1

---

## 7) Entregables para comité institucional
- Checklist de go-live completo
- Evidencia CI verde
- Evidencia de reconciliación firmada
- Acta de simulacro de incidente
- Matriz de riesgos actualizada
