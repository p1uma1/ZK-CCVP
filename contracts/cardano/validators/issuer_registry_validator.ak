use aiken/collection/list
use cardano/script_context.{ScriptContext}
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use types/registry_datum.{AddIssuer, RegistryDatum, RegistryRedeemer, RemoveIssuer,
  RotateAdmin}

/// Issuer Registry Validator
/// ──────────────────────────────────────────────────────────────────────────
/// Guards a single UTxO at this script address whose inline datum is the
/// authoritative RegistryDatum (admin PKH + list of authorized issuers).
///
/// To update the registry the admin must:
///   1. Spend this UTxO (providing the admin signature).
///   2. Send a new UTxO back to this same script address with the updated datum.
///
/// The validator checks that:
///   a) The admin signed the transaction.
///   b) Exactly one continuing output goes back to this script address.
///   c) The new datum matches the expected state transition for the redeemer.
validator issuer_registry {
  spend(
    datum: Option<RegistryDatum>,
    redeemer: RegistryRedeemer,
    own_ref: OutputReference,
    ctx: ScriptContext,
  ) {
    // Unwrap the datum — this UTxO must always carry one.
    expect Some(d) = datum

    let ScriptContext { transaction: tx, .. } = ctx

    // ── 1. Admin authorization ─────────────────────────────────────────────
    expect list.has(tx.extra_signatories, d.admin)?

    // ── 2. Locate the input being spent to get our own address ─────────────
    expect Some(own_input) =
      list.find(tx.inputs, fn(i) { i.output_reference == own_ref })
    let own_address = own_input.output.address

    // ── 3. Exactly one continuing output at this script address ────────────
    let continuing =
      list.filter(tx.outputs, fn(o) { o.address == own_address })
    expect [continuing_output] = continuing

    // ── 4. Decode the new inline datum ─────────────────────────────────────
    expect InlineDatum(raw) = continuing_output.datum
    expect new_datum: RegistryDatum = raw

    // ── 5. State transition must match the redeemer ────────────────────────
    let expected =
      when redeemer is {
        AddIssuer { pkh } ->
          RegistryDatum {
            admin: d.admin,
            // Append only if not already present to avoid duplicates.
            issuers: if list.has(d.issuers, pkh) {
              d.issuers
            } else {
              list.push(d.issuers, pkh)
            },
            version: d.version + 1,
          }

        RemoveIssuer { pkh } ->
          RegistryDatum {
            admin: d.admin,
            issuers: list.filter(d.issuers, fn(x) { x != pkh }),
            version: d.version + 1,
          }

        RotateAdmin { new_admin } ->
          RegistryDatum {
            admin: new_admin,
            issuers: d.issuers,
            version: d.version + 1,
          }
      }

    new_datum == expected
  }

  // Reject any other script purpose (e.g. staking, voting) for this validator.
  else(_) {
    fail
  }
}
