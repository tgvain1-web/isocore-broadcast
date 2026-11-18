# Isocore — Ghost & Echo AI Brain v1

This is an original Isocore implementation, not a copy of MIRA-HUD, Letta, Eliza or another agent framework.

## What exists

Two distinct AI resident identities with persistent Cloudflare D1 memory, AI-generated activity proposals, separate moods and location preferences, and an owner review process. Approved episodes can influence existing Twitch chat replies when a character's brain is enabled. AI proposals are not evidence that an action actually happened.

The new humanoid models are not yet rigged or integrated. Approved plans do not move the Three.js characters, speak aloud, control the PS5, or send Twitch/Discord messages. Existing broadcast and camera logic remains unchanged.

## On your phone

- Owner control room: /brain-console.html
- Optional read-only broadcasting display: /brain-screen.html
- Core animation prototype: /core-hud-preview.html
- Existing arena preview: /preview.html

Open the owner control room and enter your existing Isocore Broadcast CONTROL_TOKEN in the **page**, not in a chat or query string. It stays only in JavaScript memory and is not saved. Enable manual brain mode for one or both characters. Add verified memory notes or request a private decision. Approve or reject each draft. Approvals update that character's episodic memory and make the approved plan visible to the broadcast screen.

The optional automatic mode is OFF by default, even after deployment. If manually switched on, Cloudflare's 15-minute cron checks for enabled residents and creates private proposals, subject to owner review.

## Usage and cost

There is no per-character daily quota, hard call limit or artificial cooldown in the code. Only one AI request per character can run simultaneously to prevent duplicate invocations. Cloudflare's model quotas, costs, rate limits and D1 quotas still apply. An enabled automatic schedule can consume provider resources, so check your Cloudflare usage before switching it on.

## Protected API

All nonpublic routes require Authorization: Bearer CONTROL_TOKEN.

- GET /api/brain/status: private enabled state, proposed decisions and moods
- GET /api/brain/history?who=ghost: private approved and pending decisions, verified memory
- POST /api/brain/enable: who, enabled and optional automatic booleans
- POST /api/brain/remember: who and verified text
- POST /api/brain/think: who and observation
- POST /api/brain/review: numeric id and approve boolean
- GET /api/brain/public: latest owner-approved plans only; no pending drafts, credentials or private notes

The D1 tables are provisioned on first access. The Twitch bot receives only owner-approved episode memories, not unverified private notes. Twitch EventSub signature verification, OAuth handling and anti-spam safeguards are unchanged.

## File map

- src/brain.mjs: identities, validation, state, memories, D1, scheduling
- src/worker.mjs: owner-authorised routes and optional cron
- src/chat-bot.mjs: context from approved memories for chat
- public/brain-console.html: mobile private control room
- public/brain-screen.html: optional broadcast read-only display
- tests/brain.test.mjs: logic tests
- .github/workflows/verify-brain.yml: automatic tests and deployment smoke check

## What remains before a truly autonomous 3D world

The model skeleton and animations need to be joined to reviewed plans. A complete autonomy layer would need action execution permissions, perception of actual events, persistence across all Isocore surfaces, reliable recovery and more costly inference. This initial release intentionally avoids pretending a proposal was executed. Voice output and lip-sync are not yet provided.

The implementation is independent Isocore source code; it does not embed any MIRA-HUD or Aerus software.
