
import { Request, Response } from "express";
import { Lucid, Blockfrost, paymentCredentialOf, credentialToAddress } from "@lucid-evolution/lucid";

/**
 * GET /api/utils/pkh?address=addr_test1...
 */
export async function getAddressPkh(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.query;

    if (!address || typeof address !== "string") {
      res.status(400).json({ success: false, error: "address query parameter is required" });
      return;
    }

    // We don't need a full Lucid instance for this, but we need the library's utility
    // Since this is in the backend, we already have lucid-evolution.
    const pkh = paymentCredentialOf(address).hash;

    res.status(200).json({
      success: true,
      data: { pkh }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
}

/**
 * GET /api/utils/address?hex=...
 */
export async function convertHexAddress(req: Request, res: Response): Promise<void> {
  try {
    const { hex } = req.query;

    if (!hex || typeof hex !== "string") {
      res.status(400).json({ success: false, error: "hex address is required" });
      return;
    }

    // Lucid Evolution's C.Address can be used, or just use the high level API
    // For now, let's use a simple approach if possible, or just use a dummy Lucid to helper.
    const network = (process.env.CARDANO_NETWORK ?? "Preprod") as "Preprod" | "Preview" | "Mainnet";
    const lucid = await Lucid(undefined, network);

    const address = credentialToAddress("Preprod", {
      type: "Key",
      hash: hex,
    });

    res.status(200).json({
      success: true,
      data: { address }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
}
