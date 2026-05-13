import "dotenv/config";
import { Lucid, Blockfrost, Data } from "@lucid-evolution/lucid";

const REGISTRY_ADDRESS = "addr_test1wpdw8xlc7zq68f9mmq3ur04secy784rlfdtwjkd2tqk70jcdjz9rm";

async function main() {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as any;
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;
  const lucid = await Lucid(new Blockfrost(apiUrl, process.env.BLOCKFROST_PROJECT_ID!), network);

  console.log(`\nFetching all UTxOs at: ${REGISTRY_ADDRESS}\n`);
  const utxos = await lucid.utxosAt(REGISTRY_ADDRESS);
  console.log(`Found ${utxos.length} UTXO(s)\n`);

  for (const [i, utxo] of utxos.entries()) {
    console.log(`--- UTXO ${i} ---`);
    console.log(`txHash: ${utxo.txHash}#${utxo.outputIndex}`);
    console.log(`lovelace: ${utxo.assets.lovelace}`);
    console.log(`datum raw CBOR: ${utxo.datum}`);
    if (utxo.datum) {
      try {
        const decoded = Data.from(utxo.datum);
        console.log(`decoded:`, JSON.stringify(decoded, (k, v) => typeof v === 'bigint' ? v.toString() : v));
      } catch (e: any) {
        console.log(`decode error: ${e.message}`);
      }
    } else {
      console.log(`(no inline datum)`);
    }
    console.log();
  }
}

main().catch(console.error);
