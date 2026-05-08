/**
 * build_event.ts
 *
 * Builds the parameter object for a gem_event_store::log_event transaction.
 *
 * Mirrors backend/integrations/cardano/build_datum.ts — that file constructs
 * a CertificateDatum for a Cardano transaction; this file constructs the
 * equivalent argument bundle for an Aptos Move entry function call.
 *
 * The output of buildLogEventParams() is passed directly to
 * submitLogEvent() in submit_tx.ts, which encodes it for the Aptos SDK.
 *
 * Stage constants
 * ---------------
 * These must stay in sync with the u8 constants in event_record.move.
 * They are exported so the DApp frontend can use them for validation and
 * display without importing the Move source.
 */

import { hashEventPayloadBytes, type EventPayload } from "./hash";

// ---------------------------------------------------------------------------
// Stage constants — mirrors event_record.move
// ---------------------------------------------------------------------------

export const STAGE = {
  MINING:        1,
  CUTTING:       2,
  CERTIFICATION: 3,
  TRANSPORT:     4,
  WHOLESALE:     5,
  RETAIL:        6,
  SALE:          7,
} as const;

export type StageValue = typeof STAGE[keyof typeof STAGE];

/** Human-readable label for each stage — used in UI and payload metadata. */
export const STAGE_LABEL: Record<StageValue, string> = {
  1: "Mining",
  2: "Cutting",
  3: "Certification",
  4: "Transport",
  5: "Wholesale",
  6: "Retail",
  7: "Sale",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The complete parameter bundle for a gem_event_store::log_event call.
 *
 * All fields map 1-to-1 to the entry function signature in Move:
 *
 *   public entry fun log_event(
 *     actor:        &signer,      ← provided by the wallet, not here
 *     store_owner:  address,
 *     gem_id:       vector<u8>,
 *     stage:        u8,
 *     prev_tx_hash: vector<u8>,
 *     payload_hash: vector<u8>,
 *   )
 */
export interface LogEventParams {
  /** Address of the account that owns the GemEventStore resource. */
  storeOwner: string;

  /**
   * UTF-8 encoded gem identifier bytes.
   * Must match the gem_id used on Cardano (CertificateDatum.gem_id) and
   * Ethereum (ERC-721 token metadata) so all three chains reference the
   * same physical stone.
   */
  gemId: Uint8Array;

  /**
   * Supply chain stage — one of the STAGE constants above (1–7).
   * Validated by the Move module; an out-of-range value will abort the tx.
   */
  stage: StageValue;

  /**
   * SHA-256 hash (32 bytes) of the previous Aptos transaction for this gem.
   * Pass an empty Uint8Array (length 0) for the genesis (MINING) event.
   */
  prevTxHash: Uint8Array;

  /**
   * SHA-256 hash (32 bytes) of the canonical off-chain event payload stored
   * on IPFS. Produced by hashEventPayloadBytes() in hash.ts.
   */
  payloadHash: Uint8Array;
}

/**
 * Input provided by the caller (DApp backend or CLI script) before the
 * payload hash is computed. buildLogEventParams() derives LogEventParams
 * from this.
 */
export interface LogEventInput {
  /** Address of the GemEventStore owner (the deployer account). */
  storeOwner: string;

  /** Gem identifier string — will be UTF-8 encoded into bytes. */
  gemId: string;

  /** Stage value — use the STAGE constants. */
  stage: StageValue;

  /**
   * Previous Aptos transaction hash as a hex string (64 chars = 32 bytes).
   * Pass an empty string "" for the genesis (MINING) event.
   */
  prevTxHashHex: string;

  /**
   * Free-form metadata to include in the off-chain IPFS payload.
   * Examples:
   *   Mining:        { location: "Ratnapura, LK", mine_license: "ML-2024-447" }
   *   Certification: { lab: "GIC", report_id: "GIC-2024-88321" }
   *   Sale:          { ethereum_token_id: "42" }
   */
  metadata: Record<string, unknown>;

  /**
   * Sequence number of this event (0-indexed, per gem).
   * The caller is responsible for providing the correct value; the on-chain
   * module enforces ordering independently.
   */
  sequenceNumber: number;

  /** Actor's Aptos account address (hex string, for the payload record). */
  actorAddress: string;

  /** IPFS CIDs of supporting documents or photos (optional). */
  attachments?: string[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Builds the LogEventParams bundle for a log_event transaction.
 *
 * Steps:
 *   1. Constructs the canonical EventPayload (to be stored on IPFS separately).
 *   2. Hashes it with SHA-256 to produce payload_hash (32 bytes).
 *   3. Encodes gem_id as UTF-8 bytes.
 *   4. Decodes prevTxHashHex into a Uint8Array (or empty for genesis).
 *   5. Returns the complete LogEventParams.
 *
 * @param input   - Caller-supplied event details.
 * @returns         LogEventParams ready to pass to submitLogEvent().
 *
 * @example — Genesis (mining) event
 * const params = buildLogEventParams({
 *   storeOwner:     "0x402167...",
 *   gemId:          "GEM-LK-SAP-2024-00147",
 *   stage:          STAGE.MINING,
 *   prevTxHashHex:  "",           // empty = genesis
 *   actorAddress:   "0xCAFE...",
 *   sequenceNumber: 0,
 *   metadata:       { location: "Ratnapura, LK", mine_license: "ML-2024-447" },
 * });
 *
 * @example — Subsequent (cutting) event
 * const params = buildLogEventParams({
 *   storeOwner:     "0x402167...",
 *   gemId:          "GEM-LK-SAP-2024-00147",
 *   stage:          STAGE.CUTTING,
 *   prevTxHashHex:  "a3f8c1e2d4b5...",   // hash of the mining tx
 *   actorAddress:   "0xABCD...",
 *   sequenceNumber: 1,
 *   metadata:       { workshop: "Colombo Gems Ltd", facets: 58 },
 * });
 */
export function buildLogEventParams(input: LogEventInput): {
  params: LogEventParams;
  payload: EventPayload;
} {
  // 1. Build the canonical payload (this goes to IPFS)
  const payload: EventPayload = {
    gem_id:          input.gemId,
    stage:           STAGE_LABEL[input.stage],
    actor_address:   input.actorAddress,
    timestamp_ms:    Date.now(),
    sequence_number: input.sequenceNumber,
    metadata:        input.metadata,
    ...(input.attachments && { attachments: input.attachments }),
  };

  // 2. Hash the payload → payload_hash (32 bytes on-chain)
  const payloadHash = hashEventPayloadBytes(payload);

  // 3. Encode gem_id as UTF-8 bytes
  const gemId = new TextEncoder().encode(input.gemId);

  // 4. Decode prevTxHash from hex (empty = genesis)
  const prevTxHash = input.prevTxHashHex.length === 0
    ? new Uint8Array(0)
    : hexToBytes(input.prevTxHashHex);

  const params: LogEventParams = {
    storeOwner: input.storeOwner,
    gemId,
    stage:      input.stage,
    prevTxHash,
    payloadHash,
  };

  // Return both so the caller can upload payload to IPFS before submitting
  return { params, payload };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Decodes a lowercase hex string (64 chars) into a 32-byte Uint8Array.
 * Used for prevTxHashHex decoding.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length !== 64) {
    throw new Error(
      `prevTxHashHex must be 64 hex characters (32 bytes), got ${hex.length}`
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
