
import { blake2b } from "@noble/hashes/blake2b";

const vkeyHex = "e3ae198fba8abd23cc501f4deca70bc70d3f50c07495a2a5b534e167834762c2";
const vkeyBytes = Buffer.from(vkeyHex, "hex");
const hash = blake2b(vkeyBytes, { outputLength: 28 });
const hashHex = Buffer.from(hash).toString("hex");

console.log("VKey:", vkeyHex);
console.log("Calculated PKH:", hashHex);
console.log("Required Admin PKH:", "98964794cfe66f6ccfaeca7921f9ac83b8fec83729c4497f0c9bd61a");
