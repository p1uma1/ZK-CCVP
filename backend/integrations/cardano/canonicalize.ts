/**
 * canonicalize.ts
 *
 * Converts a raw issuer certificate (any format) into the standard
 * canonical JSON structure used for hashing. Key ordering is deterministic
 * (alphabetical) so the same certificate always produces the same hash.
 */

export interface CertificateImage {
  type: string;       // "certificate_scan" | "gem_photo"
  cid: string;        // IPFS CID
  sha256: string;     // SHA-256 hex of the actual file content
}

export interface GemData {
  species: string;    // e.g. "Corundum"
  variety: string;    // e.g. "Blue Sapphire"
  weight_ct: number;  // Carat weight
}

export interface CanonicalCertificate {
  document_cid: string;
  gem_data: GemData;
  gem_id: string;
  images: CertificateImage[];
  issuer_id: string;
  report_id: string;
  report_type: string;
}

/**
 * Sorts object keys recursively (alphabetical) to guarantee deterministic output.
 * This is the core requirement for a stable canonical form.
 */
function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as object)
      .sort()
      .reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return obj;
}

/**
 * Produces the canonical JSON string for a certificate.
 * - Keys sorted alphabetically (recursive)
 * - No extra whitespace
 * - UTF-8 encoded
 *
 * This string is what gets SHA-256 hashed to produce cert_hash.
 */
export function canonicalize(cert: CanonicalCertificate): string {
  const sorted = sortKeysDeep(cert);
  return JSON.stringify(sorted);
}
