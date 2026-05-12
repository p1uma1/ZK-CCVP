/**
 * aptosEventService.ts
 *
 * Business logic for Aptos supply chain event operations.
 * Now includes IPFS upload — full metadata is stored on Pinata
 * before the hash is anchored on Aptos.
 *
 * Flow for every event:
 *   1. Build canonical EventPayload (full metadata)
 *   2. Upload EventPayload to Pinata → get IPFS CID
 *   3. Add CID to metadata (so verifiers can fetch the document)
 *   4. Hash the payload → payload_hash (32 bytes)
 *   5. Submit to Aptos with payload_hash anchored on-chain
 */

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
import { uploadEventPayload } from "../../integrations/aptos/ipfs";
import type { EventPayload } from "../../integrations/aptos/hash";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEventRequest {
  gemId:        string;
  stage:        StageValue;
  actorAddress: string;
  metadata:     Record<string, unknown>;
  attachments?: string[];
}

export interface LogEventResponse {
  success:        boolean;
  txHash:         string;
  gemId:          string;
  stage:          number;
  stageLabel:     string;
  sequenceNumber: number;
  ipfsCid:        string;
  ipfsUrl:        string;
  message:        string;
}

export interface GemStatusResponse {
  gemId:          string;
  exists:         boolean;
  eventCount:     number;
  lastRecordHash: string;
}

// ---------------------------------------------------------------------------
// Shared Aptos client
// ---------------------------------------------------------------------------

const aptos      = createClientFromEnv();
const storeOwner = process.env.APTOS_MODULE_ADDRESS ?? "";

// ---------------------------------------------------------------------------
// Register a new gem — MINING event (genesis)
// ---------------------------------------------------------------------------

/**
 * Registers a new gem by logging its genesis MINING event on Aptos.
 * Called at the same time as the Ethereum NFT mint.
 * Called by: POST /api/aptos/gems
 */
export async function registerNewGem(
  gemId:            string,
  actorAddress:     string,
  metadata:         Record<string, unknown>,
  ethereumTokenId?: string,
): Promise<LogEventResponse> {
  const signer = createAccountFromEnv();

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
// Log any supply chain event
// ---------------------------------------------------------------------------

/**
 * Logs a supply chain event with full IPFS metadata storage.
 *
 * Steps:
 *   1. Get sequence number + prev hash from chain
 *   2. Build EventPayload (full metadata)
 *   3. Upload to Pinata IPFS → CID
 *   4. Add CID to payload metadata
 *   5. Submit to Aptos (payload_hash anchored on-chain)
 *
 * Called by: POST /api/aptos/events
 */
export async function logSupplyChainEvent(
  req:    LogEventRequest,
  signer: ReturnType<typeof createAccountFromEnv>,
): Promise<LogEventResponse> {

  const label = STAGE_LABEL[req.stage];

  // 1. Get sequence number and prev hash from chain
  const currentCount   = await getEventCount(aptos, storeOwner, req.gemId);
  const prevRecordHash = currentCount === 0
    ? ""
    : await getLastRecordHash(aptos, storeOwner, req.gemId);

  // 2. Build the full payload for IPFS
  const timestampMs = Date.now();

// 2. Build the exact payload that will be uploaded to IPFS
// and also hashed for Aptos.
const payload: EventPayload = {
  gem_id:          req.gemId,
  stage:           label,
  actor_address:   req.actorAddress,
  timestamp_ms:    timestampMs,
  sequence_number: currentCount,
  metadata:        req.metadata,
  ...(req.attachments && { attachments: req.attachments }),
};

// 3. Upload this exact payload to Pinata IPFS
const { cid, url } = await uploadEventPayload(payload, req.gemId, label);

// 4. Submit to Aptos.
// Important: use the SAME metadata and SAME timestamp as the IPFS payload.
// Do not add ipfsCid/ipfsUrl into metadata here.
const { txHash } = await anchorGemEvent(aptos, signer, {
  storeOwner,
  gemId:          req.gemId,
  stage:          req.stage,
  prevTxHashHex:  prevRecordHash,
  actorAddress:   req.actorAddress,
  sequenceNumber: currentCount,
  timestampMs,
  metadata:       req.metadata,
   ipfsCid:        cid,
  attachments:    req.attachments,
});

  return {
    success:        true,
    txHash,
    gemId:          req.gemId,
    stage:          req.stage,
    stageLabel:     label,
    sequenceNumber: currentCount,
    ipfsCid:        cid,
    ipfsUrl:        url,
    message:        `${label} event logged successfully`,
  };
}

// ---------------------------------------------------------------------------
// Get gem status (read-only)
// ---------------------------------------------------------------------------

export async function getGemStatus(gemId: string): Promise<GemStatusResponse> {
  const exists = await gemExists(aptos, storeOwner, gemId);
  if (!exists) return { gemId, exists: false, eventCount: 0, lastRecordHash: "" };

  const [eventCount, lastRecordHash] = await Promise.all([
    getEventCount(aptos, storeOwner, gemId),
    getLastRecordHash(aptos, storeOwner, gemId),
  ]);

  return { gemId, exists: true, eventCount, lastRecordHash };
}

// ---------------------------------------------------------------------------
// Get full gem history
// ---------------------------------------------------------------------------

type RawHistoryRecord = {
  actor_address:   string;
  gem_id:          string;
  payload_hash:    string;
  ipfs_cid:        string;
  prev_tx_hash:    string;
  sequence_number: string | number;
  stage:           number;
  timestamp_ms:    string | number;
};

type FrontendHistoryRecord = {
  gemId:          string;
  stage:          number;
  stageLabel:     string;
  actorAddress:   string;
  timestampMs:    number;
  prevTxHash:     string;
  payloadHash:    string;
  ipfsCid:        string;
  ipfsUrl:        string;
  sequenceNumber: number;
};

function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(
    clean.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
  );
  return new TextDecoder().decode(bytes);
}

function stageLabelFromNumber(stage: number): string {
  const labels: Record<number, string> = {
    1: "Mining", 2: "Cutting",      3: "Certification",
    4: "Transport", 5: "Wholesale", 6: "Retail", 7: "Sale",
  };
  return labels[stage] ?? "Unknown";
}

function normalizeHistoryRecord(raw: RawHistoryRecord): FrontendHistoryRecord {
  const cid = hexToUtf8(raw.ipfs_cid);

  return {
    gemId:          hexToUtf8(raw.gem_id),
    stage:          Number(raw.stage),
    stageLabel:     stageLabelFromNumber(Number(raw.stage)),
    actorAddress:   raw.actor_address,
    timestampMs:    Number(raw.timestamp_ms),
    prevTxHash:     raw.prev_tx_hash,
    payloadHash:    raw.payload_hash,
    ipfsCid:        cid,
    ipfsUrl:        `https://gateway.pinata.cloud/ipfs/${cid}`,
    sequenceNumber: Number(raw.sequence_number),
  };
}

export async function getGemHistory(gemId: string) {
  const exists = await gemExists(aptos, storeOwner, gemId);
  if (!exists) return { gemId, exists: false, eventCount: 0, history: [] };

  const eventCount = await getEventCount(aptos, storeOwner, gemId);
  const history: FrontendHistoryRecord[] = [];

  for (let i = 0; i < eventCount; i++) {
    const rawEvent = await getEventByIndex(aptos, storeOwner, gemId, i);
    history.push(normalizeHistoryRecord(rawEvent as RawHistoryRecord));
  }

  return { gemId, exists: true, eventCount, history };
}

export { STAGE, STAGE_LABEL };