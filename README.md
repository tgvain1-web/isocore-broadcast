# Isocore Broadcast — Cloudflare V0.6

✅ **Source upload complete.** The GitHub Actions installer automatically extracted and verified the full project files. The existing `isocore-auth` Worker and live InfinityFree website were not changed.

## Next: connect Cloudflare (phone-friendly; no terminal)

### Step 1 — Create the broadcast database

1. Open [Cloudflare dashboard](https://dash.cloudflare.com/) and choose your existing Cloudflare account.
2. Find **Workers & Pages → D1 SQL Database** (some layouts show **Storage & databases → D1**).
3. Select **Create database** and enter exactly `isocore-broadcast-db`.
4. Copy the database's **Database ID** (a UUID). It is *not* an API token or secret.
5. Return to the ChatGPT conversation and paste **only the Database ID**. The assistant can place it into this repository's `wrangler.jsonc` for you. **Do not paste any Cloudflare API tokens, Discord secrets or account passwords.**

### Step 2 — Connect GitHub to a separate Cloudflare Worker

After `wrangler.jsonc` includes the database ID:

1. In **Workers & Pages**, select **Create application → GitHub** and connect this repository: `tgvain1-web/isocore-broadcast`. If it is not listed, authorize the repository in GitHub's Cloudflare integration.
2. The **Worker name must be `isocore-broadcast`** (different from existing `isocore-auth`). Branch: `main`.
3. Deploy command: `npx wrangler deploy`. No custom build command is needed.
4. Select **Save and Deploy**.

### Step 3 — Database migrations and owner controls

The D1 database must have the SQL schema applied before `/api/health` can succeed. Apply `migrations/0001_init.sql` via Cloudflare D1's **Console**, or use Wrangler's D1 migration command in the repo's README-START-HERE.md. A private `CONTROL_TOKEN` Worker secret (32+ random characters) is required before owner camera controls work.

No permanent domain change, DNS change, or `isocore-auth` modification is required.

### Step 4 — Verify the broadcast

Once deployed, visit the Cloudflare-provided Worker URL:
- `/api/health` — database readiness
- `/preview.html` — live arena preview
- `/control.html` — private Ghost/Echo camera controls
- `/xsolla-setup.html` — Xsolla Code layer integration code

The Xsolla renderer and Twitch EventSub voting still require real-world testing and setup. The PS5-to-Twitch relay and Lightstream watermark are separate and not fixed by this hosting move.

For technical details see [README-START-HERE.md](README-START-HERE.md).
