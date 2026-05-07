/**
 * integrations/ethereum/index.ts
 *
 * Identity Layer — Ethereum
 *
 * Responsibilities:
 *  - Register identities (miners, cutters, retailers) on-chain.
 *  - Look up identity status for a given address.
 *  - Emit "certificate anchored" references so downstream systems can
 *    cross-verify the Cardano cert hash against an Ethereum identity.
 *
 * Expected Solidity ABI (IdentityRegistry.sol):
 *   function registerIdentity(address account, string calldata role, string calldata metadataURI) external
 *   function getIdentity(address account) external view returns (string memory role, string memory metadataURI, bool active)
 *   function anchorCertificate(string calldata gemId, bytes32 certHash, string calldata reportId) external
 *   function getCertificateAnchor(string calldata gemId) external view returns (bytes32 certHash, string memory reportId, address issuer, uint256 timestamp)
 *   event IdentityRegistered(address indexed account, string role)
 *   event CertificateAnchored(string indexed gemId, bytes32 certHash, address indexed issuer)
 */

import { ethers, Contract, JsonRpcProvider, Wallet } from "ethers";
import { eth as cfg } from "../../config/config";

// ─── ABI (minimal surface) ────────────────────────────────────────────────────
const IDENTITY_REGISTRY_ABI = [
  // Identity management
  "function registerIdentity(address account, string calldata role, string calldata metadataURI) external",
  "function getIdentity(address account) external view returns (string memory role, string memory metadataURI, bool active)",
  "function revokeIdentity(address account) external",

  // Certificate anchoring
  "function anchorCertificate(string calldata gemId, bytes32 certHash, string calldata reportId) external",
  "function getCertificateAnchor(string calldata gemId) external view returns (bytes32 certHash, string memory reportId, address issuer, uint256 timestamp)",

  // Events
  "event IdentityRegistered(address indexed account, string role)",
  "event CertificateAnchored(string indexed gemId, bytes32 certHash, address indexed issuer)",
];

// ─── Lazy singleton client ────────────────────────────────────────────────────
let _contract: Contract | null = null;
let _provider: JsonRpcProvider | null = null;
let _signer: Wallet | null = null;

function getClient(): { provider: JsonRpcProvider; signer: Wallet; contract: Contract } {
  if (!_contract || !_provider || !_signer) {
    _provider = new JsonRpcProvider(cfg.rpcUrl);
    _signer = new Wallet(cfg.privateKey, _provider);
    _contract = new Contract(cfg.contractAddress, IDENTITY_REGISTRY_ABI, _signer);
  }
  return { provider: _provider, signer: _signer, contract: _contract };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface IdentityData {
  account: string;   // Ethereum address
  role: string;      // "miner" | "cutter" | "retailer" | "issuer"
  metadataURI: string; // IPFS URI with extended identity metadata
}

export interface IdentityRecord {
  role: string;
  metadataURI: string;
  active: boolean;
}

export interface CertificateAnchor {
  certHash: string;  // bytes32 hex
  reportId: string;
  issuer: string;    // Ethereum address
  timestamp: number; // Unix seconds
}

// ─── Identity functions ───────────────────────────────────────────────────────

/**
 * Registers a new identity on Ethereum.
 * Callable by an authorized registrar (the backend signer).
 */
export async function registerIdentity(data: IdentityData): Promise<{ txHash: string }> {
  const { contract } = getClient();
  const tx = await contract.registerIdentity(data.account, data.role, data.metadataURI);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Fetches the on-chain identity record for an Ethereum address.
 */
export async function getIdentity(account: string): Promise<IdentityRecord> {
  const { contract } = getClient();
  const [role, metadataURI, active] = await contract.getIdentity(account);
  return { role, metadataURI, active };
}

/**
 * Revokes an identity (soft-delete on-chain flag).
 */
export async function revokeIdentity(account: string): Promise<{ txHash: string }> {
  const { contract } = getClient();
  const tx = await contract.revokeIdentity(account);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

// ─── Certificate anchoring ────────────────────────────────────────────────────

/**
 * Anchors a Cardano certificate hash on Ethereum so that identity and
 * certification proofs live on the same on-chain audit trail.
 *
 * @param gemId    - The unique gem identifier (matches Cardano datum gem_id)
 * @param certHash - 32-byte cert_hash from the Cardano datum (hex string, no 0x prefix OK)
 * @param reportId - The lab report ID string
 */
export async function anchorCertificate(
  gemId: string,
  certHash: string,
  reportId: string
): Promise<{ txHash: string }> {
  const { contract } = getClient();
  // Normalise to bytes32
  const certHashBytes = certHash.startsWith("0x") ? certHash : `0x${certHash}`;
  const tx = await contract.anchorCertificate(gemId, certHashBytes, reportId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Retrieves an anchored certificate record from Ethereum.
 */
export async function getCertificateAnchor(gemId: string): Promise<CertificateAnchor> {
  const { contract } = getClient();
  const [certHash, reportId, issuer, timestamp] = await contract.getCertificateAnchor(gemId);
  return {
    certHash: certHash as string,
    reportId: reportId as string,
    issuer: issuer as string,
    timestamp: Number(timestamp),
  };
}

// ─── blockchainApi.ts compatibility shim ─────────────────────────────────────
// These match the issueCertificate / verifyCertificate surface used in blockchainApi.ts

export interface CertificateData {
  gemId: string;
  certHash: string;
  reportId: string;
  issuerAddress: string;
  role?: string;
  metadataURI?: string;
}

/**
 * "Issue" on Ethereum = anchor the cross-chain certificate reference.
 */
export async function issueCertificate(data: CertificateData): Promise<{ txHash: string }> {
  return anchorCertificate(data.gemId, data.certHash, data.reportId);
}

/**
 * "Verify" on Ethereum = look up the anchor and return it.
 */
export async function verifyCertificate(
  gemId: string
): Promise<CertificateAnchor & { verified: boolean }> {
  const anchor = await getCertificateAnchor(gemId);
  return { ...anchor, verified: !!anchor.certHash && anchor.certHash !== ethers.ZeroHash };
}

/**
 * Returns the connected network info and signer address.
 * Useful for health-checks.
 */
export async function getNetworkInfo(): Promise<{
  chainId: number;
  network: string;
  signerAddress: string;
  blockNumber: number;
}> {
  const { provider, signer } = getClient();
  const [network, blockNumber, signerAddress] = await Promise.all([
    provider.getNetwork(),
    provider.getBlockNumber(),
    signer.getAddress(),
  ]);
  return {
    chainId: Number(network.chainId),
    network: network.name,
    signerAddress,
    blockNumber,
  };
}
