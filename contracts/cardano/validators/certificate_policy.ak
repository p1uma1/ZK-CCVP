use aiken/collection/dict
use aiken/collection/list
use cardano/address.{Script}
use cardano/assets.{PolicyId, tokens}
use cardano/transaction.{InlineDatum, Transaction}
use types/registry_datum.{RegistryDatum}
use aiken/crypto.{VerificationKeyHash}

/// Certificate Minting Policy
/// ──────────────────────────────────────────────────────────────────────────
/// Parameterized at compile time by the Issuer Registry script hash.
/// This means the policy is tightly coupled to a specific registry deployment.
///
/// When an issuer mints a certificate token, this policy verifies:
///   1. The issuer PKH (passed in the redeemer) signed the transaction.
///   2. A reference input from the Registry script address is included.
///      (Reference inputs are READ-ONLY — the registry UTxO is not consumed.)
///   3. The registry datum contains the issuer PKH in its `issuers` list.
///   4. Exactly one token is being minted under this policy (qty = 1).
///
/// The asset name is set off-chain to the gem ID bytes, making each
/// certificate token uniquely identifiable by (policy_id, gem_id).
validator certificate_policy(registry_script_hash: ByteArray) {
  mint(issuer_pkh: VerificationKeyHash , policy_id: PolicyId, self: Transaction) {
    // ── 1. Issuer must sign the transaction ────────────────────────────────
    expect list.has(self.extra_signatories, issuer_pkh)?

    // ── 2. Find the registry reference input by script hash ────────────────
    let registry_input =
      list.find(
        self.reference_inputs,
        fn(i) {
          when i.output.address.payment_credential is {
            Script(hash) -> hash == registry_script_hash
            _ -> False
          }
        },
      )
    expect Some(ref_input) = registry_input

    // ── 3. Decode the registry inline datum ───────────────────────────────
    expect InlineDatum(raw) = ref_input.output.datum
    expect registry: RegistryDatum = raw

    // ── 4. Issuer PKH must be in the authorized issuers list ───────────────
    expect list.has(registry.issuers, issuer_pkh)?

    // ── 5. Exactly one token minted under this policy, with quantity = 1 ───
    //       (prevents bulk minting or minting multiple distinct gem tokens)
    let minted = tokens(self.mint, policy_id)
    dict.size(minted) == 1 && list.all(
      dict.values(minted),
      fn(qty) { qty == 1 },
    )
  }

  else(_) {
    fail
  }
}
