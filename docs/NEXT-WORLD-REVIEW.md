# ISOCORE — finished Ghost/Echo, stage and jumbotron review

This change deliberately does **not** modify `public/preview.html`, `public/assets/bridge.js`,
`public/assets/ig-ghost-world-xsolla.js`, the existing `public/assets/models/*.glb`,
the Vain/Xsolla personal gameplay overlay, Cloudflare secrets, or broadcast camera controls.

## Included for independent review
- `assets/models/next/ghost-low.glb` — rebuilt Ghost with 3 clips and rig.
- `assets/models/next/echo-low.glb` — rebuilt Echo with 3 clips and rig.
- `assets/models/next/stage-main-low.glb` — smaller redesigned stage with equipment mounts.
- `assets/models/next/arena-low.glb.gz` — gzip-packed reviewed arena/jumbotron with west passage.
- `assets/ig-ghost-world-next.js` — updated stage-positioning renderer from the completed stage package, plus opt-in model loading.
- `assets/bridge-next.js` and `preview-next.html` — isolated review page.

## Preview
After this branch has been deployed to a **preview** Worker or intentionally merged,
open `/preview-next.html` to test the new scene. The existing `/preview.html` is unchanged.
The new world only opts in when `?world=next` is present or the review page's
`isocore-next-world` class is present.

The reviewed arena is gzip-compressed to avoid a too-large asset transfer.
The browser unpacks it using `DecompressionStream('gzip')` before parsing with Three.js.
If unavailable, or if the asset fails, the engine falls back to the existing original arena.
Ghost, Echo and stage also fall back to the current working assets if loading fails.

## Checks and limitations
Run `node --test tests/next-world.test.mjs` and `node --check public/assets/ig-ghost-world-next.js`.
These checks validate GLB headers, basic geometry/animation metadata, the named jumbotron display,
and isolation; they do **not** establish that physical seating and skinning look correct in WebGL.
The source character review README warns that seated contact with desks/controls requires visual fitting.

This review integrates optimised models for mobile/720p use. Full-resolution replacements
remain in the source Codex packages and have **not** been published here.

The public browser view necessarily serves browser-ready mesh assets; no private editable
Blender source, control token, or owner credentials are included.

**Do not enable this in Xsolla's active live layer until the browser preview is checked.**
