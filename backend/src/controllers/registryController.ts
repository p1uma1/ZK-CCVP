
import { Request, Response } from "express";
import { buildUnsignedRegistryUpdateTx, submitSignedTx } from "../../integrations/cardano/submit_tx.js";

export async function createRegistryUpdate(req: Request, res: Response): Promise<void> {
  try {
    const { action, issuerPkh, userAddress } = req.body;

    if (!action || !["Add", "Remove"].includes(action)) {
      res.status(400).json({ success: false, error: "action must be 'Add' or 'Remove'" });
      return;
    }
    if (!issuerPkh || typeof issuerPkh !== "string") {
      res.status(400).json({ success: false, error: "issuerPkh is required" });
      return;
    }
    if (!userAddress || typeof userAddress !== "string") {
      res.status(400).json({ success: false, error: "userAddress is required" });
      return;
    }

    console.log(`[registryController] Building ${action} transaction for PKH: ${issuerPkh}`);

    const unsignedTx = await buildUnsignedRegistryUpdateTx(action, issuerPkh, userAddress);

    res.status(200).json({
      success: true,
      message: `${action} transaction generated successfully`,
      data: { unsignedTx }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[registryController] createRegistryUpdate error:", message);
    res.status(500).json({ success: false, error: message });
  }
}

export async function submitRegistryTx(req: Request, res: Response): Promise<void> {
  try {
    const { signedTx } = req.body;

    if (!signedTx || typeof signedTx !== "string") {
      res.status(400).json({ success: false, error: "signedTx is required" });
      return;
    }

    console.log(`[registryController] Submitting signed registry transaction...`);
    const txHash = await submitSignedTx(signedTx);

    res.status(200).json({
      success: true,
      message: "Registry update submitted successfully",
      data: { txHash }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[registryController] submitRegistryTx error:", message);
    res.status(500).json({ success: false, error: message });
  }
}
