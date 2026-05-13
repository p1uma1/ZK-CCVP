import { getAddressDetails, Lucid } from "@lucid-evolution/lucid";
import "dotenv/config";

async function main() {
    const address = process.argv[2];

    if (!address) {
        console.error("Please provide a Cardano address as an argument.");
        console.log("Usage: npx tsx check_pkh.ts <address>");
        process.exit(1);
    }

    try {
        const details = getAddressDetails(address);
        const pkh = details.paymentCredential?.hash;

        if (pkh) {
            console.log("--------------------------------------------------");
            console.log(`Address: ${address}`);
            console.log(`PKH:     ${pkh}`);
            console.log("--------------------------------------------------");
        } else {
            console.log("Could not find payment credential hash for this address.");
        }
    } catch (error: any) {
        console.error("Error parsing address:", error.message);
    }
}

main();
