/** Shared injection tokens. */
export const CHECKOUT_SWEEPER = "CHECKOUT_SWEEPER";

/** DI tokens for the data layer. Declared here (not in data.module) so that
 *  auth.service can inject API_ENV without creating a module-load TDZ cycle:
 *  data.module imports AuthService for its provider factory, so any token auth.service
 *  reads at class-definition time must live outside that import cycle. */
export const DATA_CLIENT = Symbol("DATA_CLIENT");
export const API_ENV = Symbol("API_ENV");
