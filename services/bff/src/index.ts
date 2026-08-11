import { capabilitiesForRoles, type Role } from "@rtnads/contracts";
import type { Principal } from "./types.js";

/**
 * @rtnads/bff — REST ingress for the operator UI (docs/06).
 *
 * Resolves a session principal, enforces RBAC (capabilities) and derives tenant
 * scope from the principal — never from the request body. Proxies to the Query
 * and Control layers; it holds no business logic and calls no platform.
 */
export * from "./types.js";
export * from "./router.js";
export * from "./memory.js";
export * from "./pg.js";
export * from "./http.js";
export * from "./auth.js";

/** Build a principal from a user's roles, resolving the capability set (docs/10). */
export function makePrincipal(user_id: string, client_id: string, roles: Role[]): Principal {
  return { user_id, client_id, roles, capabilities: capabilitiesForRoles(roles) };
}
