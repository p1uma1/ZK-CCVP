import { hashCertificateBytes } from "./hash";
import type { CanonicalCertificate } from "./canonicalize";

/**
 * CertificateDatum interface for off-chain usage.
 * This structure must match the on-chain definition in certificate_datum.ak
 */
export interface CertificateDatum {
  issuer_id: Uint8Array;
  report_id: Uint8Array;
  report_type: bigint;
  gem_id: Uint8Array;
  cert_hash: Uint8Array;
  issued_at: bigint;
  schema_version: bigint;
  document_cid: Uint8Array;
}

/**
 * Helper to convert a string to Uint8Array (UTF-8)
 */
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Builds the Cardano Datum from a canonical certificate.
 *
 * @param cert - The normalized certificate object.
 * @param reportTypeInt - The integer value matching the report_type.ak constants.
 * @param issuedAt - Unix timestamp (seconds).
 * @returns The structured CertificateDatum.
 */
export function buildCertificateDatum(
  cert: CanonicalCertificate,
  reportTypeInt: number,
  issuedAt: number
): CertificateDatum {
  return {
    issuer_id: textToBytes(cert.issuer_id),
    report_id: textToBytes(cert.report_id),
    report_type: BigInt(reportTypeInt),
    gem_id: textToBytes(cert.gem_id),
    cert_hash: hashCertificateBytes(cert),
    issued_at: BigInt(issuedAt),
    schema_version: 1n, // Initial version
    document_cid: textToBytes(cert.document_cid),
  };
}
