
import { Request, Response } from "express";

export async function registerGem(req: Request, res: Response): Promise<void> {
  try {
    const { ownerAddress, ipfsLink, nftId } = req.body;

    // Validate required fields
    if (!ownerAddress || typeof ownerAddress !== "string") {
      res.status(400).json({ success: false, error: "ownerAddress is required and must be a string" });
      return;
    }
    if (!ipfsLink || typeof ipfsLink !== "string") {
      res.status(400).json({ success: false, error: "ipfsLink is required and must be a string" });
      return;
    }
    if (!nftId) {
      res.status(400).json({ success: false, error: "nftId is required" });
      return;
    }

    // Mock registration logic
    console.log(`[gemController] Registering gem: NFT ID ${nftId}, Owner ${ownerAddress}, IPFS ${ipfsLink}`);

    // In a real scenario, this might involve database storage or contract interaction.
    // Since we are not implementing contracts, we return a successful response.
    res.status(201).json({
      success: true,
      message: "Gem registered successfully (minimal API)",
      data: {
        ownerAddress,
        ipfsLink,
        nftId,
        registrationTimestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[gemController] registerGem error:", message);
    res.status(500).json({ success: false, error: message });
  }
}
