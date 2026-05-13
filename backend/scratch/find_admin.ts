import "dotenv/config";
import { Lucid, Blockfrost, Data } from "@lucid-evolution/lucid";

const REGISTRY_ADDRESS = "addr_test1wrn4gqe27zpeac55kqmrjxhnyggjp650dsg9wxg8cqwqthqrjy8zz";

const RegistryDatumSchema = Data.Object({
  admin: Data.Bytes(),
  issuers: Data.Array(Data.Bytes()),
  version: Data.Integer(),
});

async function main() {
  const network = "Preprod";
  const lucid = await Lucid(new Blockfrost(`https://cardano-preprod.blockfrost.io/api/v0`, process.env.BLOCKFROST_PROJECT_ID!), network);

  console.log("Fetching registry at:", REGISTRY_ADDRESS);
  const [registryUtxo] = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (!registryUtxo) {
    console.error("Registry UTXO not found.");
    return;
  }

  const datum = Data.from(registryUtxo.datum!, RegistryDatumSchema as any) as any;
  const adminPkh = datum.admin;

  console.log("\n--- Registry Information ---");
  console.log("Current Admin PKH:", adminPkh);
  console.log("Number of Issuers:", datum.issuers.length);
  console.log("Registry Version:", datum.version.toString());
  console.log("\nTo find the Bech32 address, search for this PKH on https://preprod.cardanoscan.io/");
}

main().catch(console.error);
