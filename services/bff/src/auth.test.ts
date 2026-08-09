import { describe, it, expect } from "vitest";
import { createHmac, generateKeyPairSync, sign as cryptoSign, type KeyObject, type JsonWebKey } from "node:crypto";
import { JwtVerifier, principalFromClaims, bearerToken, jwksResolver, AuthError } from "./auth.js";

const NOW = 1_700_000_000;
const ISS = "https://id.rtnhouse.example";
const AUD = "rtnads-bff";
const CLIENT = "cccccccc-0000-0000-0000-000000000001";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function hs256(payload: Record<string, unknown>, secret: string, alg = "HS256"): string {
  const h = b64url({ alg, typ: "JWT" });
  const p = b64url(payload);
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

function rs256(payload: Record<string, unknown>, priv: KeyObject, kid: string): string {
  const h = b64url({ alg: "RS256", typ: "JWT", kid });
  const p = b64url(payload);
  const sig = cryptoSign("RSA-SHA256", Buffer.from(`${h}.${p}`), priv).toString("base64url");
  return `${h}.${p}.${sig}`;
}

const basePayload = (over: Record<string, unknown> = {}) => ({
  iss: ISS,
  aud: AUD,
  sub: "user:operator",
  client_id: CLIENT,
  roles: ["optimizer"],
  exp: NOW + 3600,
  nbf: NOW - 10,
  ...over,
});

const HS_KEY = "unit-test-shared-secret-value-1234567890";
const hsVerifier = () => new JwtVerifier({ issuer: ISS, audience: AUD, hs256Secret: HS_KEY, now: () => NOW });

describe("JwtVerifier — HS256", () => {
  it("verifies a good token and yields tenant + roles", async () => {
    const claims = await hsVerifier().verify(hs256(basePayload(), HS_KEY));
    expect(claims).toEqual({ sub: "user:operator", client_id: CLIENT, roles: ["optimizer"] });
    const principal = principalFromClaims(claims);
    expect(principal.client_id).toBe(CLIENT);
    expect(principal.capabilities).toEqual(expect.arrayContaining(["recommendation.approve", "learning.decide"]));
  });

  it("rejects an expired token", async () => {
    await expect(hsVerifier().verify(hs256(basePayload({ exp: NOW - 3600 }), HS_KEY))).rejects.toThrow(/expired/);
  });

  it("rejects a not-yet-valid token", async () => {
    await expect(hsVerifier().verify(hs256(basePayload({ nbf: NOW + 3600 }), HS_KEY))).rejects.toThrow(/not yet valid/);
  });

  it("rejects a tampered signature", async () => {
    const tok = hs256(basePayload(), "the-wrong-secret-000000000000000000000");
    await expect(hsVerifier().verify(tok)).rejects.toThrow(/bad signature/);
  });

  it("rejects issuer and audience mismatch", async () => {
    await expect(hsVerifier().verify(hs256(basePayload({ iss: "https://evil" }), HS_KEY))).rejects.toThrow(/issuer/);
    await expect(hsVerifier().verify(hs256(basePayload({ aud: "other-api" }), HS_KEY))).rejects.toThrow(/audience/);
  });

  it("accepts an audience array that includes the expected audience", async () => {
    const claims = await hsVerifier().verify(hs256(basePayload({ aud: ["x", AUD] }), HS_KEY));
    expect(claims.client_id).toBe(CLIENT);
  });

  it("rejects missing client_id or roles claims", async () => {
    await expect(hsVerifier().verify(hs256(basePayload({ client_id: undefined }), HS_KEY))).rejects.toThrow(/client_id/);
    await expect(hsVerifier().verify(hs256(basePayload({ roles: [] }), HS_KEY))).rejects.toThrow(/sub\/roles/);
    await expect(hsVerifier().verify(hs256(basePayload({ roles: ["not_a_role"] }), HS_KEY))).rejects.toThrow(/sub\/roles/);
  });

  it("rejects an unsupported algorithm (e.g. alg=none)", async () => {
    const h = b64url({ alg: "none", typ: "JWT" });
    const p = b64url(basePayload());
    await expect(hsVerifier().verify(`${h}.${p}.`)).rejects.toThrow(/unsupported alg/);
  });

  it("rejects a malformed token", async () => {
    await expect(hsVerifier().verify("not.a.jwt.at.all")).rejects.toThrow(/three segments/);
  });
});

describe("JwtVerifier — RS256 via JWKS", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1" };
  const jwks = async (kid: string) => {
    if (kid !== "k1") throw new AuthError(`unknown key id: ${kid}`);
    return jwk;
  };
  const verifier = () => new JwtVerifier({ issuer: ISS, audience: AUD, jwks, now: () => NOW });

  it("verifies an RS256 token signed by the JWKS key", async () => {
    const claims = await verifier().verify(rs256(basePayload(), privateKey, "k1"));
    expect(claims.client_id).toBe(CLIENT);
    expect(claims.roles).toEqual(["optimizer"]);
  });

  it("rejects a token whose kid is not in the JWKS", async () => {
    await expect(verifier().verify(rs256(basePayload(), privateKey, "unknown"))).rejects.toThrow(/unknown key id/);
  });
});

describe("bearerToken", () => {
  it("extracts the token", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("rejects missing or empty bearer", () => {
    expect(() => bearerToken(undefined)).toThrow(/missing bearer/);
    expect(() => bearerToken("Basic x")).toThrow(/missing bearer/);
    expect(() => bearerToken("Bearer   ")).toThrow(/empty bearer/);
  });
});

describe("jwksResolver", () => {
  it("fetches keys, caches them, and refetches on a miss", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls += 1;
      return { ok: true, json: async () => ({ keys: [{ kid: "k1", kty: "RSA", n: "x", e: "AQAB" }] }) };
    }) as unknown as typeof fetch;
    const resolve = jwksResolver("https://id/jwks", fakeFetch);
    expect((await resolve("k1")).kid).toBe("k1");
    await resolve("k1"); // cached — no extra fetch
    expect(calls).toBe(1);
    await expect(resolve("missing")).rejects.toThrow(/unknown key id/);
    expect(calls).toBe(2); // one refetch on the miss
  });
});
