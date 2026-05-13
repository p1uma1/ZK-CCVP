
import { Lucid, Blockfrost } from "@lucid-evolution/lucid";

async function main() {
  const lucid = await Lucid(new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "preprodYKOGh6iToLhXzKjydl3LmUDaszQWKqfu"), "Preprod");
  const tx = lucid.newTx();
  
  console.log("has addCollateral:", typeof tx.addCollateral);
  console.log("has validTo:", typeof tx.validTo);
}

main().catch(console.error);
