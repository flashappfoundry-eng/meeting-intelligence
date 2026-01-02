// lib/auth/jwt.ts
import crypto from "crypto";
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
} from "jose";

// ============================================
// CONFIGURATION
// ============================================

const ISSUER = process.env.NEXT_PUBLIC_BASE_URL || "https://meeting-intelligence-beryl.vercel.app";
const KEY_ID = process.env.JWT_KEY_ID || "meeting-intel-key-1";

// Token expiration times
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "30d";
const ID_TOKEN_EXPIRY = "1h";
const AUTH_CODE_EXPIRY_SECONDS = 600; // 10 minutes

// ============================================
// KEY MANAGEMENT
// ============================================

// Use Awaited<ReturnType<...>> to infer the correct types from jose
type PrivateKey = Awaited<ReturnType<typeof importPKCS8>>;
type PublicKey = Awaited<ReturnType<typeof importSPKI>>;

let cachedPrivateKey: PrivateKey | null = null;
let cachedPublicKey: PublicKey | null = null;

/**
 * Get the private key for signing tokens
 * Caches the key after first load for performance
 */
async function getPrivateKey(): Promise<PrivateKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  
  const privateKeyPem = process.env.JWT_PRIVATE_KEY;
  if (!privateKeyPem) {
    throw new Error(
      "JWT_PRIVATE_KEY environment variable is not set. " +
      "Generate keys with: npm run auth:generate-keys"
    );
  }
  
  // Handle escaped newlines in environment variables
  const formattedKey = privateKeyPem.replace(/\\n/g, "\n");
  cachedPrivateKey = await importPKCS8(formattedKey, "RS256");
  return cachedPrivateKey;
}

/**
 * Get the public key for verifying tokens
 */
async function getPublicKey(): Promise<PublicKey> {
  if (cachedPublicKey) return cachedPublicKey;
  
  const publicKeyPem = process.env.JWT_PUBLIC_KEY;
  
  if (!publicKeyPem) {
    console.error("[JWT] JWT_PUBLIC_KEY is not set");
    throw new Error(
      "JWT_PUBLIC_KEY environment variable is not set. " +
      "Generate keys with: npm run auth:generate-keys"
    );
  }
  
  console.log("[JWT] Loading public key, length:", publicKeyPem.length);
  
  // Handle escaped newlines in environment variables
  const formattedKey = publicKeyPem.replace(/\\n/g, "\n");
  
  console.log("[JWT] Formatted key starts with:", formattedKey.substring(0, 30));
  
  try {
    cachedPublicKey = await importSPKI(formattedKey, "RS256");
    console.log("[JWT] Public key loaded successfully");
    return cachedPublicKey;
  } catch (error) {
    console.error("[JWT] Failed to import public key:", error);
    throw error;
  }
}

/**
 * Generate a new RSA key pair for JWT signing
 * Run this once during initial setup, then store keys in environment variables
 */
export async function generateKeyPairForSetup(): Promise<{
  privateKey: string;
  publicKey: string;
  keyId: string;
}> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  
  // Export as PEM format
  const privateKeyPem = await exportPKCS8(privateKey);
  const publicKeyPem = await exportSPKI(publicKey);
  
  // Generate a unique key ID
  const keyId = `meeting-intel-${crypto.randomBytes(4).toString("hex")}`;
  
  return {
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    keyId,
  };
}

/**
 * Get JWKS (JSON Web Key Set) for public key distribution
 * ChatGPT uses this to verify tokens issued by this app
 */
export async function getJWKS(): Promise<{ keys: object[] }> {
  try {
    const publicKey = await getPublicKey();
    const jwk = await exportJWK(publicKey);
    
    const keyId = process.env.JWT_KEY_ID || "meeting-intel-key-1";
    
    return {
      keys: [
        {
          ...jwk,
          kid: keyId,
          use: "sig",
          alg: "RS256",
        },
      ],
    };
  } catch (error) {
    console.error("[JWT] Error in getJWKS:", error);
    // Return empty keys array on error (endpoint already handles logging)
    return { keys: [] };
  }
}

// ============================================
// TOKEN PAYLOADS
// ============================================

export interface AccessTokenPayload {
  sub: string;          // User ID (UUID)
  email?: string;       // User email
  name?: string;        // User display name
  scope: string;        // Space-separated scopes
  client_id: string;    // OAuth client ID
}

export interface RefreshTokenPayload {
  sub: string;          // User ID
  client_id: string;    // OAuth client ID
  scope: string;        // Original granted scopes
}

export interface IdTokenPayload {
  sub: string;          // User ID
  email?: string;       // User email
  email_verified?: boolean;
  name?: string;        // User display name
  picture?: string;     // Avatar URL
  nonce?: string;       // For replay protection
}

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate an access token
 * Used by ChatGPT to authenticate MCP requests
 */
export async function generateAccessToken(
  payload: AccessTokenPayload,
  jti?: string
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const privateKey = await getPrivateKey();
  const tokenJti = jti || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  const token = await new SignJWT({
    ...payload,
    jti: tokenJti,
    type: "access_token",
  })
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID, typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setAudience(`${ISSUER}/mcp`)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(privateKey);
  
  return { token, jti: tokenJti, expiresAt };
}

/**
 * Generate a refresh token
 * Used to obtain new access tokens without re-authentication
 */
export async function generateRefreshToken(
  payload: RefreshTokenPayload,
  jti?: string
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const privateKey = await getPrivateKey();
  const tokenJti = jti || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  const token = await new SignJWT({
    ...payload,
    jti: tokenJti,
    type: "refresh_token",
  })
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuer(ISSUER)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(privateKey);
  
  return { token, jti: tokenJti, expiresAt };
}

/**
 * Generate an ID token (OpenID Connect)
 * Contains user identity claims
 */
export async function generateIdToken(
  payload: IdTokenPayload,
  clientId: string,
  nonce?: string
): Promise<string> {
  const privateKey = await getPrivateKey();
  
  const claims: Record<string, unknown> = {
    ...payload,
    type: "id_token",
  };
  
  if (nonce) {
    claims.nonce = nonce;
  }
  
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuer(ISSUER)
    .setAudience(clientId)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ID_TOKEN_EXPIRY)
    .sign(privateKey);
  
  return token;
}

// ============================================
// TOKEN VERIFICATION
// ============================================

export interface VerifiedAccessToken extends AccessTokenPayload {
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string | string[];
}

/**
 * Verify and decode an access token
 * Called on every MCP request to authenticate the user
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  const publicKey = await getPublicKey();
  
  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: ISSUER,
      audience: `${ISSUER}/mcp`,
    });
    
    // Validate token type
    if (payload.type !== "access_token") {
      throw new Error("Invalid token type: expected access_token");
    }
    
    // Ensure required fields exist
    if (!payload.sub || !payload.scope || !payload.client_id) {
      throw new Error("Invalid token: missing required claims");
    }
    
    return payload as unknown as VerifiedAccessToken;
  } catch (error) {
    if (error instanceof Error) {
      // Add context to the error
      throw new Error(`Token verification failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Verify and decode a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload & { jti: string }> {
  const publicKey = await getPublicKey();
  
  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: ISSUER,
    });
    
    if (payload.type !== "refresh_token") {
      throw new Error("Invalid token type: expected refresh_token");
    }
    
    if (!payload.sub || !payload.client_id) {
      throw new Error("Invalid token: missing required claims");
    }
    
    return {
      sub: payload.sub as string,
      client_id: payload.client_id as string,
      scope: payload.scope as string,
      jti: payload.jti as string,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Refresh token verification failed: ${error.message}`);
    }
    throw error;
  }
}

// ============================================
// AUTHORIZATION CODES
// ============================================

/**
 * Generate a cryptographically secure authorization code
 */
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Calculate authorization code expiry
 */
export function getAuthCodeExpiry(): Date {
  return new Date(Date.now() + AUTH_CODE_EXPIRY_SECONDS * 1000);
}

// ============================================
// PKCE UTILITIES
// ============================================

/**
 * Generate a PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate a PKCE code challenge from a verifier
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Verify a PKCE code challenge
 */
export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: "S256" | "plain" = "S256"
): boolean {
  if (method === "plain") {
    return verifier === challenge;
  }
  
  const computedChallenge = generateCodeChallenge(verifier);
  return computedChallenge === challenge;
}

// ============================================
// STATE & NONCE GENERATION
// ============================================

/**
 * Generate a secure random state parameter
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * Generate a nonce for OpenID Connect
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("base64url");
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  
  return parts[1];
}

/**
 * Check if a token is expired (with optional buffer)
 */
export function isTokenExpired(expiresAt: Date, bufferSeconds: number = 60): boolean {
  const bufferMs = bufferSeconds * 1000;
  return new Date(expiresAt.getTime() - bufferMs) <= new Date();
}

/**
 * Get token expiry as seconds from now
 */
export function getExpiresIn(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

