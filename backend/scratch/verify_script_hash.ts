import "dotenv/config";
import { applyDoubleCborEncoding, validatorToScriptHash, validatorToAddress, type Script } from "@lucid-evolution/lucid";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_SCRIPT_HASH = "5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e959aa582de7cb";
const REGISTRY_ADDRESS = "addr_test1wpdw8xlc7zq68f9mmq3ur04secy784rlfdtwjkd2tqk70jcdjz9rm";

async function main() {
  const plutusPath = path.resolve(__dirname, "../../contracts/cardano/plutus.json");
  const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));

  const registryValidator = plutusJson.validators.find(
    (v: any) => v.title === "issuer_registry_validator.issuer_registry.spend"
  );

  console.log("From plutus.json:");
  console.log("  hash:", registryValidator.hash);
  console.log("  compiledCode prefix (first 16 chars):", registryValidator.compiledCode.substring(0, 16));

  const registryScript: Script = {
    type: "PlutusV3",
    script: applyDoubleCborEncoding(registryValidator.compiledCode),
  };

  const computedHash = validatorToScriptHash(registryScript);
  const computedAddress = validatorToAddress("Preprod", registryScript);

  console.log("\nComputed:");
  console.log("  script hash:", computedHash);
  console.log("  address:    ", computedAddress);

  console.log("\nExpected:");
  console.log("  script hash:", REGISTRY_SCRIPT_HASH);
  console.log("  address:    ", REGISTRY_ADDRESS);

  console.log("\nMatch?");
  console.log("  hash match:", computedHash === REGISTRY_SCRIPT_HASH);
  console.log("  addr match:", computedAddress === REGISTRY_ADDRESS);

  // Also check WITHOUT double CBOR encoding
  const singleScript: Script = { type: "PlutusV3", script: registryValidator.compiledCode };
  const singleHash = validatorToScriptHash(singleScript);
  console.log("\nSingle CBOR hash (no applyDoubleCborEncoding):", singleHash);
  console.log("  matches expected?", singleHash === REGISTRY_SCRIPT_HASH);
}

main().catch(console.error);
