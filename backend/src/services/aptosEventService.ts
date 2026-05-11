

import "dotenv/config";
import {
  createClientFromEnv,
  createAccountFromEnv,
  anchorGemEvent,
  getEventCount,
  gemExists,
  getLastRecordHash,
  getEventByIndex,
} from "../../integrations/aptos/submit_tx";
import { STAGE, STAGE_LABEL, type StageValue } from "../../integrations/aptos/build_event";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEventRequest {
  /** Gemstone identifier — e.g. "GEM-LK-SAP-2024-00147" */
  gemId:        string;
  /** Stage number 1–7 */
  stage:        StageValue;
  /** Actor's Aptos address */
  actorAddress: string;
  /** Free-form metadata stored in off-chain IPFS payload */
  metadata:     Record<string, unknown>;
  /** IPFS CIDs of supporting documents (optional) */
  attachments?: string[];
}

export interface LogEventResponse {
  success:        boolean;
  txHash:         string;
  gemId:          string;
  stage:          number;
  stageLabel:     string;
  sequenceNumber: number;
  message:        string;
}

export interface GemStatusResponse {
  gemId:          string;
  exists:         boolean;
  eventCount:     number;
  lastRecordHash: string;
}

// ---------------------------------------------------------------------------
// Shared Aptos client (initialised once, reused per request)
// ---------------------------------------------------------------------------

const aptos      = createClientFromEnv();
const storeOwner = process.env.APTOS_MODULE_ADDRESS ?? "";

// ---------------------------------------------------------------------------
// Register a new gem — MINING event (genesis)
// ---------------------------------------------------------------------------

/**
 * Registers a new gem by logging its genesis MINING event on Aptos.
 *
 * Called at the same time as the Ethereum NFT mint — both happen
 * together when the miner clicks "Register Gem" in the DApp.
 *
 * The Ethereum tokenId is stored in metadata so cross-chain
 * verification can link the Ethereum NFT to the Aptos event chain.
 *
 * Called by: POST /api/aptos/gems
 *
 * @example
 * // Miner registers a new sapphire from Ratnapura
 * await registerNewGem(
 *   "GEM-LK-SAP-2024-00147",
 *   "0x402167...",
 *   { location: "Ratnapura, LK", mine_license: "ML-2024-447" },
 *   "42"  // Ethereum ERC-721 token ID
 * );
 */
export async function registerNewGem(
  gemId:            string,
  actorAddress:     string,
  metadata:         Record<string, unknown>,
  ethereumTokenId?: string,
): Promise<LogEventResponse> {
  const signer = createAccountFromEnv();

  // Include Ethereum token ID so cross-chain verification can link them
  const enrichedMetadata = {
    ...metadata,
    ...(ethereumTokenId && { ethereumTokenId }),
  };

  return logSupplyChainEvent(
    { gemId, stage: STAGE.MINING, actorAddress, metadata: enrichedMetadata },
    signer,
  );
}

// ---------------------------------------------------------------------------
// Log any subsequent supply chain event
// ---------------------------------------------------------------------------

/**
 * Logs a supply chain event for a gem that already exists on-chain.
 *
 * Automatically fetches the current sequence number and prev_record_hash
 * from the chain — the caller does not need to track these manually.
 *
 * Called by: POST /api/aptos/events
 *
 * @example
 * // Cutter logs that cutting is complete
 * await logSupplyChainEvent({
 *   gemId:        "GEM-LK-SAP-2024-00147",
 *   stage:        STAGE.CUTTING,
 *   actorAddress: "0xCUTTER_ADDRESS",
 *   metadata:     { workshop: "Colombo Gems Ltd", facets: 58 },
 * }, signer);
 */
export async function logSupplyChainEvent(
  req:    LogEventRequest,
  signer: ReturnType<typeof createAccountFromEnv>,
): Promise<LogEventResponse> {

  // 1. Fetch current event count → becomes sequence number of new event
  const currentCount = await getEventCount(aptos, storeOwner, req.gemId);

  // 2. Fetch prev_record_hash (empty for genesis, chain fingerprint otherwise)
  const prevRecordHash = currentCount === 0
    ? ""
    : await getLastRecordHash(aptos, storeOwner, req.gemId);

  // 3. Build payload, hash it, submit transaction to Aptos
  const { txHash } = await anchorGemEvent(aptos, signer, {
    storeOwner,
    gemId:          req.gemId,
    stage:          req.stage,
    prevTxHashHex:  prevRecordHash,
    actorAddress:   req.actorAddress,
    sequenceNumber: currentCount,
    metadata:       req.metadata,
    attachments:    req.attachments,
  });

  return {
    success:        true,
    txHash,
    gemId:          req.gemId,
    stage:          req.stage,
    stageLabel:     STAGE_LABEL[req.stage],
    sequenceNumber: currentCount,
    message:        `${STAGE_LABEL[req.stage]} event logged successfully`,
  };
}

// ---------------------------------------------------------------------------
// Get gem status (read-only view — no gas, no transaction)
// ---------------------------------------------------------------------------

/**
 * Returns current on-chain status of a gem.
 * Calls #[view] functions — completely free, no transaction needed.
 *
 * Called by: GET /api/aptos/gems/:gemId
 */
export async function getGemStatus(gemId: string): Promise<GemStatusResponse> {
  const exists = await gemExists(aptos, storeOwner, gemId);

  if (!exists) {
    return { gemId, exists: false, eventCount: 0, lastRecordHash: "" };
  }

  const [eventCount, lastRecordHash] = await Promise.all([
    getEventCount(aptos, storeOwner, gemId),
    getLastRecordHash(aptos, storeOwner, gemId),
  ]);

  return { gemId, exists: true, eventCount, lastRecordHash };
}

export async function getGemHistory(gemId: string) {
  const exists = await gemExists(aptos, storeOwner, gemId);

  if (!exists) {
    return {
      gemId,
      exists: false,
      eventCount: 0,
      history: [],
    };
  }

  const eventCount = await getEventCount(aptos, storeOwner, gemId);
  const history: FrontendHistoryRecord[] = [];

  for (let i = 0; i < eventCount; i++) {
    const rawEvent = await getEventByIndex(aptos, storeOwner, gemId, i);
    history.push(normalizeHistoryRecord(rawEvent as RawHistoryRecord));
  }

  return {
    gemId,
    exists: true,
    eventCount,
    history,
  };
}

function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(
    clean.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
  );
  return new TextDecoder().decode(bytes);
}

function stageLabel(stage: number): string {
  switch (stage) {
    case 1:
      return "Mining";
    case 2:
      return "Cutting";
    case 3:
      return "Certification";
    case 4:
      return "Transport";
    case 5:
      return "Wholesale";
    case 6:
      return "Retail";
    case 7:
      return "Sale";
    default:
      return "Unknown";
  }
}

type RawHistoryRecord = {
  actor_address: string;
  gem_id: string;
  payload_hash: string;
  prev_tx_hash: string;
  sequence_number: string | number;
  stage: number;
  timestamp_ms: string | number;
};

type FrontendHistoryRecord = {
  gemId: string;
  stage: number;
  stageLabel: string;
  actorAddress: string;
  timestampMs: number;
  prevTxHash: string;
  payloadHash: string;
  sequenceNumber: number;
};

function normalizeHistoryRecord(raw: RawHistoryRecord): FrontendHistoryRecord {
  return {
    gemId: hexToUtf8(raw.gem_id),
    stage: Number(raw.stage),
    stageLabel: stageLabel(Number(raw.stage)),
    actorAddress: raw.actor_address,
    timestampMs: Number(raw.timestamp_ms),
    prevTxHash: raw.prev_tx_hash,
    payloadHash: raw.payload_hash,
    sequenceNumber: Number(raw.sequence_number),
  };
}

export { STAGE, STAGE_LABEL };