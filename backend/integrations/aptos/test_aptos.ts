/**
 * test_aptos.ts
 *
 * Local test script for the Aptos backend integration.
 * Run with: npm run test:aptos
 *
 * Tests hash.ts and build_event.ts without any network connection.
 * These are pure functions so they can be verified entirely offline.
 *
 * submit_tx.ts is not tested here because it requires a live Aptos devnet
 * connection and a funded account — that comes later when doing a full
 * end-to-end deployment test.
 */

import { createHash } from "crypto";
import {
  hashEventPayload,
  hashEventPayloadBytes,
  canonicalizePayload,
  type EventPayload,
} from "./hash";
import {
  buildLogEventParams,
  STAGE,
  STAGE_LABEL,
  type LogEventInput,
} from "./build_event";

// ---------------------------------------------------------------------------
// Minimal test runner (no external test framework needed)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${(err as Error).message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(
      msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(msg ?? `Expected:\n  ${b}\nGot:\n  ${a}`);
  }
}

function assertTrue(val: boolean, msg?: string) {
  if (!val) throw new Error(msg ?? "Expected true, got false");
}

// ---------------------------------------------------------------------------
// Tests: hash.ts
// ---------------------------------------------------------------------------

console.log("\nhash.ts");

test("canonicalizePayload sorts keys alphabetically", () => {
  const payload: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        { mine_license: "ML-2024-447", location: "Ratnapura, LK" },
  };

  const canonical = canonicalizePayload(payload);
  const parsed = JSON.parse(canonical);
  const keys = Object.keys(parsed);

  // Top-level keys must be sorted
  const sorted = [...keys].sort();
  assertDeepEqual(keys, sorted, "Top-level keys not sorted");

  // Nested metadata keys must also be sorted
  const metaKeys = Object.keys(parsed.metadata);
  const sortedMeta = [...metaKeys].sort();
  assertDeepEqual(metaKeys, sortedMeta, "Metadata keys not sorted");
});

test("hashEventPayload returns a 64-char hex string", () => {
  const payload: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        {},
  };

  const hash = hashEventPayload(payload);
  assertEqual(hash.length, 64, `Hash length should be 64, got ${hash.length}`);
  assertTrue(/^[0-9a-f]{64}$/.test(hash), "Hash should be lowercase hex");
});

test("hashEventPayload is deterministic for same input", () => {
  const payload: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        { location: "Ratnapura" },
  };

  const hash1 = hashEventPayload(payload);
  const hash2 = hashEventPayload(payload);
  assertEqual(hash1, hash2, "Same payload must produce same hash");
});

test("hashEventPayload changes when any field changes", () => {
  const base: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        {},
  };

  const modified: EventPayload = { ...base, gem_id: "GEM-LK-SAP-2024-99999" };
  assertTrue(
    hashEventPayload(base) !== hashEventPayload(modified),
    "Different gem_id must produce different hash"
  );
});

test("hashEventPayloadBytes returns 32-byte Uint8Array", () => {
  const payload: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        {},
  };

  const bytes = hashEventPayloadBytes(payload);
  assertEqual(bytes.length, 32, `Byte array length should be 32, got ${bytes.length}`);
  assertTrue(bytes instanceof Uint8Array, "Should be a Uint8Array");
});

test("hashEventPayloadBytes matches hashEventPayload hex", () => {
  const payload: EventPayload = {
    gem_id:          "GEM-LK-SAP-2024-00147",
    stage:           "Mining",
    actor_address:   "0xCAFE",
    timestamp_ms:    1712700000000,
    sequence_number: 0,
    metadata:        {},
  };

  const hex   = hashEventPayload(payload);
  const bytes = hashEventPayloadBytes(payload);

  // Re-encode bytes to hex and compare
  const reHex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  assertEqual(reHex, hex, "Bytes and hex must represent the same hash");
});

test("hash matches raw crypto.createHash output", () => {
  // Verify our output is just plain SHA-256 — no surprises
  const payload: EventPayload = {
    gem_id:          "GEM-LK-RBY-2024-00401",
    stage:           "Cutting",
    actor_address:   "0xABCD",
    timestamp_ms:    1712800000000,
    sequence_number: 1,
    metadata:        { workshop: "Colombo Gems Ltd" },
  };

  const canonical = canonicalizePayload(payload);
  const expected  = createHash("sha256").update(canonical, "utf8").digest("hex");
  const actual    = hashEventPayload(payload);
  assertEqual(actual, expected, "Hash must equal raw SHA-256 of canonical JSON");
});

// ---------------------------------------------------------------------------
// Tests: build_event.ts
// ---------------------------------------------------------------------------

console.log("\nbuild_event.ts");

test("STAGE constants are correct", () => {
  assertEqual(STAGE.MINING,        1);
  assertEqual(STAGE.CUTTING,       2);
  assertEqual(STAGE.CERTIFICATION, 3);
  assertEqual(STAGE.TRANSPORT,     4);
  assertEqual(STAGE.WHOLESALE,     5);
  assertEqual(STAGE.RETAIL,        6);
  assertEqual(STAGE.SALE,          7);
});

test("STAGE_LABEL maps all stages", () => {
  assertEqual(STAGE_LABEL[1], "Mining");
  assertEqual(STAGE_LABEL[2], "Cutting");
  assertEqual(STAGE_LABEL[3], "Certification");
  assertEqual(STAGE_LABEL[4], "Transport");
  assertEqual(STAGE_LABEL[5], "Wholesale");
  assertEqual(STAGE_LABEL[6], "Retail");
  assertEqual(STAGE_LABEL[7], "Sale");
});

test("buildLogEventParams — genesis event has empty prevTxHash", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167f872e7859cae6b9c13815ad829191567aed7f79f70780eba795384e4c3",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.MINING,
    prevTxHashHex:  "",
    actorAddress:   "0xCAFE",
    sequenceNumber: 0,
    metadata:       { location: "Ratnapura, LK" },
  };

  const { params } = buildLogEventParams(input);
  assertEqual(params.prevTxHash.length, 0, "Genesis prevTxHash must be empty");
  assertEqual(params.stage, 1, "Stage must be 1 (MINING)");
});

test("buildLogEventParams — gemId is UTF-8 encoded correctly", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.MINING,
    prevTxHashHex:  "",
    actorAddress:   "0xCAFE",
    sequenceNumber: 0,
    metadata:       {},
  };

  const { params } = buildLogEventParams(input);
  const decoded = new TextDecoder().decode(params.gemId);
  assertEqual(decoded, "GEM-LK-SAP-2024-00147", "gemId must decode back to original string");
});

test("buildLogEventParams — payloadHash is 32 bytes", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.CUTTING,
    prevTxHashHex:  "a3f8c1e2d4b56789012345678901234567890123456789012345678901234567",
    actorAddress:   "0xABCD",
    sequenceNumber: 1,
    metadata:       { workshop: "Colombo Gems Ltd" },
  };

  const { params } = buildLogEventParams(input);
  assertEqual(params.payloadHash.length, 32, "payloadHash must be 32 bytes");
});

test("buildLogEventParams — prevTxHash decoded from hex is 32 bytes", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.CUTTING,
    prevTxHashHex:  "a3f8c1e2d4b56789012345678901234567890123456789012345678901234567",
    actorAddress:   "0xABCD",
    sequenceNumber: 1,
    metadata:       {},
  };

  const { params } = buildLogEventParams(input);
  assertEqual(params.prevTxHash.length, 32, "prevTxHash must be 32 bytes");
});

test("buildLogEventParams — payload contains correct gem_id and stage label", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-RBY-2024-00401",
    stage:          STAGE.CERTIFICATION,
    prevTxHashHex:  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    actorAddress:   "0xDEAD",
    sequenceNumber: 2,
    metadata:       { lab: "GIC", report_id: "GIC-2024-88321" },
  };

  const { payload } = buildLogEventParams(input);
  assertEqual(payload.gem_id,  "GEM-LK-RBY-2024-00401", "payload.gem_id mismatch");
  assertEqual(payload.stage,   "Certification",          "payload.stage label mismatch");
  assertEqual(payload.sequence_number, 2,                "payload.sequence_number mismatch");
});

test("buildLogEventParams — different inputs produce different payloadHash", () => {
  const base: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.MINING,
    prevTxHashHex:  "",
    actorAddress:   "0xCAFE",
    sequenceNumber: 0,
    metadata:       { location: "Ratnapura" },
  };

  const other: LogEventInput = {
    ...base,
    gemId: "GEM-LK-SAP-2024-99999",
  };

  const { params: p1 } = buildLogEventParams(base);
  const { params: p2 } = buildLogEventParams(other);

  const hex1 = Array.from(p1.payloadHash).map(b => b.toString(16).padStart(2,"0")).join("");
  const hex2 = Array.from(p2.payloadHash).map(b => b.toString(16).padStart(2,"0")).join("");

  assertTrue(hex1 !== hex2, "Different gem IDs must produce different payload hashes");
});

test("invalid prevTxHashHex length throws", () => {
  const input: LogEventInput = {
    storeOwner:     "0x402167...",
    gemId:          "GEM-LK-SAP-2024-00147",
    stage:          STAGE.CUTTING,
    prevTxHashHex:  "deadbeef",   // only 8 chars, not 64
    actorAddress:   "0xCAFE",
    sequenceNumber: 1,
    metadata:       {},
  };

  let threw = false;
  try {
    buildLogEventParams(input);
  } catch (e) {
    threw = true;
    assertTrue(
      (e as Error).message.includes("64 hex characters"),
      "Error message should mention 64 hex characters"
    );
  }
  assertTrue(threw, "Should have thrown for invalid prevTxHashHex length");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(40)}`);
if (failed === 0) {
  console.log(`✓  All ${passed} tests passed`);
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
