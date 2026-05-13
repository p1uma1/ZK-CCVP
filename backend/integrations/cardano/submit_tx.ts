import "dotenv/config";
import {
  Lucid, Blockfrost, Data, type Script, applyDoubleCborEncoding, fromText, fromHex, Constr,
  LucidEvolution, validatorToAddress, validatorToScriptHash, getAddressDetails,
  applyParamsToScript,
} from "@lucid-evolution/lucid";
import { buildCertificateDatum } from "./build_datum.js";
import type { CanonicalCertificate } from "./canonicalize.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────────
const REGISTRY_ADDRESS = "addr_test1wrn4gqe27zpeac55kqmrjxhnyggjp650dsg9wxg8cqwqthqrjy8zz";
const REGISTRY_SCRIPT_HASH = "e754032af0839ee294b036391af3221120ea8f6c10571907c01c05dc";

// ── Schemas ───────────────────────────────────────────────────────────────────
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

// ── Datum helpers (mirrored from test script) ─────────────────────────────────
function decodeDatum(cbor: string): RegistryDatum {
  return Data.from(cbor, RegistryDatumSchema as any) as RegistryDatum;
}

function encodeDatum(d: RegistryDatum): string {
  return Data.to(d as any, RegistryDatumSchema as any);
}

// ── Lucid init ────────────────────────────────────────────────────────────────
async function initLucid(): Promise<LucidEvolution> {
  const network = (process.env.CARDANO_NETWORK ?? "Preprod") as "Preprod" | "Preview" | "Mainnet";
  const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
  const apiUrl = `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`;

  if (!blockfrostProjectId) {
    throw new Error("BLOCKFROST_PROJECT_ID is not set in .env");
  }

  return await Lucid(new Blockfrost(apiUrl, blockfrostProjectId), network);
}

// ── Validators ────────────────────────────────────────────────────────────────
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
    script: storageValidator.compiledCode,
  };

  const policyScript: Script = {
    type: "PlutusV3",
    script: applyParamsToScript(mintingPolicy.compiledCode, [REGISTRY_SCRIPT_HASH]),
  };

  // Aiken compiledCode is already double-CBOR encoded — do NOT wrap again
  const registryScript: Script = {
    type: "PlutusV3",
    script: registryValidator.compiledCode,
  };

  return { storageScript, policyScript, registryScript };
}

// ── Anchor TX ─────────────────────────────────────────────────────────────────
/**
 * Builds an UNSIGNED transaction CBOR to be signed by a frontend wallet.
 */
export async function buildUnsignedAnchorTx(
  cert: CanonicalCertificate,
  reportTypeInt: number,
  userAddress: string
) {
  console.log("we are here\n");
  const lucid = await initLucid();
  const { storageScript, policyScript } = getValidators();

  const storageAddress = validatorToAddress("Preprod", storageScript);
  const policyId = validatorToScriptHash(policyScript);
  console.log("policy id:", policyId);

  const assetName = fromText(cert.gem_id);
  const unit = policyId + assetName;

  // 1. Prepare datum
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

  // 2. Find registry reference input
  const [registryUtxo] = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (!registryUtxo) throw new Error("Registry UTXO not found — cannot verify issuer authorization");

  // 3. Wallet setup
  const bech32Address = getAddressDetails(userAddress).address.bech32;
  const walletUtxos = await lucid.utxosAt(bech32Address);
  lucid.selectWallet.fromAddress(bech32Address, walletUtxos);

  const issuerPkhHex = toHex(rawDatum.issuer_pkh);

  // 4. Build unsigned TX
  const tx = await lucid
    .newTx()
    .readFrom([registryUtxo])
    .mintAssets(
      { [unit]: 1n },
      Data.to(issuerPkhHex)  // Redeemer: issuer_pkh bytes
    )
    .attach.MintingPolicy(policyScript)
    .addSignerKey(issuerPkhHex)
    .pay.ToContract(
      storageAddress,
      { kind: "inline", value: encodedDatum },
      { [unit]: 1n, lovelace: 2000000n }
    )
    .complete({ localUPLCEval: false });

  return tx.toString();
}

// ── Registry update TX ────────────────────────────────────────────────────────
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

  // 1. Fetch registry UTxOs
  const registryUtxos = await lucid.utxosAt(REGISTRY_ADDRESS);
  if (registryUtxos.length === 0) throw new Error("No registry UTxOs found on-chain.");
  console.log("[Registry TX] registry utxos found:", registryUtxos.length);

  // Use only the first UTxO — matches validator expectation of a single registry input
  const registryUtxo = registryUtxos[0];
  console.log("[Registry TX] using UTxO:", `${registryUtxo.txHash}#${registryUtxo.outputIndex}`);

  const rawCbor = registryUtxo.datum;
  if (!rawCbor) throw new Error("Registry UTXO is missing an inline datum.");

  // 2. Decode current datum
  const current = decodeDatum(rawCbor);
  console.log("[Registry TX] adminPkh:", current.admin);
  console.log("[Registry TX] currentIssuers:", current.issuers);
  console.log("[Registry TX] currentVersion:", current.version.toString());

  // 3. Compute new issuer list
  const normalizedPkh = issuerPkh.toLowerCase();
  let newIssuers = [...current.issuers];

  if (action === "Add") {
    if (newIssuers.includes(normalizedPkh)) throw new Error("Issuer already authorized.");
    newIssuers.push(normalizedPkh);
  } else {
    if (!newIssuers.includes(normalizedPkh)) throw new Error("Issuer not found in registry.");
    newIssuers = newIssuers.filter((p) => p !== normalizedPkh);
  }

  const newVersion = current.version + 1n;

  // 4. Encode new datum
  const encodedNextDatum = encodeDatum({
    admin: current.admin,
    issuers: newIssuers,
    version: newVersion,
  });
  console.log("[Registry TX] encodedNextDatum CBOR:", encodedNextDatum);
  console.log("[Registry TX] newIssuers:", newIssuers);
  console.log("[Registry TX] newVersion:", newVersion.toString());

  // 5. Build redeemer
  // AddIssuer: Constr(0,[pkh]), RemoveIssuer: Constr(1,[pkh])
  const redeemer = action === "Add"
    ? Data.to(new Constr(0, [normalizedPkh]))
    : Data.to(new Constr(1, [normalizedPkh]));
  console.log("[Registry TX] redeemer CBOR:", redeemer);

  // 6. Wallet setup
  const bech32Address = getAddressDetails(userAddress).address.bech32;
  const walletUtxos = await lucid.utxosAt(bech32Address);
  console.log("[Registry TX] walletUtxos count:", walletUtxos.length);
  if (walletUtxos.length === 0) throw new Error("Wallet has no UTxOs — fund it from the faucet.");
  lucid.selectWallet.fromAddress(bech32Address, walletUtxos);

  // 7. Build unsigned TX — let Lucid auto-select collateral (no setCollateral override)
  const tx = await lucid
    .newTx()
    .collectFrom([registryUtxo], redeemer)
    .attach.SpendingValidator(registryScript)
    .addSignerKey(current.admin)
    .pay.ToContract(
      REGISTRY_ADDRESS,
      { kind: "inline", value: encodedNextDatum },
      { lovelace: 3000000n }
    )
    .complete({ localUPLCEval: false });

  return tx.toString();
}

// ── Submit ────────────────────────────────────────────────────────────────────
/**
 * Submits an already-signed transaction CBOR to the Cardano network.
 */
export async function submitSignedTx(signedTxCbor: string): Promise<string> {
  const lucid = await initLucid();
  return await lucid.config().provider!.submitTx(signedTxCbor);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}