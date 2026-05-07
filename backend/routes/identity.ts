/**
 * routes/identity.ts
 *
 * Express router — /api/identity
 *
 * POST /api/identity/register     → register identity on Ethereum
 * GET  /api/identity/:address     → look up an Ethereum identity
 * DELETE /api/identity/:address   → revoke an Ethereum identity
 */

import { Router, Request, Response } from "express";
import * as ethereum from "../integrations/ethereum/index";

const router = Router();

// ─── POST /api/identity/register ─────────────────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { account, role, metadataURI } = req.body as {
      account: unknown;
      role: unknown;
      metadataURI: unknown;
    };

    if (!account || typeof account !== "string") {
      res.status(400).json({ error: "`account` (Ethereum address) is required." });
      return;
    }
    if (!role || typeof role !== "string") {
      res.status(400).json({ error: "`role` (miner|cutter|retailer|issuer) is required." });
      return;
    }

    const validRoles = ["miner", "cutter", "retailer", "issuer"];
    if (!validRoles.includes(role)) {
      res.status(400).json({
        error: `Invalid role "${role}". Valid roles: ${validRoles.join(", ")}`,
      });
      return;
    }

    const result = await ethereum.registerIdentity({
      account,
      role,
      metadataURI: typeof metadataURI === "string" ? metadataURI : "",
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /api/identity/:address ───────────────────────────────────────────────
router.get("/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      res.status(400).json({ error: "Invalid Ethereum address format." });
      return;
    }

    const identity = await ethereum.getIdentity(address);
    if (!identity.active) {
      res.status(404).json({
        success: false,
        error: `No active identity found for address ${address}`,
      });
      return;
    }

    res.status(200).json({ success: true, data: identity });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── DELETE /api/identity/:address ───────────────────────────────────────────
router.delete("/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      res.status(400).json({ error: "Invalid Ethereum address format." });
      return;
    }

    const result = await ethereum.revokeIdentity(address);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
