import "dotenv/config";
import { Lucid, Blockfrost, Data, Constr, getAddressDetails, applyDoubleCborEncoding, applyParamsToScript, validatorToAddress, validatorToScriptHash } from "@lucid-evolution/lucid";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_ADDRESS = "addr_test1wpdw8xlc7zq68f9mmq3ur04secy784rlfdtwjkd2tqk70jcdjz9rm";
const REGISTRY_SCRIPT_HASH = "5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e959aa582de7cb";

const RegistryDatumSchema = Data.Object({
  admin: Data.Bytes(),
  issuers: Data.Array(Data.Bytes()),
  version: Data.Integer(),
});

async function main() {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as any;
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;
  const lucid = await Lucid(new Blockfrost(apiUrl, process.env.BLOCKFROST_PROJECT_ID!), network);

  const utxos = await lucid.utxosAt(REGISTRY_ADDRESS);
  const registryUtxo = utxos[0];

  console.log("Using UTXO:", registryUtxo.txHash + "#" + registryUtxo.outputIndex);
  console.log("Raw datum CBOR:", registryUtxo.datum);

  const currentDatum = Data.from(registryUtxo.datum!, RegistryDatumSchema as any) as any;
  console.log("Decoded datum:", JSON.stringify(currentDatum, (k, v) => typeof v === 'bigint' ? v.toString() : v));

  const pkh = "9e0ce01fe8f1a3881a5dd8ebb83e1d160fc06b62821db21f55acc567";
  const newIssuers = [...currentDatum.issuers, pkh];
  const newDatum = { admin: currentDatum.admin, issuers: newIssuers, version: currentDatum.version + 1n };
  const encodedNextDatum = Data.to(newDatum, RegistryDatumSchema as any);
  console.log("New datum CBOR:", encodedNextDatum);
  console.log("New datum decoded:", JSON.stringify(Data.from(encodedNextDatum), (k, v) => typeof v === 'bigint' ? v.toString() : v));

  const redeemer = Data.to(new Constr(0, [pkh]));
  console.log("Redeemer CBOR:", redeemer);
  console.log("Redeemer decoded:", JSON.stringify(Data.from(redeemer), (k, v) => typeof v === 'bigint' ? v.toString() : v));

  // Load registry validator
  const plutusPath = path.resolve(__dirname, "../../contracts/cardano/plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  const registryValidator = plutusJson.validators.find((v: any) => v.title === "issuer_registry_validator.issuer_registry.spend");
  const registryScript = { type: "PlutusV3" as const, script: applyDoubleCborEncoding(registryValidator.compiledCode) };

  const adminPkh = currentDatum.admin;
  const userAddress = "addr_test1qzvfv3u5elnx7mx04m98jg0e4jpm3lkgxu5ugjtlpjdavx5u686mw6z075ganhcjn3xech65rhz8vmxjg6uvth7wx2psy5na0t";
  lucid.selectWallet.fromAddress(userAddress, []);

  try {
    const tx = await lucid.newTx()
      .collectFrom([registryUtxo], redeemer)
      .attach.SpendingValidator(registryScript)
      .addSignerKey(adminPkh)
      .pay.ToContract(REGISTRY_ADDRESS, { kind: "inline", value: encodedNextDatum }, { lovelace: 3000000n })
      .complete();
    console.log("\n✓ Transaction built successfully!");
    console.log("CBOR (first 100 chars):", tx.toString().substring(0, 100));
  } catch (e: any) {
    console.error("\n✗ Transaction failed:", e.message ?? e);
  }
}

main().catch(console.error);
