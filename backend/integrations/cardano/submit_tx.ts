import "dotenv/config";
import { Lucid, Blockfrost, Data, type Script, applyDoubleCborEncoding, fromText } from "@lucid-evolution/lucid";
import { buildCertificateDatum } from "./build_datum.js";
import type { CanonicalCertificate } from "./canonicalize.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registry Details
const REGISTRY_ADDRESS = "addr_test1wpdw8xlc7zq68f9mmq3ur04secy784rlfdtwjkd2tqk70jcdjz9rm";
const REGISTRY_SCRIPT_HASH = "5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e959aa582de7cb";

const CertificateDatumSchema = Data.Object({
  issuer_id: Data.Bytes(),
  report_id: Data.Bytes(),
  report_type: Data.Integer(),
  gem_id: Data.Bytes(),
  cert_hash: Data.Bytes(),
  issued_at: Data.Integer(),
  schema_version: Data.Integer(),
  document_cid: Data.Bytes(),
  issuer_pkh: Data.Bytes(),
});

/**
 * Initializes Lucid with a Blockfrost provider.
 */
async function initLucid(): Promise<Lucid> {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as "Preprod" | "Preview" | "Mainnet";
  const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;

  if (!blockfrostProjectId) {
    throw new Error("BLOCKFROST_PROJECT_ID is not set in .env");
  }

  return await Lucid.new(new Blockfrost(apiUrl, blockfrostProjectId), network);
}

function getValidators() {
  const plutusPath = path.resolve(__dirname, "../../../contracts/cardano/plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  
  const storageValidator = plutusJson.validators.find(
    (v: any) => v.title === "certificate_validator.certificate_validator.spend"
  );
  const mintingPolicy = plutusJson.validators.find(
    (v: any) => v.title === "certificate_policy.certificate_policy.mint"
  );

  if (!storageValidator || !mintingPolicy) throw new Error("Validators not found in plutus.json");

  const storageScript: Script = {
    type: "PlutusV3",
    script: applyDoubleCborEncoding(storageValidator.compiledCode),
  };

  // The minting policy is parameterized by the registry script hash
  const policyScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(
        applyDoubleCborEncoding(mintingPolicy.compiledCode),
        [REGISTRY_SCRIPT_HASH]
    )
  };

  return { storageScript, policyScript };
}

// Helper to handle applyParamsToScript which isn't directly in lucid-evolution exports sometimes
// but we can use the one from utils or implement a simple version if needed.
// Actually, Lucid Evolution HAS applyParamsToScript in its core.
import { applyParamsToScript } from "@lucid-evolution/lucid";

/**
 * Builds an UNSIGNED transaction CBOR to be signed by a frontend wallet.
 */
export async function buildUnsignedAnchorTx(
  cert: CanonicalCertificate,
  reportTypeInt: number,
  userAddress: string
) {
  const lucid = await initLucid();
  const { storageScript, policyScript } = getValidators();
  
  const storageAddress = lucid.utils.validatorToAddress(storageScript);
  const policyId = lucid.utils.validatorToScriptHash(policyScript);
  const assetName = fromText(cert.gem_id);
  const unit = policyId + assetName;

  // 1. Prepare Datum
  const issuedAt = Math.floor(Date.now() / 1000);
  const rawDatum = buildCertificateDatum(cert, reportTypeInt, issuedAt);

  const lucidDatum = {
    issuer_id: toHex(rawDatum.issuer_id),
    report_id: toHex(rawDatum.report_id),
    report_type: BigInt(rawDatum.report_type),
    gem_id: toHex(rawDatum.gem_id),
    cert_hash: toHex(rawDatum.cert_hash),
    issued_at: BigInt(rawDatum.issued_at),
    schema_version: BigInt(rawDatum.schema_version),
    document_cid: toHex(rawDatum.document_cid),
    issuer_pkh: toHex(rawDatum.issuer_pkh),
  };

  const encodedDatum = Data.to(lucidDatum, CertificateDatumSchema);

  // 2. Find Registry Reference Input
  const [registryUtxo] = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (!registryUtxo) throw new Error("Registry UTXO not found - cannot verify issuer authorization");

  // 3. Build Unsigned Transaction
  lucid.selectWallet.fromAddress(userAddress, []);

  const tx = await lucid
    .newTx()
    .readFrom([registryUtxo])
    .mintAssets(
        { [unit]: 1n },
        Data.to(toHex(rawDatum.issuer_pkh)) // Redeemer: issuer_pkh
    )
    .pay.ToContract(
      storageAddress,
      { kind: "inline", value: encodedDatum },
      { [unit]: 1n, lovelace: 2000000n } // Lock the NFT with the datum
    )
    .complete();

  return tx.toString();
}

/**
 * Submits an already-signed transaction CBOR to the Cardano network.
 */
export async function submitSignedTx(
  signedTxCbor: string
): Promise<string> {
  const lucid = await initLucid();
  const txHash = await lucid.fromTx(signedTxCbor).submit();
  return txHash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
