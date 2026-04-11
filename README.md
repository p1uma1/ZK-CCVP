# Gemstone Traceability System

A multi-blockchain gemstone traceability system with a tri-layer architecture.

## 🏗️ Architecture Overview

The system is designed with a three-layer blockchain integration to ensure identity management, event logging, and certification integrity.

| Layer | Blockchain | Responsibility |
| :--- | :--- | :--- |
| **Identity Layer** | Ethereum | Managing identities of miners, cutters, and retailers. |
| **Event Layer** | Aptos | High-throughput logging of gemstone transformation events. |
| **Certification Layer** | Cardano | Issuing and verifying immutable gemstone certificates. |

## 📂 Project Structure

- `docs/`: Project documentation and reports.
- `protocol/`: Security protocols, threat models, and verification flows.
- `architecture/`: System design diagrams and data models.
- `contracts/`: Smart contract code for Ethereum, Aptos, and Cardano.
- `zk/`: Zero-Knowledge circuits for privacy-preserving verification.
- `frontend/`: React/Vite based user interface.
- `backend/`: API services and cross-chain integrations.
- `scripts/`: Utility scripts for data generation and deployment.
