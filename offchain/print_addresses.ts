import {
    validatorToAddress, validatorToScriptHash,
    applyDoubleCborEncoding, applyParamsToScript, Data
} from "@lucid-evolution/lucid";
import blueprint from "../contracts/cardano/plutus.json";

// Registry address
const registry = blueprint.validators.find(v => v.title === "issuer_registry_validator.issuer_registry.spend");
if (!registry) throw new Error("Registry validator not found");
console.log("Registry Address:", validatorToAddress("Preprod", { type: "PlutusV3", script: applyDoubleCborEncoding(registry.compiledCode) }));

// Certificate storage address
const certVal = blueprint.validators.find(v => v.title === "certificate_validator.certificate_validator.spend");
if (!certVal) throw new Error("Certificate validator not found");
console.log("Certificate Address:", validatorToAddress("Preprod", { type: "PlutusV3", script: applyDoubleCborEncoding(certVal.compiledCode) }));

// Policy ID
const certPolicy = blueprint.validators.find(v => v.title === "certificate_policy.certificate_policy.mint");
if (!certPolicy) throw new Error("Certificate policy not found");
const applied = applyParamsToScript(applyDoubleCborEncoding(certPolicy.compiledCode), [Data.to("5ae39bf8f081a3a4bbd823c1beb0ce09e3d47f4b56e959aa582de7cb")]);
console.log("Policy ID:", validatorToScriptHash({ type: "PlutusV3", script: applied }));