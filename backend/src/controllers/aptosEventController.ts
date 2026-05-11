

import { Request, Response } from "express";
import {
  registerNewGem,
  logSupplyChainEvent,
  getGemStatus,
  STAGE,
} from "../services/aptosEventService.js";
import { createAccountFromEnv } from "../../integrations/aptos/submit_tx.js";
import { type StageValue } from "../../integrations/aptos/build_event.js";


export async function registerGem(req: Request, res: Response): Promise<void> {
  try {
    const { gemId, actorAddress, metadata, ethereumTokenId } = req.body;

    // Validate required fields
    if (!gemId || typeof gemId !== "string") {
      res.status(400).json({ success: false, error: "gemId is required and must be a string" });
      return;
    }
    if (!actorAddress || typeof actorAddress !== "string") {
      res.status(400).json({ success: false, error: "actorAddress is required" });
      return;
    }
    if (!metadata || typeof metadata !== "object") {
      res.status(400).json({ success: false, error: "metadata is required and must be an object" });
      return;
    }

    const result = await registerNewGem(
      gemId,
      actorAddress,
      metadata,
      ethereumTokenId,
    );

    res.status(201).json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[aptosEventController] registerGem error:", message);
    res.status(500).json({ success: false, error: message });
  }
}


export async function logEvent(req: Request, res: Response): Promise<void> {
  try {
    const { gemId, stage, actorAddress, metadata, attachments } = req.body;

    // Validate required fields
    if (!gemId || typeof gemId !== "string") {
      res.status(400).json({ success: false, error: "gemId is required" });
      return;
    }
    if (!stage || typeof stage !== "number" || stage < 1 || stage > 7) {
      res.status(400).json({ success: false, error: "stage must be a number between 1 and 7" });
      return;
    }
    if (!actorAddress || typeof actorAddress !== "string") {
      res.status(400).json({ success: false, error: "actorAddress is required" });
      return;
    }
    if (!metadata || typeof metadata !== "object") {
      res.status(400).json({ success: false, error: "metadata is required" });
      return;
    }

    // Stage 1 (MINING) must go through registerGem endpoint
    if (stage === STAGE.MINING) {
      res.status(400).json({
        success: false,
        error: "Use POST /api/aptos/gems to register a new gem (Mining stage)",
      });
      return;
    }

    const signer = createAccountFromEnv();
    const result = await logSupplyChainEvent(
      {
        gemId,
        stage: stage as StageValue,
        actorAddress,
        metadata,
        attachments
      },
      signer,
    );

    res.status(201).json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[aptosEventController] logEvent error:", message);

    // Return 403 for authorization failures
    if (message.includes("E_UNAUTHORIZED") || message.includes("105")) {
      res.status(403).json({ success: false, error: "Actor not authorized for this stage" });
      return;
    }

    // Return 409 for invalid transitions
    if (message.includes("E_INVALID_TRANSITION") || message.includes("103")) {
      res.status(409).json({ success: false, error: "Invalid stage transition" });
      return;
    }

    res.status(500).json({ success: false, error: message });
  }
}


export async function getGem(req: Request, res: Response): Promise<void> {
  try {
    const { gemId } = req.params;

    if (!gemId) {
      res.status(400).json({ success: false, error: "gemId is required" });
      return;
    }

    const result = await getGemStatus(gemId);

    if (!result.exists) {
      res.status(404).json({ success: false, error: `Gem ${gemId} not found on-chain` });
      return;
    }

    res.status(200).json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[aptosEventController] getGem error:", message);
    res.status(500).json({ success: false, error: message });
  }
}