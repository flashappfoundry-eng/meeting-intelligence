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

/**
 * Derive a stable-ish user identity string from request headers.
 *
 * Priority (first present wins):
 * - x-user-id
 * - x-openai-user-id
 * - x-openai-sub
 *
 * Fallback:
 * - Deterministic hash of a few stable-ish request traits (ip/user-agent/origin/etc)
 *   to avoid throwing when ChatGPT's MCP client doesn't forward custom headers.
 */
export function deriveUserIdFromHeaders(headers: Headers) {
  const direct =
    headers.get("x-user-id") ??
    headers.get("x-openai-user-id") ??
    headers.get("x-openai-sub") ??
    null;

  if (direct && direct.trim()) return direct.trim();

  const parts = [
    headers.get("x-openai-conversation-id"),
    headers.get("x-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("cf-connecting-ip"),
    headers.get("user-agent"),
    headers.get("accept-language"),
    headers.get("origin"),
    headers.get("host"),
  ]
    .map((v) => v?.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "anonymous-user";
  }

  const seed = parts.join("|");
  const hash = crypto.createHash("sha256").update(seed, "utf8").digest("hex");
  return `anonymous:${hash.slice(0, 32)}`;
}


