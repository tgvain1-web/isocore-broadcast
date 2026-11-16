# ISOCORE BROADCAST — Cloudflare V0.6 (separate service)

**This is a deployable, locally checked project, not a live Cloudflare deployment.**

The existing live `isocoregaming.co.uk` InfinityFree website, `isocore-auth` Discord Worker, GitHub repository and domain are **not modified** by the package. No live secrets, Discord accounts, SQLite member database, PHP `config.local.php`, or PS5 relay information are included.

## What it includes

- **Real original 3D arena engine** from the V0.4 cross-origin camera and the owner's GLB models and Three.js vendor modules, served as native Worker Static Assets (no InfinityFree).
- **One large V1-style camera**, not two tiny cameras, with switchable Ghost/Echo rigs and first-person/shoulder/side/wide/jumbotron angles.
- **Original transparent overlay artwork + most of the original overlay's animation logic**, not a substituted mockup.
- Read-only **ISOCORE CHAT** from Twitch IRC on the rig screens (browser WebSocket subject to Xsolla CSP and Twitch support).
- Cloudflare D1 live camera state, voting meter, announcements, reset, signed Twitch EventSub vote ingestion, and owner-only camera control.
- A **working standalone preview path in principle** (`/preview.html`) plus a mobile owner control panel (`/control.html`) and a 3-tab Xsolla code generator (`/xsolla-setup.html`). These are **not tested on the live Cloudflare/Xsolla services yet**.

## Deploy on Cloudflare Free

Use a **separate Cloudflare project** rather than editing your already-working `isocore-auth` Worker.

1. Extract this ZIP as a new GitHub repository or local folder (suggest `isocore-broadcast`). Do NOT paste into your existing auth Worker's root.
2. In that folder: `npm install` (requires Node 20+).
3. Authenticate the appropriate Cloudflare account: `npx wrangler login`.
4. Create a D1 database: `npx wrangler d1 create isocore-broadcast-db`.
5. Copy the returned D1 **database_id** into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_ID` (do not change the existing `isocore-auth` wrangler file).
6. Apply schema: `npx wrangler d1 migrations apply isocore-broadcast-db --remote`.
7. Make a random private secret of at least 32 characters and set it with: `npx wrangler secret put CONTROL_TOKEN`.
8. Deploy: `npx wrangler deploy`.
9. Open the deployed worker hostname from the command output, then visit `/api/health`, `/preview.html`, `/control.html`, and `/xsolla-setup.html`.
10. From `/xsolla-setup.html`, copy the three generated sections into the existing Xsolla Code layer tabs, publish and test the published Xsolla link. Keep the page's code layer expanded to the full canvas. The Xsolla test may still fail if third-party scripts/modules/WebGL are blocked by that platform.

## Verified Twitch voting (optional extra integration)

The original PHP overlay counted unauthenticated Twitch IRC votes in the browser. **That cannot safely be used as a public, unverified vote writer** after moving to Workers. This build preserves read-only chat but accepts persistent live votes **only** from authenticated Twitch EventSub notifications. Configure separately:

- `npx wrangler secret put TWITCH_EVENTSUB_SECRET` (a different strong secret, shared with Twitch EventSub).
- `TWITCH_BROADCASTER_ID` as a Worker variable identifying your Twitch channel's numeric user ID (recommended). Do not guess it.
- Register an EventSub **webhook transport** subscription for Twitch `channel.chat.message` at `https://YOUR-BROADCAST-WORKER/webhooks/twitch`, with the exact secret set above. This requires valid Twitch app credentials and appropriate permissions; they are **not included**. See Twitch's EventSub reference. The Worker verifies HMAC headers and rejects unknown/expired or duplicate events.

Until configured, the original `!ghost`/`!echo` prompt will be visible, the owner can test votes from the control panel, but **public Twitch chat votes will not update D1**. The original site's key-hunt/first-finds data is **not migrated**: `/api/ghost.keys` explicitly reports unavailable rather than inventing a result. The arena's historical member/stream data is intentionally blank in the Cloudflare static preview; the original site is untouched.

## What this does not do

- Does **not** move the full PHP/SQLite website from InfinityFree, convert its Discord login/session PHP or switch the domain.
- Does **not** remove Lightstream branding, replace Lightstream, or intercept PS5 RTMP.
- Does **not** guarantee Xsolla allows the external Three.js scripts or WebGL, even with correct CORS headers.
- Does **not** make a Twitch stream by itself. The overlay must be composited by Lightstream or another approved browser-source compositor.

## Files

- `src/worker.mjs`: Cloudflare Worker routes, auth and signed Twitch webhook.
- `migrations/0001_init.sql`: D1 schema for camera, tug meter and votes.
- `public/assets/`: Original 3D source, glTF models, three.js/vendor, arena art and overlay engine.
- `public/_headers`: CORS for cross-origin assets.
- `public/preview.html`, `public/control.html`, `public/xsolla-setup.html`: preview, owner controls, Xsolla generator.
- `xsolla/`: three paste-in Code editor sections.
- `tests/`: local verification tests.

For a completely free deployment, stay within Cloudflare's Worker/D1 quotas. Broadcasting with sustained polling by many clients can eventually exceed free quotas. Your domain registration still renews separately.
