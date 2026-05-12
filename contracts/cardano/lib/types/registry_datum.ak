use aiken/crypto.{VerificationKeyHash}

/// Datum held at the Issuer Registry script address.
/// The admin field is the PKH of the wallet that can update this registry.
/// The issuers list contains all currently authorized issuer PKHs.
pub type RegistryDatum {
  admin: VerificationKeyHash,
  issuers: List<VerificationKeyHash>,
  version: Int,
}

/// Redeemer for the Issuer Registry spend validator.
pub type RegistryRedeemer {
  AddIssuer { pkh: VerificationKeyHash }
  RemoveIssuer { pkh: VerificationKeyHash }
  RotateAdmin { new_admin: VerificationKeyHash }
}
