/**
 * routes/certificates.ts
 *
 * Express router — /api/certificates
 *
 * POST /api/certificates/issue       → issue across all 3 chains
 * GET  /api/certificates/verify/:certHash → verify on all 3 chains
 */

import { Router, Request, Response } from "express";
import * as service from "../services/certificateService";

const router = Router();

// ─── POST /api/certificates/issue ─────────────────────────────────────────────
/**
 * @body {
 *   cert: CanonicalCertificate,
 *   issuerEthAddress: string,
 *   reportType?: string
 * }
 */
router.post("/issue", async (req: Request, res: Response) => {
  try {
    const { cert, issuerEthAddress, reportType } = req.body as {
      cert: unknown;
      issuerEthAddress: unknown;
      reportType?: unknown;
    };

    // Basic input validation
    if (!cert || typeof cert !== "object") {
      res.status(400).json({ error: "Request body must include a `cert` object." });
      return;
    }
    if (!issuerEthAddress || typeof issuerEthAddress !== "string") {
      res.status(400).json({ error: "`issuerEthAddress` (string) is required." });
      return;
    }

    const result = await service.issueCertificate({
      cert: cert as Parameters<typeof service.issueCertificate>[0]["cert"],
      issuerEthAddress,
      reportType: typeof reportType === "string" ? reportType : undefined,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /api/certificates/verify/:certHash ───────────────────────────────────
/**
 * @param certHash - 64-char hex SHA-256 certificate hash
 * @query gemId   - Optional gem ID for Aptos event lookup
 */
router.get("/verify/:certHash", async (req: Request, res: Response) => {
  try {
    const { certHash } = req.params;
    const gemId = typeof req.query.gemId === "string" ? req.query.gemId : undefined;

    if (!/^[0-9a-fA-F]{64}$/.test(certHash)) {
      res.status(400).json({
        error: "certHash must be a 64-character hex string (SHA-256).",
      });
      return;
    }

    const result = await service.verifyCertificate({ certHash, gemId });
    const status = result.verified ? 200 : 404;
    res.status(status).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
