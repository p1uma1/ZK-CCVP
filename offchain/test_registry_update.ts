/**
 * test_registry_update.ts
 *
 * Full end-to-end test: sign and submit a registry AddIssuer transaction
 * using the admin seed phrase from offchain/.env
 *
 * Run from the offchain directory:
 *   npx tsx test_registry_update.ts [issuer_pkh_to_add] [Add|Remove]
 */
import "dotenv/config";
import {
  Lucid, Blockfrost, Data,
  applyDoubleCborEncoding,
  validatorToScriptHash,
  type Script, getAddressDetails,
  Constr,
} from "@lucid-evolution/lucid";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const REGISTRY_ADDRESS = "addr_test1wrn4gqe27zpeac55kqmrjxhnyggjp650dsg9wxg8cqwqthqrjy8zz";

const ISSUER_PKH_TO_ADD = process.argv[2] ?? "9e0ce01fe8f1a3881a5dd8ebb83e1d160fc06b62821db21f55acc567";
const ACTION: "Add" | "Remove" = (process.argv[3] as any) ?? "Add";

// ── Datum helpers ─────────────────────────────────────────────────────────────
// On-chain shape: Constr(0, [admin_bytes, issuers_list, version_int])
// i.e. d8799f <bytes> <list> <int> ff
// We work with raw Constr directly instead of a typed schema to avoid
// Tuple/Object mismatch with the CBOR indef-array encoding Aiken emits.

interface RegistryDatum {
  admin: string;
  issuers: string[];
  version: bigint;
}

const RegistryDatumSchema = Data.Object({
  admin: Data.Bytes(),
  issuers: Data.Array(Data.Bytes()),
  version: Data.Integer(),
});

function decodeDatum(cbor: string): RegistryDatum {
  return Data.from(cbor, RegistryDatumSchema as any) as RegistryDatum;
}

function encodeDatum(d: RegistryDatum): string {
  return Data.to(d as any, RegistryDatumSchema as any);
}

// ── Load validator ────────────────────────────────────────────────────────────
function loadRegistryScript(): Script {
  const plutusPath = path.resolve(__dirname, "../contracts/cardano/plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  const v = plutusJson.validators.find(
    (v: any) => v.title === "issuer_registry_validator.issuer_registry.spend"
  );
  if (!v) throw new Error("Registry validator not found in plutus.json");

  // Aiken compiledCode is already double-CBOR encoded — do NOT wrap again
  return { type: "PlutusV3", script: v.compiledCode };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as "Preprod" | "Preview" | "Mainnet";
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;
  const projectId = process.env.BLOCKFROST_PROJECT_ID;
  const adminSeed = process.env.ADMIN_SEED;

  if (!projectId) throw new Error("BLOCKFROST_PROJECT_ID not set");
  if (!adminSeed) throw new Error("ADMIN_SEED not set");

  console.log(`\nNetwork: ${network}`);
  console.log(`Action:  ${ACTION} issuer PKH: ${ISSUER_PKH_TO_ADD}\n`);

  // ── Connectivity check ─────────────────────────────────────────────────────
  try {
    const res = await fetch(`${apiUrl}/health`, { headers: { project_id: projectId } });
    const body = await res.json();
    console.log("Blockfrost health check:", res.status, body);
  } catch (e: any) {
    console.error("Cannot reach Blockfrost:", e.cause ?? e.message);
    process.exit(1);
  }

  // ── Init Lucid ─────────────────────────────────────────────────────────────
  const lucid = await Lucid(new Blockfrost(apiUrl, projectId), network);
  lucid.selectWallet.fromSeed(adminSeed);

  const adminAddress = await lucid.wallet().address();
  const adminPkhFromWallet = getAddressDetails(adminAddress).paymentCredential?.hash ?? "";
  console.log("Admin address:", adminAddress);
  console.log("Admin PKH:   ", adminPkhFromWallet);

  // ── 1. Fetch registry UTxOs ────────────────────────────────────────────────
  const registryUtxos = await lucid.utxosAt(REGISTRY_ADDRESS);
  console.log(`\nFound ${registryUtxos.length} registry UTxO(s):`);
  for (const u of registryUtxos) {
    console.log(`  ${u.txHash}#${u.outputIndex}  lovelace:${u.assets.lovelace}  datum:${u.datum}`);
  }
  if (registryUtxos.length === 0) throw new Error("No registry UTxOs found");

  // ── 2. Decode current datum ────────────────────────────────────────────────
  const rawCbor = registryUtxos[0].datum!;
  const current = decodeDatum(rawCbor);

  console.log("\nCurrent datum:");
  console.log("  admin:  ", current.admin);
  console.log("  issuers:", current.issuers);
  console.log("  version:", current.version.toString());

  if (current.admin !== adminPkhFromWallet) {
    console.warn(`\n⚠️  WARNING: datum admin (${current.admin}) != wallet PKH (${adminPkhFromWallet})`);
    console.warn("   The transaction will fail — admin signature required.\n");
  }

  // ── 3. Compute new issuer list ─────────────────────────────────────────────
  const normalizedPkh = ISSUER_PKH_TO_ADD.toLowerCase();
  let newIssuers = [...current.issuers];

  if (ACTION === "Add") {
    if (newIssuers.includes(normalizedPkh)) {
      console.log("\nIssuer already in the list. Nothing to do.");
      return;
    }
    newIssuers.push(normalizedPkh);
  } else {
    newIssuers = newIssuers.filter(p => p !== normalizedPkh);
  }

  const newVersion = current.version + 1n;

  // ── 4. Encode new datum ────────────────────────────────────────────────────
  const encodedNextDatum = encodeDatum({
    admin: current.admin,
    issuers: newIssuers,
    version: newVersion,
  });

  console.log("\nNew datum CBOR:", encodedNextDatum);
  console.log("New issuers:   ", newIssuers);
  console.log("New version:   ", newVersion.toString());

  // ── 5. Build redeemer ──────────────────────────────────────────────────────
  // Aiken RegistryRedeemer: AddIssuer{pkh}=Constr(0,[pkh]), RemoveIssuer{pkh}=Constr(1,[pkh])
  // Data.Enum crashes at runtime in this lucid-evolution version — use raw Constr instead.
  const redeemer = ACTION === "Add"
    ? Data.to(new Constr(0, [normalizedPkh]))
    : Data.to(new Constr(1, [normalizedPkh]));
  console.log("Redeemer CBOR:", redeemer);
  // ── 6. Load registry script ────────────────────────────────────────────────
  const registryScript = loadRegistryScript();
  console.log("Registry script hash:", validatorToScriptHash(registryScript));
  console.log("Redeemer:", redeemer);
  // ── 7. Build, sign, submit ─────────────────────────────────────────────────
  const registryUtxo = registryUtxos[0];
  console.log("\nUsing registry UTxO:", registryUtxo.txHash + "#" + registryUtxo.outputIndex);

  const tx = await lucid
    .newTx()
    .collectFrom([registryUtxo], redeemer)
    .attach.SpendingValidator(registryScript)
    .addSignerKey(current.admin)
    .pay.ToContract(
      REGISTRY_ADDRESS,
      { kind: "inline", value: encodedNextDatum },
      { lovelace: 3_000_000n },
    )
    .complete({ localUPLCEval: false });

  console.log("Signing transaction...");
  const signedTx = await tx.sign.withWallet().complete();

  console.log("Submitting transaction...");
  const txHash = await signedTx.submit();

  console.log(`\n✅ Transaction submitted: ${txHash}`);
  console.log(`   https://preprod.cardanoscan.io/transaction/${txHash}`);
}

main().catch(err => {
  console.error("\n❌ Error:", err.message ?? err);
  process.exit(1);
});