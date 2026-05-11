use aiken/primitive/bytearray

use types/certificate_datum.{CertificateDatum}

validator certificate_validator {
  spend(datum: Option<CertificateDatum>, _redeemer, _ref, _ctx) {
    expect Some(datum) = datum
    expect True = datum.report_type >= 1
    expect True = datum.report_type <= 8

    expect True = bytearray.length(datum.cert_hash) == 32

    True
  }
}
