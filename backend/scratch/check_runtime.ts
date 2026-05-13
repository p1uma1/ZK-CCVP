import { Lucid } from "@lucid-evolution/lucid";
const lucid = await Lucid(undefined, "Preprod");
console.log("Lucid keys:", Object.keys(lucid));
if ((lucid as any).utils) {
  console.log("Utils keys:", Object.keys((lucid as any).utils));
} else {
  console.log("No utils property on lucid");
}
