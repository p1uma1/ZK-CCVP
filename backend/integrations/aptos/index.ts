/**
 * integrations/aptos/index.ts
 *
 * Event Layer — Aptos
 *
 * Responsibilities:
 *  - Log gemstone transformation events (mining, cutting, grading, transfer)
 *    with high throughput using Aptos's parallel execution engine.
 *  - Query event history for a gem ID.
 *  - Provide issueCertificate / verifyCertificate shims for the unified API.
 *
 * Expected Move module (GemEvent.move at APTOS_MODULE_ADDRESS):
 *   struct GemEvent has key, store, drop {
 *     gem_id: String,
 *     event_type: u8,       // 1=Mined, 2=Cut, 3=Graded, 4=Transferred, 5=CertIssued
 *     actor_address: address,
 *     metadata_uri: String, // IPFS CID with event details
 *     timestamp: u64,
 *   }
 *   public entry fun log_event(account: &signer, gem_id: String, event_type: u8, metadata_uri: String)
 *   #[view] public fun get_events(gem_id: String): vector<GemEvent>
 *   public entry fun anchor_certificate(account: &signer, gem_id: String, cert_hash: vector<u8>, report_id: String)
 *   #[view] public fun get_certificate_anchor(gem_id: String): (vector<u8>, String, address, u64)
 */

import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  SimpleTransaction,
} from "@aptos-labs/ts-sdk";
import { aptos as cfg } from "../../config/config";

// ─── Lazy singleton client ────────────────────────────────────────────────────
let _aptos: Aptos | null = null;
let _account: Account | null = null;

function getClient(): { client: Aptos; account: Account } {
  if (!_aptos || !_account) {
    const networkMap: Record<string, Network> = {
      devnet: Network.DEVNET,
      testnet: Network.TESTNET,
      mainnet: Network.MAINNET,
    };

    const config = new AptosConfig({
      network: networkMap[cfg.network] ?? Network.DEVNET,
    });

    _aptos = new Aptos(config);

    const privateKey = new Ed25519PrivateKey(cfg.privateKey);
    _account = Account.fromPrivateKey({ privateKey });
  }
  return { client: _aptos, account: _account };
}

// ─── Event type constants (mirrors Move module) ───────────────────────────────
export const GEM_EVENT_TYPES = {
  MINED: 1,
  CUT: 2,
  GRADED: 3,
  TRANSFERRED: 4,
  CERT_ISSUED: 5,
} as const;

export type GemEventType = (typeof GEM_EVENT_TYPES)[keyof typeof GEM_EVENT_TYPES];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GemEvent {
  gem_id: string;
  event_type: GemEventType;
  actor_address: string;
  metadata_uri: string;
  timestamp: number;
}

export interface LogEventData {
  gemId: string;
  eventType: GemEventType;
  metadataUri: string;
}

export interface AptosAnchor {
  certHash: string;  // hex string
  reportId: string;
  issuer: string;    // Aptos account address
  timestamp: number;
}

// ─── Helper — submit and wait ─────────────────────────────────────────────────
async function submitAndWait(
  client: Aptos,
  account: Account,
  tx: SimpleTransaction
): Promise<string> {
  const senderAuth = await client.sign({ signer: account, transaction: tx });
  const pendingTx = await client.submitTransaction({
    transaction: tx,
    senderAuthenticator: senderAuth,
  });
  await client.waitForTransaction({ transactionHash: pendingTx.hash });
  return pendingTx.hash;
}

// ─── Event logging ────────────────────────────────────────────────────────────

/**
 * Logs a gemstone lifecycle event on Aptos.
 */
export async function logGemEvent(data: LogEventData): Promise<{ txHash: string }> {
  const { client, account } = getClient();

  const tx = await client.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${cfg.moduleAddress}::GemEvent::log_event`,
      functionArguments: [data.gemId, data.eventType, data.metadataUri],
    },
  });

  const txHash = await submitAndWait(client, account, tx);
  return { txHash };
}

/**
 * Fetches all events for a gem ID from the Aptos node.
 */
export async function getGemEvents(gemId: string): Promise<GemEvent[]> {
  const { client } = getClient();

  const result = await client.view({
    payload: {
      function: `${cfg.moduleAddress}::GemEvent::get_events`,
      functionArguments: [gemId],
    },
  });

  // The Move function returns a vector<GemEvent> — the SDK deserialises it as an array.
  const raw = result[0] as Array<{
    gem_id: string;
    event_type: number;
    actor_address: string;
    metadata_uri: string;
    timestamp: number;
  }>;

  return raw.map((e) => ({
    gem_id: e.gem_id,
    event_type: e.event_type as GemEventType,
    actor_address: e.actor_address,
    metadata_uri: e.metadata_uri,
    timestamp: Number(e.timestamp),
  }));
}

// ─── Certificate anchoring ────────────────────────────────────────────────────

/**
 * Anchors a certificate hash on Aptos (event-layer record).
 *
 * @param gemId    - The unique gem identifier
 * @param certHash - 32-byte SHA-256 cert hash (hex string)
 * @param reportId - Lab report ID
 */
export async function anchorCertificate(
  gemId: string,
  certHash: string,
  reportId: string
): Promise<{ txHash: string }> {
  const { client, account } = getClient();

  // Encode certHash as bytes (vector<u8>)
  const certHashBytes = hexToBytes(certHash);

  const tx = await client.build.simple({
    sender: account.accountAddress,
    data: {
      function: `${cfg.moduleAddress}::GemEvent::anchor_certificate`,
      functionArguments: [gemId, certHashBytes, reportId],
    },
  });

  const txHash = await submitAndWait(client, account, tx);

  // Also log a CERT_ISSUED event for the timeline
  await logGemEvent({
    gemId,
    eventType: GEM_EVENT_TYPES.CERT_ISSUED,
    metadataUri: `cert:${reportId}`,
  });

  return { txHash };
}

/**
 * Retrieves an anchored certificate from Aptos.
 */
export async function getAnchoredCertificate(gemId: string): Promise<AptosAnchor> {
  const { client } = getClient();

  const result = await client.view({
    payload: {
      function: `${cfg.moduleAddress}::GemEvent::get_certificate_anchor`,
      functionArguments: [gemId],
    },
  });

  const [certHashRaw, reportId, issuer, timestamp] = result as [
    number[],
    string,
    string,
    number,
  ];

  return {
    certHash: bytesToHex(certHashRaw),
    reportId,
    issuer,
    timestamp: Number(timestamp),
  };
}

// ─── blockchainApi.ts compatibility shim ─────────────────────────────────────

export interface CertificateData {
  gemId: string;
  certHash: string;
  reportId: string;
  metadataUri?: string;
}

/**
 * "Issue" on Aptos = log a CertIssued event + anchor the hash.
 */
export async function issueCertificate(data: CertificateData): Promise<{ txHash: string }> {
  return anchorCertificate(data.gemId, data.certHash, data.reportId);
}

/**
 * "Verify" on Aptos = look up the anchored cert and return it.
 */
export async function verifyCertificate(
  gemId: string
): Promise<AptosAnchor & { verified: boolean }> {
  const anchor = await getAnchoredCertificate(gemId);
  return { ...anchor, verified: anchor.certHash.length === 64 };
}

/**
 * Health check — returns the current ledger info.
 */
export async function getNetworkInfo(): Promise<{
  chainId: number;
  ledgerVersion: string;
  nodeUrl: string;
  signerAddress: string;
}> {
  const { client, account } = getClient();
  const ledger = await client.getLedgerInfo();
  return {
    chainId: Number(ledger.chain_id),
    ledgerVersion: ledger.ledger_version,
    nodeUrl: cfg.nodeUrl,
    signerAddress: account.accountAddress.toString(),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
