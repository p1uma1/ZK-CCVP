# GemID Cross-Chain Linkage

## What is a GemID?

`gem_id` is the **primary cross-chain identifier** for a gemstone. It is a human-readable string (e.g. `GEM-001`) that acts as the shared key tying together all three blockchain layers:

| Layer | Blockchain | What it stores | GemID role |
|---|---|---|---|
| Identity | Ethereum | Miner/owner identity, gem registration | `gem_id` is minted as a unique NFT token ID |
| Event | Aptos | Custody transfers, transformations | Events are tagged with `gem_id` |
| Certification | Cardano | Certificate hash + metadata | `gem_id` field in `CertificateDatum` |

---

## How the Link Works

```
[ Ethereum ]                  [ Aptos ]                      [ Cardano ]
  GemNFT                      EventLog                       CertDatum
  token_id = "GEM-001"  ───→  gem_id = "GEM-001"  ───────→  gem_id = "GEM-001"
  owner = 0xABCD              event = "CutAndPolished"        cert_hash = 0x9f1c...
```

No smart contract bridge is needed. The `gem_id` string is the **off-chain coordination key** — each chain independently stores it, and a verifier queries all three chains to reconstruct the full provenance trail.

---

## Verification Flow (Cardano side)

1. **User has** a physical certificate with a Report ID (e.g. `GIA-123456`)
2. **Look up** the Cardano UTXO where `report_id = "GIA-123456"`
3. **Read** `cert_hash` from the datum
4. **Fetch** the canonical certificate JSON from IPFS (`document_cid`)
5. **Recompute** SHA-256 of the canonical JSON
6. **Compare** → if hashes match, certificate is authentic and unmodified
7. **Read** `gem_id` from the datum → use it to query Ethereum (ownership) and Aptos (events)

---

## Format

`gem_id` is stored as a `ByteArray` on-chain (UTF-8 encoded string).

```
"GEM-001"  →  ByteArray (hex): 47454d2d303031
```

It is assigned at registration time on Ethereum and propagated to Aptos and Cardano by the issuer or system operator when recording events and certificates.

---

## Why not use the Ethereum token ID directly?

The Ethereum NFT token ID is a `uint256`. Carrying that across to Aiken and Move contracts is less readable. `gem_id` is a human-readable alias generated at registration (e.g. `GEM-<sequential-number>`) that is more portable across languages and serialization formats.
