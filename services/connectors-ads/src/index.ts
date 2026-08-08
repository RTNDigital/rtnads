/**
 * @rtnads/connectors-ads — L1 advertising platform connectors (read-path).
 *
 * Credentials live in this layer only; the deterministic mapping to the
 * normalized model is exported for the warehouse loader (docs/07 §Connectors).
 */
export * from "./types.js";
export * from "./meta/mapper.js";
export * from "./meta/connector.js";
export * from "./meta/http-source.js";
export * from "./meta/fixtures.js";
export * from "./loader.js";
