
import { Lucid, Blockfrost, getAddressDetails } from "@lucid-evolution/lucid";

async function main() {
  const seed = "awful elder spot okay grace rebel erosion color shop caution denial game turkey diet vast woman pipe fiction clay carry arrange creek olive fiction";
  
  // Try different account indexes to see if one matches 98964794...
  for (let i = 0; i < 5; i++) {
    const lucid = await Lucid(new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "preprodYKOGh6iToLhXzKjydl3LmUDaszQWKqfu"), "Preprod");
    lucid.selectWallet.fromSeed(seed, { accountIndex: i });
    const addr = await lucid.wallet().address();
    const pkh = getAddressDetails(addr).paymentCredential?.hash;
    console.log(`Account #${i} PKH: ${pkh}`);
  }
}

main().catch(console.error);
