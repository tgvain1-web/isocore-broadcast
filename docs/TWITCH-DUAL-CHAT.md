# Isocore Broadcast — Ghost & Echo Twitch Chat (opt-in)

This feature mirrors an AI reply **under Streamer Cam** and **in Twitch chat**.
It uses the streamer's connected Twitch account to post messages with
`GHOST //` or `ECHO //` prefixes. It does **not** create two separate Twitch
accounts. You can choose to use a dedicated bot account in a later version.

## Safety defaults
- OFF until explicitly enabled in Owner Controls.
- Only answers `!askghost <question>`, `!askecho <question>`,
  `@ghost <question>`, `@echo <question>`, or `Ghost, ...`/`Echo, ...`.
- Does not reply to every message. At least 24 seconds between replies, and
  90 seconds per viewer; duplicate EventSub deliveries are ignored.
- No replies if Twitch credentials, signed EventSub, or AI are unavailable.
- Twitch must confirm a sent message before its text appears on camera.
- Legacy arena dialogue remains excluded from the broadcast.
- The AI knows the game category, **not** what is happening in the video.
- These responses may consume Cloudflare Workers AI quota/costs; monitor usage.

## Twitch developer app (owner action)
1. Register or open an application at https://dev.twitch.tv/console/apps
   (Twitch must authorise the user who owns the live channel).
2. Set **OAuth Redirect URL** exactly:
   `https://isocore-broadcast.tgvain1.workers.dev/oauth/twitch/callback`
3. In Cloudflare Workers & Pages > isocore-broadcast > Settings > Variables
   and Secrets, configure:
   - `TWITCH_CLIENT_ID` — Twitch app Client ID
   - `TWITCH_CLIENT_SECRET` — private secret
   - `TWITCH_EVENTSUB_SECRET` — a new random 32+ character string
   - `TWITCH_SESSION_KEY` — a **different** random 32+ character encryption key
   - `TWITCH_CHANNEL_LOGIN` — the intended Twitch login (`igvain` by default)
   - `CONTROL_TOKEN` — existing owner-only token; rotate if previously exposed
4. Ensure Cloudflare Workers AI is enabled. Wrangler config has
   `"ai":{"binding":"AI"}`, using the model
   `@cf/meta/llama-3.1-8b-instruct`. Check your Cloudflare account's
   AI usage limits and billing.
5. Deploy the updated Worker and static assets.
6. Open `/control.html`, provide `CONTROL_TOKEN`, press
   **Connect Twitch account securely**, then authorise Twitch permissions
   `user:read:chat` and `user:write:chat`. The authorisation code is
   exchanged on the Worker and tokens are encrypted before D1 storage.
7. Re-enter your control token after returning to the control page.
   Check that Twitch is connected and EventSub subscription is active.
   Use **Retry chat subscription** if necessary.
8. Only when you want Ghost and Echo to start answering, press
   **Enable chat replies**. Use **Disable chat replies** at any time.
9. Replace the Xsolla JavaScript tab with version `19` from
   `/xsolla-setup.html`, save and publish. HTML/CSS unchanged.

## Testing
On a brief test broadcast, ask in the connected Twitch channel:
`!askghost What should we do first in GTA VI?`
or `!askecho How important is braking in GT7?`.

After successful AI generation and Twitch's send confirmation, the
same answer will appear with an appropriate persona label:
- Twitch chat: `GHOST // @viewer ...`
- Under Streamer Cam: `GHOST // @viewer ...`

No token, Client Secret, access token, or refresh token belongs in Xsolla
code, GitHub, public URLs, a chat message, or a screenshot.

## Troubleshooting
- No Connect link: check the four secrets in the Worker.
- OAuth error: the Twitch developer app's redirect URL must match exactly;
  sign in as the channel selected by `TWITCH_CHANNEL_LOGIN`.
- EventSub not subscribed: check EventSub secret and client permissions.
- AI binding not present: chat replies cannot be enabled.
- No on-camera reply: verify the message was actually sent in Twitch chat.
- `!ghost` and `!echo` alone remain reserved for votes and never trigger AI.
- Disable outgoing replies if issues appear; game commentary keeps working.
