import "dotenv/config";
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

async function main() {
  const lucid = await Lucid(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", process.env.BLOCKFROST_PROJECT_ID!),
    "Preprod"
  );

  const seed = "awful elder spot okay grace rebel erosion color shop caution denial game turkey diet vast woman pipe fiction clay carry arrange creek olive fiction";
  lucid.selectWallet.fromSeed(seed);
  
  const address = await lucid.wallet().address();
  console.log("\n--- Admin Wallet Details ---");
  console.log("Address:", address);
  console.log("----------------------------\n");
}

main().catch(console.error);
