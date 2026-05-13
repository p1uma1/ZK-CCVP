import * as LucidModule from "@lucid-evolution/lucid";
console.log(Object.keys(LucidModule).filter(k => k.toLowerCase().includes("hex") || k.toLowerCase().includes("bech32")));
