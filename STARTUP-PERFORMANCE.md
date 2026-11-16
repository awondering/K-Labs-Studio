# Studio startup: what was measured, what was fixed

Branch `fix/studio-slow-startup`, based on `main` at `4b3d897`. All figures are **emulated** in desktop Chromium (see "How it was measured"). Nothing here was measured on a real iPhone or in Safari.

## Cause

A returning, signed-in launch was slow because of three things in the startup sequence, none of them the public introductory page:

1. **Serial waterfall.** After sign-in is detected, `loadPrivateApp()` fetches the 21 private scripts one after another, and only after the entitlement request has returned. Each script costs a network round trip, and the screen is blank (`klabs-auth-resolving`) until all of it finishes.
2. **Network-first service worker.** Every navigation and every `js/`, `css/` and `.html` request waited on the network (a conditional revalidation) before the cached copy could be used. Installed-app launches therefore paid one round trip per file, and on a poor connection waited out the platform's own network timeout.
3. **Offline detection that did not match supabase-js.** A failed fetch comes back as `{ message: "TypeError: Failed to fetch", status: 0 }` (`Load failed` on Safari) with no `error.name`. Only `navigator.onLine === false` was recognised, so a device that reports online while the request fails was sent to the sign-in screen instead of opening from the cached entitlement.

The public page is not affected: a signed-out visitor loads 13 requests and no private code.

## Changes

- `js/public-entry.js`: when a stored session exists, start downloading (not running) the private scripts with `<link rel="preload">` while the entitlement request is in flight. Scripts still run one by one, in order, only after the entitlement check passes. The entitlement request is bounded at 8 s, then the cached entitlement is used exactly as when offline. Network failure is recognised from `status === 0`, `AbortError`, `TypeError`, and the supabase-js and Safari messages; any HTTP status from the server is never treated as offline.
- `service-worker.js`: navigations and app-shell files are served from the cache at once and refreshed in the background (stale-while-revalidate). The install step still precaches every file as one versioned set. Version bumped to `build148-v223`.

**Deployment rule:** because the cached shell is served first, every deploy that changes a shipped file must bump `APP_SHELL_VERSION` in `service-worker.js`. A new version installs the whole new shell and reloads the app once. Without a bump, users receive the change one launch later (the background refresh), not immediately.

## How it was measured

`tests/startup-benchmark.cjs` (optional; needs Playwright). A local server behaves like the production host (gzip, ETag, `Cache-Control: public, max-age=0, must-revalidate`, as `netlify.toml` implies), Supabase is a local stub with 120 ms latency and a synthetic signed-in session, and no real account or data is used. Profile **4g** adds a 100 ms round trip plus 1.5 MB/s to every response, including service-worker traffic, and a 4x CPU slowdown. Median of 3 runs. The local server is HTTP/1.1 (6 connections per host); the real host serves HTTP/2, so parallel downloads are probably faster there than here. "Ready" means the app screen is visible with the private app running.

| Scenario (4g profile) | Before the intro page (`6e9e47b^`) | Current main (`4b3d897`) | This fix |
|---|---|---|---|
| Signed-in, first visit (no service worker) | 862 ms | 3512 ms | 1156 ms |
| Signed-in, repeat launch (service worker) | 805 ms | 3318 ms | 898 ms |
| Signed-in, first launch after a deploy | n/a | 3309 ms | 883 ms |
| Signed-in, offline | n/a | sign-in screen shown (not restored) | app ready 604 ms |
| Signed-out, public page usable | 1072 ms (sign-in form) | 587 ms | 572 ms |

Unthrottled (LAN) signed-in: 239 / 237 ms before the intro page, 455 / 482 ms on main, 331 / 328 ms with this fix (first visit / repeat).

## Remaining limits

- The fixed build is still about 100 to 300 ms slower than the build before the intro page, mainly because the entitlement check (a server request) now precedes opening the app. It is deliberately kept: it is the account and trial check.
- A service-worker update still reloads the app once after the new version installs (observed in single runs, roughly 4x the normal startup that launch). This was not changed.
- The first install still precaches about 5 MB (including the PDF libraries) in the background after the app opens.
- Unverified on real devices: whether Safari reuses `rel=preload` responses for scripts requested later through a service worker; Safari's own cache and service-worker startup cost on a cold launch; and how often iOS reports `navigator.onLine === true` while requests fail (the code now handles it either way).
- WebKit clears script-writable storage (the stored session) and caches for sites in Safari tabs after 7 days without use; installed home-screen apps are exempt. This is platform policy as documented by WebKit, not something checked here.
