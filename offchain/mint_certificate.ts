import { Data, fromText, paymentCredentialOf } from "@lucid-evolution/lucid";
import { getLucid } from "./config";
import { CertificateDatum, CertificateDatumType } from "./utils";

async function main() {
    const lucid = await getLucid();

    const seed = process.env.ISSUER_SEED;
    if (!seed) throw new Error("Missing ISSUER_SEED");

    // ✅ New API: selectWallet returns a new lucid instance
    const userLucid = lucid.selectWallet.fromSeed(seed);

    // ✅ New API: wallet() is a function call, address() is async
    const issuerAddress = await userLucid.wallet().address();

    // ✅ New API: use paymentCredentialOf helper instead of utils
    const issuerPkh = paymentCredentialOf(issuerAddress).hash;

    if (!issuerPkh) throw new Error("Could not get issuer PKH");

    const datumData: CertificateDatumType = {
        issuer_id: fromText("NGJA"),
        report_id: fromText("REPORT_001"),
        report_type: 1n,
        gem_id: fromText("GEM_001"),
        cert_hash: "00".repeat(32),
        issued_at: BigInt(Math.floor(Date.now() / 1000)),
        schema_version: 1n,
        document_cid: fromText("ipfs://example"),
        issuer_pkh: issuerPkh,
    };

    const certificateDatum = Data.to(datumData, CertificateDatum);

    console.log("Certificate datum:", certificateDatum);

    // Next step:
    // build minting tx with certificate policy
    // reference registry UTXO
    // mint certificate token
}

main();