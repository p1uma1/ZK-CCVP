# Issuer-Specific Certificate Structures

This document outlines the specific certificate and report types for major gemstone certification authorities (NGJA, GIC, GIA). These structures serve as the basis for mapping into a unified cross-chain certification model on Cardano.

## 🇱🇰 National Gem and Jewellery Authority (NGJA)
The NGJA (Sri Lanka) provides a verification portal requiring a Report Number and Certificate Type.

### Certificate Types:
- **Gemstone Brief Certificate**: A summary report of the gemstone's primary characteristics.
- **Gemstone Brief Certificate with Photo Image**: A brief certificate including a visual photograph of the specimen.
- **Detailed Certificate**: A comprehensive report with full technical data (RI, SG, etc.) and heat treatment disclosures.
- **Gem Identification Certificate**: Standard identification report confirming the gemstone variety.
- **Photo Gem Identification Reports**: Versions with or without disclosure of heat treatment.
- **Descriptive Certificate**: More detailed than a standard identification report.

## 🇱🇰 Gemological Institute of Colombo (GIC)
GIC is highly regarded for its precision and specific color classification.

### Certificate Types:
- **Certificate of Gem Identification**: A full-color lab report including gemstone identification, physical data, property tests, and photographs.
- **Diamond Grading Report (DGR)**: Focused on loose, natural diamonds (D-to-Z range) with 4Cs analysis.
- **Special Colour Reports**: Includes specific trade terms based on premium color/appearance:
    - **"Royal Blue"**: Specific to high-quality blue/violet sapphires.
    - **"Pigeon's Blood"**: Specific to top-tier red rubies.
- **Stone Heat Treatment Testing**: Specialized reports focusing on thermal enhancement evaluation.

## 🇺🇸 Gemological Institute of America (GIA)
The global standard for diamond grading and gemstone identification.

### Diamond Reports:
- **GIA Diamond Grading Report**: Full assessment of 4Cs, proportions, and clarity plots.
- **GIA Diamond Dossier®**: Compact version (0.15 - 1.99 cts) omitting clarity plots; uses laser inscriptions.
- **GIA Diamond Origin Report**: Includes 4Cs plus scientific geographic origin confirmation.
- **GIA Colored Diamond Reports**: Specific focus on Hue, Tone, and Saturation.

### Gemstone & Pearl Reports:
- **Colored Gemstone Identification Report**: Identifies stone and describes detectable treatments.
- **Colored Gemstone Identification & Origin Report**: Adds geographic origin determination.
- **Pearl Identification Report**: Detailed analysis of quantity, weight, shape, and origin (natural vs. cultured).
- **Cultured Pearl Classification Report**: Based on GIA’s 7 Pearl Value Factors™.

---

## 🗺️ Unified Model Mapping (Cardano)
*Draft Strategy*

To ensure cross-blockchain interoperability on the **Certification Layer (Cardano)**, these heterogeneous issuer formats must be mapped to a standardized metadata schema (CIP-25 or similar).

### Proposed Mapping Fields:
- `issuer_id`: (NGJA, GIC, GIA)
- `report_id`: Unique identifier from the issuer.
- `report_type`: Normalized category (Identification, Grading, Origin, Brief).
- `gem_data`:
    - `variety`: (Sapphire, Ruby, Emerald, etc.)
    - `weight`: (Carats)
    - `treatment_status`: (Heated, Natural, Beryllium, etc.)
- `media_hash`: IPFS CID pointing to the official certificate photo and scan.
- `issuer_signature`: On-chain proof of authenticity from the authority's wallet.
