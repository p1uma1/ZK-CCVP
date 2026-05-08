/**
 * hash.ts
 *
 * Hashes an Aptos event payload using SHA-256.
 *
 * Mirrors backend/integrations/cardano/hash.ts — same algorithm, same output
 * format. The difference is the input: Cardano hashes a CanonicalCertificate
 * object, Aptos hashes an EventPayload object.
 *
 * The 32-byte digest produced here is what gets stored on-chain as
 * payload_hash inside the EventRecord struct in event_record.move.
 *
 * Off-chain verification flow:
 *   1. Fetch the IPFS document for an event.
 *   2. Canonicalize it with JSON.stringify(sortKeysDeep(payload)).
 *   3. SHA-256 the result with hashEventPayload().
 *   4. Compare against the payload_hash stored in the on-chain EventRecord.
 *   5. Match → data has not been tampered with.
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The canonical off-chain event payload stored on IPFS.
 *
 * Every field here ends up committed to the on-chain EventRecord via
 * payload_hash. Rich metadata (actor name, GPS coordinates, photo CIDs,
 * lab report references) lives here rather than on-chain to keep gas costs low.
 *
 * The structure must be serialised with keys sorted alphabetically before
 * hashing (see canonicalizePayload below) so that the same data always
 * produces the same hash regardless of field insertion order.
 */
export interface EventPayload {
  /** Gemstone identifier — must match gem_id in the on-chain EventRecord. */
  gem_id: string;

  /** Supply chain stage name — human-readable label matching the stage u8. */
  stage: string;

  /** Aptos account address of the actor recording this event (hex string). */
  actor_address: string;

  /** Unix timestamp in milliseconds matching the on-chain timestamp_ms. */
  timestamp_ms: number;

  /**
   * Sequence number matching the on-chain sequence_number.
   * Included in the payload so verifiers can detect replay attacks.
   */
  sequence_number: number;

  /**
   * Free-form metadata specific to the stage.
   * Examples:
   *   Mining:        { location: "Ratnapura, LK", mine_license: "ML-2024-447" }
   *   Certification: { lab: "GIC", report_id: "GIC-2024-88321", grade: "A" }
   *   Sale:          { ethereum_token_id: "42", buyer_wallet: "0xABCD..." }
   */
  metadata: Record<string, unknown>;

  /** IPFS CIDs of supporting documents or photos (optional). */
  attachments?: string[];
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/**
 * Recursively sorts object keys alphabetically.
 * Guarantees deterministic JSON serialisation — identical payloads always
 * produce identical JSON strings regardless of property insertion order.
 *
 * Identical logic to sortKeysDeep in cardano/canonicalize.ts so both sides
 * of the system use the same canonical form.
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
 * Returns the canonical JSON string for an event payload.
 * Keys are sorted alphabetically (recursive), no extra whitespace.
 * This string is what gets SHA-256 hashed to produce payload_hash.
 */
export function canonicalizePayload(payload: EventPayload): string {
  const sorted = sortKeysDeep(payload);
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Returns the SHA-256 hash of a canonical event payload as a lowercase
 * hex string (64 characters = 32 bytes).
 *
 * This hex string becomes the payload_hash field in the on-chain EventRecord.
 *
 * @example
 * const hash = hashEventPayload(payload);
 * // "9f1c2e6b7d3a4b8f..."  ← 64 hex chars, stored on-chain
 */
export function hashEventPayload(payload: EventPayload): string {
  const canonical = canonicalizePayload(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Returns the SHA-256 hash as a Uint8Array (32 bytes).
 *
 * Used when building the Aptos transaction payload directly, since the
 * Aptos SDK expects BCS-encoded byte arrays for vector<u8> parameters.
 *
 * @example
 * const hashBytes = hashEventPayloadBytes(payload);
 * // Uint8Array(32) — passed as payload_hash argument to log_event entry fn
 */
export function hashEventPayloadBytes(payload: EventPayload): Uint8Array {
  const hex = hashEventPayload(payload);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
