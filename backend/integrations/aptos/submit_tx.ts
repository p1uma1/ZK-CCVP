

import "dotenv/config";
import {
  Aptos,
  AptosConfig,
  Account,
  Ed25519PrivateKey,
  Network,
  type PendingTransactionResponse,
  type UserTransactionResponse,
} from "@aptos-labs/ts-sdk";

import {
  buildLogEventParams,
  type LogEventInput,
  type LogEventParams,
} from "./build_event.js";
import type { EventPayload } from "./hash.js";

// ---------------------------------------------------------------------------
// Config — read from environment
// ---------------------------------------------------------------------------

function getModuleAddress(): string {
  const addr = process.env.APTOS_MODULE_ADDRESS;
  if (!addr) throw new Error("APTOS_MODULE_ADDRESS is not set in .env");
  return addr;
}

function getNetwork(): Network {
  const net = (process.env.APTOS_NETWORK ?? "DEVNET").toUpperCase();
  if (net === "TESTNET") return Network.TESTNET;  
  if (net === "MAINNET") return Network.MAINNET;
  return Network.DEVNET;
}

/**
 * Creates an Aptos client from environment variables.
 * Used by the Express server on startup.
 */
export function createClientFromEnv(): Aptos {
  return new Aptos(new AptosConfig({ network: getNetwork() }));
}

/**
 * Creates an Account from the APTOS_PRIVATE_KEY env variable.
 * Used when the backend needs to sign transactions (e.g. admin operations).
 */
export function createAccountFromEnv(): Account {
  const key = process.env.APTOS_PRIVATE_KEY;
  if (!key) throw new Error("APTOS_PRIVATE_KEY is not set in .env");
  return Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(key),
  });
}

// ---------------------------------------------------------------------------
// High-level entry point
// ---------------------------------------------------------------------------

/**
 * Builds an EventPayload, hashes it, and submits a log_event transaction.
 *
 * Called by aptosEventService.ts for every supply chain event.
 *
 * Returns:
 *   txHash      — Aptos transaction hash (pass as prevTxHashHex next time)
 *   payload     — EventPayload object (upload to IPFS separately)
 *   recordHash  — on-chain fingerprint (pass as prev_record_hash next time)
 */
export async function anchorGemEvent(
  aptos:  Aptos,
  signer: Account,
  input:  LogEventInput,
): Promise<{ txHash: string; payload: EventPayload }> {
  const { params, payload } = buildLogEventParams(input);
  const txHash = await submitLogEvent(aptos, signer, params);

  console.log(`[gem-trace] Event logged on Aptos`);
  console.log(`  gem_id:  ${input.gemId}`);
  console.log(`  stage:   ${input.stage}`);
  console.log(`  tx_hash: ${txHash}`);

  return { txHash, payload };
}

// ---------------------------------------------------------------------------
// Lower-level submit
// ---------------------------------------------------------------------------

export async function submitLogEvent(
  aptos:  Aptos,
  signer: Account,
  params: LogEventParams,
): Promise<string> {
  const moduleAddr = getModuleAddress();

  const transaction = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: {
      function:          `${moduleAddr}::gem_event_store::log_event`,
      typeArguments:     [],
      functionArguments: [
        params.storeOwner,
        params.gemId,
        params.stage,
        params.prevTxHash,
        params.payloadHash,
      ],
    },
  });

  const pendingTx: PendingTransactionResponse =
    await aptos.signAndSubmitTransaction({ signer, transaction });

  const committed = (await aptos.waitForTransaction({
    transactionHash: pendingTx.hash,
  })) as UserTransactionResponse;

  if (!committed.success) {
    throw new Error(
      `log_event failed: ${committed.vm_status} | tx: ${committed.hash}`
    );
  }

  return committed.hash;
}

// ---------------------------------------------------------------------------
// Initialisation helpers (called once at deployment)
// ---------------------------------------------------------------------------

export async function initializeEventStore(
  aptos:    Aptos,
  deployer: Account,
): Promise<string> {
  const moduleAddr = getModuleAddress();

  const transaction = await aptos.transaction.build.simple({
    sender: deployer.accountAddress,
    data: {
      function:          `${moduleAddr}::gem_event_store::initialize`,
      typeArguments:     [],
      functionArguments: [],
    },
  });

  const pendingTx = await aptos.signAndSubmitTransaction({
    signer: deployer, transaction,
  });

  const committed = await aptos.waitForTransaction({
    transactionHash: pendingTx.hash,
  });

  if (!(committed as UserTransactionResponse).success) {
    throw new Error(`initialize() failed: ${(committed as UserTransactionResponse).vm_status}`);
  }

  console.log(`[gem-trace] GemEventStore initialized | tx: ${committed.hash}`);
  return committed.hash;
}

export async function initializeActorRegistry(
  aptos:    Aptos,
  deployer: Account,
): Promise<string> {
  const moduleAddr = getModuleAddress();

  const transaction = await aptos.transaction.build.simple({
    sender: deployer.accountAddress,
    data: {
      function:          `${moduleAddr}::actor_registry::initialize`,
      typeArguments:     [],
      functionArguments: [],
    },
  });

  const pendingTx = await aptos.signAndSubmitTransaction({
    signer: deployer, transaction,
  });

  const committed = await aptos.waitForTransaction({
    transactionHash: pendingTx.hash,
  });

  if (!(committed as UserTransactionResponse).success) {
    throw new Error(`actor_registry::initialize() failed`);
  }

  console.log(`[gem-trace] ActorRegistry initialized | tx: ${committed.hash}`);
  return committed.hash;
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

export async function getEventCount(
  aptos:      Aptos,
  storeOwner: string,
  gemId:      string,
): Promise<number> {
  const moduleAddr = getModuleAddress();
  const gemIdBytes = Array.from(new TextEncoder().encode(gemId));

  const result = await aptos.view({
    payload: {
      function:          `${moduleAddr}::gem_event_store::event_count`,
      typeArguments:     [],
      functionArguments: [storeOwner, gemIdBytes],
    },
  });

  return Number(result[0]);
}

export async function gemExists(
  aptos:      Aptos,
  storeOwner: string,
  gemId:      string,
): Promise<boolean> {
  const moduleAddr = getModuleAddress();
  const gemIdBytes = Array.from(new TextEncoder().encode(gemId));

  const result = await aptos.view({
    payload: {
      function:          `${moduleAddr}::gem_event_store::gem_exists`,
      typeArguments:     [],
      functionArguments: [storeOwner, gemIdBytes],
    },
  });

  return result[0] as boolean;
}

export async function getLastRecordHash(
  aptos:      Aptos,
  storeOwner: string,
  gemId:      string,
): Promise<string> {
  const moduleAddr = getModuleAddress();
  const gemIdBytes = Array.from(new TextEncoder().encode(gemId));

  const result = await aptos.view({
    payload: {
      function:          `${moduleAddr}::gem_event_store::get_last_record_hash`,
      typeArguments:     [],
      functionArguments: [storeOwner, gemIdBytes],
    },
  });

  // Returns vector<u8> — convert to hex string
  const bytes = result[0] as number[];
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}