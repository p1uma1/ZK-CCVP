

module gem_trace::actor_registry {

    use std::signer;
    use aptos_std::table::{Self, Table};

    // -------------------------------------------------------------------------
    // Error codes
    // -------------------------------------------------------------------------

    /// Registry has already been initialised.
    const E_ALREADY_INITIALIZED: u64 = 200;

    /// Registry has not been initialised yet.
    const E_NOT_INITIALIZED: u64     = 201;

    /// Only the registry admin can modify actor permissions.
    const E_NOT_ADMIN: u64           = 202;

    /// Stage value is outside the valid range (1–7).
    const E_INVALID_STAGE: u64       = 203;

    // -------------------------------------------------------------------------
    // Bitmask helpers
    // -------------------------------------------------------------------------

    /// Converts a stage value (1–7) to its bitmask bit position (0–6).
    /// Aborts with E_INVALID_STAGE if stage is out of range.
    fun stage_to_bit(stage: u8): u8 {
        assert!(stage >= 1 && stage <= 7, E_INVALID_STAGE);
        1u8 << (stage - 1)
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// Top-level resource published under the admin account.
    struct ActorRegistry has key {
        /// actor address → stage bitmask
        permissions: Table<address, u8>,
        /// address of the admin who can modify permissions
        admin: address,
    }

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    /// Publishes the ActorRegistry under the admin's account.
    /// Must be called once after deployment, before any log_event calls.
    public entry fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<ActorRegistry>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(admin, ActorRegistry {
            permissions: table::new<address, u8>(),
            admin:       admin_addr,
        });
    }

    // -------------------------------------------------------------------------
    // Admin entry functions
    // -------------------------------------------------------------------------

    /// Grants an actor permission to log events at the given stage.
    /// If the actor already has permissions, the new stage is OR'd in.
    ///
    /// @param admin     — must be the registry admin
    /// @param actor     — Aptos address to authorize
    /// @param stage     — stage to grant (1–7)
    ///
    /// Example: grant a lab (GIC) the right to log CERTIFICATION events
    ///   grant_stage(&admin, @0xGIC, 3);
    public entry fun grant_stage(
        admin: &signer,
        actor: address,
        stage: u8,
    ) acquires ActorRegistry {
        let admin_addr = signer::address_of(admin);
        assert!(exists<ActorRegistry>(admin_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<ActorRegistry>(admin_addr);
        assert!(registry.admin == admin_addr, E_NOT_ADMIN);

        let bit = stage_to_bit(stage);

        if (table::contains(&registry.permissions, actor)) {
            let current = table::borrow_mut(&mut registry.permissions, actor);
            *current = *current | bit;
        } else {
            table::add(&mut registry.permissions, actor, bit);
        };
    }

    /// Revokes an actor's permission for a specific stage.
    /// If the actor has no remaining permissions, their entry is removed.
    ///
    /// @param admin     — must be the registry admin
    /// @param actor     — Aptos address to revoke
    /// @param stage     — stage to revoke (1–7)
    public entry fun revoke_stage(
        admin: &signer,
        actor: address,
        stage: u8,
    ) acquires ActorRegistry {
        let admin_addr = signer::address_of(admin);
        assert!(exists<ActorRegistry>(admin_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<ActorRegistry>(admin_addr);
        assert!(registry.admin == admin_addr, E_NOT_ADMIN);

        if (!table::contains(&registry.permissions, actor)) return;

        let bit = stage_to_bit(stage);
        let current = table::borrow_mut(&mut registry.permissions, actor);
        *current = *current & (bit ^ 0xFF); // clear the bit

        // Remove entry entirely if no stages remain
        if (*current == 0) {
            table::remove(&mut registry.permissions, actor);
        };
    }

    /// Grants an actor permissions for multiple stages at once using a bitmask.
    /// Useful for initialising a logistics provider (TRANSPORT + WHOLESALE = 0x18).
    ///
    /// @param admin     — must be the registry admin
    /// @param actor     — Aptos address to authorize
    /// @param bitmask   — OR of (1 << (stage-1)) for each allowed stage
    public entry fun grant_bitmask(
        admin:   &signer,
        actor:   address,
        bitmask: u8,
    ) acquires ActorRegistry {
        let admin_addr = signer::address_of(admin);
        assert!(exists<ActorRegistry>(admin_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<ActorRegistry>(admin_addr);
        assert!(registry.admin == admin_addr, E_NOT_ADMIN);

        if (table::contains(&registry.permissions, actor)) {
            let current = table::borrow_mut(&mut registry.permissions, actor);
            *current = *current | bitmask;
        } else {
            table::add(&mut registry.permissions, actor, bitmask);
        };
    }

    /// Removes all permissions for an actor.
    public entry fun revoke_all(
        admin: &signer,
        actor: address,
    ) acquires ActorRegistry {
        let admin_addr = signer::address_of(admin);
        assert!(exists<ActorRegistry>(admin_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<ActorRegistry>(admin_addr);
        assert!(registry.admin == admin_addr, E_NOT_ADMIN);

        if (table::contains(&registry.permissions, actor)) {
            table::remove(&mut registry.permissions, actor);
        };
    }

    // -------------------------------------------------------------------------
    // Authorization check (called by gem_event_store)
    // -------------------------------------------------------------------------

    /// Returns true if the actor is authorized to log events at the given stage.
    ///
    /// Called by gem_event_store::log_event on every submission.
    /// Returns false (not abort) so the caller can produce a meaningful error.
    public fun is_authorized(
        registry_owner: address,
        actor:          address,
        stage:          u8,
    ): bool acquires ActorRegistry {
        if (!exists<ActorRegistry>(registry_owner)) return false;
        let registry = borrow_global<ActorRegistry>(registry_owner);

        if (!table::contains(&registry.permissions, actor)) return false;

        let bitmask = *table::borrow(&registry.permissions, actor);
        let bit     = stage_to_bit(stage);

        (bitmask & bit) != 0
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    // Returns the stage bitmask for an actor (0 if not registered).
    #[view]
    public fun get_permissions(
        registry_owner: address,
        actor:          address,
    ): u8 acquires ActorRegistry {
        if (!exists<ActorRegistry>(registry_owner)) return 0;
        let registry = borrow_global<ActorRegistry>(registry_owner);
        if (!table::contains(&registry.permissions, actor)) return 0;
        *table::borrow(&registry.permissions, actor)
    }

    // -------------------------------------------------------------------------
    // Unit tests
    // -------------------------------------------------------------------------

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_grant_and_check_authorization(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        let admin_addr = signer::address_of(&admin);

        // Grant GIC lab CERTIFICATION (stage 3) rights
        grant_stage(&admin, @0x1001, 3);
        assert!(is_authorized(admin_addr, @0x1001, 3), 1); // CERTIFICATION ✓
        assert!(!is_authorized(admin_addr, @0x1001, 1), 2); // MINING ✗
        assert!(!is_authorized(admin_addr, @0x1001, 2), 3); // CUTTING ✗
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_grant_multiple_stages(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        let admin_addr = signer::address_of(&admin);

        // Retailer can log RETAIL (6) and SALE (7)
        grant_stage(&admin, @0x1002, 6);
        grant_stage(&admin, @0x1002, 7);
        assert!(is_authorized(admin_addr, @0x1002, 6), 10);
        assert!(is_authorized(admin_addr, @0x1002, 7), 11);
        assert!(!is_authorized(admin_addr, @0x1002, 1), 12); // not a miner
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_grant_bitmask(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        let admin_addr = signer::address_of(&admin);

        // Logistics: TRANSPORT (4) + WHOLESALE (5) = 0x08 | 0x10 = 0x18
        grant_bitmask(&admin, @0x1003, 0x18);
        assert!(is_authorized(admin_addr, @0x1003, 4), 20); // TRANSPORT ✓
        assert!(is_authorized(admin_addr, @0x1003, 5), 21); // WHOLESALE ✓
        assert!(!is_authorized(admin_addr, @0x1003, 3), 22); // CERTIFICATION ✗
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_revoke_stage(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        let admin_addr = signer::address_of(&admin);

        grant_stage(&admin, @0x1004, 2);
        grant_stage(&admin, @0x1004, 3);
        assert!(is_authorized(admin_addr, @0x1004, 2), 30);
        assert!(is_authorized(admin_addr, @0x1004, 3), 31);

        // Revoke CUTTING — CERTIFICATION should remain
        revoke_stage(&admin, @0x1004, 2);
        assert!(!is_authorized(admin_addr, @0x1004, 2), 32);
        assert!(is_authorized(admin_addr, @0x1004, 3), 33);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    fun test_unregistered_actor_not_authorized(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);
        let admin_addr = signer::address_of(&admin);

        // No grant made — must return false for all stages
        assert!(!is_authorized(admin_addr, @0x9999, 1), 40);
        assert!(!is_authorized(admin_addr, @0x9999, 7), 41);
    }

    #[test(admin = @gem_trace, framework = @aptos_framework)]
    #[expected_failure(abort_code = E_NOT_ADMIN)]
    fun test_non_admin_cannot_grant(
        admin:     signer,
        framework: signer,
    ) acquires ActorRegistry {
        aptos_framework::timestamp::set_time_has_started_for_testing(&framework);
        account::create_account_for_test(signer::address_of(&admin));
        initialize(&admin);

        // Mutate the admin field to a different address so the check fails.
        // This simulates a signer whose address doesn't match registry.admin.
        let admin_addr = signer::address_of(&admin);
        let registry   = borrow_global_mut<ActorRegistry>(admin_addr);
        // Overwrite admin with a different address — any grant attempt must now abort
        registry.admin = @0xDEAD;

        // This must abort with E_NOT_ADMIN because registry.admin != signer address
        grant_stage(&admin, @0x1234, 1);
    }
}
