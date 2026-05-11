/// stage_transition.move
///
/// Pure logic module — no storage, no entry functions.
///
/// Defines which supply chain stage transitions are valid for a gemstone.
/// Called by gem_event_store::log_event before appending any new EventRecord.
///
/// Design rationale
/// ----------------
/// Keeping transition rules in a separate module means:
///   1. gem_event_store.move stays focused on storage concerns.
///   2. Transition rules can be reasoned about and tested in total isolation.
///   3. If business rules change (e.g. a new AUCTION stage is added), only
///      this file needs to change — not the storage module.
///
/// Transition matrix
/// -----------------
/// The supply chain has a mostly linear flow, but several stages allow
/// branching to model real-world flexibility:
///
///   MINING (1)
///     └─► CUTTING (2)
///     └─► TRANSPORT (4)      ← rough stone shipped before cutting
///
///   CUTTING (2)
///     └─► CERTIFICATION (3)
///     └─► TRANSPORT (4)      ← cut stone shipped to lab or trader
///
///   CERTIFICATION (3)
///     └─► WHOLESALE (5)
///     └─► TRANSPORT (4)      ← certified stone shipped to wholesaler
///     └─► RETAIL (6)         ← lab sells directly to retailer (rare but valid)
///
///   TRANSPORT (4)
///     └─► CUTTING (2)        ← rough stone arrives at cutter
///     └─► CERTIFICATION (3)  ← stone arrives at lab
///     └─► WHOLESALE (5)      ← stone arrives at wholesaler
///     └─► RETAIL (6)         ← stone arrives at retailer
///
///   WHOLESALE (5)
///     └─► TRANSPORT (4)      ← wholesaler ships to retailer
///     └─► RETAIL (6)         ← direct handoff to retailer
///
///   RETAIL (6)
///     └─► SALE (7)           ← sold to end consumer
///     └─► TRANSPORT (4)      ← returned / re-shipped (e.g. consignment)
///
///   SALE (7)
///     — terminal state — no further transitions allowed.
///
/// Notably disallowed (examples):
///   MINING → SALE            skips entire lifecycle
///   MINING → CERTIFICATION   stone not yet cut
///   CUTTING → MINING         cannot go backwards
///   SALE   → anything        lifecycle is closed
///
/// Stage constants (mirrors event_record.move — kept local to avoid a
/// circular dependency; both files must stay in sync)
/// ---------------------------------------------------------------
///   STAGE_MINING        = 1
///   STAGE_CUTTING       = 2
///   STAGE_CERTIFICATION = 3
///   STAGE_TRANSPORT     = 4
///   STAGE_WHOLESALE     = 5
///   STAGE_RETAIL        = 6
///   STAGE_SALE          = 7

module gem_trace::stage_transition {

    // -------------------------------------------------------------------------
    // Local stage constants
    // -------------------------------------------------------------------------
    // Duplicated from event_record.move to avoid a circular dependency.
    // If a new stage is added, update BOTH files.

    const STAGE_MINING:        u8 = 1;
    const STAGE_CUTTING:       u8 = 2;
    const STAGE_CERTIFICATION: u8 = 3;
    const STAGE_TRANSPORT:     u8 = 4;
    const STAGE_WHOLESALE:     u8 = 5;
    const STAGE_RETAIL:        u8 = 6;
    const STAGE_SALE:          u8 = 7;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /// Returns true if transitioning from `from_stage` to `to_stage` is a
    /// permitted supply chain progression, false otherwise.
    ///
    /// This is the single function called by gem_event_store::log_event.
    /// It is a pure function — no storage reads, no side effects.
    ///
    /// Both `from_stage` and `to_stage` are assumed to have already passed the
    /// stage range check in event_record::new (1–7). An out-of-range value
    /// will simply return false (no valid transitions from/to unknown stages).
    public fun is_valid_transition(from_stage: u8, to_stage: u8): bool {

        if (from_stage == STAGE_MINING) {
            // Rough stone can go to the cutter or be transported first
            return to_stage == STAGE_CUTTING
                || to_stage == STAGE_TRANSPORT
        };

        if (from_stage == STAGE_CUTTING) {
            // Cut stone goes to lab for grading, or is transported
            return to_stage == STAGE_CERTIFICATION
                || to_stage == STAGE_TRANSPORT
        };

        if (from_stage == STAGE_CERTIFICATION) {
            // Certified stone goes to wholesaler, retailer, or is transported
            return to_stage == STAGE_WHOLESALE
                || to_stage == STAGE_RETAIL
                || to_stage == STAGE_TRANSPORT
        };

        if (from_stage == STAGE_TRANSPORT) {
            // Arrival can be at cutter, lab, wholesaler, or retailer
            return to_stage == STAGE_CUTTING
                || to_stage == STAGE_CERTIFICATION
                || to_stage == STAGE_WHOLESALE
                || to_stage == STAGE_RETAIL
        };

        if (from_stage == STAGE_WHOLESALE) {
            // Wholesaler ships to retailer or hands off directly
            return to_stage == STAGE_RETAIL
                || to_stage == STAGE_TRANSPORT
        };

        if (from_stage == STAGE_RETAIL) {
            // Retailer sells to consumer, or re-ships (e.g. consignment return)
            return to_stage == STAGE_SALE
                || to_stage == STAGE_TRANSPORT
        };

        // STAGE_SALE (7) and any unknown value — no valid outgoing transitions
        false
    }

    /// Returns true if `stage` is a terminal state (no further events allowed).
    /// Currently only SALE is terminal.
    public fun is_terminal(stage: u8): bool {
        stage == STAGE_SALE
    }

    /// Returns true if `stage` is the required genesis stage.
    /// The first event for every gem must be STAGE_MINING.
    public fun is_genesis_stage(stage: u8): bool {
        stage == STAGE_MINING
    }

    // -------------------------------------------------------------------------
    // Unit tests
    // -------------------------------------------------------------------------
    // Run with: aptos move test --filter stage_transition

    // ---- Valid transitions -------------------------------------------------

    #[test]
    fun test_mining_to_cutting_valid() {
        assert!(is_valid_transition(STAGE_MINING, STAGE_CUTTING), 1);
    }

    #[test]
    fun test_mining_to_transport_valid() {
        // Rough stone shipped before cutting — real-world scenario for
        // Sri Lankan sapphires exported rough before being cut abroad.
        assert!(is_valid_transition(STAGE_MINING, STAGE_TRANSPORT), 2);
    }

    #[test]
    fun test_cutting_to_certification_valid() {
        assert!(is_valid_transition(STAGE_CUTTING, STAGE_CERTIFICATION), 3);
    }

    #[test]
    fun test_cutting_to_transport_valid() {
        // Cut stone shipped to a remote lab (e.g. GIA New York)
        assert!(is_valid_transition(STAGE_CUTTING, STAGE_TRANSPORT), 4);
    }

    #[test]
    fun test_certification_to_wholesale_valid() {
        assert!(is_valid_transition(STAGE_CERTIFICATION, STAGE_WHOLESALE), 5);
    }

    #[test]
    fun test_certification_to_retail_valid() {
        // Lab sells certified stone directly to a retail jeweller
        assert!(is_valid_transition(STAGE_CERTIFICATION, STAGE_RETAIL), 6);
    }

    #[test]
    fun test_certification_to_transport_valid() {
        assert!(is_valid_transition(STAGE_CERTIFICATION, STAGE_TRANSPORT), 7);
    }

    #[test]
    fun test_transport_to_cutting_valid() {
        // Rough stone arrives at cutting facility after shipping
        assert!(is_valid_transition(STAGE_TRANSPORT, STAGE_CUTTING), 8);
    }

    #[test]
    fun test_transport_to_certification_valid() {
        // Stone arrives at lab after shipping
        assert!(is_valid_transition(STAGE_TRANSPORT, STAGE_CERTIFICATION), 9);
    }

    #[test]
    fun test_transport_to_wholesale_valid() {
        assert!(is_valid_transition(STAGE_TRANSPORT, STAGE_WHOLESALE), 10);
    }

    #[test]
    fun test_transport_to_retail_valid() {
        assert!(is_valid_transition(STAGE_TRANSPORT, STAGE_RETAIL), 11);
    }

    #[test]
    fun test_wholesale_to_retail_valid() {
        assert!(is_valid_transition(STAGE_WHOLESALE, STAGE_RETAIL), 12);
    }

    #[test]
    fun test_wholesale_to_transport_valid() {
        // Wholesaler ships stone to retailer via courier
        assert!(is_valid_transition(STAGE_WHOLESALE, STAGE_TRANSPORT), 13);
    }

    #[test]
    fun test_retail_to_sale_valid() {
        assert!(is_valid_transition(STAGE_RETAIL, STAGE_SALE), 14);
    }

    #[test]
    fun test_retail_to_transport_valid() {
        // Consignment stone returned from retailer A to retailer B
        assert!(is_valid_transition(STAGE_RETAIL, STAGE_TRANSPORT), 15);
    }

    // ---- Invalid transitions -----------------------------------------------

    #[test]
    fun test_mining_to_certification_invalid() {
        // Stone cannot be certified before it is cut
        assert!(!is_valid_transition(STAGE_MINING, STAGE_CERTIFICATION), 20);
    }

    #[test]
    fun test_mining_to_wholesale_invalid() {
        assert!(!is_valid_transition(STAGE_MINING, STAGE_WHOLESALE), 21);
    }

    #[test]
    fun test_mining_to_retail_invalid() {
        assert!(!is_valid_transition(STAGE_MINING, STAGE_RETAIL), 22);
    }

    #[test]
    fun test_mining_to_sale_invalid() {
        // Cannot skip entire lifecycle — mined → sold directly is not allowed
        assert!(!is_valid_transition(STAGE_MINING, STAGE_SALE), 23);
    }

    #[test]
    fun test_cutting_to_mining_invalid() {
        // Backwards transitions are never allowed
        assert!(!is_valid_transition(STAGE_CUTTING, STAGE_MINING), 24);
    }

    #[test]
    fun test_cutting_to_wholesale_invalid() {
        // Must be certified before entering trade channels
        assert!(!is_valid_transition(STAGE_CUTTING, STAGE_WHOLESALE), 25);
    }

    #[test]
    fun test_cutting_to_sale_invalid() {
        assert!(!is_valid_transition(STAGE_CUTTING, STAGE_SALE), 26);
    }

    #[test]
    fun test_sale_to_anything_invalid() {
        // SALE is terminal — no outgoing transitions whatsoever
        assert!(!is_valid_transition(STAGE_SALE, STAGE_MINING), 30);
        assert!(!is_valid_transition(STAGE_SALE, STAGE_CUTTING), 31);
        assert!(!is_valid_transition(STAGE_SALE, STAGE_CERTIFICATION), 32);
        assert!(!is_valid_transition(STAGE_SALE, STAGE_TRANSPORT), 33);
        assert!(!is_valid_transition(STAGE_SALE, STAGE_WHOLESALE), 34);
        assert!(!is_valid_transition(STAGE_SALE, STAGE_RETAIL), 35);
    }

    #[test]
    fun test_unknown_stage_invalid() {
        // Out-of-range stage values must never produce a valid transition
        assert!(!is_valid_transition(99, STAGE_CUTTING), 40);
        assert!(!is_valid_transition(STAGE_MINING, 99), 41);
        assert!(!is_valid_transition(0, 0), 42);
    }

    // ---- Helper function tests ---------------------------------------------

    #[test]
    fun test_is_terminal() {
        assert!(is_terminal(STAGE_SALE), 50);
        assert!(!is_terminal(STAGE_MINING), 51);
        assert!(!is_terminal(STAGE_RETAIL), 52);
        assert!(!is_terminal(0), 53);
        assert!(!is_terminal(99), 54);
    }

    #[test]
    fun test_is_genesis_stage() {
        assert!(is_genesis_stage(STAGE_MINING), 60);
        assert!(!is_genesis_stage(STAGE_CUTTING), 61);
        assert!(!is_genesis_stage(STAGE_SALE), 62);
        assert!(!is_genesis_stage(0), 63);
    }
}
