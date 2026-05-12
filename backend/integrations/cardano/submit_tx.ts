import "dotenv/config";
import { Lucid, Blockfrost, Data, type SpendingValidator } from "lucid-cardano";
import { buildCertificateDatum } from "./build_datum.js";
import type { CanonicalCertificate } from "./canonicalize.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { applyDoubleCborEncoding } from "lucid-cardano";


// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

type CertificateDatum = Data.Static<typeof CertificateDatumSchema>;

/**
 * Initializes Lucid with a Blockfrost provider (No private key needed).
 */
async function initLucid(): Promise<Lucid> {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as any;
  const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
  const apiUtl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;

  if (!blockfrostProjectId) {
    throw new Error("BLOCKFROST_PROJECT_ID is not set in .env");
  }

  return await Lucid.new(new Blockfrost(apiUtl, blockfrostProjectId), network);
}


function getValidator(): SpendingValidator {
  const plutusPath = path.resolve(__dirname, "../../../contracts/cardano/plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));
  const validator = plutusJson.validators.find(
    (v: any) => v.title === "certificate_validator.certificate_validator.spend"
  );
  if (!validator) throw new Error("Validator not found in plutus.json");

  return {
    type: "PlutusV2",
    script: applyDoubleCborEncoding(validator.compiledCode),
  };
}

/**
 * Builds an UNSIGNED transaction CBOR to be signed by a frontend wallet.
 */
export async function buildUnsignedAnchorTx(
  cert: CanonicalCertificate,
  reportTypeInt: number,
  userAddress: string // Needed to select UTXOs for the transaction
) {

  const lucid = await initLucid();

  const validator = getValidator();
  const scriptAddress = lucid.utils.validatorToAddress(validator);

  // 1. Prepare Datum
  const issuedAt = Math.floor(Date.now() / 1000);
  const rawDatum = buildCertificateDatum(cert, reportTypeInt, issuedAt);

  // Pass the object DIRECTLY. Lucid's Data.Nullable handles the "Some" wrapping.
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

  console.log("[Cardano] Datum Keys count:", Object.keys(lucidDatum).length);
  console.log("[Cardano] Datum fields:", JSON.stringify(lucidDatum, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // 2. Select the user's wallet as the source of funds
  lucid.selectWalletFrom({ address: userAddress });

  const encodedDatum = Data.to(lucidDatum, CertificateDatumSchema as any);
  console.log("[Cardano] Encoded Datum Hex:", encodedDatum);

  // 3. Build Unsigned Transaction
  // The datum is submitted as an "inline datum" attached to the script output.
  console.log("[Cardano] Building transaction and attaching datum...");
  const tx = await lucid
    .newTx()
    .payToContract(
      scriptAddress,
      { inline: encodedDatum },
      { lovelace: 2000000n }
    )
    .complete();

  // Return the CBOR string 
  return tx.toString();
}

/**
 * Submits an already-signed transaction CBOR to the Cardano network.
 * Called by the backend after the frontend has signed the tx.
 */
export async function submitSignedTx(
  signedTxCbor: string
): Promise<string> {

  const lucid = await initLucid();

  console.log(
    `[Cardano] Submitting signed transaction: ${signedTxCbor.substring(0, 50)}...`
  );

  // Submit EXACT signed CBOR from frontend
  const txHash = await lucid.provider.submitTx(signedTxCbor);

  console.log("[Cardano] Transaction submitted. Hash:", txHash);

  return txHash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
