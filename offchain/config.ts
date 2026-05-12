import "dotenv/config";
import { Blockfrost, Lucid } from "@lucid-evolution/lucid";

type Network = "Mainnet" | "Preprod" | "Preview" | "Custom";

const NETWORK_URLS: Record<string, string> = {
    Mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
    Preprod: "https://cardano-preprod.blockfrost.io/api/v0",
    Preview:  "https://cardano-preview.blockfrost.io/api/v0",
};

export async function getLucid() {
    const projectId = process.env.BLOCKFROST_PROJECT_ID;
    const networkEnv = process.env.CARDANO_NETWORK;

    if (!projectId) throw new Error("Missing BLOCKFROST_PROJECT_ID");
    if (!networkEnv) throw new Error("Missing CARDANO_NETWORK");
    if (!Object.keys(NETWORK_URLS).includes(networkEnv)) {
        throw new Error(`Invalid CARDANO_NETWORK: "${networkEnv}". Must be one of: ${Object.keys(NETWORK_URLS).join(", ")}`);
    }

    const network = networkEnv as Network;
    const url = NETWORK_URLS[network];

    return await Lucid(
        new Blockfrost(url, projectId),
        network
    );
}