pub type CertificateDatum {
  issuer_id: ByteArray,
  report_id: ByteArray,
  report_type: Int,
  gem_id: ByteArray,
  cert_hash: ByteArray,
  issued_at: Int,
  schema_version: Int,
  document_cid: ByteArray,
}