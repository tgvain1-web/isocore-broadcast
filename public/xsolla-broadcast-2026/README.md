# Isocore Broadcast — 1920x1080 Xsolla layer

Use a NEW independent Xsolla Code layer (HTML, CSS, JS) and set its position to X=0,Y=0, width=1920,height=1080.

Paste the corresponding text files in each tab. Keep other Isocore Code layers hidden while reviewing. Game source beneath the Xsolla layer in Lightstream; do not alter your Vain personal overlay.

Pinned to GitHub merge 408870b9b902c25ba9f216f55d67877050c9b42b (Nov 21, 2026). 3D models, Three.js and stage load from this immutable public release snapshot through jsDelivr. The real Cloudflare Worker at https://isocore-broadcast.tgvain1.workers.dev supplies camera control (/api/state), game/live context (/api/stream-context), and already-configured caption messages (/api/chat/latest).

Full 1920x1080 transparent output; Ghost/Echo 500x281 top-right camera. Camera follows the existing owner-controlled camera setting. Only real Twitch live state displays LIVE, and the voting meter uses the actual D1 state. Captions remain under the camera and accept existing game/chat sources. No placeholders, fake viewer counts or private owner secrets.

This is code-validated, not yet observed in signed-in Xsolla. The browser must allow external scripts, WebGL, and cross-origin HTTPS to the public model CDN. Only a saved/published Xsolla layer composed above the PS5 source will appear in the actual stream. If the browser cannot fetch jsDelivr, preserve original live Code layer as a rollback.

Do not merge or overwrite deployed Xsolla code without owner approval. Refresh the pinned SHA deliberately when new assets are approved.
