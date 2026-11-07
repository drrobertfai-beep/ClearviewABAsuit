// ClearView ABA Suite — session-cookie security policy
//
// The decision "should this cookie carry the `Secure` flag?" is kept as a pure
// function so it can be reasoned about (and tested) without a live request.
// `src/server/auth.ts` feeds it the protocol/host it read from the current
// request plus the runtime's NODE_ENV.

/** Hostnames that are only reachable locally, where plain http is expected. */
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

/** True for `localhost`, `127.0.0.1`, `[::1]`, optionally with a port. */
export function isLocalHostname(host: string): boolean {
  const hostname = host
    .trim()
    .replace(/:\d+$/, "") // strip the port
    .replace(/^\[|\]$/g, "") // strip IPv6 brackets
    .toLowerCase();
  return LOCAL_HOSTNAMES.has(hostname);
}

export interface CookieSecurityInput {
  /** Scheme of the incoming request, e.g. `https` (honours `x-forwarded-proto`). */
  protocol: string;
  /** Host of the incoming request, e.g. `getclearviewaba.com` (honours `x-forwarded-host`). */
  host: string;
  /** `process.env.NODE_ENV` of the running server. */
  nodeEnv?: string;
}

/**
 * Whether the session cookie must be `Secure`.
 *
 *  - Any HTTPS request → secure. This is the production path: Vercel terminates
 *    TLS at the edge and forwards `x-forwarded-proto: https`.
 *  - Local host over plain http → not secure, so development on
 *    `http://localhost:3000` still works (browsers drop Secure cookies on http,
 *    which would silently break sign-in locally).
 *  - Anything else in production → secure. A missing/incorrect proxy header
 *    fails closed instead of shipping a cookie that can travel over plaintext.
 */
export function shouldUseSecureCookie({
  protocol,
  host,
  nodeEnv,
}: CookieSecurityInput): boolean {
  if (protocol.toLowerCase() === "https") return true;
  if (host && isLocalHostname(host)) return false;
  return nodeEnv === "production";
}
