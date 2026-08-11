/**
 * @rtnads/connectors-crm — L1 CRM connector.
 *
 * Pseudonymizes PII at the boundary and normalizes lead-quality and sales
 * outcomes into the warehouse. CRM is a first-class source (docs/00 §5); PII is
 * separated from analytical data using pseudonymous identifiers (docs/09 §3).
 */
export * from "./pseudonymize.js";
export * from "./types.js";
export * from "./mapper.js";
export * from "./connector.js";
export * from "./fixtures.js";
export * from "./loader.js";
