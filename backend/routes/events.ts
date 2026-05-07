/**
 * routes/events.ts
 *
 * Express router — /api/events
 *
 * POST /api/events/log             → log a gem lifecycle event on Aptos
 * GET  /api/events/:gemId          → fetch all events for a gem from Aptos
 */

import { Router, Request, Response } from "express";
import * as aptos from "../integrations/aptos/index";

const router = Router();

// ─── POST /api/events/log ─────────────────────────────────────────────────────
/**
 * @body {
 *   gemId: string,
 *   eventType: number,   // 1=Mined, 2=Cut, 3=Graded, 4=Transferred, 5=CertIssued
 *   metadataUri: string  // IPFS URI with event details
 * }
 */
router.post("/log", async (req: Request, res: Response) => {
  try {
    const { gemId, eventType, metadataUri } = req.body as {
      gemId: unknown;
      eventType: unknown;
      metadataUri: unknown;
    };

    if (!gemId || typeof gemId !== "string") {
      res.status(400).json({ error: "`gemId` (string) is required." });
      return;
    }
    if (typeof eventType !== "number" || eventType < 1 || eventType > 5) {
      res.status(400).json({
        error: "`eventType` must be a number between 1 and 5. " +
          "(1=Mined, 2=Cut, 3=Graded, 4=Transferred, 5=CertIssued)",
      });
      return;
    }
    if (!metadataUri || typeof metadataUri !== "string") {
      res.status(400).json({ error: "`metadataUri` (IPFS CID or URI string) is required." });
      return;
    }

    const result = await aptos.logGemEvent({
      gemId,
      eventType: eventType as aptos.GemEventType,
      metadataUri,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── GET /api/events/:gemId ───────────────────────────────────────────────────
router.get("/:gemId", async (req: Request, res: Response) => {
  try {
    const { gemId } = req.params;

    if (!gemId) {
      res.status(400).json({ error: "`gemId` path parameter is required." });
      return;
    }

    const events = await aptos.getGemEvents(gemId);

    const eventTypeLabels: Record<number, string> = {
      1: "Mined",
      2: "Cut",
      3: "Graded",
      4: "Transferred",
      5: "CertIssued",
    };

    const enriched = events.map((e) => ({
      ...e,
      event_type_label: eventTypeLabels[e.event_type] ?? "Unknown",
    }));

    res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
