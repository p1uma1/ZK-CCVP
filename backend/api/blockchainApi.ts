/**
 * api/blockchainApi.ts
 *
 * Unified Blockchain API entry point.
 *
 * This file is the thin public facade over the three chain integrations.
 * For advanced usage (e.g. Aptos event logging, Ethereum identity management)
 * import directly from the integrations or use the service layer.
 *
 * Integrations:
 *   - Cardano  (integrations/cardano/index.ts)  → Certification layer
 *   - Ethereum (integrations/ethereum/index.ts) → Identity layer
 *   - Aptos    (integrations/aptos/index.ts)    → Event layer
 *
 * Service layer (recommended for multi-chain operations):
 *   - services/certificateService.ts            → Orchestrates all three chains
 */

import * as cardano from "../integrations/cardano/index";
import * as ethereum from "../integrations/ethereum/index";
import * as aptos from "../integrations/aptos/index";
import {
  issueCertificate as _issueCrossChain,
  verifyCertificate as _verifyCrossChain,
  getChainStatus,
} from "../services/certificateService";
import type { CanonicalCertificate } from "../integrations/cardano/canonicalize";

// ─── Re-export the supported chain type ───────────────────────────────────────
export type SupportedChain = "cardano" | "ethereum" | "aptos";
export const supportedChains: SupportedChain[] = ["cardano", "ethereum", "aptos"];

// ─── Common data shapes ───────────────────────────────────────────────────────

/** Input for single-chain issue/verify operations */
export interface CertificateData {
  [key: string]: unknown;
}

/** Input for the cross-chain issuance flow */
export interface CrossChainIssuanceInput {
  cert: CanonicalCertificate;
  issuerEthAddress: string;
  reportType?: string;
}

// ─── Single-chain helpers ─────────────────────────────────────────────────────
// These route a call to exactly one chain. For production use the cross-chain
// service functions below which coordinate all three simultaneously.

/**
 * Issues a certificate on a single specified chain.
 * Note: For a production-grade issuance that anchors on all three chains,
 *       use `issueCrossChain` instead.
 */
export async function issueCertificate(
  chain: SupportedChain,
  data: CertificateData
): Promise<unknown> {
  switch (chain) {
    case "cardano":
      return cardano.issueCertificate(
        data as unknown as Parameters<typeof cardano.issueCertificate>[0]
      );
    case "ethereum":
      return ethereum.issueCertificate(
        data as unknown as Parameters<typeof ethereum.issueCertificate>[0]
      );
    case "aptos":
      return aptos.issueCertificate(
        data as unknown as Parameters<typeof aptos.issueCertificate>[0]
      );
    default:
      throw new Error(`Unsupported blockchain: ${chain}`);
  }
}

/**
 * Verifies a certificate on a single specified chain.
 * Note: For a full cross-chain verification, use `verifyCrossChain` instead.
 */
export async function verifyCertificate(
  chain: SupportedChain,
  certificateId: string
): Promise<unknown> {
  switch (chain) {
    case "cardano":
      return cardano.verifyCertificate(certificateId);
    case "ethereum":
      return ethereum.verifyCertificate(certificateId);
    case "aptos":
      return aptos.verifyCertificate(certificateId);
    default:
      throw new Error(`Unsupported blockchain: ${chain}`);
  }
}

// ─── Cross-chain operations (recommended) ─────────────────────────────────────

/**
 * Issues a certificate across ALL three chains in sequence:
 *   1. Cardano  → locks the CertificateDatum (source of truth)
 *   2. Aptos    → anchors the cert hash + emits a CERT_ISSUED event
 *   3. Ethereum → anchors the cert hash against the issuer's identity
 *
 * Returns all three transaction hashes and the computed cert hash.
 */
export const issueCrossChain = _issueCrossChain;

/**
 * Verifies a certificate across ALL three chains in parallel:
 *   - Cardano  → authoritative UTxO check (primary)
 *   - Ethereum → issuer identity check (corroborating)
 *   - Aptos    → event history audit trail (informational)
 */
export const verifyCrossChain = _verifyCrossChain;

/**
 * Returns live connection status for all three blockchain nodes.
 * Useful for health-checks and dashboards.
 */
export const chainStatus = getChainStatus;

// ─── Direct integration access (for advanced callers) ─────────────────────────
export { cardano, ethereum, aptos };
