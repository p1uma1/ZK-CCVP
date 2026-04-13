use ./types/certificate_datum
use ./types/report_type

validator certificate_validator {
  spend(datum: CertificateDatum, _, _, _) {
    expect True = datum.report_type >= 1
    expect True = datum.report_type <= 8

    expect True = bytearray.length(datum.cert_hash) == 32

    True
  }
}