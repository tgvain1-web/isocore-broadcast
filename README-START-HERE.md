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
6. Apply all schema migrations, including `0002_ai_followers_chat_telemetry.sql`: `npx wrangler d1 migrations apply isocore-broadcast-db --remote`. Do this **before** deploying the social broadcast branch.
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

## In-development: Ghost/Echo supporters, chat and telemetry

**These features live on the development branch `feature/ghost-echo-follow-counters`, not the production deployment until merged and deployed.** No actual Twitch user follows are created; these are persistent **Isocore character follows**:

- `!ghost` assigns a Twitch chat user to Ghost; `!echo` assigns them to Echo. The D1 `ai_followers` table holds one record per Twitch user. Repeated commands do not add another follower; changing sides transfers one follower. Existing tug-of-war vote handling is preserved.
- `/api/state` and `/api/social` serve both counters and recent character lines. The broadcast camera draws bottom-screen dialogue from the existing AI world plus signed EventSub-driven chat replies. The character dialogue rules are currently **templates**, not connected to an LLM.
- Chat EventSub **must already be registered** and signed correctly. A publicly open Twitch browser IRC connection cannot safely authenticate follower assignments. Until EventSub is configured, real viewer commands will not change counts.
- Optional Twitch bot posting is **off by default**. To enable it later, set public Worker vars `CHAT_REPLIES_ENABLED=1`, `TWITCH_CLIENT_ID`, `TWITCH_BOT_USER_ID`, `TWITCH_BROADCASTER_ID`, and private secret `TWITCH_BOT_ACCESS_TOKEN`. The bot token must have Twitch's `user:write:chat` authorization and the bot/broadcaster must have the appropriate additional permission for your authorization model. Set `TWITCH_EVENTSUB_SECRET` as a private secret; use the Twitch Helix EventSub API to subscribe `channel.chat.message` for your broadcaster. For a webhook subscription you need an app access token and bot/broadcaster prior grants. Never commit tokens to GitHub or paste them into Xsolla.
- Chat response rate limits prevent replying to every incoming message or generating chat spam; sensitive raw messages are not persisted. One character may respond to each eligible comment, alternating in the absence of a direct Ghost/Echo mention. This is not yet full autonomous LLM dialogue.
- **SimHub telemetry:** run `integrations/simhub_bridge.py` locally next to SimHub; it polls SimHub's local `http://127.0.0.1:8888/Api/GetGameData` endpoint (verify your configured port), normalises available speed/RPM/gear/lap/fuel data and sends a lightweight heartbeat every two seconds. On the Worker set a separate private 32+ character `TELEMETRY_TOKEN` using `npx wrangler secret put TELEMETRY_TOKEN`. On the PC set the **matching** `ISOCORE_TELEMETRY_TOKEN` environment variable and the Worker HTTPS address in `ISOCORE_BROADCAST_URL`. Never include the token in the web overlay. SimHub runs on Windows, independently of the PS5 video relay; **no PC is needed for the streaming compositor itself, but SimHub does require a PC telemetry source**.
- Worker `POST /api/telemetry` requires the separate secret. `GET /api/telemetry` gives sanitised public values and declares `live=false` after 12 seconds without data. Echo never claims telemetry values when offline. The bridge-to-SimHub data mapping still requires a real session test.
- **Voice** synthesis and LLM-generated responses are future integrations. This branch provides live text/subtitles and telemetry-driven text, not a confirmed working audio voice channel.

Run `npm test` and visually inspect first-person, side and shoulder shots of both avatar seats before merging; this branch has not been validated live on Xsolla or Twitch.
