/**
 * services/certificateService.ts
 *
 * Orchestration layer — sits between the HTTP routes and the three
 * blockchain integrations.
 *
 * Flow for issueCertificate:
 *   1. Canonicalize + hash the cert data (off-chain)
 *   2. Cardano  → lock CertificateDatum at script address  (source of truth)
 *   3. Aptos    → anchor cert hash + log CERT_ISSUED event  (event layer)
 *   4. Ethereum → anchor cert hash against issuer identity  (identity link)
 *   Returns all three transaction hashes.
 *
 * Flow for verifyCertificate:
 *   1. Cardano  → scan UTxOs for matching cert_hash  (primary check)
 *   2. Ethereum → confirm issuer identity is active   (secondary check)
 *   3. Aptos    → retrieve event history for the gem  (audit trail)
 */

import * as cardano from "../integrations/cardano/index";
import * as ethereum from "../integrations/ethereum/index";
import * as aptos from "../integrations/aptos/index";
import { hashCertificate } from "../integrations/cardano/hash";
import type { CanonicalCertificate } from "../integrations/cardano/canonicalize";
import issuerRegistry from "../config/issuer_registry.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IssuanceRequest {
  cert: CanonicalCertificate;
  issuerEthAddress: string; // Ethereum address of the signing issuer
  reportType?: string;      // Overrides cert.report_type if provided
}

export interface IssuanceResult {
  certHash: string;
  cardano: {
    txHash: string;
    datumHash: string;
    network: string;
    scriptAddress: string;
  };
  aptos: {
    txHash: string;
    network: string;
  };
  ethereum: {
    txHash: string;
    network: string;
  };
  issuedAt: number;
}

export interface VerificationRequest {
  certHash: string;
  gemId?: string; // Needed for Aptos event query
}

export interface VerificationResult {
  verified: boolean;
  certHash: string;
  cardano: cardano.VerificationResult;
  ethereum: (ethereum.CertificateAnchor & { verified: boolean }) | { error: string };
  aptos: { events: aptos.GemEvent[] } | { error: string };
  checkedAt: number;
}

// ─── Issuer validation ────────────────────────────────────────────────────────

interface IssuerEntry {
  issuer_id: string;
  supported_report_types: number[];
}

function validateIssuer(issuerId: string, reportTypeInt: number): void {
  const entry = (issuerRegistry.issuers as IssuerEntry[]).find(
    (i) => i.issuer_id === issuerId
  );
  if (!entry) {
    throw new Error(`Unknown issuer: "${issuerId}". Not found in issuer registry.`);
  }
  if (!entry.supported_report_types.includes(reportTypeInt)) {
    throw new Error(
      `Issuer "${issuerId}" does not support report type ${reportTypeInt}.`
    );
  }
}

// ─── Core service functions ───────────────────────────────────────────────────

/**
 * Issues a certificate across all three blockchains.
 * Steps are sequential — Cardano first (source of truth), then Aptos, then Ethereum.
 */
export async function issueCertificate(req: IssuanceRequest): Promise<IssuanceResult> {
  const reportType = (req.reportType ?? req.cert.report_type).toLowerCase();
  const reportTypeInt = cardano.REPORT_TYPE_MAP[reportType];
  if (!reportTypeInt) {
    throw new Error(
      `Invalid report type: "${reportType}". ` +
        `Valid: ${Object.keys(cardano.REPORT_TYPE_MAP).join(", ")}`
    );
  }

  // Validate issuer is registered and authorised
  validateIssuer(req.cert.issuer_id, reportTypeInt);

  // Compute the cert hash off-chain first (used by all three chains)
  const certHash = hashCertificate(req.cert);

  // ── 1. Cardano: lock datum at script address ──────────────────────────────
  let cardanoResult: cardano.CertificateRecord;
  try {
    cardanoResult = await cardano.issueCertificate({
      cert: req.cert,
      reportType,
    });
  } catch (err) {
    throw new Error(`Cardano issuance failed: ${String(err)}`);
  }

  // ── 2. Aptos: anchor + log CERT_ISSUED event ──────────────────────────────
  let aptosResult: { txHash: string };
  try {
    aptosResult = await aptos.anchorCertificate(
      req.cert.gem_id,
      certHash,
      req.cert.report_id
    );
  } catch (err) {
    throw new Error(
      `Aptos anchoring failed (Cardano tx already submitted: ${cardanoResult.txHash}): ${String(err)}`
    );
  }

  // ── 3. Ethereum: anchor cert hash against issuer identity ─────────────────
  let ethResult: { txHash: string };
  try {
    ethResult = await ethereum.anchorCertificate(
      req.cert.gem_id,
      certHash,
      req.cert.report_id
    );
  } catch (err) {
    throw new Error(
      `Ethereum anchoring failed (Cardano: ${cardanoResult.txHash}, Aptos: ${aptosResult.txHash}): ${String(err)}`
    );
  }

  const cardanoInfo = await cardano.getNetworkInfo();

  return {
    certHash,
    cardano: {
      txHash: cardanoResult.txHash,
      datumHash: cardanoResult.datumHash,
      network: cardanoInfo.network,
      scriptAddress: cardanoInfo.scriptAddress,
    },
    aptos: {
      txHash: aptosResult.txHash,
      network: (await aptos.getNetworkInfo()).chainId.toString(),
    },
    ethereum: {
      txHash: ethResult.txHash,
      network: (await ethereum.getNetworkInfo()).network,
    },
    issuedAt: cardanoResult.issuedAt,
  };
}

/**
 * Verifies a certificate against all three chains.
 * Cardano is the authoritative source; Ethereum and Aptos provide
 * corroborating evidence.
 */
export async function verifyCertificate(
  req: VerificationRequest
): Promise<VerificationResult> {
  const checkedAt = Math.floor(Date.now() / 1000);

  // Run all three checks in parallel for speed
  const [cardanoCheck, ethCheck, aptosCheck] = await Promise.allSettled([
    cardano.verifyCertificate(req.certHash),
    ethereum.verifyCertificate(req.gemId ?? req.certHash),
    req.gemId
      ? aptos.getGemEvents(req.gemId).then((events) => ({ events }))
      : Promise.resolve({ events: [] }),
  ]);

  const cardanoResult =
    cardanoCheck.status === "fulfilled"
      ? cardanoCheck.value
      : { verified: false, reason: String((cardanoCheck as PromiseRejectedResult).reason) };

  const ethResult =
    ethCheck.status === "fulfilled"
      ? ethCheck.value
      : { error: String((ethCheck as PromiseRejectedResult).reason) };

  const aptosResult =
    aptosCheck.status === "fulfilled"
      ? aptosCheck.value
      : { error: String((aptosCheck as PromiseRejectedResult).reason) };

  return {
    verified: cardanoResult.verified,
    certHash: req.certHash,
    cardano: cardanoResult,
    ethereum: ethResult,
    aptos: aptosResult,
    checkedAt,
  };
}

/**
 * Returns health/status of all three blockchain connections.
 */
export async function getChainStatus(): Promise<{
  ethereum: object | { error: string };
  aptos: object | { error: string };
  cardano: object | { error: string };
}> {
  const [ethInfo, aptosInfo, cardanoInfo] = await Promise.allSettled([
    ethereum.getNetworkInfo(),
    aptos.getNetworkInfo(),
    cardano.getNetworkInfo(),
  ]);

  return {
    ethereum:
      ethInfo.status === "fulfilled"
        ? ethInfo.value
        : { error: String((ethInfo as PromiseRejectedResult).reason) },
    aptos:
      aptosInfo.status === "fulfilled"
        ? aptosInfo.value
        : { error: String((aptosInfo as PromiseRejectedResult).reason) },
    cardano:
      cardanoInfo.status === "fulfilled"
        ? cardanoInfo.value
        : { error: String((cardanoInfo as PromiseRejectedResult).reason) },
  };
}
