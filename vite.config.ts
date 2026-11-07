import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Server-only modules: they open a Neon connection, read `node:fs` or hash with
 * `node:crypto`, so none of them may be reachable from browser code.
 *
 * `~/server/*.ts` modules that only *export* `createServerFn`s are deliberately
 * not listed — the Start compiler rewrites those into RPC stubs, so a route
 * importing one is normal and correct. What must never survive is a static
 * import of the data layer itself.
 */
const SERVER_ONLY_MODULE = [
  /^~\/db$/, // the query barrel
  /^~\/db\/(?!types$)/, // every db helper except the pure type module
  /^~\/server\/(password|auth-guard)$/,
];

/**
 * Structural guard: server-only code must never reach the browser bundle.
 *
 * The Start compiler strips `createServerFn` handler bodies, which normally
 * removes DB imports as dead code — but it keeps any import it cannot prove
 * unused (a handler-local name shadowing an imported one was enough to do it
 * once). The symptom is either an opaque rollup failure
 * (`"join" is not exported by "__vite-browser-external"`) or, worse, server
 * code shipped to the browser.
 *
 * This check runs after every other transform, on the client environment only,
 * so it inspects exactly what the browser would receive and fails the build
 * with a message naming the offending file and module.
 *
 * Fix a violation by importing inside the handler:
 *   const { getClient } = await import("~/db");
 */
function serverOnlyGuard(): Plugin {
  const STATIC_IMPORT =
    /^\s*import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm;

  return {
    name: "clearview:server-only-guard",
    enforce: "post",
    transform(code, id) {
      // `this.environment` is the Vite 7 environments API (client vs ssr).
      const environment = (this as { environment?: { name?: string } })
        .environment;
      if (environment?.name !== "client") return null;
      if (id.includes("node_modules") || id.includes("\0")) return null;
      if (!id.includes("/src/")) return null;

      const offenders = new Set<string>();
      for (const match of code.matchAll(STATIC_IMPORT)) {
        const specifier = match[1];
        if (SERVER_ONLY_MODULE.some((pattern) => pattern.test(specifier))) {
          offenders.add(specifier);
        }
      }
      if (offenders.size === 0) return null;

      this.error(
        `${id.replace(process.cwd() + "/", "")} statically imports server-only ` +
          `module(s) ${[...offenders].map((m) => `"${m}"`).join(", ")}, which ` +
          `would be bundled into the browser build. Import it lazily inside ` +
          `the createServerFn handler instead: const { ... } = await import(...)`,
      );
      return null;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    // The site is reverse-proxied behind <label>.<PUBLIC_SITE_DOMAIN>; the proxy
    // masks the Host to localhost:3000, but accept any host so a dev server never
    // rejects a proxied request with "Blocked request".
    allowedHosts: true,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
    serverOnlyGuard(),
  ],
});
