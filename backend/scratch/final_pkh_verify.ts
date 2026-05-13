
import * as CML from "@anastasia-labs/cardano-multiplatform-lib-nodejs";

const vkeyHex = "e3ae198fba8abd23cc501f4deca70bc70d3f50c07495a2a5b534e167834762c2";
const vkey = CML.Vkey.new(CML.PublicKey.from_hex(vkeyHex));
const hash = vkey.public_key().hash().to_hex();

console.log("VKey in signature:", vkeyHex);
console.log("PKH of this VKey:", hash);
console.log("Required Admin PKH:", "98964794cfe66f6ccfaeca7921f9ac83b8fec83729c4497f0c9bd61a");
