
import { getAddressDetails } from "@lucid-evolution/lucid";

const adminAddr = "addr_test1qzvfv3u5elnx7mx04m98jg0e4jpm3lkgxu5ugjtlpjdavx5u686mw6z075ganhcjn3xech65rhz8vmxjg6uvth7wx2psy5na0t";
const adminDetails = getAddressDetails(adminAddr);

console.log("Admin Address:", adminAddr);
console.log("Admin PKH:", adminDetails.paymentCredential?.hash);
console.log("Admin Stake Credential:", adminDetails.stakeCredential?.hash);
