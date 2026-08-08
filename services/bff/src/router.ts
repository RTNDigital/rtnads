import type { Capability } from "@rtnads/contracts";
import type { BffDeps, Principal, HttpRequest, HttpResponse } from "./types.js";

/**
 * The BFF router. Every route declares a required capability; the router enforces
 * it (403) and scopes all data access to `principal.client_id` (tenancy is derived
 * from the session, never the request). Missing resources return 404 without
 * leaking cross-tenant existence (docs/06 §2, §5).
 */

class NotFound extends Error {}
class BadRequest extends Error {}

interface RouteCtx {
  deps: BffDeps;
  principal: Principal;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  capability: Capability;
  handle(ctx: RouteCtx): Promise<unknown>;
}

function route(
  method: string,
  path: string,
  capability: Capability,
  handle: (ctx: RouteCtx) => Promise<unknown>,
): Route {
  const paramNames: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:[a-zA-Z_]+/g, (m) => {
        paramNames.push(m.slice(1));
        return "([^/]+)";
      }) +
      "$",
  );
  return { method, pattern, paramNames, capability, handle };
}

const ROUTES: Route[] = [
  route("GET", "/v1/recommendations", "recommendation.read", async ({ deps, principal, query }) =>
    deps.query.listRecommendations(principal.client_id, { status: query.get("status") ?? undefined }),
  ),
  route("GET", "/v1/recommendations/:id", "recommendation.read", async ({ deps, principal, params }) => {
    const rec = await deps.query.getRecommendation(principal.client_id, params.id!);
    if (!rec) throw new NotFound();
    return rec;
  }),
  route("POST", "/v1/recommendations/:id/approve", "recommendation.approve", async ({ deps, principal, params, body }) => {
    const note = (body as { note?: string } | undefined)?.note;
    return deps.control.approve(principal.client_id, params.id!, principal, note);
  }),
  route("POST", "/v1/recommendations/:id/reject", "recommendation.reject", async ({ deps, principal, params, body }) => {
    const reason = (body as { reason?: string } | undefined)?.reason;
    if (!reason) throw new BadRequest();
    return deps.control.reject(principal.client_id, params.id!, principal, reason);
  }),
  route("GET", "/v1/actions/:id", "recommendation.read", async ({ deps, principal, params }) => {
    const a = await deps.query.getAction(principal.client_id, params.id!);
    if (!a) throw new NotFound();
    return a;
  }),
  route("GET", "/v1/actions/:id/audit", "audit.read", async ({ deps, principal, params }) =>
    deps.query.getAudit(principal.client_id, `action:${params.id!}`),
  ),
];

export class BffRouter {
  constructor(private readonly deps: BffDeps) {}

  async dispatch(principal: Principal, req: HttpRequest): Promise<HttpResponse> {
    const [rawPath, rawQuery = ""] = req.path.split("?");
    const query = new URLSearchParams(rawQuery);

    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const m = rawPath!.match(r.pattern);
      if (!m) continue;

      // Authentication is assumed (principal resolved); enforce authorization.
      if (!principal.capabilities.includes(r.capability)) {
        return { status: 403, body: { error: "forbidden", capability: r.capability } };
      }

      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => (params[name] = m[i + 1]!));

      try {
        const data = await r.handle({ deps: this.deps, principal, params, query, body: req.body });
        return { status: 200, body: data };
      } catch (e) {
        if (e instanceof NotFound) return { status: 404, body: { error: "not_found" } };
        if (e instanceof BadRequest) return { status: 400, body: { error: "bad_request" } };
        throw e;
      }
    }
    return { status: 404, body: { error: "not_found" } };
  }
}
