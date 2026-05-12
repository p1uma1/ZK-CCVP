use aiken/primitive/bytearray
use aiken/collection/list
use cardano/script_context.{ScriptContext}
use cardano/transaction.{OutputReference}
use types/certificate_datum.{CertificateDatum}

/// Certificate Validator
/// ──────────────────────────────────────────────────────────────────────────
/// Locks a certificate datum at this script address once a certificate token
/// has been minted. Any spend of this UTxO must satisfy the integrity checks
/// below to ensure the datum was not tampered with.
validator certificate_validator {
  spend(
    datum: Option<CertificateDatum>,
    _redeemer: Data,
    _own_ref: OutputReference,
    ctx: ScriptContext,
  ) {
    expect Some(d) = datum

    let ScriptContext { transaction: tx, .. } = ctx

    // ── Integrity: report_type must be in [1, 8] ───────────────────────────
    expect (d.report_type >= 1)?
    expect (d.report_type <= 8)?

    // ── Integrity: cert_hash must be a 32-byte SHA-256 digest ──────────────
    expect (bytearray.length(d.cert_hash) == 32)?

    // ── Authorization: the issuer identified in the datum must sign the tx ─
    list.has(tx.extra_signatories, d.issuer_pkh)
  }

  else(_) {
    fail
  }
}
