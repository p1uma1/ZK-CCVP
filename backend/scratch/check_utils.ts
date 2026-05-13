import { Lucid } from "@lucid-evolution/lucid";
async function test() {
    const lucid = await Lucid(undefined, "Preprod");
    console.log("Utils exists:", !!(lucid as any).utils);
    if ((lucid as any).utils) {
        console.log("hexToBech32 exists:", !!(lucid as any).utils.hexToBech32);
    }
}
test();
