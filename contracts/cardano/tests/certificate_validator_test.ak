use ./types/certificate_datum.{CertificateDatum}
use ./types/report_type
use ./validators/certificate_validator

test valid_datum_passes() {
  let datum =
    CertificateDatum {
      issuer_id: "GIA",
      report_id: "GIA-123",
      report_type: report_type.REPORT_TYPE_ORIGIN,
      gem_id: "GEM-001",
      cert_hash: #"a3f8c1e2d4b56789012345678901234567890123456789012345678901234567",
      issued_at: 1712700000,
      schema_version: 1,
      document_cid: #"bafybeihykld5x6scnrmhkr5yikle4hdezy5mmjaqnrywivgzf4zetwkzly",
    }
  certificate_validator.certificate_validator.spend(datum, Void, Void, Void)
}

test invalid_report_type_fails() {
  let datum =
    CertificateDatum {
      issuer_id: "GIA",
      report_id: "GIA-123",
      report_type: 99, // Invalid
      gem_id: "GEM-001",
      cert_hash: #"a3f8c1e2d4b56789012345678901234567890123456789012345678901234567",
      issued_at: 1712700000,
      schema_version: 1,
      document_cid: #"bafybeihykld5x6scnrmhkr5yikle4hdezy5mmjaqnrywivgzf4zetwkzly",
    }
  !certificate_validator.certificate_validator.spend(datum, Void, Void, Void)
}

test invalid_hash_length_fails() {
  let datum =
    CertificateDatum {
      issuer_id: "GIA",
      report_id: "GIA-123",
      report_type: report_type.REPORT_TYPE_ORIGIN,
      gem_id: "GEM-001",
      cert_hash: #"deadbeef", // Too short
      issued_at: 1712700000,
      schema_version: 1,
      document_cid: #"bafybeihykld5x6scnrmhkr5yikle4hdezy5mmjaqnrywivgzf4zetwkzly",
    }
  !certificate_validator.certificate_validator.spend(datum, Void, Void, Void)
}
