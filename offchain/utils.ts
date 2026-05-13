import { Data, fromText } from "@lucid-evolution/lucid";

export const RegistryDatum = Data.Object({
    admin: Data.Bytes(),
    issuers: Data.Array(Data.Bytes()),
    version: Data.Integer(),
});

export type RegistryDatumType = Data.Static<typeof RegistryDatum>;

export const RegistryRedeemer = Data.Enum([
    Data.Object({ AddIssuer: Data.Object({ pkh: Data.Bytes() }) }),
    Data.Object({ RemoveIssuer: Data.Object({ pkh: Data.Bytes() }) }),
    Data.Object({ RotateAdmin: Data.Object({ new_admin: Data.Bytes() }) }),
]);

export type RegistryRedeemerType = Data.Static<typeof RegistryRedeemer>;

export const CertificateDatum = Data.Object({
    issuer_id: Data.Bytes(),
    report_id: Data.Bytes(),
    report_type: Data.Integer(),
    gem_id: Data.Bytes(),
    cert_hash: Data.Bytes(),
    issued_at: Data.Integer(),
    schema_version: Data.Integer(),
    document_cid: Data.Bytes(),
    issuer_pkh: Data.Bytes(),
});

export type CertificateDatumType = Data.Static<typeof CertificateDatum>;

export function textToHex(value: string) {
    return fromText(value);
}