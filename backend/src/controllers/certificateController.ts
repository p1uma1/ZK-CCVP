
import { Request, Response } from "express";
import { buildUnsignedAnchorTx, submitSignedTx } from "../../integrations/cardano/submit_tx.js";
import type { CanonicalCertificate } from "../../integrations/cardano/canonicalize.js";

export async function createCertificate(req: Request, res: Response): Promise<void> {
  try {
    const {
      gemId,
      issuerId,
      issuerPkh,
      userAddress,
      reportId,
      reportType,
      ipfsLink,
      gemData,
      images
    } = req.body;

    // Validate required fields
    if (!gemId || typeof gemId !== "string") {
      res.status(400).json({ success: false, error: "gemId is required and must be a string" });
      return;
    }
    if (!issuerId || typeof issuerId !== "string") {
      res.status(400).json({ success: false, error: "issuerId is required and must be a string" });
      return;
    }
    if (!issuerPkh || typeof issuerPkh !== "string") {
      res.status(400).json({ success: false, error: "issuerPkh is required and must be a hex string" });
      return;
    }
    if (!userAddress || typeof userAddress !== "string") {
      res.status(400).json({ success: false, error: "userAddress is required to build the transaction" });
      return;
    }
    if (!reportId || typeof reportId !== "string") {
      res.status(400).json({ success: false, error: "reportId is required and must be a string" });
      return;
    }
    if (!ipfsLink || typeof ipfsLink !== "string") {
      res.status(400).json({ success: false, error: "ipfsLink is required and must be a string" });
      return;
    }

    // 1. Prepare canonical certificate structure for Cardano integration
    const canonicalCert: CanonicalCertificate = {
      document_cid: ipfsLink,
      gem_data: gemData || { species: "Unknown", variety: "Unknown", weight_ct: 0 },
      gem_id: gemId,
      images: images || [],
      issuer_id: issuerId,
      issuer_pkh: issuerPkh,
      report_id: reportId,
      report_type: typeof reportType === "string" ? reportType : "Standard"
    };

    // 2. Use Cardano integration to build the UNSIGNED transaction
    // reportTypeInt matches the on-chain definition (e.g., 1 for Standard)
    const reportTypeInt = typeof reportType === "number" ? reportType : 1;

    console.log(`[certificateController] Building unsigned transaction for Gem ID: ${gemId}`);

    const unsignedTx = await buildUnsignedAnchorTx(canonicalCert, reportTypeInt, userAddress);

    // 3. Return success with the unsigned transaction hex (CBOR)
    res.status(200).json({
      success: true,
      message: "Unsigned transaction generated successfully",
      data: {
        unsignedTx,
        gemId,
        issuerId,
        reportId,
        creationTimestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[certificateController] createCertificate error:", message);
    res.status(500).json({ success: false, error: message });
  }
}

/**
 * POST /api/certificates/submit
 * Accepts a signed transaction CBOR (hex) from the frontend and submits it.
 */
export async function submitCertificate(req: Request, res: Response): Promise<void> {
  try {
    const { unsignedTxHex, signedWitnessSet } = req.body;

    if (!unsignedTxHex || typeof unsignedTxHex !== "string") {
      res.status(400).json({ success: false, error: "unsignedTxHex is required" });
      return;
    }
    if (!signedWitnessSet || typeof signedWitnessSet !== "string") {
      res.status(400).json({ success: false, error: "signedWitnessSet is required" });
      return;
    }

    console.log(`[certificateController] Submitting signed transaction...`);
    const txHash = await submitSignedTx({ unsignedTxHex, signedWitnessSet });

    res.status(200).json({
      success: true,
      message: "Transaction submitted successfully",
      data: { txHash }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[certificateController] submitCertificate error:", message);
    res.status(500).json({ success: false, error: message });
  }
}
