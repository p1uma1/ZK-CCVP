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


export interface LogEventParams {
  storeOwner: string;
  gemId: Uint8Array;
  stage: StageValue;
  prevTxHash: Uint8Array;
  payloadHash: Uint8Array;
  ipfsCid: Uint8Array;
}


export interface LogEventInput {
  storeOwner: string;
  gemId: string;
  stage: StageValue;
  prevTxHashHex: string;
  metadata: Record<string, unknown>;
  sequenceNumber: number;
timestampMs?: number;
  actorAddress: string;
ipfsCid: string;
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
    timestamp_ms:     input.timestampMs ?? Date.now(),
    sequence_number: input.sequenceNumber,
    metadata:        input.metadata,
    ...(input.attachments && { attachments: input.attachments }),
  };

  // 2. Hash the payload → payload_hash (32 bytes on-chain)
  const payloadHash = hashEventPayloadBytes(payload);

  // 3. Encode gem_id as UTF-8 bytes
  const gemId = new TextEncoder().encode(input.gemId);

  const ipfsCid = new TextEncoder().encode(input.ipfsCid);

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
    ipfsCid,
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
