# Puntos Posta (PPT)

Puntos Posta es la primera infraestructura de fidelización omnichain en Argentina. Transformamos programas de lealtad tradicionales en activos digitales (tokens) 100% propiedad del usuario, con liquidez y libertad total.

## Características principales
- **Omnichain:** Basado en el estándar OFT de LayerZero v2, permitiendo transferencias nativas entre distintas redes (Arbitrum, Base, Optimism).
- **Cero Fricción:** Diseñado para integrarse con soluciones de abstracción de cuentas (Privy/Biconomy), permitiendo que el usuario final use la app sin fricción cripto.
- **Transparencia:** 100% on-chain, inmutable y sin vencimientos arbitrarios.

## Arquitectura
El contrato principal (`PuntosPosta.sol`) utiliza:
- **LayerZero OFT:** Para la interoperabilidad cross-chain.
- **OpenZeppelin Access Control:** Para garantizar que solo el comercio autorizado pueda emitir o quemar puntos.

## Instalación

1. Clonar el repositorio:
   ```bash
   git clone [https://github.com/TU_USUARIO/puntos-posta.git](https://github.com/TU_USUARIO/puntos-posta.git)
