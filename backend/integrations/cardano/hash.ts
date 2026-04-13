/**
 * hash.ts
 *
 * Hashes a canonical certificate string using SHA-256.
 * The output is a 32-byte hex string — stored on-chain as cert_hash (ByteArray).
 *
 * This module is intentionally independent of any Cardano library
 * so it can be tested in isolation.
 */

import { createHash } from "crypto";
import { canonicalize, type CanonicalCertificate } from "./canonicalize";

/**
 * Returns the SHA-256 hash of a canonical certificate as a lowercase hex string.
 *
 * @param cert   - The normalized certificate object
 * @returns        64-char hex string (32 bytes)
 *
 * @example
 * const hash = hashCertificate(cert);
 * // "9f1c2e6b7d3a4b8f..."  ← this becomes cert_hash in CertificateDatum
 */
export function hashCertificate(cert: CanonicalCertificate): string {
  const canonical = canonicalize(cert);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Returns the SHA-256 hash as a Uint8Array (32 bytes).
 * Useful when building the Cardano datum directly with Lucid/Mesh.
 */
export function hashCertificateBytes(cert: CanonicalCertificate): Uint8Array {
  const hex = hashCertificate(cert);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
