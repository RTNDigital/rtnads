import { createHmac, createPublicKey, verify as cryptoVerify, timingSafeEqual, type JsonWebKey } from "node:crypto";
import { z } from "zod";
import { Role, capabilitiesForRoles } from "@rtnads/contracts";
import type { Principal } from "./types.js";

/**
 * OIDC/JWT authentication boundary for the BFF (docs/06 §5, docs/09 §4). Replaces
 * the demo principal stub: an incoming `Authorization: Bearer <jwt>` is verified
 * (signature, issuer, audience, expiry) and mapped to a Principal whose `client_id`
 * is the ONLY source of tenant scope. RBAC (capabilities) is then derived from the
 * token's roles — never from the request body.
 *
 * Dependency-free (node:crypto only). HS256 (shared secret) and RS256 (public key /
 * JWKS) are supported, so pointing this at a real IdP in production is a config
 * change: supply issuer, audience and the JWKS resolver. Clock and key resolution
 * are injectable, so verification is fully deterministic in tests.
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  roles: z.array(Role).min(1),
});

export interface AuthClaims {
  sub: string;
  client_id: string;
  roles: Role[];
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthClaims>;
}

export interface JwtVerifierOptions {
  issuer: string;
  audience: string;
  /** Symmetric secret for HS256 tokens. */
  hs256Secret?: string;
  /** Resolve an RS256 signing key (JWK) by `kid`, e.g. from a JWKS endpoint. */
  jwks?: (kid: string) => Promise<JsonWebKey>;
  /** Seconds since epoch; injectable for deterministic tests. */
  now?: () => number;
  clockToleranceSec?: number;
  /** Claim names carrying tenant + roles (namespaced claims are common in OIDC). */
  clientIdClaim?: string;
  rolesClaim?: string;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    return JSON.parse(b64urlToBuf(segment).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AuthError("malformed token segment");
  }
}

/** Verifies a JWT and extracts the tenant + roles claims. */
export class JwtVerifier implements TokenVerifier {
  private readonly now: () => number;
  private readonly tol: number;
  private readonly clientIdClaim: string;
  private readonly rolesClaim: string;

  constructor(private readonly opts: JwtVerifierOptions) {
    if (!opts.hs256Secret && !opts.jwks) throw new Error("JwtVerifier needs hs256Secret or jwks");
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
    this.tol = opts.clockToleranceSec ?? 30;
    this.clientIdClaim = opts.clientIdClaim ?? "client_id";
    this.rolesClaim = opts.rolesClaim ?? "roles";
  }

  async verify(token: string): Promise<AuthClaims> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new AuthError("token must have three segments");
    const [h, p, s] = parts as [string, string, string];
    const header = decodeJson(h);
    const payload = decodeJson(p);
    const signingInput = `${h}.${p}`;
    const signature = b64urlToBuf(s);

    await this.checkSignature(String(header.alg ?? ""), header.kid, signingInput, signature);
    this.checkTime(payload);
    this.checkIssuerAudience(payload);
    return this.extract(payload);
  }

  private async checkSignature(alg: string, kid: unknown, signingInput: string, signature: Buffer): Promise<void> {
    if (alg === "HS256") {
      if (!this.opts.hs256Secret) throw new AuthError("HS256 token but no shared secret configured");
      const expected = createHmac("sha256", this.opts.hs256Secret).update(signingInput).digest();
      if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
        throw new AuthError("bad signature");
      }
      return;
    }
    if (alg === "RS256") {
      if (!this.opts.jwks) throw new AuthError("RS256 token but no JWKS resolver configured");
      const jwk = await this.opts.jwks(String(kid ?? ""));
      const key = createPublicKey({ key: jwk, format: "jwk" });
      const ok = cryptoVerify("RSA-SHA256", Buffer.from(signingInput), key, signature);
      if (!ok) throw new AuthError("bad signature");
      return;
    }
    throw new AuthError(`unsupported alg: ${alg || "none"}`);
  }

  private checkTime(payload: Record<string, unknown>): void {
    const now = this.now();
    const exp = payload.exp;
    if (typeof exp === "number" && now > exp + this.tol) throw new AuthError("token expired");
    const nbf = payload.nbf;
    if (typeof nbf === "number" && now + this.tol < nbf) throw new AuthError("token not yet valid");
  }

  private checkIssuerAudience(payload: Record<string, unknown>): void {
    if (payload.iss !== this.opts.issuer) throw new AuthError("issuer mismatch");
    const aud = payload.aud;
    const ok = Array.isArray(aud) ? aud.includes(this.opts.audience) : aud === this.opts.audience;
    if (!ok) throw new AuthError("audience mismatch");
  }

  private extract(payload: Record<string, unknown>): AuthClaims {
    const clientId = payload[this.clientIdClaim];
    if (typeof clientId !== "string" || clientId.length === 0) throw new AuthError("missing client_id claim");
    const parsed = ClaimsSchema.safeParse({ sub: payload.sub, roles: payload[this.rolesClaim] });
    if (!parsed.success) throw new AuthError("missing or invalid sub/roles claims");
    return { sub: parsed.data.sub, client_id: clientId, roles: parsed.data.roles };
  }
}

/** Map verified claims to a Principal (capabilities resolved from roles). */
export function principalFromClaims(claims: AuthClaims): Principal {
  return {
    user_id: claims.sub,
    client_id: claims.client_id,
    roles: claims.roles,
    capabilities: capabilitiesForRoles(claims.roles),
  };
}

/** Extract the bearer token from an Authorization header, or throw AuthError. */
export function bearerToken(authorization: string | undefined): string {
  if (!authorization || !authorization.startsWith("Bearer ")) throw new AuthError("missing bearer token");
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new AuthError("empty bearer token");
  return token;
}

/**
 * JWKS resolver: fetch signing keys from an OIDC provider's jwks_uri and cache them
 * by `kid`. On a cache miss it refetches once (handles key rotation). `fetchImpl` is
 * injectable so it is testable and so the proxy/runtime fetch can be supplied.
 */
export function jwksResolver(jwksUri: string, fetchImpl: typeof fetch = fetch): (kid: string) => Promise<JsonWebKey> {
  let cache: Map<string, JsonWebKey> | null = null;
  async function refresh(): Promise<Map<string, JsonWebKey>> {
    const res = await fetchImpl(jwksUri);
    if (!res.ok) throw new AuthError(`JWKS fetch failed (${res.status})`);
    const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
    cache = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid as string, k]));
    return cache;
  }
  return async (kid: string) => {
    const map = cache ?? (await refresh());
    return map.get(kid) ?? (await refresh()).get(kid) ?? raise(`unknown key id: ${kid}`);
  };
}

function raise(message: string): never {
  throw new AuthError(message);
}
