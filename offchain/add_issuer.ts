import { Data, paymentCredentialOf, validatorToAddress } from "@lucid-evolution/lucid";
import { getLucid } from "./config";
import { RegistryDatum, RegistryDatumType, RegistryRedeemer } from "./utils";

async function main() {
    const lucid = await getLucid();

    const seed = process.env.ADMIN_SEED;
    if (!seed) throw new Error("Missing ADMIN_SEED");

    // ✅ New API: selectWallet returns a new lucid instance
    const userLucid = lucid.selectWallet.fromSeed(seed);

    const issuerPkh = process.argv[2];
    if (!issuerPkh) {
        throw new Error("Usage: ts-node add_issuer.ts <issuer_pkh>");
    }

    const registryScript = {
        type: "PlutusV3",
        script: "YOUR_COMPILED_REGISTRY_CBOR_HERE",
    } as const;

    const networkConfig = "Preprod"; // or "Mainnet"
    const registryAddress = validatorToAddress(networkConfig, registryScript);

    const utxos = await userLucid.utxosAt(registryAddress);
    if (utxos.length === 0) throw new Error("No registry UTXO found");

    const registryUtxo = utxos[0];

    const oldDatum = Data.from(
        registryUtxo.datum!,
        RegistryDatum
    );

    const newDatumData: RegistryDatumType = {
        admin: oldDatum.admin,
        issuers: [...oldDatum.issuers, issuerPkh],
        version: oldDatum.version + 1n,
    };

    const newDatum = Data.to(newDatumData, RegistryDatum);

    const redeemer = Data.to(
        { AddIssuer: { pkh: issuerPkh } },
        RegistryRedeemer
    );

    const tx = await userLucid
        .newTx()
        .collectFrom([registryUtxo], redeemer)
        .pay.ToContract(
            registryAddress,
            { kind: "inline", value: newDatum },
            { lovelace: 3_000_000n }
        )
        .attach.SpendingValidator(registryScript)
        .complete();

    const signedTx = await tx.sign.withWallet().complete();
    const txHash = await signedTx.submit();

    console.log("Issuer added:", txHash);
}

main();