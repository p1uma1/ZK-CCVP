# ZK-CCVP — Zero-Knowledge Certified Certificate Verification Protocol

A Cardano-based protocol for issuing and verifying gemstone certification tokens on-chain using PlutusV3 smart contracts.

---

## Table of Contents

- [Overview](#overview)
- [Smart Contracts](#smart-contracts)
- [Deployed Addresses](#deployed-addresses)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Scripts](#scripts)
- [How It Works](#how-it-works)
- [Adding a Certificate (dApp)](#adding-a-certificate-dapp)
- [Verifying a Certificate](#verifying-a-certificate)
- [Security Model](#security-model)

---

## Overview

ZK-CCVP allows authorized issuers to mint certificate tokens on the Cardano blockchain. Each token is uniquely identified by `(policy_id, gem_id)` and is backed by on-chain metadata stored in a spending validator UTxO.

The system uses three contracts that work together:

```
Admin controls registry
       │
       ▼
Issuer Registry  ──(reference input)──▶  Certificate Minting Policy
                                                    │
                                                    ▼
                                         Certificate Validator
                                         (on-chain metadata store)
```

---

## Smart Contracts

| Contract | Type | Description |
|---|---|---|
| `issuer_registry_validator` | SpendingValidator | Maintains the list of authorized issuers |
| `certificate_policy` | MintingPolicy | Controls certificate token minting |
| `certificate_validator` | SpendingValidator | Stores certificate metadata on-chain |

All contracts are compiled with **Aiken v1.1.21** targeting **PlutusV3**.

---

## Deployed Addresses

> Network: **Cardano Preprod Testnet**

| Item | Value |
|---|---|
| Registry Script Hash | `5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e959aa582de7cb` |
| Registry Genesis TxHash | `a0f6bcb93212c6b2c882248cdbda87a959d6968e07a618c83e6ccd7f16ae3098` |
| Certificate Policy ID | `a22a9757990def21f835701c8c97b6c7f8c902e864d67822decfe1f8` |
| Certificate Validator Hash | `06fddd3816eaf57a6fa82c6e86961b9902fd588ee9de07607f392035` |

To derive the bech32 addresses, run:

```bash
npx tsx offchain/print_addresses.ts
```

---

## Project Structure

```
ZK-CCVP/
├── onchain/                        # Aiken smart contracts
│   ├── aiken.toml
│   ├── plutus.json                 # Compiled blueprint (generated)
│   ├── validators/
│   │   ├── certificate_policy.ak   # Minting policy
│   │   ├── certificate_validator.ak
│   │   └── issuer_registry_validator.ak
│   └── lib/
│       └── types/
│           ├── certificate_datum.ak
│           └── registry_datum.ak
│
└── offchain/                       # TypeScript off-chain code
    ├── .env                        # secrets (never commit)
    ├── config.ts                   # Lucid + Blockfrost setup
    ├── validators.ts               # Contract exports
    ├── init_registry.ts            # Deploy registry (run once)
    ├── add_issuer.ts               # Admin: add issuer PKH
    ├── mint_certificate.ts         # Issuer: mint a certificate token
    └── print_addresses.ts          # Print all contract addresses
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Aiken](https://aiken-lang.org/) v1.1.21
- A [Blockfrost](https://blockfrost.io/) Preprod API key
- A Cardano wallet seed phrase (admin + issuer)

---

## Setup

**1. Clone and install dependencies**

```bash
git clone https://github.com/your-org/ZK-CCVP
cd ZK-CCVP/offchain
npm install
```

**2. Create `.env`**

```env
BLOCKFROST_PROJECT_ID=preprodXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CARDANO_NETWORK=Preprod
ADMIN_SEED=word1 word2 word3 ... word24
ISSUER_SEED=word1 word2 word3 ... word24
```

**3. Compile contracts** (only needed if you modify the Aiken source)

```bash
cd onchain
aiken build
```

---

## Scripts

### Initialize the Registry (run once)

Deploys the issuer registry UTxO. Only needs to be run once per deployment.

```bash
npx tsx offchain/init_registry.ts
```

Output: a transaction hash. Save it — this is the genesis UTxO.

### Print Contract Addresses

```bash
npx tsx offchain/print_addresses.ts
```

Prints the registry address, certificate validator address, and policy ID.

### Add an Issuer

Adds a wallet PKH to the authorized issuers list. Must be run by the admin.

```bash
npx tsx offchain/add_issuer.ts <issuer_pkh>
```

### Mint a Certificate

Mints a certificate token for a gemstone. Must be run by an authorized issuer.

```bash
npx tsx offchain/mint_certificate.ts <gem_id>
```

---

## How It Works

### 1. Registry Setup (Admin)

The admin deploys the registry with an empty `issuers` list, then adds authorized issuer PKHs via `AddIssuer` transactions. Each update increments the `version` field.

```
RegistryDatum {
  admin:   "98964794..."   // admin PKH
  issuers: ["abc123...", "def456..."]
  version: 2
}
```

### 2. Certificate Minting (Issuer)

When an issuer mints a certificate, the minting policy checks:

1. Issuer PKH signed the transaction
2. Registry UTxO is included as a **reference input** (read-only, never consumed)
3. Issuer PKH is in `registry.issuers`
4. Exactly **1 token** is minted with quantity = 1

The asset name is set to the `gem_id` bytes, making each token globally unique by `(policy_id, gem_id)`.

### 3. Certificate Storage

Alongside the mint, a UTxO is sent to the **certificate validator address** with the full `CertificateDatum` as an inline datum:

```
CertificateDatum {
  issuer_id:      bytes
  report_id:      bytes
  report_type:    int
  gem_id:         bytes    ← matches the token asset name
  cert_hash:      bytes    ← hash of off-chain PDF
  issued_at:      int      ← Unix timestamp
  schema_version: int
  document_cid:   bytes    ← IPFS CID
  issuer_pkh:     bytes
}
```

---

## Adding a Certificate (dApp)

```typescript
import { getCertificatePolicy, getCertificatePolicyId,
         certificateAddress, registryAddress } from "./validators";
import { fromText, Data } from "@lucid-evolution/lucid";

const certPolicy   = getCertificatePolicy();
const policyId     = getCertificatePolicyId();
const regUtxos     = await lucid.utxosAt(registryAddress("Preprod"));
const certAddr     = certificateAddress("Preprod");

const datum = Data.to(datumData, CertificateDatum);

const tx = await lucid
  .newTx()
  .mintAssets(
    { [policyId + fromText(gemId)]: 1n },
    issuerPkh                              // redeemer
  )
  .readFrom([regUtxos[0]])                 // reference input — not consumed
  .pay.ToContract(
    certAddr,
    { kind: "inline", value: datum },
    { lovelace: 2_000_000n }
  )
  .addSignerKey(issuerPkh)
  .attach.MintingPolicy(certPolicy)
  .complete();

const signed  = await tx.sign.withWallet().complete();
const txHash  = await signed.submit();
console.log("Certificate minted:", txHash);
```

---

## Verifying a Certificate

```typescript
import { getCertificatePolicyId, certificateAddress } from "./validators";

const POLICY_ID = getCertificatePolicyId();

async function verifyCertificate(gemId: string) {
  // 1. Check token exists under the canonical policy ID
  const assetName = POLICY_ID + fromText(gemId);

  // 2. Fetch UTxO from certificate validator
  const utxos = await lucid.utxosAt(certificateAddress("Preprod"));
  const certUtxo = utxos.find(u => u.assets[assetName]);

  if (!certUtxo) throw new Error("Certificate not found");

  // 3. Read on-chain datum
  const datum = Data.from(certUtxo.datum, CertificateDatum);

  // 4. Verify cert_hash matches off-chain document
  // 5. Optionally resolve datum.document_cid on IPFS

  return datum;
}
```

---

## Security Model

| Threat | Mitigation |
|---|---|
| Attacker mints fake certificate | Must be in admin-controlled `issuers` list |
| Attacker deploys copy of policy | Results in a different `policy_id` — tokens unrecognized |
| Attacker modifies registry | Registry validator requires admin signature |
| Front-end is tampered with | On-chain validator enforces all rules regardless |
| Policy ID collision | Cryptographically impossible — hash of script bytes |

The `policy_id` is the canonical identifier of trust. It is deterministic — applying the same `registry_script_hash` parameter always produces the same `policy_id`. Hardcode it in your dApp:

```typescript
// constants.ts
export const CERTIFICATE_POLICY_ID =
  "a22a9757990def21f835701c8c97b6c7f8c902e864d67822decfe1f8";
```

---

## Explorer

View transactions on Preprod:
`https://preprod.cardanoscan.io/transaction/<txHash>`

View tokens by policy:
`https://preprod.cardanoscan.io/tokenPolicy/a22a9757990def21f835701c8c97b6c7f8c902e864d67822decfe1f8`
