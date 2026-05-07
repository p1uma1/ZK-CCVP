/**
 * config.ts
 *
 * Single source of truth for all environment-driven configuration.
 * Validates required variables at startup so the server fails fast
 * with a clear message rather than a cryptic runtime error.
 */

import dotenv from "dotenv";
dotenv.config();

function require_env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Config] Missing required environment variable: ${name}\n` +
        `  → Copy .env.example to .env and fill in the value.`
    );
  }
  return value;
}

// ─── Server ───────────────────────────────────────────────────────────────────
export const SERVER_PORT = parseInt(process.env.PORT ?? "3001", 10);
export const NODE_ENV = process.env.NODE_ENV ?? "development";

// ─── Ethereum (Identity Layer) ────────────────────────────────────────────────
export const eth = {
  rpcUrl: require_env("ETH_RPC_URL"),
  contractAddress: require_env("ETH_CONTRACT_ADDRESS"),
  privateKey: require_env("ETH_PRIVATE_KEY"),
  chainId: parseInt(process.env.ETH_CHAIN_ID ?? "11155111", 10),
};

// ─── Aptos (Event Layer) ──────────────────────────────────────────────────────
export const aptos = {
  nodeUrl: require_env("APTOS_NODE_URL"),
  faucetUrl: process.env.APTOS_FAUCET_URL ?? "",
  privateKey: require_env("APTOS_PRIVATE_KEY"),
  moduleAddress: require_env("APTOS_MODULE_ADDRESS"),
  network: (process.env.APTOS_NETWORK ?? "devnet") as
    | "devnet"
    | "testnet"
    | "mainnet",
};

// ─── Cardano (Certification Layer) ────────────────────────────────────────────
export const cardano = {
  blockfrostProjectId: require_env("BLOCKFROST_PROJECT_ID"),
  network: (process.env.CARDANO_NETWORK ?? "preview") as
    | "preview"
    | "preprod"
    | "mainnet",
  scriptAddress: require_env("CARDANO_SCRIPT_ADDRESS"),
  walletMnemonic: require_env("CARDANO_WALLET_MNEMONIC").split(" "),
};
