
import * as fs from "fs";
import * as path from "path";
import { validatorToScriptHash, applyParamsToScript } from "@lucid-evolution/lucid";

const plutusPath = path.resolve("c:/Users/nimsara/Documents/FYP/New folder/ZK-CCVP/contracts/cardano/plutus.json");
const plutusJson = JSON.parse(fs.readFileSync(plutusPath, "utf-8"));

const registryValidator = plutusJson.validators.find(
  (v: any) => v.title === "issuer_registry_validator.issuer_registry.spend"
);
const mintingPolicy = plutusJson.validators.find(
  (v: any) => v.title === "certificate_policy.certificate_policy.mint"
);

const regHash = validatorToScriptHash({ type: "PlutusV3", script: registryValidator.compiledCode });
console.log("Registry Hash:", regHash);

const policyScript = {
  type: "PlutusV3" as const,
  script: applyParamsToScript(
    mintingPolicy.compiledCode,
    [regHash]
  )
};

console.log("Policy ID:", validatorToScriptHash(policyScript));
