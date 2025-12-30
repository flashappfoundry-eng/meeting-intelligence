import crypto from "node:crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Our DB schema uses uuid for user ids.
 * In local/dev flows (and some integrations) we may receive non-UUID user ids
 * (e.g. "test-user-123"). This function deterministically maps any string to a UUID.
 *
 * - If input is already a UUID, returns it unchanged.
 * - Otherwise, hashes the input and formats a stable UUID.
 */
export function coerceUserIdToUuid(userId: string) {
  const trimmed = userId.trim();
  if (!trimmed) {
    throw new Error("Missing x-user-id header");
  }
  if (UUID_RE.test(trimmed)) return trimmed;

  const hash = crypto.createHash("sha256").update(trimmed, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));

  // Set UUID version 4 bits (0100) and variant bits (10xx).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}


