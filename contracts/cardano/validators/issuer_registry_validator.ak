use aiken/collection/list
use cardano/transaction.{InlineDatum, OutputReference, Transaction}
use types/registry_datum.{AddIssuer, RegistryDatum, RegistryRedeemer, RemoveIssuer, RotateAdmin}

validator issuer_registry {
  spend(
    datum: Option<RegistryDatum>,
    redeemer: RegistryRedeemer,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    expect Some(d) = datum

    expect list.has(tx.extra_signatories, d.admin)?

    expect Some(own_input) =
      list.find(tx.inputs, fn(i) { i.output_reference == own_ref })

    let own_address = own_input.output.address

    let continuing =
      list.filter(tx.outputs, fn(o) { o.address == own_address })

    expect [continuing_output] = continuing

    expect InlineDatum(raw) = continuing_output.datum
    expect new_datum: RegistryDatum = raw

    let expected =
      when redeemer is {
        AddIssuer { pkh } ->
          RegistryDatum {
            admin: d.admin,
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

  else(_) {
    fail
  }
}