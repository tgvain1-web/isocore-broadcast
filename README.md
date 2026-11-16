# Isocore Broadcast — Cloudflare project

This repository is **separate from the working Discord authentication Worker** (`isocore-auth`). The main website and domain remain unchanged.

## Install the project without a computer or terminal

1. Download both files from the ChatGPT conversation: `ISOCORE-BROADCAST-PART-1.zip` and `ISOCORE-BROADCAST-PART-2.zip`.
2. In this repository, open **Add file → Upload files**.
3. Upload **both ZIP files unchanged** to the **repository root** (not inside a folder), then tap **Commit changes**.
4. The **Actions** tab should show **Install Isocore Broadcast project**. The workflow extracts and validates the package, commits its 85 files, and deletes the two temporary ZIPs. If only the first ZIP is uploaded initially, the workflow does nothing until the second is present.
5. After the workflow is green, the full project files appear here, including `src/worker.mjs`, `wrangler.jsonc`, `public/`, and `migrations/`.

**This upload step does not deploy to Cloudflare.** Deployment requires a separate Cloudflare D1 database and account authentication, covered in `README-START-HERE.md` after extraction. Keep the existing `isocore-auth` deployment untouched.

## Security

Do not upload secrets, Cloudflare API tokens, or Discord tokens to this repository or include them in screenshots. The new broadcast project needs a dedicated `CONTROL_TOKEN` secret when deployed.
