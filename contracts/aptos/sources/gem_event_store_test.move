#[test_only]
module gem_trace::gem_event_store_test {

    use std::signer;
    use std::vector;
    use aptos_framework::account;
    use aptos_framework::timestamp;
    use gem_trace::event_record;
    use gem_trace::gem_event_store;
    use gem_trace::actor_registry;

    // -------------------------------------------------------------------------
    // Payload constants (valid 32-byte hashes)
    // -------------------------------------------------------------------------

    const PAYLOAD_MINING:        vector<u8> = x"aa00000000000000000000000000000000000000000000000000000000000001";
    const PAYLOAD_CUTTING:       vector<u8> = x"bb00000000000000000000000000000000000000000000000000000000000002";
    const PAYLOAD_CERTIFICATION: vector<u8> = x"cc00000000000000000000000000000000000000000000000000000000000003";
    const PAYLOAD_TRANSPORT_1:   vector<u8> = x"dd00000000000000000000000000000000000000000000000000000000000004";
    const PAYLOAD_TRANSPORT_2:   vector<u8> = x"dd00000000000000000000000000000000000000000000000000000000000005";
    const PAYLOAD_WHOLESALE:     vector<u8> = x"ee00000000000000000000000000000000000000000000000000000000000006";
    const PAYLOAD_RETAIL:        vector<u8> = x"ff00000000000000000000000000000000000000000000000000000000000007";
    const PAYLOAD_SALE:          vector<u8> = x"1100000000000000000000000000000000000000000000000000000000000008";

    // -------------------------------------------------------------------------
    // CID constants (stored on-chain as UTF-8 bytes)
    // -------------------------------------------------------------------------

    const CID_MINING:        vector<u8> = b"bafkrei-mining-demo";
    const CID_CUTTING:       vector<u8> = b"bafkrei-cutting-demo";
    const CID_CERTIFICATION: vector<u8> = b"bafkrei-certification-demo";
    const CID_TRANSPORT_1:   vector<u8> = b"bafkrei-transport-1-demo";
    const CID_TRANSPORT_2:   vector<u8> = b"bafkrei-transport-2-demo";
    const CID_WHOLESALE:     vector<u8> = b"bafkrei-wholesale-demo";
    const CID_RETAIL:        vector<u8> = b"bafkrei-retail-demo";
    const CID_SALE:          vector<u8> = b"bafkrei-sale-demo";

    // -------------------------------------------------------------------------
    // Shared setup
    // -------------------------------------------------------------------------

    // Full setup: store + registry + grant admin all stages (0x7F)
    fun setup(admin: &signer, framework: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        account::create_account_for_test(signer::address_of(admin));
        gem_event_store::initialize(admin);
        actor_registry::initialize(admin);
        actor_registry::grant_bitmask(admin, signer::address_of(admin), 0x7F);
    }

    // Helper: logs an event and returns the resulting record hash.
    // In production the DApp backend reads this from the emitted EventLoggedEvent.
    fun log_and_get_hash(
        admin:       &signer,
        addr:        address,
        gem:         vector<u8>,
        stage:       u8,
        prev_hash:   vector<u8>,
        payload:     vector<u8>,
        cid:         vector<u8>,
    ): vector<u8> {
        gem_event_store::log_event(admin, addr, gem, stage, prev_hash, payload, cid);
        gem_event_store::get_last_record_hash(addr, gem)
    }

    // -------------------------------------------------------------------------
    // Scenario A — "Ratnapura Blue" (full lifecycle with hash linkage)
    // Mining → Cutting → Certification → Wholesale → Retail → Sale
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun scenario_a_ratnapura_blue_full_lifecycle(
        admin: signer, framework: signer,
    ) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        let gem  = b"GEM-LK-SAP-2024-00147";

        // Step 1 — Mining (genesis, prev_hash = empty)
        let h1 = log_and_get_hash(
            &admin, addr, gem, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        assert!(vector::length(&h1) == 32, 1000);

        let rec0 = gem_event_store::get_event(addr, gem, 0);
        assert!(event_record::stage(&rec0) == 1, 1001);
        assert!(event_record::sequence_number(&rec0) == 0, 1002);
        assert!(event_record::is_genesis(&rec0), 1003);

        // Step 2 — Cutting
        let h2 = log_and_get_hash(&admin, addr, gem, 2, h1, PAYLOAD_CUTTING, CID_CUTTING);
        let rec1 = gem_event_store::get_event(addr, gem, 1);
        assert!(event_record::stage(&rec1) == 2, 1010);
        assert!(event_record::sequence_number(&rec1) == 1, 1011);

        // Step 3 — Certification
        let h3 = log_and_get_hash(
            &admin, addr, gem, 3, h2, PAYLOAD_CERTIFICATION, CID_CERTIFICATION
        );
        let rec2 = gem_event_store::get_event(addr, gem, 2);
        assert!(event_record::stage(&rec2) == 3, 1020);
        assert!(event_record::sequence_number(&rec2) == 2, 1021);

        // Step 4 — Wholesale
        let h4 = log_and_get_hash(
            &admin, addr, gem, 5, h3, PAYLOAD_WHOLESALE, CID_WHOLESALE
        );
        let rec3 = gem_event_store::get_event(addr, gem, 3);
        assert!(event_record::stage(&rec3) == 5, 1030);

        // Step 5 — Retail
        let h5 = log_and_get_hash(
            &admin, addr, gem, 6, h4, PAYLOAD_RETAIL, CID_RETAIL
        );
        let rec4 = gem_event_store::get_event(addr, gem, 4);
        assert!(event_record::stage(&rec4) == 6, 1040);

        // Step 6 — Sale
        let _h6 = log_and_get_hash(
            &admin, addr, gem, 7, h5, PAYLOAD_SALE, CID_SALE
        );

        assert!(gem_event_store::event_count(addr, gem) == 6, 1050);
        let latest = gem_event_store::get_latest_event(addr, gem);
        assert!(event_record::stage(&latest) == 7, 1051);
        assert!(event_record::sequence_number(&latest) == 5, 1052);
    }

    // -------------------------------------------------------------------------
    // Scenario B — "Export Rough" (Mining → Transport first)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun scenario_b_export_rough_alternate_path(
        admin: signer, framework: signer,
    ) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        let gem  = b"GEM-LK-YSP-2024-00288";

        let h1 = log_and_get_hash(
            &admin, addr, gem, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        let h2 = log_and_get_hash(
            &admin, addr, gem, 4, h1, PAYLOAD_TRANSPORT_1, CID_TRANSPORT_1
        );
        let h3 = log_and_get_hash(
            &admin, addr, gem, 2, h2, PAYLOAD_CUTTING, CID_CUTTING
        );
        let h4 = log_and_get_hash(
            &admin, addr, gem, 3, h3, PAYLOAD_CERTIFICATION, CID_CERTIFICATION
        );
        let h5 = log_and_get_hash(
            &admin, addr, gem, 4, h4, PAYLOAD_TRANSPORT_2, CID_TRANSPORT_2
        );
        let h6 = log_and_get_hash(
            &admin, addr, gem, 6, h5, PAYLOAD_RETAIL, CID_RETAIL
        );
        let _  = log_and_get_hash(
            &admin, addr, gem, 7, h6, PAYLOAD_SALE, CID_SALE
        );

        assert!(gem_event_store::event_count(addr, gem) == 7, 2000);
        let latest = gem_event_store::get_latest_event(addr, gem);
        assert!(event_record::stage(&latest) == 7, 2001);
        assert!(event_record::sequence_number(&latest) == 6, 2002);
    }

    // -------------------------------------------------------------------------
    // Scenario C — "Multi-gem registry" (isolation test)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun scenario_c_multi_gem_isolation(
        admin: signer, framework: signer,
    ) {
        setup(&admin, &framework);
        let addr  = signer::address_of(&admin);
        let gem_a = b"GEM-LK-RBY-2024-00401";
        let gem_b = b"GEM-LK-ALX-2024-00402";

        let ha1 = log_and_get_hash(
            &admin, addr, gem_a, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        let hb1 = log_and_get_hash(
            &admin, addr, gem_b, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        let hb2 = log_and_get_hash(
            &admin, addr, gem_b, 2, hb1, PAYLOAD_CUTTING, CID_CUTTING
        );
        let _   = log_and_get_hash(
            &admin, addr, gem_b, 3, hb2, PAYLOAD_CERTIFICATION, CID_CERTIFICATION
        );

        assert!(gem_event_store::event_count(addr, gem_a) == 1, 3000);
        let a_latest = gem_event_store::get_latest_event(addr, gem_a);
        assert!(event_record::stage(&a_latest) == 1, 3001);
        assert!(event_record::sequence_number(&a_latest) == 0, 3002);

        assert!(gem_event_store::event_count(addr, gem_b) == 3, 3010);
        let b_latest = gem_event_store::get_latest_event(addr, gem_b);
        assert!(event_record::stage(&b_latest) == 3, 3011);

        let _ = log_and_get_hash(
            &admin, addr, gem_a, 2, ha1, PAYLOAD_CUTTING, CID_CUTTING
        );
        assert!(gem_event_store::event_count(addr, gem_a) == 2, 3020);
        assert!(gem_event_store::event_count(addr, gem_b) == 3, 3021);
    }

    // -------------------------------------------------------------------------
    // F1 — Non-MINING genesis (abort 102)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = 102)]
    fun f1_non_mining_genesis_fails(admin: signer, framework: signer) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        gem_event_store::log_event(
            &admin, addr, b"GEM-LK-BAD-001",
            2, vector::empty<u8>(), PAYLOAD_CUTTING, CID_CUTTING,
        );
    }

    // -------------------------------------------------------------------------
    // F2 — Flexible flow: Mining → Sale succeeds
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun f2_mining_to_sale_should_succeed(admin: signer, framework: signer) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        let gem  = b"GEM-LK-FLEX-001";

        let h1 = log_and_get_hash(
            &admin, addr, gem, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        let _h2 = log_and_get_hash(
            &admin, addr, gem, 7, h1, PAYLOAD_SALE, CID_SALE
        );

        assert!(gem_event_store::event_count(addr, gem) == 2, 4000);
        let latest = gem_event_store::get_latest_event(addr, gem);
        assert!(event_record::stage(&latest) == 7, 4001);
        assert!(event_record::sequence_number(&latest) == 1, 4002);
    }

    // -------------------------------------------------------------------------
    // F3 — Double initialisation (abort 100)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = 100)]
    fun f3_double_initialize_fails(admin: signer, framework: signer) {
        setup(&admin, &framework);
        gem_event_store::initialize(&admin);
    }

    // -------------------------------------------------------------------------
    // F4 — Log before initialisation (abort 101)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = 101)]
    fun f4_log_before_initialize_fails(admin: signer, framework: signer) {
        timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        let addr = signer::address_of(&admin);

        gem_event_store::log_event(
            &admin, addr, b"GEM-LK-BAD-004",
            1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING,
        );
    }

    // -------------------------------------------------------------------------
    // F5 — Flexible flow: progress after Sale succeeds
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun f5_progress_after_sale_should_succeed(admin: signer, framework: signer) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        let gem  = b"GEM-LK-FLEX-005";

        let h1 = log_and_get_hash(
            &admin, addr, gem, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );
        let h2 = log_and_get_hash(
            &admin, addr, gem, 2, h1, PAYLOAD_CUTTING, CID_CUTTING
        );
        let h3 = log_and_get_hash(
            &admin, addr, gem, 3, h2, PAYLOAD_CERTIFICATION, CID_CERTIFICATION
        );
        let h4 = log_and_get_hash(
            &admin, addr, gem, 6, h3, PAYLOAD_RETAIL, CID_RETAIL
        );
        let h5 = log_and_get_hash(
            &admin, addr, gem, 7, h4, PAYLOAD_SALE, CID_SALE
        );
        let _h6 = log_and_get_hash(
            &admin, addr, gem, 4, h5, PAYLOAD_TRANSPORT_1, CID_TRANSPORT_1
        );

        assert!(gem_event_store::event_count(addr, gem) == 6, 5000);
        let latest = gem_event_store::get_latest_event(addr, gem);
        assert!(event_record::stage(&latest) == 4, 5001);
        assert!(event_record::sequence_number(&latest) == 5, 5002);
    }

    // -------------------------------------------------------------------------
    // F6 — Wrong prev_record_hash (abort 104)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = 104)]
    fun f6_wrong_prev_hash_fails(admin: signer, framework: signer) {
        setup(&admin, &framework);
        let addr = signer::address_of(&admin);
        let gem  = b"GEM-LK-BAD-006";
        let fake = x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        log_and_get_hash(
            &admin, addr, gem, 1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING
        );

        gem_event_store::log_event(
            &admin, addr, gem, 2, fake, PAYLOAD_CUTTING, CID_CUTTING
        );
    }

    // -------------------------------------------------------------------------
    // F7 — Unauthorized actor (abort 105)
    // -------------------------------------------------------------------------

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = 105)]
    fun f7_unauthorized_actor_fails(admin: signer, framework: signer) {
        timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        gem_event_store::initialize(&admin);
        actor_registry::initialize(&admin);
        // No grant — admin has zero permissions

        let addr = signer::address_of(&admin);
        gem_event_store::log_event(
            &admin, addr, b"GEM-LK-BAD-007",
            1, vector::empty<u8>(), PAYLOAD_MINING, CID_MINING,
        );
    }
}