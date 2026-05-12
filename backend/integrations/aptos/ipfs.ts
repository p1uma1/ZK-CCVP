/**
 * ipfs.ts
 *
 * Uploads event payload JSON to IPFS via Pinata.
 *
 * Every supply chain event has two parts:
 *   - On-chain (Aptos):  payload_hash — 32-byte SHA-256 fingerprint
 *   - Off-chain (IPFS):  full EventPayload JSON — the actual metadata
 *
 * This module handles the off-chain part. The returned CID is stored
 * in the on-chain metadata so anyone can fetch and verify the full document.
 *
 * Environment variable required:
 *   PINATA_JWT — JWT token from https://app.pinata.cloud/keys
 */

import "dotenv/config";
import type { EventPayload } from "./hash";

// ---------------------------------------------------------------------------
// Pinata API config
// ---------------------------------------------------------------------------

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getPinataJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is not set in .env");
  return jwt;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IpfsUploadResult {
  /** IPFS Content Identifier — use this to fetch the document later */
  cid:      string;
  /** Full IPFS gateway URL for browser access */
  url:      string;
  /** File size in bytes */
  size:     number;
}

// ---------------------------------------------------------------------------
// Upload event payload to IPFS
// ---------------------------------------------------------------------------

/**
 * Uploads a canonical EventPayload JSON to IPFS via Pinata.
 *
 * The CID returned here should be:
 *   1. Included in the next event's metadata (for history linking)
 *   2. Stored alongside the on-chain tx hash in your backend records
 *
 * Anyone can verify by:
 *   1. Fetching the document at https://gateway.pinata.cloud/ipfs/<CID>
 *   2. Canonicalizing the JSON (sort keys, no whitespace)
 *   3. SHA-256 hashing it
 *   4. Comparing against the payload_hash stored on Aptos
 *
 * @param payload   - The canonical EventPayload to upload
 * @param gemId     - Used as the Pinata pin name for easy identification
 * @param stage     - Stage label used in the pin name
 * @returns           IPFS CID and gateway URL
 */
export async function uploadEventPayload(
  payload: EventPayload,
  gemId:   string,
  stage:   string,
): Promise<IpfsUploadResult> {
  const jwt = getPinataJwt();

  const body = {
    pinataContent:  payload,
    pinataMetadata: {
      // Name shown in Pinata dashboard — helps identify pins easily
      name:        `${gemId}_${stage}_${payload.timestamp_ms}`,
      keyvalues: {
        gemId,
        stage,
        sequenceNumber: String(payload.sequence_number),
      },
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const response = await fetch(PINATA_API_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${response.status} — ${error}`);
  }

  const result = await response.json() as {
    IpfsHash:    string;
    PinSize:     number;
    Timestamp:   string;
  };

  const cid = result.IpfsHash;
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

  console.log(`[ipfs] Uploaded event payload`);
  console.log(`  gem:  ${gemId}`);
  console.log(`  stage: ${stage}`);
  console.log(`  CID:  ${cid}`);
  console.log(`  URL:  ${url}`);

  return {
    cid,
    url,
    size: result.PinSize,
  };
}

// ---------------------------------------------------------------------------
// Fetch and verify a payload from IPFS
// ---------------------------------------------------------------------------

/**
 * Fetches an event payload from IPFS by CID.
 *
 * Used by the verification dashboard to display full event metadata.
 *
 * @param cid - The IPFS CID stored in the event metadata
 * @returns     The full EventPayload JSON
 */
export async function fetchEventPayload(cid: string): Promise<EventPayload> {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.status} — CID: ${cid}`);
  }

  return response.json() as Promise<EventPayload>;
}
