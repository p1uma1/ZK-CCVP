
import { Lucid, Blockfrost, getAddressDetails } from "@lucid-evolution/lucid";

async function main() {
  const lucid = await Lucid(new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", "preprodYKOGh6iToLhXzKjydl3LmUDaszQWKqfu"), "Preprod");
  
  const vkeyHex = "e3ae198fba8abd23cc501f4deca70bc70d3f50c07495a2a5b534e167834762c2";
  // We can't easily hash to PKH without CML, but we can compare it to the bech32 address PKH
  
  const adminAddr = "addr_test1qzvfv3u5elnx7mx04m98jg0e4jpm3lkgxu5ugjtlpjdavx5u686mw6z075ganhcjn3xech65rhz8vmxjg6uvth7wx2psy5na0t";
  const adminDetails = getAddressDetails(adminAddr);
  console.log("Admin PKH from Seed:", adminDetails.paymentCredential?.hash);
  
  // Now let's see what address produces the VKey in the witness set
  // We'll use a dummy address check
  console.log("Required PKH: 98964794cfe66f6ccfaeca7921f9ac83b8fec83729c4497f0c9bd61a");
}

main().catch(console.error);
