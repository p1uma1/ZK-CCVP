
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
    
    // Diagnostic log to help the user identify their real PKH
    try {
      const { getAddressDetails } = await import("@lucid-evolution/lucid");
      const userPkh = getAddressDetails(userAddress).paymentCredential?.hash;
      console.log(`[registryController] YOUR CONNECTED PKH: ${userPkh}`);
      console.log(`[registryController] REQUIRED ADMIN PKH: 98964794cfe66f6ccfaeca7921f9ac83b8fec83729c4497f0c9bd61a`);
    } catch (e) {
      console.warn("[registryController] Could not derive user PKH for logging.");
    }

    const unsignedTx = await buildUnsignedRegistryUpdateTx(action, issuerPkh, userAddress);
    console.log("unsigned tx: ", unsignedTx)
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
    const { unsignedTxHex, signedWitnessSet } = req.body;

    if (!unsignedTxHex || typeof unsignedTxHex !== "string") {
      res.status(400).json({ success: false, error: "unsignedTxHex is required" });
      return;
    }
    if (!signedWitnessSet || typeof signedWitnessSet !== "string") {
      res.status(400).json({ success: false, error: "signedWitnessSet is required" });
      return;
    }

    console.log(`[registryController] Submitting signed registry transaction...`);
    const txHash = await submitSignedTx({ unsignedTxHex, signedWitnessSet });

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
