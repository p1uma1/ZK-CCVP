

module gem_trace::event_record {

    use std::vector;

    // -------------------------------------------------------------------------
    // Stage constants
    // -------------------------------------------------------------------------
    // Move does not support enums. Stages are u8 constants that must be one of
    // the values below. The validator enforces this at submission time.

    /// Gemstone extracted from the earth.
    const STAGE_MINING: u8        = 1;

    /// Raw stone shaped and faceted by a cutter.
    const STAGE_CUTTING: u8       = 2;

    /// Gem physically handed to a laboratory for grading.
    const STAGE_CERTIFICATION: u8 = 3;

    /// Gem in transit between two supply chain actors.
    const STAGE_TRANSPORT: u8     = 4;

    /// Gem acquired by a wholesaler / trader.
    const STAGE_WHOLESALE: u8     = 5;

    /// Gem listed or held by a retail jeweller.
    const STAGE_RETAIL: u8        = 6;

    /// Final sale to an end consumer.
    const STAGE_SALE: u8          = 7;

    // Upper bound used in validation — update if new stages are added.
    const STAGE_MAX: u8 = 7;

    // -------------------------------------------------------------------------
    // Error codes
    // -------------------------------------------------------------------------

    const E_INVALID_STAGE: u64        = 1;
    const E_INVALID_GEM_ID: u64       = 2;
    const E_INVALID_PAYLOAD_HASH: u64 = 3;
    const E_INVALID_PREV_TX_HASH: u64 = 4;

    // -------------------------------------------------------------------------
    // EventRecord struct
    // -------------------------------------------------------------------------

    /// A single immutable supply chain event anchored on Aptos.
    ///
    /// Fields
    /// ------
    /// gem_id          UTF-8 bytes of the gem's unique identifier.
    ///                 Must match the gem_id used in the Cardano CertificateDatum
    ///                 and the Ethereum ERC-721 token metadata so all three chains
    ///                 reference the same physical stone.
    ///                 Example: b"GEM-LK-2024-00147"
    ///
    /// stage           Supply chain stage at the time of this event.
    ///                 Must be one of the STAGE_* constants above (1–7).
    ///
    /// actor_address   The Aptos account address of the entity recording this event
    ///                 (miner, cutter, lab, logistics provider, retailer, etc.).
    ///                 Aptos addresses are 32 bytes and are natively represented
    ///                 as the `address` type. The on-chain signer is verified by
    ///                 the Move module so this field cannot be spoofed.
    ///
    /// timestamp_ms    Unix timestamp in milliseconds at the time the event
    ///                 occurred (not necessarily the block time, but the
    ///                 real-world time supplied by the actor). Stored as u64.
    ///                 Callers should derive this from
    ///                 aptos_framework::timestamp::now_microseconds() / 1000
    ///                 when the event time equals the submission time.
    ///
    /// prev_tx_hash    SHA-256 hash (32 bytes) of the Aptos transaction that
    ///                 submitted the previous EventRecord for this gem.
    ///                 For the very first event (STAGE_MINING) this is an empty
    ///                 vector<u8> of length 0 — explicitly meaning "no prior event".
    ///                 This chains events together in an ordered, tamper-evident
    ///                 linked list without requiring a centralised sequence store.
    ///
    /// payload_hash    SHA-256 hash (32 bytes) of the canonical off-chain event
    ///                 payload JSON stored on IPFS. Commits rich metadata
    ///                 (actor name, location, lab report reference, photos, etc.)
    ///                 to the on-chain record without storing the raw data on-chain.
    ///                 Verifiers can fetch the IPFS document and recompute the hash
    ///                 to confirm it has not been altered.
    ///
    /// sequence_number Monotonic counter per gem_id. Starts at 0 for the first
    ///                 event and increments by 1 for each subsequent event.
    ///                 Allows consumers to detect gaps or reordering without
    ///                 traversing the full prev_tx_hash chain.
    struct EventRecord has copy, drop, store {
    gem_id:          vector<u8>,
    stage:           u8,
    actor_address:   address,
    timestamp_ms:    u64,
    prev_tx_hash:    vector<u8>,
    payload_hash:    vector<u8>,
    ipfs_cid:        vector<u8>,
    sequence_number: u64,
}

    // -------------------------------------------------------------------------
    // Constructor with validation
    // -------------------------------------------------------------------------

    /// Creates a validated EventRecord.
    ///
    /// Aborts with:
    ///   E_INVALID_GEM_ID       if gem_id is empty
    ///   E_INVALID_STAGE        if stage is outside 1–STAGE_MAX
    ///   E_INVALID_PREV_TX_HASH if prev_tx_hash is neither empty nor 32 bytes
    ///   E_INVALID_PAYLOAD_HASH if payload_hash is not exactly 32 bytes
    public fun new(
        gem_id:          vector<u8>,
        stage:           u8,
        actor_address:   address,
        timestamp_ms:    u64,
        prev_tx_hash:    vector<u8>,
        payload_hash:    vector<u8>,
        ipfs_cid:        vector<u8>,
        sequence_number: u64,
    ): EventRecord {
        // gem_id must not be empty
        assert!(vector::length(&gem_id) > 0, E_INVALID_GEM_ID);

        // stage must be a known value
        assert!(stage >= 1 && stage <= STAGE_MAX, E_INVALID_STAGE);

        // prev_tx_hash must be either empty (genesis) or exactly 32 bytes
        let prev_len = vector::length(&prev_tx_hash);
        assert!(prev_len == 0 || prev_len == 32, E_INVALID_PREV_TX_HASH);

        // payload_hash must always be exactly 32 bytes (SHA-256 digest)
        assert!(vector::length(&payload_hash) == 32, E_INVALID_PAYLOAD_HASH);

        EventRecord {
            gem_id,
            stage,
            actor_address,
            timestamp_ms,
            prev_tx_hash,
            payload_hash,
            sequence_number,
            ipfs_cid,
        }
    }

    // -------------------------------------------------------------------------
    // Read accessors
    // -------------------------------------------------------------------------

    public fun gem_id(r: &EventRecord): &vector<u8>  { &r.gem_id }
    public fun stage(r: &EventRecord): u8             { r.stage }
    public fun actor_address(r: &EventRecord): address { r.actor_address }
    public fun timestamp_ms(r: &EventRecord): u64     { r.timestamp_ms }
    public fun prev_tx_hash(r: &EventRecord): &vector<u8> { &r.prev_tx_hash }
    public fun payload_hash(r: &EventRecord): &vector<u8> { &r.payload_hash }
    public fun sequence_number(r: &EventRecord): u64  { r.sequence_number }
    public fun ipfs_cid(r: &EventRecord): &vector<u8> { &r.ipfs_cid }

    // -------------------------------------------------------------------------
    // Stage helpers
    // -------------------------------------------------------------------------

    public fun is_genesis(r: &EventRecord): bool {
        vector::length(&r.prev_tx_hash) == 0
    }

    public fun stage_mining(): u8        { STAGE_MINING }
    public fun stage_cutting(): u8       { STAGE_CUTTING }
    public fun stage_certification(): u8 { STAGE_CERTIFICATION }
    public fun stage_transport(): u8     { STAGE_TRANSPORT }
    public fun stage_wholesale(): u8     { STAGE_WHOLESALE }
    public fun stage_retail(): u8        { STAGE_RETAIL }
    public fun stage_sale(): u8          { STAGE_SALE }

    // -------------------------------------------------------------------------
    // Unit tests
    // -------------------------------------------------------------------------
    // Run with: aptos move test --filter event_record

    #[test]
    fun test_valid_genesis_event() {
        // ------------------------------------------------------------------
        // Real-world example 1: Mining event — first event for a new gem.
        //
        // A miner in Ratnapura, Sri Lanka extracts a rough sapphire.
        // This is the genesis record: prev_tx_hash is empty.
        // The off-chain payload JSON (stored on IPFS) contains location
        // coordinates, photo CIDs, and miner credentials.
        // ------------------------------------------------------------------
        let payload_hash = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";

        let record = new(
            b"GEM-LK-2024-00147",       // gem_id
            STAGE_MINING,               // stage = 1
            @0xCAFE,                    // actor_address (miner's Aptos account)
            1712700000000,              // timestamp_ms  (Unix ms)
            vector::empty<u8>(),        // prev_tx_hash  — empty = genesis
            payload_hash,               // payload_hash  — 32 bytes
            b"bafkreidemoexamplecid0001",
            0
        );

        assert!(stage(&record) == STAGE_MINING, 100);
        assert!(is_genesis(&record), 101);
        assert!(sequence_number(&record) == 0, 102);
    }

    #[test]
    fun test_valid_certification_event() {
        // ------------------------------------------------------------------
        // Real-world example 2: Certification handoff.
        //
        // The cut stone is delivered to a GIC (Gemmological Institute of
        // Colombo) laboratory for grading. The actor is GIC's Aptos account.
        // prev_tx_hash links back to the cutting transaction.
        // sequence_number is 2 (mining=0, cutting=1, this=2).
        // ------------------------------------------------------------------
        let prev_tx = x"a3f8c1e2d4b56789012345678901234567890123456789012345678901234567";
        let payload  = x"cc00000000000000000000000000000000000000000000000000000000000003";

        let record = new(
            b"GEM-LK-2024-00147",
            STAGE_CERTIFICATION,        // stage = 3
            @0xABCD,                    // GIC's Aptos account
            1712800000000,
            prev_tx,                    // 32-byte hash of cutting tx
            payload,
            b"bafkreidemoexamplecid0001",
            2
        );

        assert!(stage(&record) == STAGE_CERTIFICATION, 200);
        assert!(!is_genesis(&record), 201);
        assert!(sequence_number(&record) == 2, 202);
    }

    #[test]
    fun test_valid_sale_event() {
        // ------------------------------------------------------------------
        // Real-world example 3: Final sale to consumer.
        //
        // A retail jeweller in Colombo sells the certified sapphire ring to
        // an end buyer. This closes the on-chain lifecycle of the gem.
        // The payload JSON references the Ethereum ERC-721 token ID so the
        // consumer can look up ownership on the Gem Passport contract.
        // ------------------------------------------------------------------
        let prev_tx = x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        let payload  = x"cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe";

        let record = new(
            b"GEM-LK-2024-00147",
            STAGE_SALE,                 // stage = 7
            @0x1234,                    // retailer's Aptos account
            1713200000000,
            prev_tx,
            payload,
            b"bafkreidemoexamplecid0001",
            6                    // 7th event in lifecycle (0-indexed)
        );

        assert!(stage(&record) == STAGE_SALE, 300);
        assert!(sequence_number(&record) == 6, 301);
    }

    #[test]
    #[expected_failure(abort_code = E_INVALID_STAGE)]
    fun test_invalid_stage_fails() {
        let payload = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";
        new(
            b"GEM-LK-2024-00147",
            99,                         // Invalid stage — must abort
            @0xCAFE,
            1712700000000,
            vector::empty<u8>(),
            payload,
            b"bafkreidemoexamplecid0001",
            0
        );
    }

    #[test]
    #[expected_failure(abort_code = E_INVALID_PAYLOAD_HASH)]
    fun test_short_payload_hash_fails() {
        new(
            b"GEM-LK-2024-00147",
            STAGE_MINING,
            @0xCAFE,
            1712700000000,
            vector::empty<u8>(),
            x"deadbeef",               // Only 4 bytes — must abort
            b"bafkreidemoexamplecid0001",
            0
        );
    }

    #[test]
    #[expected_failure(abort_code = E_INVALID_PREV_TX_HASH)]
    fun test_bad_prev_tx_hash_fails() {
        let payload = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";
        new(
            b"GEM-LK-2024-00147",
            STAGE_CUTTING,
            @0xCAFE,
            1712700000000,
            x"aabbcc",                 // 3 bytes — neither empty nor 32 — must abort
            payload,
            b"bafkreidemoexamplecid0001",
            1
        );
    }
}
