
module gem_trace::gem_event_store {

    use std::signer;
    use std::vector;
    use std::hash;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use gem_trace::event_record::{
        Self,
        EventRecord,
        stage_mining,
    };
    use gem_trace::actor_registry;

    // -------------------------------------------------------------------------
    // Error codes
    // -------------------------------------------------------------------------

    const E_ALREADY_INITIALIZED: u64    = 100;
    const E_NOT_INITIALIZED: u64        = 101;
    const E_FIRST_EVENT_NOT_MINING: u64 = 102;
    const E_PREV_HASH_MISMATCH: u64     = 104;
    /// Actor is not authorized to log events at this stage.
    const E_UNAUTHORIZED: u64           = 105;
    /// sequence_number supplied does not match the expected next value.
    const E_WRONG_SEQUENCE: u64         = 106;

    // -------------------------------------------------------------------------
    // Aptos v2 event
    // -------------------------------------------------------------------------

    #[event]
    struct EventLoggedEvent has drop, store {
        gem_id:          vector<u8>,
        stage:           u8,
        actor_address:   address,
        timestamp_ms:    u64,
        sequence_number: u64,
        payload_hash:    vector<u8>,
        record_hash:     vector<u8>,  // fingerprint of this record
    }

    // -------------------------------------------------------------------------
    // Internal storage types
    // -------------------------------------------------------------------------

    struct GemHistory has store {
        records:          vector<EventRecord>,
        event_count:      u64,
        /// SHA-256 fingerprint of the most recently stored EventRecord.
        /// The next caller must pass this as prev_record_hash.
        /// Empty vector for a gem with no events yet (should never persist
        /// in that state — initialised and first event added atomically).
        last_record_hash: vector<u8>,
    }

    struct GemEventStore has key {
        histories: SmartTable<vector<u8>, GemHistory>,
    }

    // -------------------------------------------------------------------------
    // Record fingerprint computation
    // -------------------------------------------------------------------------

    /// Computes the record fingerprint for an event.
    ///
    /// fingerprint = SHA-256(gem_id || [stage] || sequence_number_le8 || payload_hash)
    ///
    /// This is stored as last_record_hash in GemHistory and must be supplied
    /// by the next caller as prev_record_hash.
    fun compute_record_hash(
        gem_id:          &vector<u8>,
        stage:           u8,
        sequence_number: u64,
        payload_hash:    &vector<u8>,
    ): vector<u8> {
        let buf = vector::empty<u8>();

        // gem_id bytes
        vector::append(&mut buf, *gem_id);

        // stage as single byte
        vector::push_back(&mut buf, stage);

        // sequence_number as 8-byte little-endian
        let seq = sequence_number;
        let i = 0u8;
        while (i < 8) {
            vector::push_back(&mut buf, ((seq & 0xFF) as u8));
            seq = seq >> 8;
            i = i + 1;
        };

        // payload_hash bytes
        vector::append(&mut buf, *payload_hash);

        hash::sha2_256(buf)
    }

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<GemEventStore>(admin_addr), E_ALREADY_INITIALIZED);
        move_to(admin, GemEventStore {
            histories: smart_table::new<vector<u8>, GemHistory>(),
        });
    }

    // -------------------------------------------------------------------------
    // log_event
    // -------------------------------------------------------------------------
    public entry fun log_event(
        actor:            &signer,
        store_owner:      address,
        gem_id:           vector<u8>,
        stage:            u8,
        prev_record_hash: vector<u8>,
        payload_hash:     vector<u8>,
    ) acquires GemEventStore {
        // 1. Store must exist
        assert!(exists<GemEventStore>(store_owner), E_NOT_INITIALIZED);

        let actor_addr = signer::address_of(actor);
        let now_ms     = timestamp::now_microseconds() / 1000;

        // 2. Authorization — actor must be registered for this stage
        assert!(
            actor_registry::is_authorized(store_owner, actor_addr, stage),
            E_UNAUTHORIZED
        );

        let store      = borrow_global_mut<GemEventStore>(store_owner);
        let is_new_gem = !smart_table::contains(&store.histories, gem_id);
        let sequence_number: u64;

        if (is_new_gem) {
            // 3. First event must be MINING
            assert!(stage == stage_mining(), E_FIRST_EVENT_NOT_MINING);

            // 4. Genesis prev_record_hash must be empty
            assert!(vector::length(&prev_record_hash) == 0, E_PREV_HASH_MISMATCH);

            sequence_number = 0;

            smart_table::add(&mut store.histories, gem_id, GemHistory {
                records:          vector::empty<EventRecord>(),
                event_count:      0,
                last_record_hash: vector::empty<u8>(),
            });

        } else {
            let history = smart_table::borrow(&store.histories, gem_id);

            assert!(
                prev_record_hash == history.last_record_hash,
                E_PREV_HASH_MISMATCH
            );

            sequence_number = history.event_count;
        };

        // 7. Build validated EventRecord
        let record = event_record::new(
            gem_id,
            stage,
            actor_addr,
            now_ms,
            prev_record_hash,
            payload_hash,
            sequence_number,
        );

        // Compute fingerprint for THIS record — next caller will need it
        let record_hash = compute_record_hash(
            &gem_id,
            stage,
            sequence_number,
            &payload_hash,
        );

        // Append record and update fingerprint
        let history_mut = smart_table::borrow_mut(&mut store.histories, gem_id);
        vector::push_back(&mut history_mut.records, record);
        history_mut.event_count      = history_mut.event_count + 1;
        history_mut.last_record_hash = record_hash;

        // Emit — includes record_hash so DApp backend can use it as
        // prev_record_hash for the next event without an extra RPC call
        event::emit(EventLoggedEvent {
            gem_id,
            stage,
            actor_address:   actor_addr,
            timestamp_ms:    now_ms,
            sequence_number,
            payload_hash,
            record_hash:     history_mut.last_record_hash,
        });
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    #[view]
    public fun event_count(store_owner: address, gem_id: vector<u8>): u64
    acquires GemEventStore {
        if (!exists<GemEventStore>(store_owner)) return 0;
        let store = borrow_global<GemEventStore>(store_owner);
        if (!smart_table::contains(&store.histories, gem_id)) return 0;
        smart_table::borrow(&store.histories, gem_id).event_count
    }

    #[view]
    public fun get_event(
        store_owner: address,
        gem_id:      vector<u8>,
        index:       u64,
    ): EventRecord acquires GemEventStore {
        let store   = borrow_global<GemEventStore>(store_owner);
        let history = smart_table::borrow(&store.histories, gem_id);
        *vector::borrow(&history.records, index)
    }

    #[view]
    public fun get_latest_event(
        store_owner: address,
        gem_id:      vector<u8>,
    ): EventRecord acquires GemEventStore {
        let store   = borrow_global<GemEventStore>(store_owner);
        let history = smart_table::borrow(&store.histories, gem_id);
        *vector::borrow(&history.records, history.event_count - 1)
    }

    #[view]
    public fun gem_exists(store_owner: address, gem_id: vector<u8>): bool
    acquires GemEventStore {
        if (!exists<GemEventStore>(store_owner)) return false;
        let store = borrow_global<GemEventStore>(store_owner);
        smart_table::contains(&store.histories, gem_id)
    }

    // Returns the last_record_hash for a gem.
    // The DApp backend uses this as prev_record_hash for the next event.
    #[view]
    public fun get_last_record_hash(
        store_owner: address,
        gem_id:      vector<u8>,
    ): vector<u8> acquires GemEventStore {
        if (!exists<GemEventStore>(store_owner)) return vector::empty<u8>();
        let store = borrow_global<GemEventStore>(store_owner);
        if (!smart_table::contains(&store.histories, gem_id)) return vector::empty<u8>();
        smart_table::borrow(&store.histories, gem_id).last_record_hash
    }

    // -------------------------------------------------------------------------
    // Unit tests
    // -------------------------------------------------------------------------

    #[test_only]
    use aptos_framework::account;

    // Helper: sets up store + registry + grants actor all stages
    #[test_only]
    fun setup_full(admin: &signer, framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));
        initialize(admin);
        actor_registry::initialize(admin);
        // Grant admin all stages (0x7F = bits 0-6 = stages 1-7)
        actor_registry::grant_bitmask(admin, signer::address_of(admin), 0x7F);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_authorized_mining_event(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        setup_full(&admin, &framework);
        let addr    = signer::address_of(&admin);
        let payload = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";

        log_event(&admin, addr, b"GEM-LK-2024-00147", 1, vector::empty<u8>(), payload);

        assert!(gem_exists(addr, b"GEM-LK-2024-00147"), 1);
        assert!(event_count(addr, b"GEM-LK-2024-00147") == 1, 2);

        // last_record_hash must be non-empty after first event
        let h = get_last_record_hash(addr, b"GEM-LK-2024-00147");
        assert!(vector::length(&h) == 32, 3);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_hash_linkage_enforced(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        setup_full(&admin, &framework);
        let addr = signer::address_of(&admin);
        let p1   = x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let p2   = x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

        // Log mining
        log_event(&admin, addr, b"GEM-LK-2024-00500", 1, vector::empty<u8>(), p1);

        // Get the record hash the module computed
        let correct_hash = get_last_record_hash(addr, b"GEM-LK-2024-00500");

        // Log cutting using the correct hash — must succeed
        log_event(&admin, addr, b"GEM-LK-2024-00500", 2, correct_hash, p2);
        assert!(event_count(addr, b"GEM-LK-2024-00500") == 2, 10);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_PREV_HASH_MISMATCH)]
    fun test_wrong_prev_hash_rejected(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        setup_full(&admin, &framework);
        let addr = signer::address_of(&admin);
        let p1   = x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let p2   = x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let fake = x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        log_event(&admin, addr, b"GEM-LK-2024-00600", 1, vector::empty<u8>(), p1);

        // Supply a fabricated prev hash — must abort
        log_event(&admin, addr, b"GEM-LK-2024-00600", 2, fake, p2);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_UNAUTHORIZED)]
    fun test_unauthorized_actor_rejected(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        actor_registry::initialize(&admin);
        // Deliberately do NOT grant any permissions to admin

        let addr    = signer::address_of(&admin);
        let payload = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";

        // Must abort — admin has no permissions
        log_event(&admin, addr, b"GEM-LK-2024-00700", 1, vector::empty<u8>(), payload);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_ALREADY_INITIALIZED)]
    fun test_double_initialize_fails(
        admin: signer, framework: signer,
    ) {
        timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        initialize(&admin);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_FIRST_EVENT_NOT_MINING)]
    fun test_first_event_not_mining_fails(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        setup_full(&admin, &framework);
        let addr    = signer::address_of(&admin);
        let payload = x"9f1c2e6b7d3a4b8f0123456789abcdef0123456789abcdef0123456789abcdef";
        log_event(&admin, addr, b"GEM-LK-2024-00800", 2, vector::empty<u8>(), payload);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
  
    fun test_invalid_stage_transition_fails(
        admin: signer, framework: signer,
    ) acquires GemEventStore {
        setup_full(&admin, &framework);
        let addr = signer::address_of(&admin);
        let p1   = x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let p2   = x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

        log_event(&admin, addr, b"GEM-LK-2024-00900", 1, vector::empty<u8>(), p1);
        let h = get_last_record_hash(addr, b"GEM-LK-2024-00900");
        // Mining → Sale is invalid
        log_event(&admin, addr, b"GEM-LK-2024-00900", 7, h, p2);
    }
}
