import "dotenv/config";
import {
  Lucid, Blockfrost, Data, type Script, applyDoubleCborEncoding, fromText, fromHex, Constr, LucidEvolution, validatorToAddress,
  validatorToScriptHash, getAddressDetails
} from "@lucid-evolution/lucid";
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

// We use manual Constr wrapping for datums to ensure compatibility with Aiken's single-constructor types
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

// Data.Object maps to Constr(0,[...]) which matches the on-chain RegistryDatum
const RegistryDatumSchema = Data.Object({
  admin: Data.Bytes(),
  issuers: Data.Array(Data.Bytes()),
  version: Data.Integer(),
});
type RegistryDatum = { admin: string; issuers: string[]; version: bigint };

/**
 * Initializes Lucid with a Blockfrost provider.
 */
async function initLucid(): Promise<LucidEvolution> {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as "Preprod" | "Preview" | "Mainnet";
  const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;

  if (!blockfrostProjectId) {
    throw new Error("BLOCKFROST_PROJECT_ID is not set in .env");
  }

  return await Lucid(new Blockfrost(apiUrl, blockfrostProjectId), network);
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
  const registryValidator = plutusJson.validators.find(
    (v: any) => v.title === "issuer_registry_validator.issuer_registry.spend"
  );

  if (!storageValidator || !mintingPolicy || !registryValidator) {
    throw new Error("Validators not found in plutus.json");
  }

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

  const registryScript: Script = {
    type: "PlutusV3",
    script: applyDoubleCborEncoding(registryValidator.compiledCode),
  };

  return { storageScript, policyScript, registryScript };
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
  console.log("we are here\n")
  const lucid = await initLucid();
  const { storageScript, policyScript } = getValidators();

  const storageAddress = validatorToAddress("Preprod", storageScript);
  const policyId = validatorToScriptHash(policyScript);
  console.log("policy id: ", policyId);
  const assetName = fromText(cert.gem_id);
  const unit = policyId + assetName;

  // 1. Prepare Datum
  const issuedAt = Math.floor(Date.now() / 1000);
  const rawDatum = buildCertificateDatum(cert, reportTypeInt, issuedAt);

  const encodedDatum = Data.to(new Constr(0, [
    toHex(rawDatum.issuer_id),
    toHex(rawDatum.report_id),
    BigInt(rawDatum.report_type),
    toHex(rawDatum.gem_id),
    toHex(rawDatum.cert_hash),
    BigInt(rawDatum.issued_at),
    BigInt(rawDatum.schema_version),
    toHex(rawDatum.document_cid),
    toHex(rawDatum.issuer_pkh),
  ]));

  // 2. Find Registry Reference Input
  const [registryUtxo] = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (!registryUtxo) throw new Error("Registry UTXO not found - cannot verify issuer authorization");

  // 3. Build Unsigned Transaction
  const bech32Address = getAddressDetails(userAddress).address.bech32;
  const issuerPkhHex = toHex(rawDatum.issuer_pkh);
  // Fetch user's actual UTxOs so Lucid can select collateral and fee inputs
  const walletUtxos = await lucid.utxosAt(bech32Address);
  lucid.selectWallet.fromAddress(bech32Address, walletUtxos);

  const tx = await lucid
    .newTx()
    .readFrom([registryUtxo])
    .mintAssets(
      { [unit]: 1n },
      Data.to(issuerPkhHex) // Redeemer: issuer_pkh bytes
    )
    .attach.MintingPolicy(policyScript)
    .addSignerKey(issuerPkhHex) // Minting policy requires issuer signature
    .pay.ToContract(
      storageAddress,
      { kind: "inline", value: encodedDatum },
      { [unit]: 1n, lovelace: 2000000n } // Lock the NFT with the datum
    )
    .complete({ localUPLCEval: false });

  return tx.toString();
}

/**
 * Builds an UNSIGNED transaction CBOR for updating the issuer registry.
 */
export async function buildUnsignedRegistryUpdateTx(
  action: "Add" | "Remove",
  issuerPkh: string,
  userAddress: string
) {
  const lucid = await initLucid();
  const { registryScript } = getValidators();

  // 1. Get ALL registry UTxOs (there may be duplicates from multiple initializations)
  const registryUtxos = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (registryUtxos.length === 0) throw new Error("Registry UTXO not found on-chain.");
  console.log("[Registry TX] registry utxos found:", registryUtxos.length);

  const rawCbor = registryUtxos[0].datum;
  if (!rawCbor) throw new Error("Registry UTXO is missing an inline datum.");

  // 2. Decode using Data.Object schema — matches Constr(0,[admin, issuers, version]) on-chain
  const currentDatum = Data.from<RegistryDatum>(rawCbor, RegistryDatumSchema as any);
  const { admin: adminPkh, issuers: currentIssuers, version: currentVersion } = currentDatum;
  console.log("[Registry TX] adminPkh:", adminPkh);
  console.log("[Registry TX] currentIssuers:", currentIssuers);
  console.log("[Registry TX] currentVersion:", currentVersion.toString());

  const normalizedPkh = issuerPkh.toLowerCase();
  let newIssuers = [...currentIssuers];

  if (action === "Add") {
    if (newIssuers.includes(normalizedPkh)) throw new Error("Issuer already authorized.");
    newIssuers.push(normalizedPkh);
  } else {
    if (!newIssuers.includes(normalizedPkh)) throw new Error("Issuer not found in registry.");
    newIssuers = newIssuers.filter((p) => p !== normalizedPkh);
  }

  const encodedNextDatum = Data.to<RegistryDatum>(
    { admin: adminPkh, issuers: newIssuers, version: currentVersion + 1n },
    RegistryDatumSchema as any
  );
  console.log("[Registry TX] encodedNextDatum CBOR:", encodedNextDatum);

  // 3. Redeemer — AddIssuer: Constr(0,[pkh]), RemoveIssuer: Constr(1,[pkh])
  const redeemer = action === "Add"
    ? Data.to(new Constr(0, [normalizedPkh]))
    : Data.to(new Constr(1, [normalizedPkh]));

  // 4. Wallet setup
  const bech32Address = getAddressDetails(userAddress).address.bech32;
  const walletUtxos = await lucid.utxosAt(bech32Address);
  console.log("[Registry TX] walletUtxos count:", walletUtxos.length);
  if (walletUtxos.length === 0) throw new Error("Wallet has no UTxOs — fund it from the faucet.");
  lucid.selectWallet.fromAddress(bech32Address, walletUtxos);

  // Collateral must be a pure-ADA UTxO — pass the UTxO object, not the amount
  const collateralUtxo = walletUtxos
    .filter(u => Object.keys(u.assets).length === 1)
    .sort((a, b) => Number(b.assets.lovelace - a.assets.lovelace))[0];
  if (!collateralUtxo) throw new Error("No pure-ADA UTxO available for collateral.");
  console.log("[Registry TX] collateral:", `${collateralUtxo.txHash}#${collateralUtxo.outputIndex}`);

  // 5. Spend ALL registry UTxOs (consolidates duplicates into one clean output)
  const tx = await lucid
    .newTx()
    .collectFrom(registryUtxos, redeemer)
    .attach.SpendingValidator(registryScript)
    .addSignerKey(adminPkh)
    .pay.ToContract(
      REGISTRY_ADDRESS,
      { kind: "inline", value: encodedNextDatum },
      { lovelace: 3000000n }
    )
    .complete({
      localUPLCEval: false,
      setCollateral: collateralUtxo as any,
    });

  return tx.toString();
}

/**
 * Submits an already-signed transaction CBOR to the Cardano network.
 */
export async function submitSignedTx(
  signedTxCbor: string
): Promise<string> {
  const lucid = await initLucid();

  const txHash = await lucid.config().provider!.submitTx(signedTxCbor);

  return txHash;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
