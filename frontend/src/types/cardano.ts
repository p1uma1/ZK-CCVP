// Types for Cardano scripts

export const RegistryDatum = {
    admin: "Bytes",
    issuers: ["Bytes"],
    version: "Integer",
};

export type RegistryDatumType = {
    admin: string;
    issuers: string[];
    version: bigint;
};

// In lucid-cardano, we don't necessarily need a schema for Constr if we build it manually,
// but we can define one if we want. For simplicity and to match common patterns:
export const RegistryRedeemer = {
    AddIssuer: "Bytes",
    RemoveIssuer: "Bytes",
    RotateAdmin: "Bytes",
};

export const CertificateDatum = {
    issuer_id: "Bytes",
    report_id: "Bytes",
    report_type: "Integer",
    gem_id: "Bytes",
    cert_hash: "Bytes",
    issued_at: "Integer",
    schema_version: "Integer",
    document_cid: "Bytes",
    issuer_pkh: "Bytes",
};

export type CertificateDatumType = {
    issuer_id: string;
    report_id: string;
    report_type: bigint;
    gem_id: string;
    cert_hash: string;
    issued_at: bigint;
    schema_version: bigint;
    document_cid: string;
    issuer_pkh: string;
};
