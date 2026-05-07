# GemNFT Metadata Specification

This document specifies the metadata structure for GemNFTs on the **Identity Layer (Ethereum)**. It aims to maximize compatibility with marketplaces like OpenSea while providing industrial-grade traceability data.

## OpenSea Compatibility

The schema follows the [OpenSea Metadata Standards](https://docs.opensea.io/docs/metadata-standards).

- **`image`**: Should point to an `ipfs://` CID containing the high-resolution image.
- **`attributes`**: Used for filtering and sorting on the marketplace. Use `display_type` for carat weights and dates.

---

## Attribute Dictionary

| Trait Type | Description | Values / Format |
| :--- | :--- | :--- |
| `GemID` | The global cross-chain coordination key. | `GEM-XXXX` string |
| `Variety` | The type of gemstone. | `Blue Sapphire`, `Ruby`, etc. |
| `Origin` | Geographic mining location. | `Sri Lanka`, `Mozambique`, etc. |
| `Carat Weight` | Numerical weight. | `number` |
| `Status` | Current state of the gem. | `Rough`, `Cut`, `Set` |
| `Treatment` | Thermal or chemical enhancement. | `Natural`, `Heated`, `Beryllium` |
| `Cert Hash` | SHA-256 hash of the Cardano certificate. | 64-character hex string |

---

## Cross-Chain Verification Strategy

The integrity of the NFT is guaranteed by the **Certification Layer (Cardano)**.

1. **User sees NFT** on Ethereum.
2. **User reads `Cert Hash`** and `GemID` from the NFT attributes.
3. **User visits portal** (linked via `external_url`).
4. **Portal queries Cardano** for the UTXO corresponding to the `GemID`.
5. **System compares** the `cert_hash` in the Cardano datum with the `Cert Hash` in the NFT metadata.
6. **Result**: If they match, the NFT's claimed quality and identity are cryptographically proven.

---

## Implementation Notes

### Handling Transformations
When a gem moves from **Rough** to **Cut**:
1. The off-chain system generates a new **Canonical JSON** with updated `gem_data`.
2. A new certificate is anchored on **Cardano**.
3. The Ethereum NFT metadata is updated (using **ERC-4906**) to reflect the new `Cert Hash` and `Status`.

### Storage
- **Primary**: IPFS is the default for metadata JSON and images to ensure availability and content-addressing.
- **Fallback**: Arweave for long-term historical persistence of "Detailed Certificates".
