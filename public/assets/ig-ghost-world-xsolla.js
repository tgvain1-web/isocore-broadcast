/* IG-Ghost's town, at night, walked in first person from the top of Home (and shown on his own page). The 3D diorama that began as his room, grown into the whole town: the server room he lives in, Isocore
   Gaming, the GridSync circuit, the arena, the post box and the gate. Rendering is local (three.js, shipped with the site).
   Where he is, whether a game night is live, when the next one starts and how many windows are lit come from the site
   (data- attributes at first, then api.php?action=ghost.world once a minute). Every place can be tapped, and the same six
   places are ordinary links under the town, so the page works without WebGL, with a keyboard and for a screen reader. */
(function () {
  'use strict';
  var ISOCORE_ASSET_BASE = new URL('../', document.currentScript && document.currentScript.src || location.href).href;

  var stage = document.getElementById('ig-ghost-world');
  if (!stage) return;
  var canvas = stage.querySelector('.igw-canvas');
  var activity = stage.querySelector('.igw-activity');
  var pauseButton = document.querySelector('[data-igw-pause]');
  var resetButton = document.querySelector('[data-igw-reset]');
  var status = document.getElementById('igw-status');
  var help = document.getElementById('igw-help');
  var doing = document.getElementById('ghostDoing');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var started = false, loading = false, controller = null, zoomButtons = [];
  var SHORT = { home: 'In the server room', barracks: 'At Isocore Gaming', circuit: 'At the GridSync circuit', arena: 'At the arena', post: 'At the post box', gate: 'At the gate' };
  var world = { where: SHORT[stage.dataset.where] ? stage.dataset.where : 'home', live: stage.dataset.live === '1', next: Number(stage.dataset.next) || 0, lit: Math.max(0, Math.min(18, Number(stage.dataset.lit) || 6)), homes: Math.max(0, Number(stage.dataset.homes) || 0) };
  var homesLine = document.getElementById('ghostHomes'), housesBox = document.getElementById('ghostHouses');
  function houseList(v) { var out = []; (Array.isArray(v) ? v : []).forEach(function (h) { if (h && typeof h.n === 'string' && /^[a-z0-9]{8,16}$/.test(String(h.c))) out.push({ n: h.n.slice(0, 24), c: String(h.c), s: h.s === 'g' ? 'g' : 'i', q: Number.isInteger(h.q) ? h.q : -1 }); }); return out.slice(0, 300); }
  try { world.houses = houseList(JSON.parse(stage.dataset.houses || '[]')); } catch (e) { world.houses = []; }
  var MOODS = { cheerful: 0x39c2ff, restless: 0xff7a3a, sleepy: 0x6a7bd0, proud: 0xffc94d, curious: 0x52e0c4, mischievous: 0xc56bff, thoughtful: 0x7fb2ff, gloomy: 0x56708f };
  function itemList(v) { var out = []; (Array.isArray(v) ? v : []).forEach(function (it) { if (Array.isArray(it) && /^[a-z_]{2,16}$/.test(String(it[0])) && /^s\d{1,2}$/.test(String(it[1]))) out.push([String(it[0]), String(it[1]), it[2] === 'echo' ? 'echo' : 'ghost']); }); return out.slice(0, 16); }
  try { world.items = itemList(JSON.parse(stage.dataset.items || '[]')); } catch (e) { world.items = []; }
  world.mood = MOODS[stage.dataset.mood] ? stage.dataset.mood : '';
  function streetList(v) { var out = []; (Array.isArray(v) ? v : []).forEach(function (x) { if (Array.isArray(x) && (x[0] === 'i' || x[0] === 'g')) out.push([x[0], String(x[1] || '').slice(0, 28), Math.max(0, Math.min(2000, Number(x[2]) || 0)), String(x[3] || '').slice(0, 24), String(x[4] || '').slice(0, 24), Math.max(0, Math.min(999, Number(x[5]) || 0))]); }); return out.slice(0, 40); }
  try { world.streets = streetList(JSON.parse(stage.dataset.streets || '[]')); } catch (e) { world.streets = []; }
  try { world.extra = JSON.parse(stage.dataset.extra || '{}') || {}; } catch (e) { world.extra = {}; }
  // real 3D models the Owner has added (assets/models/<name>.glb); the number is the file's date, so a new file is fetched afresh
  world.models = {}; String(stage.dataset.models || '').split(',').forEach(function (p) { var m = /^([a-z-]+):(\d+)$/.exec(p.trim()); if (m) world.models[m[1]] = ISOCORE_ASSET_BASE + 'assets/models/' + m[1] + '.glb?v=' + m[2]; });
  function sidePair(a, b) { return { i: Math.max(0, Math.min(2000, Number(a) || 0)), g: Math.max(0, Math.min(2000, Number(b) || 0)) }; }
  var sd = String(stage.dataset.sides || '').split(','); world.sides = sidePair(sd[0], sd[1]);
  stage.tabIndex = 0;
  stage.setAttribute('aria-describedby', 'igw-help');
  if (help) help.textContent = ('ontouchstart' in window) ? 'Swipe to look around from your seat. Menu > Walk around gets you up.' : 'Click a place and you walk there, then go in. Drag to look around; W A S D or the arrow keys walk.';
  if (activity) activity.textContent = SHORT[world.where];

  function fallback() {
    stage.classList.remove('is-live');
    if (status) status.textContent = 'The 3D arena is not available on this device. The diary and notes are below.';
    if (pauseButton) pauseButton.hidden = true;
    if (resetButton) resetButton.hidden = true;
    zoomButtons.forEach(function (button) { button.hidden = true; });
    if (help) help.hidden = true;
    if (wrap) wrap.classList.add('igw-dead');
    if (where() === 'home' && document.getElementById('overview')) location.replace('#overview');      /* no town on this device: the ordinary front page instead */
  }
  var wrap = document.getElementById('igwWrap'), homeSlot = document.getElementById('igwHomeSlot'), ghostSlot = document.getElementById('igwGhostSlot');
  // The one stage shows in two places: at the top of Home, and on the ghost's own page while that is open.
  function where() { return 'home'; } // independent of Xsolla scene URL
  function active() { return !!where(); }
  (function () {
    var foot = document.querySelector('footer'), chip = document.querySelector('.igw-back');
    if (!foot || !chip || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) { chip.classList.toggle('igw-back-off', en[0].isIntersecting); }).observe(foot);
  })();
  function seat() {
    document.documentElement.classList.toggle('igw-in-town', where() === 'home');
    var to = where() === 'ghost' ? ghostSlot : (where() === 'home' ? homeSlot : null);
    if (wrap && to && wrap.parentNode !== to) to.insertBefore(wrap, to.firstChild);
  }
  seat();
  function maybeStart() {
    if (!active() || started || loading) return;
    loading = true;
    import(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/three.module.min.js').then(function (T) {
      try { controller = build(T); started = true; }
      catch (e) { window.__igwErr = String(e && e.stack || e).slice(0, 600); fallback(); }
      loading = false;
    }).catch(function () { loading = false; fallback(); });
  }
  // The two places on this page itself (the diary and the note box) scroll there instead of changing the page.
  Array.prototype.forEach.call(document.querySelectorAll('.ghost-places a[data-jump]'), function (a) {
    a.addEventListener('click', function (ev) {
      var to = document.getElementById(a.getAttribute('data-jump'));
      if (!to) return;
      var move = function () { to.scrollIntoView({ behavior: reduced && reduced.matches ? 'auto' : 'smooth', block: 'start' }); };
      if (where() !== 'ghost') { setTimeout(move, 450); return; }      /* from Home: open his page first, then go down to it */
      ev.preventDefault(); move();
    });
  });
  function go(id) {
    var hm = /^house:(\d+)$/.exec(id);
    if (hm) { var hs = world.houses[Number(hm[1])]; if (hs) { if (controller && controller.openPod) controller.openPod(Number(hm[1])); else location.hash = '#player-' + hs.c; } return; }
    var a = document.querySelector('.ghost-places a[data-place="' + id + '"]'); if (a) a.click();
  }
  function showWhere() {
    if (activity) activity.textContent = SHORT[world.where] || '';
    Array.prototype.forEach.call(document.querySelectorAll('.ghost-places a'), function (a) { a.classList.toggle('here', a.getAttribute('data-place') === world.where); });
    stage.dataset.where = world.where;
  }
  window.addEventListener('hashchange', function () { if (wrap && wrap.classList.contains('igw-dead') && where() === 'home' && document.getElementById('overview')) { location.replace('#overview'); return; } seat(); if (active()) { maybeStart(); if (controller) controller.wake(); } });
  maybeStart();

  function build(T) {
    if (!canvas || !window.WebGLRenderingContext) throw new Error('WebGL unavailable');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x050a16, 1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32; // Broadcast camera exposure: readable rigs without washing out their cyan/orange lighting.
    var scene = new T.Scene();
    scene.background = new T.Color(0x050a16);
    scene.fog = new T.Fog(0x0a1630, 45, 230);
    var camera = new T.PerspectiveCamera(42, 1, 0.1, 520);
    scene.add(new T.HemisphereLight(0x7f9fe0, 0x141c2c, 1.55));
    var sun = new T.DirectionalLight(0x9db9ff, 1.5); sun.position.set(-9, 13, 7); scene.add(sun);                 /* moonlight */
    var lampFill = new T.PointLight(0xffb866, 140, 26); lampFill.position.set(0, 4.5, 6.0); scene.add(lampFill);           /* the warm pool the plaza lamps throw */
    var blue = new T.PointLight(0x20a9e7, 260, 46); blue.position.set(0, 14, -10); scene.add(blue);
    var amber = new T.PointLight(0xff7847, 160, 34); amber.position.set(14, 7, 10); scene.add(amber);
    var flood = new T.PointLight(0xffe2a8, 0, 30); flood.position.set(-13, 12, 17); scene.add(flood);
    var mats = {
      base: new T.MeshStandardMaterial({ color: 0x9ba2ac, roughness: .6, metalness: .15 }),
      rim: new T.MeshStandardMaterial({ color: 0x4a505a, roughness: .6, metalness: .3 }),
      floor: new T.MeshStandardMaterial({ color: 0x2c313b, roughness: .45, metalness: .25 }),
      road: new T.MeshStandardMaterial({ color: 0x1b1f2a, roughness: .85, metalness: .05 }),
      dark: new T.MeshStandardMaterial({ color: 0x262b36, roughness: .6, metalness: .2 }),
      metal: new T.MeshStandardMaterial({ color: 0x3e4346, roughness: .55, metalness: .65 }),
      trim: new T.MeshStandardMaterial({ color: 0x6f7470, emissive: 0x000000, emissiveIntensity: 0, roughness: .6, metalness: .5 }),
      grid: new T.MeshStandardMaterial({ color: 0xc9781e, emissive: 0x000000, emissiveIntensity: 0, roughness: .6, metalness: .2 }),
      light: new T.MeshBasicMaterial({ color: 0xe6ecf0 }),
      warm: new T.MeshBasicMaterial({ color: 0xffd08a }),
      roofBlue: new T.MeshStandardMaterial({ color: 0x24405e, emissive: 0x000000, emissiveIntensity: 0, roughness: .75, metalness: .3 }),
      roofAmber: new T.MeshStandardMaterial({ color: 0x8a4a1e, emissive: 0x000000, emissiveIntensity: 0, roughness: .75, metalness: .3 }),
      foot: new T.MeshStandardMaterial({ color: 0x0b1220, roughness: .5, metalness: .2 }),
      off: new T.MeshStandardMaterial({ color: 0x0c1424, roughness: .3, metalness: .5 }),
      ink: new T.MeshStandardMaterial({ color: 0x0d202b, roughness: .35, metalness: .32 }),
      hood: new T.MeshStandardMaterial({ color: 0x2aa3cc, emissive: 0x0c5674, emissiveIntensity: .55, roughness: .78, metalness: .02, side: T.DoubleSide }),
      face: new T.MeshBasicMaterial({ color: 0x03070d }),
      eye: new T.MeshBasicMaterial({ color: 0xf6fdff }),
      red: new T.MeshBasicMaterial({ color: 0xff3b30 }),
      white: new T.MeshBasicMaterial({ color: 0xf2f5f7 })
    };
    function mesh(geo, mat, x, y, z, parent) { var o = new T.Mesh(geo, mat); o.position.set(x || 0, y || 0, z || 0); (parent || scene).add(o); return o; }
    function box(w, h, d, mat, x, y, z, parent) { return mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent); }
    function cylinder(r1, r2, h, mat, x, y, z, parent, seg, open) { return mesh(new T.CylinderGeometry(r1, r2, h, seg || 32, 1, !!open), mat, x, y, z, parent); }
    function sphere(w, h, d, mat, x, y, z, parent) { var o = mesh(new T.SphereGeometry(1, 24, 16), mat, x, y, z, parent); o.scale.set(w, h, d); return o; }
    function torus(r, tube, mat, x, y, z, parent) { return mesh(new T.TorusGeometry(r, tube, 8, 64), mat, x, y, z, parent); }

    // The places. Each is a group at (x, z); "at" is where he stands when he is there.
    var PLACES = {
      home: { x: 0, z: -18, at: [0, -11.6], name: 'THE SERVER ROOM', colour: '#76d6f3', top: 31 },
      barracks: { x: -16, z: -4, at: [-16, 2.4], name: 'ISOCORE GAMING', colour: '#76d6f3', top: 12.6 },
      circuit: { x: 14, z: 13, at: [13.4, 7.2], name: 'GRIDSYNC', colour: '#ff9a6b', top: 5.4 },
      arena: { x: -13, z: 17, at: [-5.4, 15.4], name: 'THE ARENA', colour: '#e4f5fc', top: 9.2 },
      post: { x: -4.6, z: 10.6, at: [-3.0, 11.8], name: 'THE POST BOX', colour: '#ffd58a', top: 3.0 },
      gate: { x: 0, z: 21.0, at: [0, 18.6], name: 'THE GATE', colour: '#e4f5fc', top: 9.4 },
      rosters: { x: -23, z: 6.0, at: [-17.6, 6.0], name: 'SQUAD CLUBHOUSE', colour: '#76d6f3', top: 8.2 },
      broadcast: { x: 13, z: -19, at: [13, -13.6], name: 'BROADCAST', colour: '#76d6f3', top: 8.6 },
      staff: { x: -13, z: -19, at: [-13, -11.2], name: 'STAFF HQ', colour: '#ffd58a', top: 11.4 },
      login: { x: -2.6, z: 21.72, at: [-2.6, 23.2], name: (function () { var a = document.querySelector('.ghost-places a[data-place="login"]'); return (a && a.getAttribute('data-tag')) || 'LOG IN'; })(), colour: '#ffd58a', top: 3.4 },
      overview: { x: 2.6, z: 21.72, at: [2.6, 23.2], name: 'OVERVIEW', colour: '#76d6f3', top: 3.4 }
    };
    var pickable = [], tags = [];
    var lastPlace = null; function placeGroup(id) { if (lastPlace) { lastPlace.solidTo = SOLIDS.length; lastPlace.sceneTo = scene.children.length; } var p = PLACES[id], g = new T.Group(); p.solidFrom = SOLIDS.length; p.sceneFrom = scene.children.length; lastPlace = p; g.position.set(p.x, .08, p.z); g.userData.place = id; scene.add(g); p.group = g; return g; }
    function own(id) { PLACES[id].group.traverse(function (o) { if (o.isMesh) { o.userData.place = id; pickable.push(o); } }); }

    // Words drawn on a small canvas, used for the screens on the buildings.
    function screenTexture(text, sub, colour, line) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 256; var x = c.getContext('2d');
      x.fillStyle = '#081a27'; x.fillRect(0, 0, 512, 256); x.strokeStyle = line || '#23799c'; x.lineWidth = 5; x.strokeRect(5, 5, 502, 246);
      x.fillStyle = colour || '#76d6f3'; x.font = '600 23px sans-serif'; x.fillText(sub, 30, 50);
      x.fillStyle = '#e4f5fc'; x.font = '700 43px sans-serif'; x.fillText(text, 30, 112);
      x.fillStyle = line || '#1c7499'; x.fillRect(30, 148, 286, 5); x.fillStyle = colour || '#2db8e6'; x.fillRect(30, 148, 160, 5);
      x.fillStyle = '#7caaba'; x.font = '22px sans-serif'; x.fillText('ONE MORE GAME', 30, 204);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
    }
    function screen(text, sub, w, h, colour, line) { return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: screenTexture(text, sub, colour, line) })); }
    // A name floating over a place. It always faces the camera.
    function nameTag(id) {
      var p = PLACES[id], c = document.createElement('canvas'); c.width = 512; c.height = 96; var x = c.getContext('2d');
      x.font = '700 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 8; x.strokeStyle = 'rgba(7,19,30,.9)'; x.strokeText(p.name, 256, 50); x.fillStyle = p.colour; x.fillText(p.name, 256, 50);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      var s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.userData.base = [7.2, 1.35]; s.scale.set(7.2, 1.35, 1); s.position.set(p.x, p.top, p.z); s.userData.place = id; scene.add(s); tags.push(s); pickable.push(s); return s;
    }
    // Rows of windows on the front (+z) face of a block. Returns the window meshes so they can be lit and unlit.
    function windowsFront(parent, w, h, d, cols, rows, y0) {
      var list = [];
      for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) list.push(box(w / cols * .46, h / rows * .5, .03, mats.off, -w / 2 + (q + .5) * w / cols, y0 + (r + .5) * h / rows, d / 2 + .012, parent));
      return list;
    }

    // ---- The night it sits in: a graded sky, stars, slow clouds, dark land out to the hills. ----------------------------
    function shade(w, h, paint) { var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex; }
    var skyTex = shade(8, 256, function (x, w, h) { var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#03060f'); g.addColorStop(.42, '#081329'); g.addColorStop(.5, '#16305a'); g.addColorStop(.56, '#0a1428'); g.addColorStop(1, '#050a16'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    mesh(new T.SphereGeometry(360, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }), 0, 0, 0);
    var starPts = [];
    for (var sn = 0; sn < 420; sn++) { var sa = sn * 2.39996, sy = .06 + ((sn * 73) % 100) / 108, sr = Math.sqrt(1 - sy * sy) * 340; starPts.push(Math.cos(sa) * sr, sy * 340, Math.sin(sa) * sr); }
    var starGeo = new T.BufferGeometry(); starGeo.setAttribute('position', new T.Float32BufferAttribute(starPts, 3));
    var stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xdbe9ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: .85, fog: false, depthWrite: false })); scene.add(stars);
    var glowTex = shade(64, 64, function (x) { var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
    function glow(colour, size, x, y, z, parent, strength) { var g = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: colour, transparent: true, opacity: strength || .55, blending: T.AdditiveBlending, depthWrite: false })); g.scale.set(size, size, 1); g.position.set(x, y, z); (parent || scene).add(g); return g; }
    var cloudTex = shade(256, 128, function (x) { for (var cb = 0; cb < 9; cb++) { var cx = 40 + (cb * 53) % 180, cy = 50 + (cb * 29) % 40, cr = 26 + (cb * 17) % 26, g = x.createRadialGradient(cx, cy, 0, cx, cy, cr); g.addColorStop(0, 'rgba(70,92,140,.5)'); g.addColorStop(1, 'rgba(70,92,140,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 128); } });
    var clouds = new T.Group(); scene.add(clouds);
    for (var cl = 0; cl < 7; cl++) { var ca0 = cl * .9 + .3, cs = new T.Sprite(new T.SpriteMaterial({ map: cloudTex, transparent: true, opacity: .75, fog: false, depthWrite: false })); cs.scale.set(150 + (cl % 3) * 44, 52 + (cl % 2) * 16, 1); cs.position.set(Math.cos(ca0) * 290, 70 + (cl * 13) % 60, Math.sin(ca0) * 290); clouds.add(cs); }
    var land = mesh(new T.CircleGeometry(340, 64), new T.MeshStandardMaterial({ color: 0x0c1526, roughness: .95, metalness: 0 }), 0, -.5, 0); land.rotation.x = -Math.PI / 2;
    var hillMat = new T.MeshBasicMaterial({ color: 0x0b1832, fog: false });
    for (var hl = 0; hl < 16; hl++) { var ha = hl * Math.PI / 8 + .2, hr = 250 + (hl % 3) * 18, hill = mesh(new T.SphereGeometry(1, 16, 8), hillMat, Math.cos(ha) * hr, -4, Math.sin(ha) * hr); hill.scale.set(26, 11 + (hl * 5) % 12, 74 + (hl * 7) % 30); hill.rotation.y = -ha; }

    // ---- Production value: a thin glowing edge on every block of every building, and kit on the roofs. --------------------
    var edgeMat = new T.LineBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: .85 }), edgeAmber = new T.LineBasicMaterial({ color: 0xffa060, transparent: true, opacity: .85 });
    function edges() { return; }
    function edgesOld(group, amber) {
      var list = []; group.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') { var p = o.geometry.parameters; if (p.width * p.height + p.height * p.depth > .5) list.push(o); } });
      list.forEach(function (o) { var l = new T.LineSegments(new T.EdgesGeometry(o.geometry), amber ? edgeAmber : edgeMat); o.add(l); });
    }
    var blinkers = [];
    function roofKit(group, amber) {
      group.updateMatrixWorld(true); var b = new T.Box3().setFromObject(group); if (!isFinite(b.max.y)) return;
      var top = b.max.y - group.position.y, w = b.max.x - b.min.x, d = b.max.z - b.min.z, cx = (b.max.x + b.min.x) / 2 - group.position.x, cz = (b.max.z + b.min.z) / 2 - group.position.z;
      var kit = new T.Group(); kit.position.set(cx, top, cz); group.add(kit); var ks = Math.max(1, Math.min(w, d) / 3); kit.scale.setScalar(ks); w /= ks; d /= ks;
      box(Math.min(.5, w * .2), .22, Math.min(.36, d * .2), mats.metal, -w * .22, .11, d * .18, kit);
      box(Math.min(.36, w * .15), .16, Math.min(.3, d * .18), mats.metal, w * .2, .08, -d * .15, kit);
      cylinder(.012, .02, .9, mats.metal, w * .3, .45, d * .25, kit, 6);
      var tipLight = sphere(.04, .04, .04, new T.MeshBasicMaterial({ color: amber ? 0xff5a2a : 0xff2a3a }), w * .3, .92, d * .25, kit); blinkers.push(tipLight);
      var dish = mesh(new T.SphereGeometry(.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), mats.metal, -w * .25, .24, -d * .22, kit); dish.rotation.x = -1.0;
    }

    // =====================================================================================================================
    // ---- The town, at full size: about 60 metres across inside the rail, with the server room tower at the north end, the
    //      boulevard from the gate to it, the avenue across, Isocore Gaming's district on the west, GridSync's circuit on the
    //      east, the staff headquarters and the studio at the back. Members' houses stand outside the rail in streets, one
    //      street for each squad or league. Everything that cannot be walked through is listed in SOLIDS.
    // =====================================================================================================================
    // Keep the furthest member booths well inside the seating bowl.  The outer
    // band is a continuous concourse rather than a decorative, unreachable ring.
    var R = 30.4, RO = R + 45, SOLIDS = [];
    function solidRect(x, z, w, d, rot) { SOLIDS.push([x, z, w / 2, d / 2, rot || 0]); }
    function solidCircle(x, z, r) { SOLIDS.push([x, z, r]); }
    function groupRect(g, w, d, ox, oz) { var c = Math.cos(g.rotation.y), s2 = Math.sin(g.rotation.y), lx = ox || 0, lz = oz || 0; solidRect(g.position.x + lx * c + lz * s2, g.position.z - lx * s2 + lz * c, w, d, g.rotation.y); }
    function sign(text, sub, w, h, colour, line) { return screen(text, sub, w, h, colour, line); }

    // ---- The ground: one great disc, a raised kerb, the rail, the light strip, the roads and their markings.
    cylinder(R + .3, R + .7, .8, mats.base, 0, -.42, 0, null, 120);
    cylinder(R + .15, R + .3, .12, mats.rim, 0, -.04, 0, null, 120);
    var mainGround = cylinder(R, R, .06, mats.floor, 0, .0, 0, null, 120);
    var townEdge = torus(R + .05, .12, mats.rim, 0, .08, 0); townEdge.rotation.x = -Math.PI / 2;
    var adCv = document.createElement('canvas'); adCv.width = 1024; adCv.height = 64; (function (g) { var w = 256; for (var i = 0; i < 4; i++) { var iso = i % 2 === 0; g.fillStyle = iso ? '#061a2e' : '#2a1206'; g.fillRect(i * w, 0, w, 64); g.fillStyle = iso ? '#4fc8f5' : '#ff9a4d'; g.fillRect(i * w, 0, w, 4); g.fillRect(i * w, 60, w, 4); g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(iso ? 'ISOCORE GAMING' : 'GRIDSYNC RACING', i * w + w / 2, 33); } })(adCv.getContext('2d'));
    var adTex = new T.CanvasTexture(adCv); adTex.colorSpace = T.SRGBColorSpace; adTex.wrapS = T.RepeatWrapping; adTex.repeat.set(-12, 1);            /* read from inside the arena */
    // Eight real openings in the LED boards connect the floor to the pods.
    // The old unbroken cylinder looked solid even where walking was allowed.
    var innerBoardMat = new T.MeshBasicMaterial({ map: adTex, side: T.DoubleSide });
    var gateSpan = Math.PI * 2 / 8, gateHalf = 2.8 / R;
    for (var eg = 0; eg < 8; eg++) {
      var startAngle = eg * gateSpan + gateHalf, arcAngle = gateSpan - 2 * gateHalf;
      mesh(new T.CylinderGeometry(R - .1, R - .1, 1, 22, 1, true, startAngle, arcAngle), innerBoardMat, 0, .62, 0);
      mesh(new T.CylinderGeometry(R - .1, R - .1, .10, 22, 1, true, startAngle, arcAngle), mats.metal, 0, 1.18, 0);
    }
    // the ring path just inside the rail, the boulevard (gate to tower) and the avenue (the two sides)
    var ringPath = torus(27.6, 1.0, mats.road, 0, .02, 0); ringPath.rotation.x = -Math.PI / 2; ringPath.scale.z = .02;
    box(4.4, .05, 15.6, mats.road, 0, .05, 19.2);                                  // boulevard, gate to helipad (z 27 to 11.4)
    box(4.4, .05, 15.6, mats.road, 0, .05, -7.2);                                  // boulevard, helipad to tower (z 0.6 to -15)
    box(15.1, .05, 3.2, mats.road, -12.95, .05, 6.0);                              // avenue, west (x -20.5 to -5.4)
    box(22.1, .05, 3.2, mats.road, 16.45, .05, 6.0);                               // avenue, east (x 5.4 to 27.5)
    // kerbs along the boulevard
    [-2.3, 2.3].forEach(function (kx) { box(.18, .14, 15.8, mats.rim, kx, .1, 18.5); box(.18, .14, 14.6, mats.rim, kx, .1, -7.0); });

    // ---- The plaza where the roads cross: a sunken court with a lit ring, benches and the post box.
    cylinder(5.4, 5.4, .08, mats.rim, 0, .08, 6.0, null, 64);
    var paintY = new T.MeshStandardMaterial({ color: 0x2f9fd6, roughness: .5 }), paintW = new T.MeshStandardMaterial({ color: 0xe8e8e0, roughness: .7 });
    var plazaRing = torus(4.6, .14, paintY, 0, .13, 6.0); plazaRing.rotation.x = -Math.PI / 2; plazaRing.scale.z = .1;
    
    var courtRing = torus(2.6, .08, new T.MeshStandardMaterial({ color: 0xe07a32, roughness: .5 }), 0, .14, 6.0); courtRing.rotation.x = -Math.PI / 2; courtRing.scale.z = .1;
    var plazaWall = cylinder(5.45, 5.45, .45, mats.rim, 0, .26, 6.0, null, 64, true); plazaWall.material = mats.rim.clone(); plazaWall.material.side = T.DoubleSide;
    [[-9.2, 2.3, Math.PI], [9.2, 2.3, Math.PI]].forEach(function (b) { var bg = new T.Group(); bg.position.set(b[0], .1, b[1]); bg.rotation.y = b[2]; scene.add(bg); box(2.4, .12, .6, mats.metal, 0, .55, 0, bg); box(2.4, .6, .1, mats.metal, 0, .9, -.28, bg); box(.12, .5, .5, mats.foot, -1.0, .27, 0, bg); box(.12, .5, .5, mats.foot, 1.0, .27, 0, bg); solidRect(b[0], b[1], 2.4, .8, b[2]); });

    // ---- The server room: his tower. A podium, a twenty-metre glass tower with set-backs, a crown and a mast.
    var home = placeGroup('home');
    box(10, 1.4, 10, mats.rim, 0, .7, 0, home);
    box(6.4, 14, 6.4, mats.base, 0, 8.4, 0, home);
    box(5.2, 5, 5.2, mats.base, 0, 17.9, 0, home);
    box(3.6, 2.2, 3.6, mats.dark, 0, 21.5, 0, home);
    [15.4, 20.4].forEach(function (y, i) { box(i ? 5.4 : 6.6, .25, i ? 5.4 : 6.6, mats.trim, 0, y, 0, home); });
    for (var hv = 0; hv < 4; hv++) { var hx = hv < 2 ? (hv ? 1 : -1) * 3.22 : 0, hz = hv >= 2 ? (hv === 2 ? 1 : -1) * 3.22 : 0; box(hv < 2 ? .14 : 6.5, 13.6, hv < 2 ? 6.5 : .14, mats.metal, hx, 8.4, hz, home); }
    box(.25, 7, .25, mats.metal, 0, 26.1, 0, home); var beacon = sphere(.28, .28, .28, mats.light, 0, 29.7, 0, home);
    glow(0xffe2b0, 5, 0, 22.8, 0, home, .18); glow(0xffe2b0, 4, 0, 3.0, 4.6, home, .2);
    box(3.2, 4.0, .3, mats.ink, 0, 3.4, 3.25, home); box(2.6, 3.4, .1, mats.trim, 0, 3.3, 3.42, home);          // his door
    box(5.4, .3, 2.4, mats.rim, 0, 5.6, 4.3, home); box(5.4, .08, .1, mats.trim, 0, 5.5, 5.5, home);              // the canopy over it
    var homeScreen = sign('SERVER ROOM', 'IG-GHOST // HOME', 4.6, 1.5); homeScreen.position.set(0, 7.4, 3.26); home.add(homeScreen);
    own('home'); groupRect(home, 10, 10);

    // ---- Isocore Gaming headquarters: a long low block with a giant screen, a wing, an entrance canopy and banners.
    var bar = placeGroup('barracks');
    box(13, .6, 9.4, mats.rim, 0, .3, 0, bar);
    box(11, 7.6, 7.6, mats.base, 0, 4.4, -.4, bar);
    box(4.6, 10.4, 5.4, mats.base, -3.6, 5.8, -1.4, bar);
    box(11.2, .3, 7.8, mats.roofBlue, 0, 8.35, -.4, bar); box(4.8, .3, 5.6, mats.roofBlue, -3.6, 11.15, -1.4, bar);
    box(7.6, 4.2, .3, mats.ink, 1.4, 4.6, 3.5, bar);
    var isoScreen = sign('ISOCORE', 'TACTICAL FPS', 7.2, 3.8); isoScreen.position.set(1.4, 4.6, 3.67); bar.add(isoScreen);
    box(4.2, 2.8, .2, mats.ink, -3.6, 1.6, 3.4, bar); box(3.6, 2.4, .1, mats.light, -3.6, 1.5, 3.52, bar);       // the doors
    box(5.6, .25, 2.6, mats.rim, -3.6, 3.3, 4.5, bar); box(5.6, .1, .1, mats.trim, -3.6, 3.2, 5.8, bar);
    [-6.2, 6.2].forEach(function (fx) { cylinder(.08, .08, 9, mats.metal, fx, 4.5, 4.4, bar, 8); box(1.4, 3.2, .05, mats.roofBlue, fx + (fx < 0 ? .75 : -.75), 7.2, 4.4, bar); });
    own('barracks'); groupRect(bar, 13, 9.4);

    // ---- The arena: a stadium bowl in three tiers, a lit pitch, four floodlight towers and the countdown board.
    var are = placeGroup('arena');
    [[6.9, 6.2, 1.6, 0], [6.4, 5.7, 1.6, 1.6], [5.9, 5.2, 1.4, 3.2]].forEach(function (t, i) {
      var tier = cylinder(t[0], t[1], t[2], mats.base, 0, t[3] + t[2] / 2, 0, are, 64, true); tier.material = mats.base.clone(); tier.material.side = T.DoubleSide;
      var lip = torus(t[0], .06, i === 2 ? mats.trim : mats.rim, 0, t[3] + t[2], 0, are); lip.rotation.x = -Math.PI / 2;
    });
    cylinder(5.0, 5.0, .08, mats.floor, 0, .05, 0, are, 64);
    var pitchRing = torus(1.4, .04, mats.light, 0, .1, 0, are); pitchRing.rotation.x = -Math.PI / 2;
    box(.06, .02, 9.4, mats.light, 0, .1, 0, are); box(6.4, .02, .06, mats.light, 0, .1, -4.1, are); box(6.4, .02, .06, mats.light, 0, .1, 4.1, are);
    var lamps = [];
    for (var fl = 0; fl < 4; fl++) {
      var fa = Math.PI / 4 + fl * Math.PI / 2, fx2 = Math.cos(fa) * 7.6, fz2 = Math.sin(fa) * 7.6;
      box(.3, 11, .3, mats.metal, fx2, 5.5, fz2, are);
      var bank = box(1.6, 1.0, .3, mats.off, fx2 * .96, 11.2, fz2 * .96, are); bank.rotation.y = -fa + Math.PI / 2; lamps.push(bank);
    }
    var boardCanvas = document.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 256;
    var boardTex = new T.CanvasTexture(boardCanvas); boardTex.colorSpace = T.SRGBColorSpace;
    var boardG = new T.Group(); boardG.position.set(6.8, 0, -4.6); boardG.rotation.y = .9; are.add(boardG);
    box(.25, 5.2, .25, mats.metal, -2.4, 2.6, 0, boardG); box(.25, 5.2, .25, mats.metal, 2.4, 2.6, 0, boardG);
    box(5.6, 2.9, .25, mats.ink, 0, 5.4, 0, boardG);
    var board = new T.Mesh(new T.PlaneGeometry(5.3, 2.65), new T.MeshBasicMaterial({ map: boardTex })); board.position.set(0, 5.4, .14); boardG.add(board);
    own('arena'); solidCircle(are.position.x, are.position.z, 7.1); solidRect(are.position.x + 6.8, are.position.z - 4.6, 1.4, 1.4, 0);
    function nextNightText() {
      if (world.live) return 'Live now';
      if (!world.next || world.next * 1000 <= Date.now()) return 'No upcoming session scheduled';
      return new Date(world.next * 1000).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function drawBoard() {
      var x = boardCanvas.getContext('2d'), txt = '';
      if (world.live) txt = 'LIVE NOW';
      else { var left = Math.round(world.next - Date.now() / 1000); if (world.next && left > 0) { var dd = Math.floor(left / 86400), hh = Math.floor(left % 86400 / 3600), mm = Math.floor(left % 3600 / 60); txt = dd ? dd + 'd ' + hh + 'h' : (hh ? hh + 'h ' + mm + 'm' : mm + 'm'); } }
      x.fillStyle = world.live ? '#ffd58a' : '#081a27'; x.fillRect(0, 0, 512, 256);
      x.strokeStyle = world.live ? '#07121b' : '#23799c'; x.lineWidth = 6; x.strokeRect(6, 6, 500, 244);
      x.fillStyle = world.live ? '#07121b' : '#76d6f3'; x.font = '600 34px sans-serif'; x.textAlign = 'center'; x.fillText(world.live ? 'GAME NIGHT' : (txt ? 'NEXT GAME NIGHT' : 'GAME NIGHTS'), 256, 70);
      x.fillStyle = world.live ? '#07121b' : '#e4f5fc'; x.font = '700 68px sans-serif'; x.fillText(txt || 'NOT SCHEDULED', 256, 152, 470);
      x.font = '600 24px sans-serif'; x.fillText(world.live ? 'GAME NIGHT IS UNDERWAY' : (txt ? nextNightText().toUpperCase() + ' · LOCAL TIME' : 'CHECK BACK FOR THE NEXT SESSION'), 256, 208, 460);
      boardTex.needsUpdate = true;
      lamps.forEach(function (l) { l.material = world.live ? mats.warm : mats.off; });
      flood.intensity = world.live ? 120 : 0;
    }

    // ---- The GridSync circuit: a proper track with a hairpin and a chicane, red and white kerbs, a start gantry with
    //      lights, the pit building in the infield and a covered grandstand along the main straight. Three cars lap it.
    var cir = placeGroup('circuit');
    var trackCurve = new T.CatmullRomCurve3([[-7.6, -3.6], [-3, -4.3], [2.5, -4.3], [6.4, -4.0], [7.9, -2.2], [7.6, .6], [5.4, 1.4], [3.6, .4], [2.0, 1.6], [3.0, 3.4], [1.2, 4.3], [-3.6, 4.2], [-7.0, 3.6], [-8.1, .2]].map(function (p) { return new T.Vector3(p[0], 0, p[1]); }), true, 'centripetal', .5);
    function ribbon(curve, off0, off1, y, mat, n, stripes) {
      var pos = [], col = [], idx = [], cA = new T.Color(0xd8312a), cB = new T.Color(0xf2f2f2);
      for (var i = 0; i <= n; i++) {
        var u = i / n, p = curve.getPointAt(u % 1), t2 = curve.getTangentAt(u % 1), nx = -t2.z, nz = t2.x;
        pos.push(p.x + nx * off0, y, p.z + nz * off0, p.x + nx * off1, y, p.z + nz * off1);
        if (stripes) { var cc = Math.floor(u * n / 2) % 2 ? cA : cB; col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); }
        if (i < n) { var a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (stripes) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      var uv = []; for (var k = 0; k <= n; k++) uv.push(k / 4, 0, k / 4, 1); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      var m = new T.Mesh(g, mat); m.userData.ribbon = true; cir.add(m); return m;
    }
    ribbon(trackCurve, -1.4, -.8, .1, mats.floor, 260);                                      // run-off
    ribbon(trackCurve, .8, 1.4, .1, mats.floor, 260);
    ribbon(trackCurve, -.8, .8, .12, mats.road, 260);                                        // the tarmac
    var kerbMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .6 });
    ribbon(trackCurve, -1.05, -.8, .14, kerbMat, 260, true); ribbon(trackCurve, .8, 1.05, .14, kerbMat, 260, true);
    ribbon(trackCurve, -.03, .03, .135, mats.white, 260).visible = false;
    // the start line and gantry on the main straight
    box(.3, .02, 1.6, mats.white, 0, .14, -4.3, cir);
    box(.25, 3.4, .25, mats.metal, 0, 1.7, -5.6, cir); box(.25, 3.4, .25, mats.metal, 0, 1.7, -3.0, cir); box(.4, .6, 2.9, mats.ink, 0, 3.5, -4.3, cir);
    var startLights = []; for (var sl = 0; sl < 5; sl++) startLights.push(sphere(.1, .1, .1, mats.red, .22, 3.5, -5.3 + sl * .5, cir));
    // the pit building in the infield, its screen facing the avenue
    box(8.6, 2.6, 2.2, mats.base, -.6, 1.4, -1.6, cir); box(8.8, .2, 2.6, mats.roofAmber, -.6, 2.8, -1.6, cir);
    for (var gd = 0; gd < 5; gd++) box(1.3, 1.7, .08, gd % 2 ? mats.ink : mats.dark, -4 + gd * 1.7, .95, -.48, cir);
    var gsScreen = sign('GRIDSYNC', 'SIM RACING', 4.4, 1.3, '#ff9a6b', '#a6471f'); gsScreen.position.set(-.6, 2.1, -2.72); gsScreen.rotation.y = Math.PI; cir.add(gsScreen);
    // the grandstand along the south side of the circuit, roofed, facing the track
    var stand = new T.Group(); stand.position.set(-1, 0, 6.3); cir.add(stand);
    for (var st = 0; st < 4; st++) box(11, .5, .9, mats.base, 0, .25 + st * .55, st * .8, stand);
    box(11, .2, 4.0, mats.roofAmber, 0, 4.2, 1.3, stand); box(.2, 4.2, .2, mats.metal, -5.3, 2.1, 3.0, stand); box(.2, 4.2, .2, mats.metal, 5.3, 2.1, 3.0, stand);
    // the cars: low, long, with a wing and a halo
    var cars = [];
    for (var cn = 0; cn < 3; cn++) {
      var car = new T.Group(); cir.add(car); var paint = [mats.grid, mats.trim, mats.white][cn];
      box(1.1, .16, .42, paint, 0, .2, 0, car); box(.42, .14, .3, mats.ink, -.06, .33, 0, car); box(.14, .2, .5, paint, -.55, .34, 0, car);
      box(.3, .04, .46, paint, .58, .14, 0, car);
      [[-.36, .24], [-.36, -.24], [.36, .24], [.36, -.24]].forEach(function (w) { var wh = cylinder(.12, .12, .12, mats.ink, w[0], .14, w[1], car, 12); wh.rotation.x = Math.PI / 2; });
      cars.push(car);
    }
    own('circuit'); solidRect(cir.position.x - .6, cir.position.z - 1.6, 8.8, 2.4, 0); solidRect(cir.position.x - 1, cir.position.z + 7.5, 11.2, 4.2, 0);
    solidRect(cir.position.x, cir.position.z - 4.3, .5, .5, 0); solidRect(cir.position.x, cir.position.z - 5.6, .5, .5, 0); solidRect(cir.position.x, cir.position.z - 3.0, .5, .5, 0);

    // ---- The squad clubhouse: two storeys, a terrace, the squads screen, facing the avenue.
    var social = placeGroup('rosters'); social.rotation.y = Math.PI / 2;
    box(8.4, .4, 6, mats.rim, 0, .2, 0, social);
    box(7.6, 6.2, 4.2, mats.base, 0, 3.5, -.7, social); box(7.8, .25, 4.4, mats.roofBlue, 0, 6.7, -.7, social);
    box(7.8, .2, 1.6, mats.rim, 0, 3.4, 2.0, social); box(7.8, .7, .08, mats.metal, 0, 3.8, 2.8, social);      // the terrace upstairs
    var socialScreen = sign('SQUADS', 'COMMUNITY CLUBHOUSE', 5.4, 1.5); socialScreen.position.set(0, 5.2, 1.43); social.add(socialScreen);
    box(2.0, 2.8, .2, mats.ink, 0, 1.6, 1.42, social); box(1.6, 2.4, .08, mats.light, 0, 1.5, 1.52, social);
    own('rosters'); groupRect(social, 8.4, 6);

    // ---- The broadcast studio: a glass-fronted block, two dishes and a tall mast with a warning light.
    var studio = placeGroup('broadcast');
    box(10, .4, 7, mats.rim, 0, .2, 0, studio);
    box(9, 6, 6, mats.base, 0, 3.4, -.3, studio); box(9.2, .25, 6.2, mats.roofBlue, 0, 6.5, -.3, studio);
    var studioScreen = sign('BROADCAST', 'COMMUNITY STREAMS', 5.6, 1.6); studioScreen.position.set(0, 4.4, 2.72); studio.add(studioScreen);
    box(3.0, 2.6, .2, mats.ink, 0, 1.5, 2.72, studio); box(2.6, 2.2, .08, mats.light, 0, 1.4, 2.82, studio);
    [[-2.6, -1.2], [2.4, -1.6]].forEach(function (d2, i) { box(.2, 1.2, .2, mats.metal, d2[0], 7.2, d2[1], studio); var dsh = mesh(new T.SphereGeometry(1.0 - i * .2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), mats.metal, d2[0], 7.9, d2[1], studio); dsh.rotation.x = -.9; dsh.rotation.z = i ? .5 : -.4; });
    box(.25, 10, .25, mats.metal, 3.8, 11.5, -2.6, studio); var mastLight = sphere(.25, .25, .25, mats.red, 3.8, 16.6, -2.6, studio);
    own('broadcast'); groupRect(studio, 10, 7);

    // ---- Staff headquarters: armoured, angular, gold-lit. A security booth and barrier out front, a searchlight, the flags.
    var staffMat = new T.MeshStandardMaterial({ color: 0x232c3e, roughness: .55, metalness: .5 }), gold = new T.MeshStandardMaterial({ color: 0xb8913e, emissive: 0xffa630, emissiveIntensity: .35, roughness: .5, metalness: .4 });
    var sh = placeGroup('staff');
    box(12, .6, 9, mats.rim, 0, .3, 0, sh);
    box(9.4, 6.6, 6.4, staffMat, 0, 3.9, -.4, sh);
    [[-4.7, 2.8], [4.7, 2.8], [-4.7, -3.6], [4.7, -3.6]].forEach(function (c) { var bt = box(1.6, 7.6, 1.6, mats.base, c[0], 4.4, c[1], sh); bt.rotation.y = Math.PI / 4; });   // the four corner bastions
    box(9.6, .3, 6.6, gold, 0, 7.35, -.4, sh); box(6.2, 2.4, 4.0, staffMat, 0, 8.6, -.6, sh); box(6.4, .2, 4.2, gold, 0, 9.9, -.6, sh);
    for (var fin = -3; fin <= 3; fin++) box(.12, 5.6, .14, gold, fin * 1.3, 3.9, 2.82, sh);
    var staffSign = sign('STAFF HQ', 'ISOCORE // GRIDSYNC', 5.2, 1.4, '#ffd58a', '#a8782a'); staffSign.position.set(0, 6.0, 2.92); sh.add(staffSign);
    box(2.6, 3.2, .3, mats.ink, 0, 2.2, 2.85, sh); box(2.2, 2.8, .1, gold, 0, 2.0, 3.02, sh);
    var booth = new T.Group(); booth.position.set(3.6, 0, 6.0); sh.add(booth); box(1.6, 2.4, 1.6, staffMat, 0, 1.5, 0, booth); box(1.4, .8, .05, mats.light, 0, 1.8, .82, booth); box(1.8, .15, 1.8, gold, 0, 2.75, 0, booth);
    box(4.0, .14, .14, mats.red, .9, 1.1, 6.0, sh); box(.3, 1.2, .3, staffMat, -1.2, .6, 6.0, sh);
    var searchlight = mesh(new T.ConeGeometry(2.2, 14, 24, 1, true), new T.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: .05, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 16.8, -.6, sh); searchlight.userData.fx = true; searchlight.userData.sweep = true;
    [-5.4, 5.4].forEach(function (fx, i) { cylinder(.1, .1, 10, mats.metal, fx, 5, 4.4, sh, 8); box(1.6, 1.0, .05, i ? mats.roofAmber : mats.roofBlue, fx + (i ? -.82 : .82), 9.3, 4.4, sh); });
    own('staff'); groupRect(sh, 12, 9); solidRect(sh.position.x + 3.6, sh.position.z + 6.0, 1.8, 1.8, 0);

    // ---- The post box on the plaza, and the gate: two great pylons, a lintel with the town's name, the members' door and
    //      the notice board on the pylons' faces.
    var post = placeGroup('post');
    cylinder(.42, .46, 1.9, mats.dark, 0, .95, 0, post, 24); sphere(.42, .26, .42, mats.dark, 0, 1.9, 0, post); cylinder(.5, .5, .1, mats.metal, 0, .05, 0, post, 24);
    var slot = box(.46, .08, .05, mats.warm, 0, 1.45, .42, post);
    own('post'); solidCircle(post.position.x, post.position.z, .7);
    var gate = placeGroup('gate');
    box(1.3, 7.2, 1.3, mats.base, -2.6, 3.6, 0, gate); box(1.3, 7.2, 1.3, mats.base, 2.6, 3.6, 0, gate);
    box(7.4, 1.1, 1.6, mats.rim, 0, 7.6, 0, gate); box(7.4, .12, 1.7, mats.trim, 0, 8.2, 0, gate);
    var gateSign = sign('ISOCORE', 'WELCOME TO THE TOWN', 5.6, 1.0); gateSign.position.set(0, 7.6, .82); gate.add(gateSign);
    box(.3, .3, .3, mats.light, -2.6, 6.4, .66, gate); box(.3, .3, .3, mats.light, 2.6, 6.4, .66, gate);
    own('gate'); solidRect(gate.position.x - 2.6, gate.position.z, 1.5, 1.5, 0); solidRect(gate.position.x + 2.6, gate.position.z, 1.5, 1.5, 0);
    var door = placeGroup('login'); box(1.0, 2.2, .1, mats.foot, 0, 1.2, 0, door); box(.82, 2.0, .05, mats.warm, 0, 1.2, .06, door); sphere(.06, .06, .06, mats.foot, .28, 1.2, .1, door); own('login');
    var notice = placeGroup('overview'); box(1.1, 1.5, .1, mats.foot, 0, 1.8, 0, notice); box(.94, 1.3, .05, mats.light, 0, 1.8, .06, notice); for (var nb = 0; nb < 4; nb++) box(.66, .07, .02, mats.ink, 0, 2.2 - nb * .26, .1, notice); own('overview');

    // ---- Two more districts, scenery that leads to the same pages: the FPS training range (Isocore Gaming) and the racing
    //      paddock (GridSync).
    function district(x, z, rot) { var g = new T.Group(); g.position.set(x, .04, z); g.rotation.y = rot || 0; scene.add(g); return g; }
    function districtLinks(group, place) { group.traverse(function (o) { if (o.isMesh) { o.userData.place = place; pickable.push(o); } }); }
    // Isocore Gaming's stall: a firing range. Four lanes, a shooting bench with a rifle and a screen at each, lane
    // dividers, steel targets at the far end and a blue canopy over the bench.
    var range = district(-21.5, -12.5, .5);
    box(7, .3, 5.6, mats.rim, 0, .15, 0, range); box(6.8, .1, 5.4, mats.road, 0, .32, 0, range);
    box(6.8, .9, .7, mats.dark, 0, .82, -1.4, range); box(6.9, .06, .8, mats.metal, 0, 1.29, -1.4, range);
    box(7.0, .12, 2.4, mats.roofBlue, 0, 3.1, -1.6, range); [-3.3, 3.3].forEach(function (cx) { box(.12, 2.8, .12, mats.metal, cx, 1.7, -2.6, range); box(.12, 2.8, .12, mats.metal, cx, 1.7, -.5, range); });
    var rangeScreen = sign('FIRING RANGE', 'ISOCORE GAMING', 3.4, .8); rangeScreen.position.set(0, 2.62, -.38); range.add(rangeScreen);
    for (var rt = 0; rt < 4; rt++) {
      var tx = -2.55 + rt * 1.7;
      if (rt) box(.06, 1.3, 2.0, mats.light, tx - .85, 1.0, -1.6, range);                                         // lane divider
      var gun = box(.12, .14, .7, mats.foot, tx, 1.42, -1.3, range); cylinder(.03, .03, .45, mats.metal, tx, 1.45, -.78, range, 8).rotation.x = Math.PI / 2; box(.06, .16, .1, mats.foot, tx, 1.3, -1.45, range);
      var ms = box(.5, .32, .03, mats.ink, tx + .45, 1.55, -1.72, range); ms.rotation.y = -.3;
      box(.9, .01, 4.0, rt % 2 ? mats.road : mats.floor, tx, .38, .7, range);                                      // lane
      box(.08, 1.4, .08, mats.metal, tx, 1.0, 2.4, range); box(.8, .8, .06, mats.white, tx, 1.9, 2.4, range);
      torus(.3, .03, mats.red, tx, 1.9, 2.44, range); torus(.14, .03, mats.red, tx, 1.9, 2.44, range);
    }
    districtLinks(range, 'barracks'); groupRect(range, 7, 5.6); range.userData.solid = SOLIDS[SOLIDS.length - 1];
    // GridSync's stall: sim racing. Two rows of three rigs, each a bucket seat on a frame, a wheel, pedals and three
    // curved screens, under an amber canopy.
    var paddock = district(22, -5, -.5);
    box(7.6, .3, 5.4, mats.rim, 0, .15, 0, paddock); box(7.4, .1, 5.2, mats.road, 0, .32, 0, paddock);
    box(7.8, .12, 5.6, mats.roofAmber, 0, 3.6, 0, paddock); [[-3.7, -2.6], [3.7, -2.6], [-3.7, 2.6], [3.7, 2.6]].forEach(function (c) { box(.12, 3.3, .12, mats.metal, c[0], 1.95, c[1], paddock); });
    var paddockScreen = sign('SIM RIGS', 'GRIDSYNC RACING', 3.4, .8, '#ff9a6b', '#a6471f'); paddockScreen.position.set(0, 3.1, 2.68); paddock.add(paddockScreen);
    var trackCv = document.createElement('canvas'); trackCv.width = 128; trackCv.height = 64; (function (g) { var gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#5a7fb0'); gr.addColorStop(.45, '#c9d8e8'); gr.addColorStop(.5, '#3d6b2e'); gr.addColorStop(1, '#2a4a20'); g.fillStyle = gr; g.fillRect(0, 0, 128, 64); g.fillStyle = '#333'; g.beginPath(); g.moveTo(52, 32); g.lineTo(76, 32); g.lineTo(120, 64); g.lineTo(8, 64); g.fill(); g.fillStyle = '#fff'; g.fillRect(62, 40, 4, 8); g.fillRect(61, 54, 6, 10); g.fillStyle = '#ff9a4d'; g.fillRect(4, 4, 30, 6); })(trackCv.getContext('2d'));
    var sideScreens = [], rigScreens = [], trackMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(trackCv) }); trackMat.map.colorSpace = T.SRGBColorSpace;
    for (var rg = 0; rg < 6; rg++) {
      var rgx = -2.4 + (rg % 3) * 2.4, rgz = rg < 3 ? -1.2 : 1.4, rig = new T.Group(); rig.position.set(rgx, .37, rgz); paddock.add(rig);
      box(.7, .08, 1.7, mats.metal, 0, .04, 0, rig); box(.56, .14, .6, mats.foot, 0, .32, .45, rig); var back = box(.56, .7, .12, mats.foot, 0, .62, .8, rig); back.rotation.x = -.35;
      box(.06, .5, .06, mats.metal, 0, .35, -.35, rig); var wh = torus(.16, .025, mats.foot, 0, .62, -.3, rig); wh.rotation.x = -.3; box(.36, .06, .14, mats.metal, 0, .12, -.68, rig);
      [-1, 0, 1].forEach(function (k) { var sc = box(.62, .38, .03, mats.foot, k * .6, .9, -.95 + Math.abs(k) * .16, rig); sc.rotation.y = -k * .5; var pic = mesh(new T.PlaneGeometry(.58, .34), trackMat, k * .6, .9, -.93 + Math.abs(k) * .16, rig); pic.rotation.y = -k * .5; sc.userData.rig = rg; pic.userData.rig = rg;
        if (k) { sideScreens.push({ mesh: pic, rig: rg, mat: null }); }
        if (!k) { var rcv = document.createElement('canvas'); rcv.width = 256; rcv.height = 144; var rtex = new T.CanvasTexture(rcv); rtex.colorSpace = T.SRGBColorSpace; rigScreens.push({ cv: rcv, tex: rtex, mat: new T.MeshBasicMaterial({ map: rtex }), mesh: pic, on: false }); } });
    }
    districtLinks(paddock, 'circuit'); groupRect(paddock, 7.6, 5.4); paddock.userData.solid = SOLIDS[SOLIDS.length - 1];

    // ---- Street lamps along the boulevard and the avenue, low bollards round the plaza, and lamps round the edge.
    var bollards = [];
    function streetLamp(x, z, face) {
      bollards.push([x, z, .3, 3.6]); solidCircle(x, z, .3);
      cylinder(.09, .13, 3.8, mats.foot, x, 1.9, z, null, 10);
      var ox = Math.cos(face) * .7, oz = Math.sin(face) * .7;
      var arm = box(1.5, .1, .1, mats.foot, x + ox / 2, 3.75, z + oz / 2); arm.rotation.y = -face;
      box(.5, .16, .3, mats.foot, x + ox, 3.7, z + oz); box(.4, .06, .22, mats.warm, x + ox, 3.6, z + oz);
      glow(0xffb45e, 2.6, x + ox, 3.5, z + oz, null, .55);
    }
    function bollard(x, z) { bollards.push([x, z, .2, 1.04]); solidCircle(x, z, .22); cylinder(.07, .09, .86, mats.foot, x, .51, z, null, 10); cylinder(.1, .1, .2, mats.warm, x, 1.04, z, null, 12); cylinder(.12, .12, .05, mats.foot, x, 1.165, z, null, 12); glow(0xffb45e, 1.5, x, 1.04, z, null, .55); }
    for (var lz = 16.5; lz > -12; lz -= 6.5) { if (Math.abs(lz - 6) > 6) { streetLamp(-3.0, lz, 0); streetLamp(3.0, lz, Math.PI); } }
    for (var lx = -18; lx < 27; lx += 6.5) { if (Math.abs(lx) > 6.5) { streetLamp(lx, 3.8, Math.PI / 2); if (lx < 5 || lx > 23) streetLamp(lx, 8.2, -Math.PI / 2); } }
    for (var pb = 0; pb < 12; pb++) { var pa = pb * Math.PI / 6 + Math.PI / 12; bollard(Math.cos(pa) * 5.9, 6.0 + Math.sin(pa) * 5.9); }
    for (var eb = 0; eb < 30; eb++) { var ea = eb * Math.PI / 15 + .1; bollard(Math.cos(ea) * (R - 1.0), Math.sin(ea) * (R - 1.0)); }

    // ---- One house for every member, outside the rail, in streets. Each squad or league on the Roster has its own street
    //      with its name on a sign at the end; members with no squad yet share their side's last street. Isocore Gaming's
    //      streets fan out to the west (blue roofs), GridSync's to the east (amber roofs). Drawn as instances.
    var HOMES_IN = 0, HOMES_MAX = 600, cube = new T.BoxGeometry(1, 1, 1), spot = new T.Object3D();
    var prism = (function () { var g = new T.BufferGeometry(), v = [-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5], ix = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]; g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setIndex(ix); g.computeVertexNormals(); return g; })();
    function instanced(mat, n, geo) { var im = new T.InstancedMesh(geo || cube, mat, n); im.count = 0; im.frustumCulled = false; scene.add(im); return im; }
    // A tiny shared screen texture and instanced hardware add detail without
    // loading a separate model or drawing each member booth individually.
    var monitorCanvas = document.createElement('canvas'); monitorCanvas.width = 128; monitorCanvas.height = 64;
    var mc = monitorCanvas.getContext('2d'); mc.fillStyle = '#071420'; mc.fillRect(0, 0, 128, 64); mc.fillStyle = '#263c4b'; mc.fillRect(4, 4, 120, 5); mc.fillStyle = '#73aebd'; mc.fillRect(9, 16, 65, 3); mc.fillRect(9, 24, 38, 2); mc.fillStyle = '#345969'; mc.fillRect(9, 35, 110, 2); mc.fillRect(9, 42, 82, 2); mc.fillStyle = '#1a3342'; mc.fillRect(84, 15, 34, 15);
    var monitorTex = new T.CanvasTexture(monitorCanvas); monitorTex.colorSpace = T.SRGBColorSpace;
    var mBody = instanced(mats.dark, HOMES_MAX * 3), mRoofB = instanced(mats.roofBlue, HOMES_MAX), mRoofA = instanced(mats.roofAmber, HOMES_MAX), mRoofP = instanced(mats.rim, 1), mWin = instanced(new T.MeshBasicMaterial({ color: 0xffffff, map: monitorTex }), HOMES_MAX * 3), mDoor = instanced(mats.foot, HOMES_MAX), mPath = instanced(mats.metal, HOMES_MAX + 40);
    var mPodFrames = instanced(mats.metal, HOMES_MAX * 6), mPodDetails = instanced(mats.foot, HOMES_MAX * 3);
    // Painted edge markers follow the actual member streets, so they guide
    // visitors to existing pods without adding obstacles to their routes.
    var pathBlue = instanced(new T.MeshStandardMaterial({ color: 0x298db5, emissive: 0x075275, emissiveIntensity: .35, roughness: .65 }), 80);
    var pathAmber = instanced(new T.MeshStandardMaterial({ color: 0xb66b35, emissive: 0x6a2d0c, emissiveIntensity: .35, roughness: .65 }), 80);
    var WARM = new T.Color(0xffb35c).multiplyScalar(1.3), CYAN = new T.Color(0xcfe8ff).multiplyScalar(1.8), curWin = WARM;
    function put(im, x, y, z, turn, w, h, d) { spot.position.set(x, y, z); spot.rotation.set(0, turn, 0); spot.scale.set(w, h, d); spot.updateMatrix(); if (im === mWin) im.setColorAt(im.count, curWin); im.setMatrixAt(im.count++, spot.matrix); }
    function putLocal(im, x, z, turn, lx, y, lz, w, h, d) { var c = Math.cos(turn), s = Math.sin(turn); put(im, x + lx * c + lz * s, y, z - lx * s + lz * c, turn, w, h, d); }
    var townHouses = [], built = '', housePos = [], houseTags = [], streetTags = [], boothSolids = [];
    function houseTag(name, at, who) {
      var c = document.createElement('canvas'); c.width = 256; c.height = 56; var x = c.getContext('2d');
      x.font = '700 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(5,10,22,.92)'; x.strokeText(name, 128, 30, 244); x.fillStyle = '#ffe2ad'; x.fillText(name, 128, 30, 244);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.userData.named = who; sp.userData.base = [4.2, .92]; sp.scale.set(4.2, .92, 1); sp.position.set(at.x, at.y + .9, at.z); scene.add(sp); houseTags.push(sp); pickable.push(sp);
    }
    function streetTag(text, sub, x, z, colour) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 128; var g = c.getContext('2d');
      g.fillStyle = 'rgba(6,14,24,.92)'; g.fillRect(0, 0, 512, 128); g.strokeStyle = colour; g.lineWidth = 6; g.strokeRect(4, 4, 504, 120);
      g.textAlign = 'center'; g.fillStyle = colour; g.font = '600 24px sans-serif'; g.fillText(sub, 256, 42); g.fillStyle = '#eaf6fc'; g.font = '700 46px sans-serif'; g.fillText(text, 256, 96, 480);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.userData.base = [5.6, 1.4]; sp.userData.street = true; sp.scale.set(5.6, 1.4, 1); sp.position.set(x, 4.2, z); scene.add(sp); streetTags.push(sp);
      var pole = cylinder(.08, .08, 3.4, mats.metal, x, 1.7, z, null, 8); pole.userData.streetPole = true; streetTags.push(pole);
    }
    // A street's archway: two pylons and a beam over the street where it leaves the rail, a hologram with the squad or league,
    // its game and its lead, and, when its members are on Discord, "3 OPERATORS ONLINE" above it.
    var archMatB = new T.MeshStandardMaterial({ color: 0x24405e, roughness: .7, metalness: .4 }), archMatA = new T.MeshStandardMaterial({ color: 0x8a4a1e, roughness: .7, metalness: .4 });
    function holo(lines, colour, w, h) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 64 + lines.length * 52; var g = c.getContext('2d');
      g.fillStyle = '#23271c'; g.fillRect(0, 0, 512, c.height); g.fillStyle = colour; g.fillRect(0, 0, 512, 12); g.fillRect(0, c.height - 12, 512, 12);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; for (var bx2 = 14; bx2 < 512; bx2 += 486) { g.beginPath(); g.arc(bx2, 26, 4, 0, 7); g.stroke(); g.beginPath(); g.arc(bx2, c.height - 26, 4, 0, 7); g.stroke(); }
      g.textAlign = 'center'; lines.forEach(function (l, k) { g.fillStyle = k === 0 ? '#efe4c2' : colour; g.font = (k === 0 ? '900 48px ' : '700 28px ') + 'Impact,"Arial Narrow",Arial,sans-serif'; g.fillText(l, 256, 64 + k * 52, 480); });
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(w, w * c.height / 512, 1); return sp;
    }
    function streetArch(st2, mid, side) {
      var colour = side === 'i' ? '#5aa0e8' : '#e8862e', mat = side === 'i' ? archMatB : archMatA, cosM = Math.cos(mid), sinM = Math.sin(mid), r0 = R + 2.6;
      var g = new T.Group(); g.position.set(cosM * r0, 0, sinM * r0); g.rotation.y = -mid + Math.PI / 2; scene.add(g); streetTags.push(g);
      box(.5, 5.4, .5, mat, -1.9, 2.7, 0, g); box(.5, 5.4, .5, mat, 1.9, 2.7, 0, g); box(4.6, .45, .5, mat, 0, 5.5, 0, g);
      var name = (st2[1] || (side === 'i' ? 'No squad yet' : 'No team yet')).toUpperCase();
      var lines = [name, (side === 'i' ? 'ISOCORE GAMING' : 'GRIDSYNC') + (st2[3] ? ' // ' + String(st2[3]).toUpperCase() : '')];
      if (st2[4]) lines.push((side === 'i' ? 'SQUAD LEAD: ' : 'LEAGUE LEAD: ') + String(st2[4]).toUpperCase());
      lines.push(st2[2] + (st2[2] === 1 ? ' MEMBER' : ' MEMBERS'));
      var sp = holo(lines, colour, 5.2); sp.position.set(cosM * r0, 7.4, sinM * r0); sp.userData.base = [5.2, sp.scale.y]; sp.userData.street = true; scene.add(sp); streetTags.push(sp);
      if (st2[5] > 0) { var on = holo([st2[5] + (st2[5] === 1 ? ' OPERATOR ONLINE' : ' OPERATORS ONLINE')], '#6fe08a', 4.6); on.position.set(cosM * r0, 9.6, sinM * r0); on.userData.base = [4.6, on.scale.y]; on.userData.street = true; scene.add(on); streetTags.push(on); }
    }
    var sideTown = { i: [], g: [] }, townNamed = [], instNamed = [], BOOTH_ROWS = 6;
    function growTown() {
      var want = { i: Math.max(0, world.sides.i), g: Math.max(0, world.sides.g) };
      router = null;
      var sig = want.i + '|' + want.g + '|' + JSON.stringify(world.streets) + '|' + world.houses.map(function (h) { return h.s + h.q + h.c + h.n; }).join(',');
      if (sig === built) return; built = sig;
      if (arenaMode) { [mBody, mRoofB, mRoofA, mWin, mDoor, mPath, mPodFrames, mPodDetails, pathBlue, pathAmber].forEach(function (im) { im.count = 0; }); boothSolids = []; housePos = []; if (cityReady) { try { cityHomes(); } catch (e) {} } return; }
      [mBody, mRoofB, mRoofA, mWin, mDoor, mPath, mPodFrames, mPodDetails, pathBlue, pathAmber].forEach(function (im) { im.count = 0; });
      houseTags.concat(streetTags).forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.isGroup) sp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); var pi = pickable.indexOf(sp); if (pi >= 0) pickable.splice(pi, 1); }); houseTags = []; streetTags = [];
      housePos = []; townNamed = []; instNamed = []; boothSolids = [];
      // the streets of each side: the server's list where there is one, otherwise one street a side
      var streets = world.streets.length ? world.streets.slice() : [['i', '', want.i], ['g', '', want.g]];
      ['i', 'g'].forEach(function (side) {
        var mine = []; streets.forEach(function (s3, idx) { if (s3[0] === side) mine.push(idx); });
        var named = {}; world.houses.forEach(function (h, idx) { if (h.s !== side) return; var q = mine.indexOf(h.q) >= 0 ? h.q : (mine.length ? mine[mine.length - 1] : -1); (named[q] = named[q] || []).push(idx); });
        var total = 0; mine.forEach(function (q) { total += Math.max(streets[q][2], (named[q] || []).length); });
        if (!total) return;
        var lo = side === 'i' ? Math.PI / 2 + .12 : -Math.PI / 2 + .12, span = Math.PI - .24, a0 = lo;
        mine.forEach(function (q) {
          var n = Math.max(streets[q][2], (named[q] || []).length); if (!n) return;
          var share = Math.max(.16, span * n / total), mid = a0 + share / 2, half = share / 2; a0 += share;
          var who = named[q] || [], k = 0, row = 0, cosM = Math.cos(mid), sinM = Math.sin(mid);
          // the street itself: a road running out from the rail, and its sign
          var len = Math.min(RO - R - 3.5, 8 + Math.ceil(n / 4) * 3.6);
          spot.position.set(cosM * (R + 1.6 + len / 2), .02, sinM * (R + 1.6 + len / 2)); spot.rotation.set(0, -mid, 0); spot.scale.set(len, .06, 2.4); spot.updateMatrix(); mPath.setMatrixAt(mPath.count++, spot.matrix);
          var routeMat = side === 'i' ? pathBlue : pathAmber, routeMid = R + 1.6 + len / 2;
          [-1, 1].forEach(function (edge) { if (routeMat.count < 80) put(routeMat, cosM * routeMid - sinM * edge * 1.02, .058, sinM * routeMid + cosM * edge * 1.02, -mid, len, .012, .045); });
          if (streetTags.length < 120) streetArch(streets[q], mid, side); curWin = streets[q][5] > 0 ? CYAN : WARM;
          while (k < n && mBody.count < HOMES_MAX * 3 && row < BOOTH_ROWS) {
            // Reserve a clear centre aisle along each squad/league street,
            // even when all six rows of booths are populated.
            var r = R + 4.4 + row * 5.0, maxOff = half * r - 1.6, perSide = Math.max(1, Math.floor((maxOff - 1.4) / 3.2));
            for (var c3 = 0; c3 < perSide * 2 && k < n && mBody.count + 3 <= HOMES_MAX * 3; c3++, k++) {
              var off = ((Math.floor(c3 / 2) + .5) * 3.2 + 1.4) * (c3 % 2 ? 1 : -1), ang = mid + off / r;
              var x = Math.cos(ang) * r, z = Math.sin(ang) * r, h = 2.0 + ((k * 7 + q) % 4) * .45, w = 2.3 + (k % 3) * .25, d = 2.2;
              var fx = -Math.sin(ang) * (off > 0 ? -1 : 1), fz = Math.cos(ang) * (off > 0 ? -1 : 1);          // the front faces the street
              var turn = Math.atan2(fx, fz);
              var idx2 = k < who.length ? who[k] : -1;
              // Keep visitors on the walkways instead of walking through a pod.
              boothSolids.push([x, z, w / 2, d / 2, turn]);
              // a gaming booth: a back wall with two screens, side walls, a desk, a chair, and a canopy in the side's colour
              h = 2.5; var bx = x - fx * (d / 2 - .1), bz = z - fz * (d / 2 - .1);
              instNamed[mBody.count] = idx2; put(mBody, bx, h / 2, bz, turn, w, h, .2);
              instNamed[mBody.count] = idx2; put(mBody, x - fz * (w / 2 - .06), .7, z + fx * (w / 2 - .06), turn, .12, 1.4, d);
              instNamed[mBody.count] = idx2; put(mBody, x + fz * (w / 2 - .06), .7, z - fx * (w / 2 - .06), turn, .12, 1.4, d);
              put(mPath, x - fx * (d / 2 - .55), .74, z - fz * (d / 2 - .55), turn, w - .3, .08, .7);
              put(side === 'i' ? mRoofB : mRoofA, x, h + .06, z, turn, w + .2, .12, d + .1);
              put(mWin, bx + fx * .12 - fz * .55, 1.45, bz + fz * .12 + fx * .55, turn, .9, .55, .03);
              put(mWin, bx + fx * .12 + fz * .55, 1.45, bz + fz * .12 - fx * .55, turn, .9, .55, .03);
              [-1, 1].forEach(function (s) { [-1, 1].forEach(function (t) { putLocal(mPodFrames, x, z, turn, s * (w / 2 - .08), 1.25, t * (d / 2 - .08), .08, 2.5, .08); }); });
              [-.55, .55].forEach(function (sx) { putLocal(mPodFrames, x, z, turn, sx, 1.45, -d / 2 + .16, 1.0, .64, .05); });
              putLocal(mDoor, x, z, turn, 0, .88, .28, .58, .9, .13);
              putLocal(mPodDetails, x, z, turn, 0, .48, .44, .6, .12, .65);
              putLocal(mPodDetails, x, z, turn, 0, .23, .44, .12, .45, .12);
              putLocal(mPodDetails, x, z, turn, 0, .06, .44, .55, .08, .55);
              var at = { x: x, y: h + 1.2, z: z, approachX: Math.cos(ang) * (r + 2.1), approachZ: Math.sin(ang) * (r + 2.1) };
              if (idx2 >= 0) { housePos[idx2] = at; if (houseTags.length < 60) houseTag(world.houses[idx2].n, at, idx2); }
            }
            row++;
          }
        });
      });
      [mBody, mRoofB, mRoofA, mWin, mDoor, mPath, mPodFrames, mPodDetails, pathBlue, pathAmber].forEach(function (im) { im.instanceMatrix.needsUpdate = true; }); if (mWin.instanceColor) mWin.instanceColor.needsUpdate = true;
      mBody.computeBoundingSphere();
      var all = want.i + want.g;
      if (homesLine) homesLine.textContent = all ? 'One gaming booth for every member: ' + want.i + ' on the Isocore Gaming side (blue canopies) and ' + want.g + ' on the GridSync side (amber canopies). Each new member adds one.' : '';
      if (housesBox) {
        housesBox.hidden = !world.houses.length; var cnt = document.getElementById('ghostHousesN'); if (cnt) cnt.textContent = world.houses.length;
        ['i', 'g'].forEach(function (side) {
          var list = housesBox.querySelector('.ghost-houses-list[data-side="' + side + '"]'), head = housesBox.querySelector('.ghost-houses-side[data-side="' + side + '"]'), any = false; if (!list) return; list.textContent = '';
          world.houses.forEach(function (hs) { if (hs.s !== side) return; any = true; var a = document.createElement('a'); a.href = '#player-' + hs.c; a.textContent = hs.n; list.appendChild(a); });
          list.hidden = !any; if (head) head.hidden = !any;
        });
      }
      if (typeof freshen === 'function' && typeof renderer !== 'undefined') freshen();
    }
    var houseWin = [];
    pickable.push(mBody);
    // The buildings get their glow and their roof kit once they are all built.
    if (lastPlace && lastPlace.solidTo === undefined) { lastPlace.solidTo = SOLIDS.length; lastPlace.sceneTo = scene.children.length; }
    // An eSports arena has booths, not buildings: each big building is put away (hidden, not walked into, not tapped) and
    // a booth stands on its spot instead, facing where you arrive, with room to walk all round it.
    var BOOTHS = { home: ['IG-GHOST', 'THE SERVER ROOM', '#76d6f3', 7.6], barracks: ['ISOCORE GAMING', 'TACTICAL FPS', '#4fc8f5', 7.0], circuit: ['GRIDSYNC', 'SIM RACING', '#ff9a4d', 7.0],
      arena: ['MAIN STAGE', 'MATCHES + RESULTS', '#e4f5fc', 9.0], rosters: ['SQUADS', 'COMMUNITY CLUBHOUSE', '#4fc8f5', 6.4], broadcast: ['BROADCAST', 'COMMUNITY STREAMS', '#c38bff', 6.4], staff: ['STAFF HQ', 'ISOCORE // GRIDSYNC', '#ffd58a', 6.4] };
    var placeGroups = Object.keys(PLACES).map(function (k) { return PLACES[k].group; });
    Object.keys(BOOTHS).forEach(function (id) {
      var p = PLACES[id]; if (!p || !p.group) return;
      p.group.visible = false; p.group.traverse(function (o) { var pi = pickable.indexOf(o); if (pi >= 0) pickable.splice(pi, 1); });
      for (var ci = p.sceneFrom; ci < p.sceneTo; ci++) { var ch = scene.children[ci]; if (ch && placeGroups.indexOf(ch) < 0 && !ch.isLight) { ch.visible = false; ch.userData.gone = true; } }
      for (var si = p.solidFrom; si < p.solidTo; si++) { var o = SOLIDS[si]; o[0] = 9999; o[1] = 9999; }
      var b = BOOTHS[id], W = b[3], D = 4.4, rot = Math.atan2(p.at[0] - p.x, p.at[1] - p.z), g = new T.Group(); g.position.set(p.x, .04, p.z); g.rotation.y = rot; scene.add(g);
      var col = new T.Color(b[2]), canopy = new T.MeshStandardMaterial({ color: col.clone().multiplyScalar(.55), roughness: .6, metalness: .3 }), glowM = new T.MeshBasicMaterial({ color: col });
      box(W, .16, D, mats.rim, 0, .08, 0, g); box(W, .03, .08, glowM, 0, .18, D / 2, g);
      box(W, 3.4, .2, mats.dark, 0, 1.86, -D / 2 + .1, g); box(.16, 2.2, D, mats.dark, -W / 2 + .08, 1.26, 0, g); box(.16, 2.2, D, mats.dark, W / 2 - .08, 1.26, 0, g);
      box(W + .3, .18, D + .3, canopy, 0, 3.66, 0, g); box(W + .32, .06, .06, glowM, 0, 3.56, D / 2 + .15, g);
      var sg = sign(b[0], b[1], Math.min(W - 1.2, 5.6), 1.4, b[2], b[2]); sg.position.set(0, 2.6, -D / 2 + .22); g.add(sg);
      box(W * .55, .9, .7, mats.base, 0, .61, .6, g); box(W * .55 + .1, .06, .8, mats.metal, 0, 1.08, .6, g);
      [-1, 1].forEach(function (k2) { var mon = box(.9, .55, .04, mats.foot, k2 * W * .14, 1.5, .45, g); var scr = box(.84, .49, .01, glowM, k2 * W * .14, 1.5, .48, g); box(.55, .9, .55, mats.foot, k2 * W * .14, .55, -.45, g); });
      g.traverse(function (o) { if (o.isMesh) { o.userData.place = id; pickable.push(o); } });
      solidRect(p.x, p.z, W + .2, D + .2, rot); p.boothSolid = SOLIDS[SOLIDS.length - 1];
      p.top = 5.2; p.booth = g;
    });
    ['home', 'barracks', 'circuit', 'arena', 'rosters', 'broadcast', 'staff'].forEach(function (id) { var g = PLACES[id] && PLACES[id].group; if (!g) return; var amber = id === 'circuit'; edges(g, amber); if (id !== 'arena' && id !== 'circuit') roofKit(g, amber); });
    if (PLACES.gate && PLACES.gate.group) edges(PLACES.gate.group, false);

    // Give the main stage a proper layered fascia and overhead rig while
    // keeping all of the added geometry inside its existing collision bounds.
    var mainStage = PLACES.arena && PLACES.arena.booth;
    if (mainStage) {
      var stageTrim = new T.MeshStandardMaterial({ color: 0x657987, metalness: .7, roughness: .35 });
      var stageAccent = new T.MeshStandardMaterial({ color: 0x237ea5, emissive: 0x0a405b, emissiveIntensity: .5, metalness: .45, roughness: .4 });
      [-1, 1].forEach(function (side) {
        box(.22, 3.4, .24, stageTrim, side * 4.18, 1.9, 1.91, mainStage);
        box(.06, 2.65, .08, stageAccent, side * 3.96, 1.8, 1.98, mainStage);
        box(1.12, 1.7, .18, mats.foot, side * 3.25, 1.45, -1.89, mainStage);
        for (var speaker = 0; speaker < 3; speaker++) { var cone = cylinder(.25, .25, .04, mats.rim, side * 3.25, .94 + speaker * .51, -1.77, mainStage, 20); cone.rotation.x = Math.PI / 2; }
      });
      box(8.6, .13, .3, stageTrim, 0, 3.94, 1.75, mainStage);
      for (var rig = -3; rig <= 3; rig++) box(.32, .12, .28, mats.light, rig * 1.1, 3.84, 1.76, mainStage);
      mainStage.traverse(function (o) { if (o.isMesh && !o.userData.place) { o.userData.place = 'arena'; pickable.push(o); } });
      // The original countdown lived on the hidden legacy arena. Put the
      // same, real site-fed board where visitors can actually see and tap it.
      box(5.5, 2.6, .18, mats.foot, 0, 5.38, 1.5, mainStage);
      var nightScreen = mesh(new T.PlaneGeometry(5.2, 2.35), new T.MeshBasicMaterial({ map: boardTex }), 0, 5.38, 1.61, mainStage);
      nightScreen.userData.gameNight = true; pickable.push(nightScreen);
    }


    // ---- The arena: a roof truss ring high over the floor with moving stage lights, the centre-hung screen over the
    //      plaza, stalls round the edge, crowd barriers at the doors, turnstiles at the gate and team banners.
    var sweepers = [];
    function rnd2(seed) { var s5 = seed >>> 0; return function () { s5 = (s5 * 1664525 + 1013904223) >>> 0; return s5 / 4294967296; }; }
    var TRUSS_Y = 22, bowlFrom = scene.children.length;
    var trussA = torus(RO + .6, .22, mats.metal, 0, TRUSS_Y, 0); trussA.rotation.x = -Math.PI / 2;
    var trussB = torus(RO + .6, .16, mats.metal, 0, TRUSS_Y - .9, 0); trussB.rotation.x = -Math.PI / 2;
    for (var tc = 0; tc < 8; tc++) { var ta = (tc + .5) * Math.PI / 4; box(.5, TRUSS_Y + 6, .5, mats.rim, Math.cos(ta) * (RO + 1.4), (TRUSS_Y + 6) / 2, Math.sin(ta) * (RO + 1.4)); }
    // The outer concourse is deliberately wider than the maximum six pod rows.
    // It remains clear of furniture and collision boxes all the way around.
    var outerFloor = mesh(new T.RingGeometry(R + .7, RO, 120, 1), mats.floor, 0, .015, 0); outerFloor.rotation.x = -Math.PI / 2;
    var concourseCanvas = document.createElement('canvas'); concourseCanvas.width = concourseCanvas.height = 256;
    var ccx = concourseCanvas.getContext('2d'), crand = rnd2(177);
    ccx.fillStyle = '#64727d'; ccx.fillRect(0, 0, 256, 256);
    for (var gr = 0; gr < 1200; gr++) { var cv = 130 + Math.floor(crand() * 100); ccx.fillStyle = 'rgba(' + cv + ',' + cv + ',' + cv + ',.09)'; ccx.fillRect(crand() * 256, crand() * 256, 1 + crand() * 2, 1 + crand() * 2); }
    ccx.strokeStyle = 'rgba(20,28,35,.55)'; ccx.lineWidth = 2; ccx.strokeRect(0, 0, 256, 256); ccx.beginPath(); ccx.moveTo(128, 0); ccx.lineTo(128, 256); ccx.moveTo(0, 128); ccx.lineTo(256, 128); ccx.stroke();
    var concourseTex = new T.CanvasTexture(concourseCanvas); concourseTex.colorSpace = T.SRGBColorSpace; concourseTex.wrapS = concourseTex.wrapT = T.RepeatWrapping; concourseTex.repeat.set(22, 22); concourseTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    var concourseMat = new T.MeshStandardMaterial({ color: 0xa0aab3, map: concourseTex, roughness: .76, metalness: .18, side: T.DoubleSide });
    mainGround.material = concourseMat;
    // A locally hosted photographic concrete albedo improves the floor on
    // both desktop and mobile. The procedural surface above remains a safe
    // fallback if the optional image cannot be loaded.
    new T.TextureLoader().load(ISOCORE_ASSET_BASE + 'assets/arena-materials/concrete-floor.webp', function (photo) {
      photo.colorSpace = T.SRGBColorSpace; photo.wrapS = photo.wrapT = T.RepeatWrapping;
      photo.repeat.set(22, 22); photo.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      concourseMat.map = photo; concourseMat.color.setHex(0xd0d5da); concourseMat.needsUpdate = true;
      if (typeof still === 'function') still();
    }, undefined, function () { /* keep the local procedural fallback */ });
    var concourse = mesh(new T.RingGeometry(R + 32.2, RO - 1.3, 160, 1), concourseMat, 0, .035, 0); concourse.rotation.x = -Math.PI / 2;
    var wayfinding = new T.MeshStandardMaterial({ color: 0x8da0ab, roughness: .7, metalness: .2 });
    [R + 32.5, RO - 1.65].forEach(function (r) { var marking = torus(r, .045, wayfinding, 0, .07, 0); marking.rotation.x = -Math.PI / 2; });
    var outerAds = cylinder(RO, RO, 1.4, new T.MeshBasicMaterial({ map: adTex, side: T.DoubleSide }), 0, .8, 0, null, 160, true);
    // Concrete terraces, individual seats and a steel canopy give the arena
    // depth without thousands of separate draw calls on mobile hardware.
    var seatMat = new T.MeshStandardMaterial({ color: 0x48515a, roughness: .91, metalness: .05, side: T.DoubleSide }), seatMat2 = new T.MeshStandardMaterial({ color: 0x58626b, roughness: .86, metalness: .08, side: T.DoubleSide });
    for (var tier = 0; tier < 10; tier++) { var rr = RO + .2 + tier * 1.3, yy = 1.5 + tier * .9; var tread = mesh(new T.RingGeometry(rr, rr + 1.3, 120, 1), tier % 2 ? seatMat : seatMat2, 0, yy, 0); tread.rotation.x = -Math.PI / 2; cylinder(rr, rr, .9, seatMat, 0, yy - .45, 0, null, 120, true); }
    cylinder(RO + 13.3, RO + 13.3, 14, seatMat, 0, 7, 0, null, 120, true);
    var seatCount = 9 * 256, seatShell = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0x263644, emissiveIntensity: .25, roughness: .72, metalness: .24 });
    var seatBases = new T.InstancedMesh(new T.BoxGeometry(.8, .12, .72), seatShell, seatCount);
    var seatBacks = new T.InstancedMesh(new T.BoxGeometry(.8, .78, .12), seatShell, seatCount);
    var seatDummy = new T.Object3D(), seatColour = new T.Color(), seatN = 0;
    for (var sr = 0; sr < 9; sr++) for (var sc = 0; sc < 256; sc++) {
      // Leave visible aisles for circulation through the stands.
      if (sc % 32 < 2) continue;
      var sa2 = (sc + .5 * (sr % 2)) * Math.PI * 2 / 256, rad = RO + 1.0 + sr * 1.3, sy2 = 1.5 + sr * .9;
      seatDummy.rotation.set(0, -sa2, 0); seatDummy.position.set(Math.sin(sa2) * rad, sy2 + .2, Math.cos(sa2) * rad); seatDummy.updateMatrix(); seatBases.setMatrixAt(seatN, seatDummy.matrix);
      seatDummy.position.set(Math.sin(sa2) * (rad + .3), sy2 + .58, Math.cos(sa2) * (rad + .3)); seatDummy.updateMatrix(); seatBacks.setMatrixAt(seatN, seatDummy.matrix);
      seatColour.setHex(sc % 37 === 0 ? 0x4b7892 : (sr % 3 === 0 ? 0x52616e : 0x394a58)); seatBases.setColorAt(seatN, seatColour); seatBacks.setColorAt(seatN, seatColour); seatN++;
    }
    seatBases.count = seatBacks.count = seatN; seatBases.instanceMatrix.needsUpdate = seatBacks.instanceMatrix.needsUpdate = true;
    if (seatBases.instanceColor) seatBases.instanceColor.needsUpdate = true; if (seatBacks.instanceColor) seatBacks.instanceColor.needsUpdate = true;
    scene.add(seatBases); scene.add(seatBacks);
    var roofMat = new T.MeshStandardMaterial({ color: 0x26343f, roughness: .65, metalness: .5, side: T.DoubleSide });
    var roof = mesh(new T.RingGeometry(RO + 1.5, RO + 15.0, 128, 1), roofMat, 0, TRUSS_Y + 1.3, 0); roof.rotation.x = Math.PI / 2;
    var roofInner = torus(RO + 1.8, .18, mats.metal, 0, TRUSS_Y + .8, 0); roofInner.rotation.x = -Math.PI / 2;
    var roofOuter = torus(RO + 14.7, .18, mats.metal, 0, TRUSS_Y + .8, 0); roofOuter.rotation.x = -Math.PI / 2;
    var roofLights = new T.MeshBasicMaterial({ color: 0xd6eaff });
    for (var rb = 0; rb < 32; rb++) {
      var ra = rb * Math.PI * 2 / 32, rm = RO + 8.1;
      var beam2 = box(13.0, .35, .38, mats.metal, Math.cos(ra) * rm, TRUSS_Y + .72, Math.sin(ra) * rm); beam2.rotation.y = -ra;
      var fixture = box(1.7, .1, .4, roofLights, Math.cos(ra) * (RO + 3.0), TRUSS_Y + .5, Math.sin(ra) * (RO + 3.0)); fixture.rotation.y = -ra;
    }
    // Four shadow-free architectural washes illuminate the public concourse
    // and seating without the expense of a spotlight for every roof fixture.
    var concourseLights = [];
    for (var wl = 0; wl < 4; wl++) {
      var wa = wl * Math.PI / 2, wash = new T.PointLight(0xc8e2ff, 1100, 60, 2);
      wash.position.set(Math.sin(wa) * (RO - 6), 11, Math.cos(wa) * (RO - 6)); scene.add(wash); concourseLights.push(wash);
    }
    // Distant sector panels and vertical support ribs make the outer bowl
    // read as an actual venue from the accessible walkway.
    var sectorGlass = new T.MeshStandardMaterial({ color: 0x254253, emissive: 0x0b2633, emissiveIntensity: .5, roughness: .45, metalness: .4 });
    for (var sp2 = 0; sp2 < 16; sp2++) {
      var aa2 = sp2 * Math.PI * 2 / 16, ss = RO + 13.0;
      var rib = box(.6, 13.0, .6, mats.metal, Math.sin(aa2) * ss, 7.0, Math.cos(aa2) * ss); rib.rotation.y = aa2;
      var panel2 = box(5.2, 2.1, .15, sectorGlass, Math.sin(aa2) * (RO + 12.5), 12.2, Math.cos(aa2) * (RO + 12.5)); panel2.rotation.y = aa2;
    }
    // everything above that makes the stands, so a real arena model can take their place (the floor, the concourse, the
    // boards round the bottom and the lights stay)
    var bowlParts = scene.children.slice(bowlFrom).filter(function (o) { return o !== outerFloor && o !== concourse && o !== outerAds && !o.isLight && o.material !== wayfinding; });
    if (world.models.arena) bowlParts.forEach(function (o) { o.visible = false; });
    function stageLight(a, colour) {
      var x = Math.cos(a) * (RO + .4), z = Math.sin(a) * (RO + .4);
      cylinder(.28, .2, .5, mats.foot, x, TRUSS_Y - 1.3, z, null, 10);
      var beam = mesh(new T.ConeGeometry(2.6, 22, 18, 1, true), new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: .06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, -11, 0);
      var pivot = new T.Group(); pivot.position.set(x, TRUSS_Y - 1.4, z); scene.add(pivot); var tilt = new T.Group(); tilt.rotation.x = -.55; pivot.add(tilt); tilt.add(beam); beam.userData.fx = true;
      sweepers.push([pivot, -a + Math.PI / 2, sweepers.length]);
    }
    for (var sl = 0; sl < 8; sl++) stageLight(sl * Math.PI / 4 + Math.PI / 8, sl % 2 ? 0xffa45c : 0x58c8ff);
    // the centre-hung screen: four faces with the score between the two sides, hung on cables from the truss
    var jumbo = new T.Group(); jumbo.position.set(0, 15.5, 6.0); scene.add(jumbo);
    var jCv = document.createElement('canvas'); jCv.width = 512; jCv.height = 256; var jTex = new T.CanvasTexture(jCv); jTex.colorSpace = T.SRGBColorSpace;
    var jCv2 = document.createElement('canvas'); jCv2.width = 512; jCv2.height = 256; var jTex2 = new T.CanvasTexture(jCv2); jTex2.colorSpace = T.SRGBColorSpace;
    var jLast = [0, 0];
    function okStream(sm) { if (Array.isArray(sm)) { for (var i = 0; i < sm.length; i++) { var o = okStream(sm[i]); if (o) return o; } return null; } return sm && sm.login && /^[a-z0-9_]{2,25}$/i.test(sm.login) ? sm : null; }
    function liveStream() { var st = (world.extra || {}).stream || {}; return okStream(st.iso) || okStream(st.gs); }
    // The stream on Ghost's side or Echo's side. When the Owner is broadcasting from one of their seats, his stream belongs to that
    // side, whichever side his Twitch account is filed under (README-ADMIN 263).
    function sideStream(w) {
      var st = (world.extra || {}).stream || {}, base = okStream(w === 'ghost' ? st.iso : st.gs), oa = (typeof inSuite !== 'undefined' && inSuite) || (world.extra || {}).onair || '';
      if (!oa) return base; var any = liveStream();
      if (w === oa) return base || any;
      return base && any && base.login === any.login ? null : base;
    }
    // All the screens are connected: every live member, Isocore Gaming first, shared out in turn. With one member live
    // every screen shows them; with two, screens 1 and 3 show the first and 2 and 4 the second; and so on.
    function allStreams() { var st = (world.extra || {}).stream || {}; return (Array.isArray(st.isos) && st.isos.length ? st.isos : (st.iso ? [st.iso] : [])).concat(Array.isArray(st.gs) ? st.gs : []).map(okStream).filter(Boolean); }
    // Each side's screens show its own members: Isocore Gaming on the big screen and the west wall, GridSync on the east
    // wall and the sim rigs. Several live on one side share its screens in turn (1 and 3, 2 and 4).
    function sideStreams(side) { var st = (world.extra || {}).stream || {}; return (side === 'gs' ? (Array.isArray(st.gs) ? st.gs : []) : (Array.isArray(st.isos) && st.isos.length ? st.isos : (st.iso ? [st.iso] : []))).map(okStream).filter(Boolean); }
    function screenStream(n, side) { var l = sideStreams(side || 'iso'); return l.length ? l[n % l.length] : null; }
    function rigStream(n) { return screenStream(n, 'gs'); }
    var thumbs = {};
    function thumbOf(sm, redraw) {
      var want = /^https:\/\/static-cdn\.jtvnw\.net\//.test(sm.thumb || '') ? sm.thumb + (sm.thumb.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 300000) : '';
      if (!want) return null; var c = thumbs[want]; if (c) return c.ok ? c.img : null;
      c = thumbs[want] = { ok: false, img: new Image() }; c.img.crossOrigin = 'anonymous'; c.img.onload = function () { c.ok = true; redraw(); }; c.img.src = want; return null;
    }
    // the sim rigs' middle screens: a GridSync member's stream when one is live, the track otherwise
    var avatarTex = {};
    function avatarMat(url) {
      if (avatarTex[url]) return avatarTex[url];
      var m = new T.MeshBasicMaterial({ color: 0x0b1220 }); avatarTex[url] = m;
      var im = new Image(); im.crossOrigin = 'anonymous'; im.onload = function () { var t3 = new T.Texture(im); t3.colorSpace = T.SRGBColorSpace; t3.needsUpdate = true; m.map = t3; m.color.setHex(0xffffff); m.needsUpdate = true; }; im.src = url;
      return m;
    }
    function drawRigs() {
      sideScreens.forEach(function (sc) { var sm = rigStream(sc.rig); sc.mesh.material = sm && sm.avatar ? avatarMat(sm.avatar) : trackMat; });
      rigScreens.forEach(function (r, n) {
        var sm = rigStream(n), g = r.cv.getContext('2d');
        if (!sm) { if (r.on) { r.on = false; r.mesh.material = trackMat; } return; }
        var img = thumbOf(sm, drawRigs); g.fillStyle = '#05080f'; g.fillRect(0, 0, 256, 144);
        if (img) { try { g.drawImage(img, 0, 0, 256, 144); } catch (e) {} } else { g.fillStyle = '#ff9a4d'; g.font = 'bold 20px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(String(sm.game || 'LIVE').slice(0, 18).toUpperCase(), 128, 80); }
        g.fillStyle = '#e8262b'; g.fillRect(6, 6, 52, 22); g.fillStyle = '#fff'; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('LIVE', 32, 22);
        g.fillStyle = 'rgba(5,8,15,.8)'; g.fillRect(0, 116, 256, 28); g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 16px Arial, sans-serif'; g.fillText(String(sm.name || sm.login).slice(0, 26), 8, 136);
        r.tex.needsUpdate = true; if (!r.on) { r.on = true; r.mesh.material = r.mat; }
      });
    }
    var jLogo = null;
    // the brand face: the Isocore Gaming logo, the Discord count and the site's address
    function drawWelcome(g) {
      g.fillStyle = 'rgba(3,7,13,.92)'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#4fc8f5'; g.fillRect(0, 0, 256, 6); g.fillStyle = '#ff9a4d'; g.fillRect(256, 0, 256, 6);
      g.textAlign = 'center'; g.fillStyle = '#7fd6ff'; g.font = 'bold 26px Arial, sans-serif'; g.fillText('WELCOME TO THE ARENA', 256, 90);
      var nm = String(welcomeName || 'A NEW FAN').toUpperCase().slice(0, 18); g.fillStyle = '#ffffff'; g.font = 'bold ' + (nm.length > 12 ? 44 : 58) + 'px Arial, sans-serif'; g.fillText(nm, 256, 162);
      g.fillStyle = '#9fb6cc'; g.font = 'bold 18px Arial, sans-serif'; g.fillText('JUST TOOK A SEAT', 256, 206);
    }
    function drawBrand(g, a2, b2) {
      var dc = (world.extra || {}).discord, fol = dc && dc.members !== undefined ? dc.members : (a2 || 0) + (b2 || 0), folLbl = dc ? 'IN THE DISCORD' + (dc.online ? '  //  ' + dc.online + ' ONLINE' : '') : (fol === 1 ? 'MEMBER' : 'MEMBERS');
      var bg = g.createLinearGradient(0, 0, 0, 256); bg.addColorStop(0, '#071425'); bg.addColorStop(1, '#03070d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#4fc8f5'; g.fillRect(0, 0, 256, 6); g.fillStyle = '#ff9a4d'; g.fillRect(256, 0, 256, 6);
      if (!jLogo) { jLogo = new Image(); jLogo.crossOrigin = 'anonymous'; jLogo.onload = function () { drawJumbo(jLast[0], jLast[1]); }; jLogo.src = ISOCORE_ASSET_BASE + 'assets/isocore-wordmark.webp'; }
      if (jLogo.complete && jLogo.naturalWidth) { try { g.drawImage(jLogo, 164, 14, 184, 84); } catch (e) {} }
      g.textAlign = 'center';
      var ar = (world.extra || {}).arena, la = ar && ar.arrivals && ar.arrivals[0];
      var sp = typeof syncPct === 'function' ? syncPct() : 0, alt = Math.floor(Date.now() / 6000) % 5, nx = typeof nextSched === 'function' ? nextSched() : null;
      if (alt === 4 && typeof tug !== 'undefined' && tug && typeof tugLine === 'function') { g.fillStyle = tug.lean === 'ghost' ? '#4fc8f5' : tug.lean === 'echo' ? '#ff9a4d' : '#e6f6ff'; g.font = 'bold 15px Arial, sans-serif'; g.fillText(tugLine(), 256, 122); }
      else if (alt === 3 && typeof keyLine === 'function' && keyLine()) { g.fillStyle = '#e6f6ff'; g.font = 'bold 15px Arial, sans-serif'; g.fillText(keyLine(), 256, 122); }
      else if (alt === 2 && nx) { g.fillStyle = nx.who === 'echo' ? '#ff9a4d' : '#4fc8f5'; g.font = 'bold 15px Arial, sans-serif'; g.fillText('NEXT STREAM // ' + (nx.who === 'echo' ? 'ECHO' : 'GHOST') + ' ' + nx.label, 256, 122); }
      else if (la && alt === 1) { var mins = Math.max(0, Math.round((Date.now() / 1000 - la.at) / 60)); g.fillStyle = '#9fb6cc'; g.font = 'bold 15px Arial, sans-serif'; g.fillText(mins < 1 ? 'SOMEONE JUST TOOK A SEAT' : 'LAST SEAT TAKEN ' + (mins < 60 ? mins + ' MIN' : Math.round(mins / 60) + ' HR') + ' AGO', 256, 122); }
      else { g.fillStyle = '#9fd0ff'; g.font = 'bold 14px Arial, sans-serif'; g.fillText('MEMORY SYNC ' + sp + '%', 256, 116); g.fillStyle = 'rgba(120,190,255,.18)'; g.fillRect(156, 122, 200, 6); g.fillStyle = '#4fa8ff'; g.fillRect(156, 122, 2 * sp, 6); } g.fillStyle = '#ffffff'; g.font = 'bold 64px Arial, sans-serif'; g.fillText(String(fol), 256, 186);
      g.fillStyle = '#7fd6ff'; g.font = 'bold 20px Arial, sans-serif'; g.fillText(folLbl, 256, 212);
      var mfRecent = typeof mfAt !== 'undefined' && mfLast && Date.now() - mfAt < 20000;
      g.fillStyle = 'rgba(79,200,245,.18)'; g.fillRect(0, 224, 512, 32); g.fillStyle = mfRecent ? '#9fd0ff' : '#e6f6ff'; g.font = 'bold ' + (mfRecent ? 14 : 19) + 'px Arial, sans-serif';
      g.fillText(mfRecent ? ('CORE // ' + mfLast).slice(0, 62) : 'isocoregaming.co.uk', 256, 245);
      if (typeof keyFlash !== 'undefined' && keyFlash && Date.now() < keyFlash.until) { g.fillStyle = 'rgba(3,9,20,.92)'; g.fillRect(0, 0, 512, 224); g.fillStyle = keyFlash.k === 'echo' ? '#ff9a4d' : keyFlash.k === 'ghost' ? '#4fc8f5' : '#e6f6ff'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('FIRST TO FIND // ' + (keyFlash.k === 'ghost' ? 'GHOST\'S KEY' : keyFlash.k === 'echo' ? 'ECHO\'S KEY' : '???'), 256, 70); g.fillStyle = '#ffffff'; g.font = 'bold ' + (keyFlash.name.length > 12 ? 44 : 60) + 'px Arial, sans-serif'; g.fillText(keyFlash.name.slice(0, 18), 256, 160); }
      if (typeof mfPeakUntil !== 'undefined' && Date.now() < mfPeakUntil) { g.fillStyle = 'rgba(3,9,20,.9)'; g.fillRect(0, 0, 512, 224); g.fillStyle = '#9fd0ff'; g.font = 'bold 22px Arial, sans-serif'; g.fillText('SYNC 100%', 256, 70); g.fillStyle = '#ffffff'; g.font = 'bold 96px Arial, sans-serif'; g.fillText('3:18', 256, 175); }
    }
    function drawJumbo(a2, b2) {
      jLast = [a2, b2]; var g = jCv.getContext('2d'), sm = liveStream(); g.fillStyle = '#05080f'; g.fillRect(0, 0, 512, 256); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      if (sm) {
        var jImg = thumbOf(sm, function () { drawJumbo(jLast[0], jLast[1]); });
        var side = sm.branch === 'gridsync' ? '#ff9a4d' : '#4fc8f5';
        if (jImg) { try { g.drawImage(jImg, 28, 0, 456, 256); } catch (e) { jImg = null; } }
        if (!jImg) { g.fillStyle = side; g.font = 'bold 30px Arial, sans-serif'; g.fillText(String(sm.game || 'LIVE NOW').slice(0, 26).toUpperCase(), 256, 150); }
        g.fillStyle = side; g.fillRect(0, 0, 28, 256); g.fillRect(484, 0, 28, 256);
        g.fillStyle = 'rgba(5,8,15,.78)'; g.fillRect(28, 196, 456, 60);
        g.fillStyle = '#e8262b'; g.fillRect(40, 14, 92, 34); g.fillStyle = '#fff'; g.font = 'bold 24px Arial, sans-serif'; g.fillText('LIVE', 86, 40); g.textAlign = 'right'; g.font = 'bold 18px Arial, sans-serif'; g.fillText('TAP TO WATCH', 470, 38); g.textAlign = 'center';
        g.textAlign = 'left'; g.font = 'bold 24px Arial, sans-serif'; g.fillText(String(sm.name || sm.login).slice(0, 28), 44, 224);
        g.font = '16px Arial, sans-serif'; g.fillStyle = '#c4cad6'; g.fillText(String(sm.title || '').slice(0, 52), 44, 246);
        g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = 'bold 18px Arial, sans-serif'; g.fillText((sm.viewers || 0) + ' WATCHING', 472, 224);
      } else if ((world.extra || {}).party) {
        var pg2 = g.createLinearGradient(0, 0, 512, 256); pg2.addColorStop(0, '#0b4f7a'); pg2.addColorStop(1, '#7a3a0b'); g.fillStyle = pg2; g.fillRect(0, 0, 512, 256);
        for (var cf = 0; cf < 60; cf++) { g.fillStyle = ['#ffd36b', '#4fc8f5', '#ff9a4d', '#7cf29a', '#ff6bd5'][cf % 5]; g.fillRect((cf * 97) % 512, (cf * 53) % 256, 8, 14); }
        g.fillStyle = '#ffffff'; g.font = 'bold 44px Arial, sans-serif'; g.fillText('HAPPY BIRTHDAY', 256, 112); g.font = 'bold 34px Arial, sans-serif'; g.fillText('ISOCORE // GRIDSYNC', 256, 170);
      } else if (CITY || !arenaMode || true) {
        drawBrand(g, a2, b2);
      }
      if (Date.now() < welcomeUntil) drawWelcome(g); jTex.needsUpdate = true; try { var g9 = jCv2.getContext('2d'); g9.textAlign = 'center'; g9.textBaseline = 'alphabetic'; drawBrand(g9, a2, b2); if (Date.now() < welcomeUntil) drawWelcome(g9); jTex2.needsUpdate = true; } catch (e) {} drawRigs(); if (typeof drawSuites === 'function') drawSuites(); if (typeof drawWallScreens === 'function') drawWallScreens();
    }
    drawJumbo(0, 0);
    box(6.2, 3.4, 6.2, mats.foot, 0, 0, 0, jumbo);
    for (var jf = 0; jf < 4; jf++) { var jp = new T.Mesh(new T.PlaneGeometry(5.8, 2.9), new T.MeshBasicMaterial({ map: jTex })); jp.rotation.y = jf * Math.PI / 2; jp.position.set(Math.sin(jf * Math.PI / 2) * 3.12, 0, Math.cos(jf * Math.PI / 2) * 3.12); jp.userData.jumbo = true; pickable.push(jp); jumbo.add(jp); }
    box(6.6, .25, 6.6, mats.metal, 0, 1.85, 0, jumbo); box(6.6, .25, 6.6, mats.metal, 0, -1.85, 0, jumbo);
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (c) { var top = new T.Vector3(c[0] * (RO + .4) * .7071, TRUSS_Y, c[1] * (RO + .4) * .7071), bot = new T.Vector3(c[0] * 3, 17.4, 6 + c[1] * 3), len = top.distanceTo(bot); var cab = cylinder(.03, .03, len, mats.metal, (top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2, null, 4); cab.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); });
    var stripeCache = {};
    function stripes(colour) { if (stripeCache[colour]) return stripeCache[colour]; var cv = document.createElement('canvas'); cv.width = 64; cv.height = 8; var g = cv.getContext('2d'); for (var i = 0; i < 64; i += 16) { g.fillStyle = colour; g.fillRect(i, 0, 8, 8); g.fillStyle = '#eef1f4'; g.fillRect(i + 8, 0, 8, 8); } var t3 = new T.CanvasTexture(cv); t3.colorSpace = T.SRGBColorSpace; t3.wrapS = T.RepeatWrapping; t3.repeat.set(3, 1); return (stripeCache[colour] = new T.MeshStandardMaterial({ map: t3, roughness: .8, side: T.DoubleSide })); }
    // a stall: a counter, a back wall with its sign, a striped awning on two poles. It turns to face the middle.
    function stall(x, z, colour, title, sub) {
      var g = new T.Group(), rot = Math.atan2(-x, -z); g.position.set(x, .04, z); g.rotation.y = rot; scene.add(g);
      box(3.6, .1, 2.4, mats.rim, 0, .05, 0, g); box(3.4, 2.6, .15, mats.dark, 0, 1.35, -1.05, g); box(3.4, 1.0, .6, mats.base, 0, .55, .55, g); box(3.5, .06, .7, mats.metal, 0, 1.08, .55, g);
      var aw = box(3.8, .06, 1.6, stripes(colour), 0, 2.75, .2, g); aw.rotation.x = .18; [-1.75, 1.75].forEach(function (px) { box(.08, 2.7, .08, mats.metal, px, 1.35, 1.0, g); });
      var sg = sign(title, sub, 2.8, .7, colour, colour); sg.position.set(0, 2.1, -.96); g.add(sg);
      for (var it = 0; it < 4; it++) box(.28, .32 + (it % 2) * .14, .22, it % 2 ? mats.roofBlue : mats.roofAmber, -1.1 + it * .72, 1.28 + (it % 2) * .07, .55, g);
      solidRect(x, z, 3.8, 2.6, rot);
    }
    stall(-7.6, -26.0, '#4fc8f5', 'MERCH', 'ISOCORE // GRIDSYNC');
    stall(7.6, -26.0, '#ff9a4d', 'ENERGY BAR', 'DRINKS + SNACKS');
    stall(21.6, -14.2, '#ff9a4d', 'PIT STOP', 'FOOD TO GO');
    stall(-26.6, -6.0, '#4fc8f5', 'PRO SHOP', 'PERIPHERALS');
    // crowd barriers: steel panels on feet
    function barricade(x, z, rot, len) {
      var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
      box(len, .06, .06, mats.metal, 0, 1.05, 0, g); box(len, .06, .06, mats.metal, 0, .25, 0, g);
      for (var bb = 0; bb <= Math.round(len / .3); bb++) box(.03, .8, .03, mats.metal, -len / 2 + bb * len / Math.round(len / .3), .65, 0, g);
      [-len / 2, len / 2].forEach(function (fx2) { box(.06, .06, .7, mats.metal, fx2, .03, 0, g); });
      solidRect(x, z, len + .2, .5, rot);
    }
    barricade(-2.4, -11.4, 0, 1.6);
    barricade(-16, 3.6, 0, 2.4); barricade(-11.0, 3.4, .1, 1.6);
    barricade(-17.4, -12.8, 0, 2.0);
    // turnstiles at the gate
    function barrier(x, z, rot) { var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g); box(.5, 1.0, 1.4, mats.base, 0, .5, 0, g); box(.52, .06, 1.42, mats.light, 0, 1.02, 0, g); var arm = cylinder(.03, .03, .8, mats.metal, .5, .85, 0, g, 6); arm.rotation.z = Math.PI / 2; solidRect(x, z, 1.3, 1.5, rot); }
    barrier(-3.6, 23.6, 0); barrier(3.6, 23.6, 0); barrier(-3.6, 25.8, 0); barrier(3.6, 25.8, 0);
    // tall team banners along the boulevard
    function flagPole(x, z, mat) { cylinder(.06, .08, 7, mats.metal, x, 3.5, z, null, 8); box(1.1, .06, .06, mats.metal, x + (x < 0 ? -.5 : .5), 6.9, z); var fl = box(1.0, 3.2, .04, mat, x + (x < 0 ? -.5 : .5), 5.2, z); sphere(.1, .1, .1, mats.metal, x, 7.05, z); solidCircle(x, z, .25); return fl; }
    [12.0, 18.8].forEach(function (fz) { flagPole(-3.9, fz, mats.roofBlue); flagPole(3.9, fz, mats.roofAmber); });

    // ---- His own things: what the ghost has chosen to put in his town (the site sends [thing, spot] pairs). ---------------
    var SPOTS = { s14: [24.6, 12.0], s15: [17.5, -10.5], s16: [8.5, -8.5], s17: [-9.0, -10.5], s18: [-25.0, -2.0], s19: [11.0, 24.5], s1: [-8.4, 23.6], s2: [6.6, 19.0], s3: [-3.0, 13.6], s4: [-7.8, 9.4], s5: [25.4, 3.2], s6: [-5.6, -10.6], s7: [5.6, -10.6], s8: [0, -26.4], s9: [-27.6, 1.0], s10: [27.4, 9.0], s11: [-14.6, 10.0], s12: [-22.4, 12.6], s13: [20.2, -15.0] };
    var fireLights = [], waters = [], thingGroup = new T.Group(); scene.add(thingGroup);
    var leaf = new T.MeshStandardMaterial({ color: 0x1f6b52, roughness: .8, emissive: 0x0a2a20, emissiveIntensity: .4 }), bark = new T.MeshStandardMaterial({ color: 0x3a2a20, roughness: .9 });
    var THINGS = {
      bench: function (g) { box(1.0, .06, .32, mats.metal, 0, .42, 0, g); box(1.0, .3, .05, mats.metal, 0, .64, -.15, g); [-.42, .42].forEach(function (x) { box(.05, .42, .3, mats.foot, x, .21, 0, g); }); },
      tree: function (g) { cylinder(.07, .1, 1.1, bark, 0, .55, 0, g, 8); sphere(.55, .5, .55, leaf, 0, 1.4, 0, g); sphere(.4, .38, .4, leaf, .25, 1.75, .1, g); },
      lantern: function (g) { cylinder(.04, .06, 2.2, mats.foot, 0, 1.1, 0, g, 8); box(.22, .3, .22, mats.warm, 0, 2.3, 0, g); glow(0xffb45e, 1.6, 0, 2.3, 0, g, .7); },
      flowers: function (g) { box(1.1, .18, .5, mats.dark, 0, .09, 0, g); for (var i = 0; i < 9; i++) sphere(.07, .07, .07, new T.MeshBasicMaterial({ color: [0xff6b9a, 0xffd166, 0x7fdcff][i % 3] }), -.45 + i * .11, .24, (i % 2 ? .1 : -.1), g); },
      campfire: function (g) { for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3, st = box(.16, .1, .12, mats.foot, Math.cos(a) * .32, .05, Math.sin(a) * .32, g); st.rotation.y = -a; } var fl = mesh(new T.ConeGeometry(.16, .5, 8), new T.MeshBasicMaterial({ color: 0xffa040 }), 0, .3, 0, g); fireLights.push(fl); glow(0xff8a30, 2.2, 0, .4, 0, g, .7); var pl = new T.PointLight(0xff8a30, 10, 5); pl.position.y = .6; g.add(pl); fireLights.push(pl); },
      statue: function (g) { box(.7, .5, .7, mats.rim, 0, .25, 0, g); var c = new T.Group(); c.position.y = 1.15; c.scale.setScalar(.38); g.add(c); disc2(c); },
      flag_iso: function (g) { cylinder(.03, .03, 2.6, mats.metal, 0, 1.3, 0, g, 8); box(.9, .55, .02, mats.roofBlue, .45, 2.25, 0, g); },
      flag_grid: function (g) { cylinder(.03, .03, 2.6, mats.metal, 0, 1.3, 0, g, 8); box(.9, .55, .02, mats.roofAmber, .45, 2.25, 0, g); },
      arcade: function (g) { box(.55, 1.3, .5, mats.dark, 0, .65, 0, g); box(.42, .34, .02, new T.MeshBasicMaterial({ color: 0x52e0c4 }), 0, 1.0, .26, g); box(.5, .08, .2, mats.metal, 0, .7, .3, g); glow(0x52e0c4, 1.0, 0, 1.0, .3, g, .5); },
      telescope: function (g) { [-.15, .15].forEach(function (x) { var l = box(.03, .8, .03, mats.metal, x, .38, 0, g); l.rotation.z = x > 0 ? -.2 : .2; }); var tb = cylinder(.07, .1, .8, mats.steelish || mats.metal, 0, .95, 0, g, 12); tb.rotation.x = -.9; },
      fountain: function (g) { cylinder(.6, .65, .28, mats.rim, 0, .14, 0, g, 24); var w = cylinder(.52, .52, .02, new T.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: .7 }), 0, .27, 0, g, 24); waters.push(w); cylinder(.07, .09, .7, mats.rim, 0, .5, 0, g, 10); glow(0x3aa0ff, 1.4, 0, .4, 0, g, .4); },
      crates: function (g) { var cm = new T.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .9 }); box(.5, .5, .5, cm, -.2, .25, 0, g); box(.5, .5, .5, cm, .3, .25, .1, g); var t2 = box(.45, .45, .45, cm, 0, .72, .05, g); t2.rotation.y = .4; },
      sign: function (g) { cylinder(.03, .03, 1.6, mats.foot, 0, .8, 0, g, 6); var ar = box(.8, .22, .04, mats.trim, .2, 1.55, 0, g); var hd = mesh(new T.ConeGeometry(.2, .3, 3), mats.trim, .7, 1.55, 0, g); hd.rotation.z = -Math.PI / 2; glow(0x3fc4ff, 1.6, .3, 1.55, 0, g, .45); },
      trophy: function (g) { box(.5, .8, .5, mats.rim, 0, .4, 0, g); var gold = new T.MeshStandardMaterial({ color: 0xffc94d, metalness: .7, roughness: .3, emissive: 0x6a4a10, emissiveIntensity: .5 }); cylinder(.18, .07, .3, gold, 0, 1.0, 0, g, 16); cylinder(.12, .14, .06, gold, 0, .83, 0, g, 16); glow(0xffc94d, 1.0, 0, 1.0, 0, g, .35); },
      pumpkin: function (g) { var pm = new T.MeshStandardMaterial({ color: 0xe07020, roughness: .6, emissive: 0x803000, emissiveIntensity: .6 }); sphere(.35, .28, .35, pm, 0, .28, 0, g); cylinder(.03, .04, .14, bark, 0, .6, 0, g, 6); glow(0xff8a30, 1.2, 0, .3, .2, g, .6); },
      snowman: function (g) { var sw = new T.MeshStandardMaterial({ color: 0xe8f0ff, roughness: .7 }); sphere(.4, .4, .4, sw, 0, .4, 0, g); sphere(.3, .3, .3, sw, 0, 1.0, 0, g); sphere(.2, .2, .2, sw, 0, 1.45, 0, g); var n = mesh(new T.ConeGeometry(.04, .2, 8), new T.MeshBasicMaterial({ color: 0xff7a1a }), 0, 1.45, .25, g); n.rotation.x = Math.PI / 2; }
    };
    // a small copy of him, for the statue
    function disc2(parent) { var ring = mesh(new T.TorusGeometry(.9, .12, 10, 40), mats.rim, 0, 0, 0, parent); sphere(.4, .4, .2, new T.MeshBasicMaterial({ color: 0x1f8dff }), 0, 0, .05, parent); return ring; }
    var thingSig = '', thingSpots = [];
    function placeThings() {
      var sig = JSON.stringify(world.items); if (sig === thingSig) return; thingSig = sig;
      while (thingGroup.children.length) { var c = thingGroup.children.pop(); c.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
      fireLights.length = 0; waters.length = 0; thingSpots = [];
      world.items.forEach(function (it) {
        var sp = SPOTS[it[1]], make = THINGS[it[0]]; if (!sp || !make) return;
        var g = new T.Group(); g.position.set(sp[0], .08, sp[1]); g.scale.setScalar(1.8); g.rotation.y = Math.atan2(-sp[0], -sp[1]) + Math.PI; thingGroup.add(g); make(g); thingSpots.push([sp[0], sp[1], 1.0]);
        var ring2 = torus(.75, .03, it[2] === 'echo' ? mats.grid : mats.trim, 0, .03, 0, g); ring2.rotation.x = -Math.PI / 2;            /* whose it is: a blue ring for Ghost, orange for Echo */
      });
      router = null;
    }

    function lightWindows() { houseWin.forEach(function (m, i) { m.material = i < world.lit ? mats.warm : mats.off; }); }
    Object.keys(PLACES).forEach(nameTag);

    // ---- IG-Ghost: the core. ------------------------------------------------
    var spirit = new T.Group(); scene.add(spirit);
    // He is the core: the steel emblem with the blue light in it, hovering. Built facing +z; he always turns to face the viewer.
    var figure = new T.Group(); figure.name = 'core-figure'; figure.position.y = 1.75; figure.scale.set(1.0, 1.0, 1.0); spirit.add(figure);
    var steel = new T.MeshStandardMaterial({ color: 0x5d6878, roughness: .38, metalness: .5 }), steelDark = new T.MeshStandardMaterial({ color: 0x161c26, roughness: .45, metalness: .55 }), steelLight = new T.MeshStandardMaterial({ color: 0x8c98a8, roughness: .3, metalness: .45 });
    steel.userData.coreMetal = 'main'; steelDark.userData.coreMetal = 'dark'; steelLight.userData.coreMetal = 'light';
    // A single local brushed-steel map is shared by the arena framework and
    // both 3D cores; the original plain materials remain if it cannot load.
    new T.TextureLoader().load(ISOCORE_ASSET_BASE + 'assets/arena-materials/brushed-steel.webp', function (t) {
      t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2); t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      function applyMetal(m) { if (!m || !m.userData) return; m.map = t; m.color.setHex(m.userData.coreMetal === 'dark' ? 0x83919c : 0xc5d0d7); if (m.userData.keep) { m.userData.keep.c = t; m.userData.keep.col = m.color.clone(); } m.needsUpdate = true; }
      applyMetal(mats.metal);
      spirit.traverse(function (o) { if (o.material && o.material.userData && o.material.userData.coreMetal) applyMetal(o.material); });
      if (echoSpirit) echoSpirit.traverse(function (o) { if (o.material && o.material.userData && o.material.userData.coreMetal) applyMetal(o.material); });
      if (typeof still === 'function') still();
    }, undefined, function () { /* keep plain steel on a missing optional asset */ });
    // Actual 3D construction based on the supplied core: no emblem image or
    // flat image plane is used for either character in the world.
    var coreBlue = new T.MeshStandardMaterial({ color: 0x0758bd, emissive: 0x0056c9, emissiveIntensity: .85, metalness: .45, roughness: .3 });
    var coreMid = new T.MeshStandardMaterial({ color: 0x169bff, emissive: 0x008cff, emissiveIntensity: 1.25, metalness: .2, roughness: .22 });
    var coreWhite = new T.MeshBasicMaterial({ color: 0xeaf7ff });
    var outline = new T.Shape(); outline.absarc(0, .08, 1, Math.PI * 1.22, -Math.PI * .22, true); outline.lineTo(0, -1.10); outline.closePath();
    mesh(new T.ExtrudeGeometry(outline, { depth: .30, bevelEnabled: true, bevelThickness: .07, bevelSize: .06, bevelSegments: 3, curveSegments: 48 }), steelDark, 0, 0, -.23, figure);
    function disc(r, depth, mat, z, y) { var d = cylinder(r, r, depth, mat, 0, y === undefined ? .08 : y, z, figure, 64); d.rotation.x = Math.PI / 2; return d; }
    function band(r, tube, mat, z) { return mesh(new T.TorusGeometry(r, tube, 12, 72), mat, 0, .08, z, figure); }
    // Separate, bevelled mechanical layers provide depth and real highlights.
    disc(.96, .18, steelDark, -.01); band(.98, .055, steelLight, .10); band(.91, .065, steel, .15);
    band(.84, .018, steelLight, .20); disc(.82, .09, steelDark, .15); band(.77, .024, coreBlue, .22);
    band(.72, .035, steel, .24); disc(.67, .09, steelDark, .19); band(.62, .028, coreMid, .28);
    band(.56, .068, steelLight, .29); band(.48, .018, steelDark, .32); disc(.46, .10, coreBlue, .28);
    band(.40, .024, steelDark, .34); band(.35, .014, coreMid, .36);
    // Curved machined plates follow the ring instead of being flat decals.
    function arcPlate(inner, outer, a0, a1, z, mat) {
      var s = new T.Shape(); s.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
      s.absarc(0, 0, outer, a0, a1, false); s.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner); s.absarc(0, 0, inner, a1, a0, true); s.closePath();
      return mesh(new T.ExtrudeGeometry(s, { depth: .055, bevelEnabled: true, bevelThickness: .018, bevelSize: .015, bevelSegments: 2, curveSegments: 10 }), mat, 0, .08, z, figure);
    }
    for (var ap = 0; ap < 8; ap++) { var aa3 = ap * Math.PI / 4; arcPlate(.83, .99, aa3 + .07, aa3 + Math.PI / 4 - .07, .19, ap % 2 ? steel : steelLight); }
    for (var ip = 0; ip < 12; ip++) { var ia = ip * Math.PI / 6; arcPlate(.64, .71, ia + .045, ia + Math.PI / 6 - .045, .27, ip % 2 ? steelDark : steel); }
    // Fine recessed channels and short radial ribs give the shell a machined
    // depth from oblique angles rather than a single smooth circular badge.
    for (var detail = 0; detail < 16; detail++) {
      var angle = detail * Math.PI / 8, rib = box(.028, .10, .045, detail % 2 ? steelLight : steelDark, Math.sin(angle) * .805, .08 + Math.cos(angle) * .805, .25, figure);
      rib.rotation.z = -angle;
      if (detail % 2 === 0) arcPlate(.87, .89, angle + .04, angle + .31, .255, steelDark);
    }
    // Recessed fasteners, light channels and a rounded, projecting energy core.
    for (var dn = 0; dn < 16; dn++) { var da = dn * Math.PI / 8; sphere(.022, .022, .018, dn % 2 ? steelLight : coreMid, Math.cos(da) * .755, .08 + Math.sin(da) * .755, .275, figure); }
    sphere(.31, .31, .16, coreBlue, 0, .08, .34, figure); sphere(.245, .245, .13, coreMid, 0, .08, .43, figure);
    var heart = sphere(.15, .15, .10, coreWhite, 0, .08, .53, figure);
    var spinner = new T.Group(); spinner.name = 'core-spinner'; spinner.position.set(0, .08, .38); figure.add(spinner);
    for (var sn2 = 0; sn2 < 12; sn2++) { var sa3 = sn2 * Math.PI / 6, notch = box(.035, .075, .035, sn2 % 2 ? coreMid : steelLight, Math.sin(sa3) * .335, Math.cos(sa3) * .335, 0, spinner); notch.rotation.z = -sa3; }
    // Shaped armour and the V-shaped lower point match the reference silhouette.
    for (var pl = 0; pl < 4; pl++) { var pa2 = Math.PI / 4 + pl * Math.PI / 2; arcPlate(.77, 1.04, pa2 - .17, pa2 + .17, .24, steelLight); }
    function bevelPlate(points, z, mat) { var s = new T.Shape(); points.forEach(function (p, i) { if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }); s.closePath(); return mesh(new T.ExtrudeGeometry(s, { depth: .07, bevelEnabled: true, bevelThickness: .018, bevelSize: .016, bevelSegments: 2 }), mat, 0, 0, z, figure); }
    bevelPlate([[-.55,-.63],[0,-1.10],[.55,-.63],[.44,-.61],[0,-.94],[-.44,-.61]], .22, steelLight);
    bevelPlate([[-.38,-.67],[0,-.96],[.38,-.67],[.29,-.66],[0,-.86],[-.29,-.66]], .31, coreBlue);
    box(.18, .33, .13, steel, 0, .88, .25, figure); box(.07, .20, .14, steelDark, 0, .84, .32, figure);
    var halo = glow(0x1f7dff, 3.2, 0, .08, .3, figure, .3), spark = glow(0xcfeaff, .8, 0, .08, .57, figure, .7);
    var ghostLight = new T.PointLight(0x3aa0ff, 9, 7); ghostLight.position.set(0, .6, .2); spirit.add(ghostLight);
    // His mood for the day tints his light and sets his pace: restless and mischievous bob faster, sleepy and gloomy slower and dimmer.
    var pace = 1, dim = 1;
    function feel() {
      var col = MOODS[world.mood] || 0x3aa0ff; halo.material.color.setHex(col); ghostLight.color.setHex(col);
      pace = { restless: 1.8, mischievous: 1.6, cheerful: 1.25, curious: 1.2, sleepy: .55, gloomy: .7 }[world.mood] || 1;
      dim = { sleepy: .6, gloomy: .7, proud: 1.3, cheerful: 1.15 }[world.mood] || 1; ghostLight.intensity = 9 * dim;
      stage.dataset.mood = world.mood;
      var hud = stage.querySelector('.igw-mood'); if (!hud) { hud = document.createElement('span'); hud.className = 'igw-mood'; var hd = stage.querySelector('.igw-hud'); if (hd) hd.appendChild(hud); }
      hud.textContent = world.mood ? 'Feeling ' + world.mood : '';
    }
    var shadow = mesh(new T.CircleGeometry(1.0, 32), new T.MeshBasicMaterial({ color: 0x02050a, transparent: true, opacity: .5, depthWrite: false }), 0, .125, 0); shadow.rotation.x = -Math.PI / 2;
    // Dust in the air round the town.
    var dustGeo = new T.BufferGeometry(), points = [];
    for (var j = 0; j < 140; j++) { var a = j * 2.399, r = 9.8 + (j % 7) * .5; points.push(Math.cos(a) * r, .5 + (j % 13) * .5, Math.sin(a) * r); }
    dustGeo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    var dust = new T.Points(dustGeo, new T.PointsMaterial({ color: 0x8fd8ff, size: .05, transparent: true, opacity: .4, depthWrite: false })); scene.add(dust);

    var clock = new T.Clock(), elapsed = 0, paused = !!(reduced && reduced.matches), visible = true, disposed = false, frame = 0;
    // Sound is opt-in: browsers require a gesture, and the town must not start
    // playing unexpectedly when someone visits the homepage.
    var crowdBands = [], nextCheer = 0, soundCtx = null, soundMaster = null, soundNoise = null, soundEngine = null, soundArena = null, enginePitch = null, soundOn = false, lastSoundStride = 0;
    function soundSync() {
      if (!soundCtx) return;
      var playing = soundOn && active() && visible && !document.hidden && !disposed;
      if (playing && soundCtx.state === 'suspended') soundCtx.resume().then(soundLandscape).catch(function () {});
      else if (!playing && soundCtx.state === 'running') soundCtx.suspend().catch(function () {});
    }
    function soundStart() {
      if (SEALED) return;      // the arena has no sound of its own: the synthesised crowd sounded like white noise (README-ADMIN 262)
      if (soundCtx) return true;
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      try {
        soundCtx = new AC(); soundMaster = soundCtx.createGain(); soundMaster.gain.value = .30; soundMaster.connect(soundCtx.destination);
        soundNoise = soundCtx.createBuffer(1, Math.floor(soundCtx.sampleRate * 2), soundCtx.sampleRate);
        var samples = soundNoise.getChannelData(0); for (var i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        // A crowd in an indoor arena, made here from noise (no sound files): a low murmur of many voices, shaped like speech, that
        // swells and falls, and now and then a cheer rolls round the stands. The old wind, hum and engine sounds are gone.
        function band(f, q, g) { var src = soundCtx.createBufferSource(), flt = soundCtx.createBiquadFilter(), lv = soundCtx.createGain(); src.buffer = soundNoise; src.loop = true; src.playbackRate.value = .9 + Math.random() * .2; flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q; lv.gain.value = g; src.connect(flt); flt.connect(lv); lv.connect(soundMaster); src.start(soundCtx.currentTime + Math.random() * .5); return { f: flt, g: lv, base: g, bf: f }; }
        crowdBands = [band(320, .9, .55), band(650, 1.2, .5), band(1150, 1.6, .32), band(2300, 2.2, .12)];
        var room = soundCtx.createBufferSource(), roomF = soundCtx.createBiquadFilter(), roomL = soundCtx.createGain(); room.buffer = soundNoise; room.loop = true; roomF.type = 'lowpass'; roomF.frequency.value = 180; roomL.gain.value = .35; room.connect(roomF); roomF.connect(roomL); roomL.connect(soundMaster); room.start();
        soundEngine = soundCtx.createGain(); soundEngine.gain.value = 0; enginePitch = { frequency: { setTargetAtTime: function () {} } };
        soundArena = soundCtx.createGain(); soundArena.gain.value = 0; return true;
      } catch (e) { if (soundCtx) soundCtx.close().catch(function () {}); soundCtx = null; return false; }
    }
    function soundStep() {
      if (!soundOn || !soundCtx || soundCtx.state !== 'running') return;
      var now = soundCtx.currentTime, source = soundCtx.createBufferSource(), filter = soundCtx.createBiquadFilter(), gain = soundCtx.createGain();
      source.buffer = soundNoise; filter.type = 'lowpass'; filter.frequency.value = 480; gain.gain.setValueAtTime(.55, now); gain.gain.exponentialRampToValueAtTime(.001, now + .13);
      source.connect(filter); filter.connect(gain); gain.connect(soundMaster); source.start(now); source.stop(now + .14);
    }
    function soundLandscape() {
      if (!soundOn || !soundCtx || soundCtx.state !== 'running' || !soundEngine) return;
      // the crowd: each band drifts on its own, like a room of conversations, and a cheer every half a minute or so
      var tn = soundCtx.currentTime;
      crowdBands.forEach(function (b, i) { b.g.gain.setTargetAtTime(b.base * (.75 + .25 * Math.sin(elapsed * (.21 + i * .07) + i) + .1 * Math.sin(elapsed * 1.3 + i * 2)), tn, .4); b.f.frequency.setTargetAtTime(b.bf * (1 + .04 * Math.sin(elapsed * (.33 + i * .11))), tn, .5); });
      if (elapsed > nextCheer) {
        nextCheer = elapsed + 25 + Math.random() * 45; if (nextCheer - 25 > 0 && elapsed > 3) {
          var cs = soundCtx.createBufferSource(), cf = soundCtx.createBiquadFilter(), cf2 = soundCtx.createBiquadFilter(), cg = soundCtx.createGain(); cs.buffer = soundNoise; cs.loop = true; cf.type = 'bandpass'; cf.frequency.value = 900; cf.Q.value = .5; cf2.type = 'highshelf'; cf2.frequency.value = 2000; cf2.gain.value = 4;
          cg.gain.setValueAtTime(.0001, tn); cg.gain.exponentialRampToValueAtTime(.9, tn + 1.2); cg.gain.setTargetAtTime(.0001, tn + 2.2, 1.1);
          cs.connect(cf); cf.connect(cf2); cf2.connect(cg); cg.connect(soundMaster); cs.start(tn); cs.stop(tn + 8);
        }
      }
      var distanceToTrack = 999, nearTrack = 0;
      soundEngine.gain.setTargetAtTime(nearTrack * .30, soundCtx.currentTime, .3);
      enginePitch.frequency.setTargetAtTime(105 + 75 * (.5 + .5 * Math.sin(elapsed * .9)), soundCtx.currentTime, .25);
      var nearArena = Math.max(0, 1 - Math.hypot(player.x - PLACES.arena.x, player.z - PLACES.arena.z) / 22);
      if (soundArena) soundArena.gain.setTargetAtTime(nearArena * (.32 + .08 * Math.sin(elapsed * .45)), soundCtx.currentTime, .3);
    }
    var defaultYaw = -.4, defaultPitch = .42, defaultDistance = 72, yaw = defaultYaw, pitch = defaultPitch, distance = defaultDistance, drag = null, adjusted = false, moved = 0, downAt = 0;
    var currentPos = new T.Vector3(PLACES[world.where].at[0], 0, PLACES[world.where].at[1]), goal = new T.Vector3();
    // ---- The visitor: on foot, at eye height, starting just inside the rail and looking in through the gate. ----------------
    var START = { x: 0, z: 28.8, yaw: 0, pitch: .07 }, EYE = 1.6, SPEED = 6.2, EDGE = RO - 1.8;
    var mode = 'walk', player = { x: START.x, z: START.z }, pyaw = START.yaw, ppitch = START.pitch, walkTo = null, bob = 0, stride = 0;
    // A lightweight marker appears only while the visitor is walking to a
    // destination. It has no collision or picking surface of its own.
    var walkMarker = new T.Group(); walkMarker.visible = false; scene.add(walkMarker);
    var markerMat = new T.MeshBasicMaterial({ color: 0x64d5ff, transparent: true, opacity: .8, depthWrite: false });
    var markerRing = mesh(new T.TorusGeometry(.62, .035, 8, 32), markerMat, 0, .1, 0, walkMarker); markerRing.rotation.x = Math.PI / 2;
    var markerArrow = mesh(new T.ConeGeometry(.2, .34, 12), markerMat, 0, 1.05, 0, walkMarker); markerArrow.rotation.x = Math.PI;
    function updateWalkMarker() { walkMarker.visible = !!walkTo && mode === 'walk'; if (walkMarker.visible) { walkMarker.position.set(walkTo.x, 0, walkTo.z); markerArrow.position.y = 1.05 + (paused ? 0 : Math.sin(elapsed * 3) * .1); } }
    var tip = document.createElement('div'); tip.className = 'igw-tip'; stage.appendChild(tip);
    var cross = document.createElement('div'); cross.className = 'igw-cross'; cross.setAttribute('aria-hidden', 'true'); stage.appendChild(cross);
    function say(text) { tip.textContent = text || ''; tip.style.visibility = text ? '' : 'hidden'; }
    var TAP = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window ? 'Tap' : 'Click', STICKS = TAP === 'Tap', IDLE = STICKS ? 'Left stick walks, right stick looks. Tap Ghost or Echo when you are close to say hello' : 'Click a place to walk there, or the ground to walk about';
    // What cannot be walked through: circles [x, z, r] and turned rectangles [x, z, half width, half depth, turn] (SOLIDS, from
    // the buildings), the lamps, and the ghost's own things.
    var PLAYER_SOLIDS = [];      // walls only the visitor bumps into (the stage edge); Ghost and Echo walk through them
    function blocked() { return SOLIDS.concat(boothSolids, typeof thingSpots === 'undefined' ? [] : thingSpots); }
    function inRing(o, x, z, pad) {
      var rr = Math.hypot(x - o[0], z - o[1]); if (rr < o[2] - pad || rr > o[3] + pad) return false;
      var a = Math.atan2(x - o[0], z - o[1]);
      return !(o.gaps || []).some(function (g) { var da = a - g.a; return Math.cos(da) > 0 && Math.abs(rr * Math.sin(da)) < g.hw - pad; });
    }
    function inside(o, x, z, pad) {
      if (o.length === 4) return inRing(o, x, z, pad);
      if (o.length === 5) { var c = Math.cos(o[4]), s4 = Math.sin(o[4]), dx = x - o[0], dz = z - o[1], lx = dx * c - dz * s4, lz = dx * s4 + dz * c; return Math.abs(lx) < o[2] + pad && Math.abs(lz) < o[3] + pad; }
      return Math.hypot(x - o[0], z - o[1]) < o[2] + pad;
    }
    // push a point out of one solid, to its nearest edge (and a little along it, so walking slides round corners)
    function pushOut(o, x, z) {
      if (o.length === 4) {
        if (!inRing(o, x, z, .25)) return null;
        var rr0 = Math.hypot(x - o[0], z - o[1]) || .001, a0 = Math.atan2(x - o[0], z - o[1]), best = null, bd = 1e9;
        // the smallest way out: back onto the floor, out to the street, or sideways into the nearest tunnel
        [[o[2] - .26, a0], [o[3] + .26, a0]].forEach(function (c) { var d = Math.abs(c[0] - rr0); if (d < bd) { bd = d; best = [o[0] + Math.sin(c[1]) * c[0], o[1] + Math.cos(c[1]) * c[0]]; } });
        (o.gaps || []).forEach(function (g) {
          var da = a0 - g.a; if (Math.cos(da) <= 0) return; var along = rr0 * Math.cos(da), lat = rr0 * Math.sin(da), nl = (lat < 0 ? -1 : 1) * (g.hw - .27), d = Math.abs(lat - nl);
          if (d < bd) { bd = d; var na = g.a + Math.atan2(nl, along), nr = Math.hypot(along, nl); best = [o[0] + Math.sin(na) * nr, o[1] + Math.cos(na) * nr]; }
        });
        return best;
      }
      if (o.length === 5) {
        var c = Math.cos(o[4]), s4 = Math.sin(o[4]), dx = x - o[0], dz = z - o[1], lx = dx * c - dz * s4, lz = dx * s4 + dz * c, ex = o[2] + .25, ez = o[3] + .25;
        if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return null;
        if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = lx < 0 ? -ex : ex; else lz = lz < 0 ? -ez : ez;
        return [o[0] + lx * c + lz * s4, o[1] - lx * s4 + lz * c];
      }
      var ox = x - o[0], oz = z - o[1], od = Math.hypot(ox, oz) || .0001, rr = o[2] + .25; if (od >= rr) return null;
      return [o[0] + ox / od * rr, o[1] + oz / od * rr];
    }
    // One step towards (tx, tz), sliding round whatever is in the way and staying inside the rail.
    function stepTo(tx, tz, len) {
      if (seatY) { if (seatLock) return; standUp(); }
      var dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz) || .0001, nx = player.x + dx / d * len, nz = player.z + dz / d * len;
      blocked().concat(PLAYER_SOLIDS).forEach(function (o) { var p2 = pushOut(o, nx, nz); if (p2) { nx = p2[0]; nz = p2[1]; } });
      var rr = Math.hypot(nx, nz); if (rr > EDGE) { nx *= EDGE / rr; nz *= EDGE / rr; }
      stride += Math.hypot(nx - player.x, nz - player.z); player.x = nx; player.z = nz;
    }
    function turnTo(want, amount) { var diff = Math.atan2(Math.sin(want - pyaw), Math.cos(want - pyaw)); pyaw += diff * Math.min(1, amount); }
    function makeRouter(blockedList, edge) {
      blockedList = blockedList.filter(function (o) { return o.length === 4 || Math.hypot(o[0], o[1]) < edge + 30; });
      // One-metre cells keep routing responsive across the enlarged floor,
      // while the existing .35m collision clearance protects narrow passages.
      var HALF = Math.ceil(edge) + 1, CELL = 1, N = Math.round(HALF * 2 / CELL) + 1;
      function at(i) { return -HALF + i * CELL; }
      function cellOf(v) { return Math.max(0, Math.min(N - 1, Math.round((v + HALF) / CELL))); }
      var free = new Uint8Array(N * N);
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
        var x = at(i), z = at(j), ok = Math.hypot(x, z) <= edge;
        for (var k = 0; ok && k < blockedList.length; k++) if (inside(blockedList[k], x, z, .35)) ok = false;
        free[j * N + i] = ok ? 1 : 0;
      }
      function nearestFree(x, z) {
        var ci = cellOf(x), cj = cellOf(z), best = -1, bd = 1e9;
        for (var r = 0; r < 24 && best < 0; r++) for (var j = cj - r; j <= cj + r; j++) for (var i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N || !free[j * N + i]) continue;
          var d = Math.hypot(at(i) - x, at(j) - z); if (d < bd) { bd = d; best = j * N + i; }
        }
        return best;
      }
      function clear(ax, az, bx, bz) { var len = Math.hypot(bx - ax, bz - az), steps = Math.ceil(len / .2); for (var t = 1; t < steps; t++) { var px = ax + (bx - ax) * t / steps, pz = az + (bz - az) * t / steps; if (Math.hypot(px, pz) > edge || blockedList.some(function (o) { return inside(o, px, pz, .27); })) return false; } return true; }
      return function (fx, fz, tx, tz) {
        var s0 = nearestFree(fx, fz), g = nearestFree(tx, tz); if (s0 < 0 || g < 0) return [];
        if (clear(fx, fz, tx, tz)) return [[tx, tz]];
        // A* on the grid, with a binary heap for the open list
        var heap = [], cost = new Float32Array(N * N).fill(1e9), came = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N), gx = g % N, gz = Math.floor(g / N);
        function h(c) { var dx = (c % N) - gx, dz = Math.floor(c / N) - gz; return Math.sqrt(dx * dx + dz * dz); }
        function push(c, f) { heap.push([f, c]); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
        function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; }
        cost[s0] = 0; push(s0, h(s0));
        while (heap.length) {
          var c = pop()[1]; if (c === g) break; if (done[c]) continue; done[c] = 1;
          var ci = c % N, cj = Math.floor(c / N);
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
            if (!di && !dj) continue; var ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
            var n = nj * N + ni; if (!free[n] || done[n]) continue;
            if (di && dj && (!free[cj * N + ni] || !free[nj * N + ci])) continue;
            var nc = cost[c] + (di && dj ? 1.414 : 1);
            if (nc < cost[n]) { cost[n] = nc; came[n] = c; push(n, nc + h(n)); }
          }
        }
        if (g !== s0 && came[g] < 0) return [];
        var cells = [], cur = g; while (cur >= 0 && cur !== s0) { cells.unshift(cur); cur = came[cur]; }
        var pts = cells.map(function (c2) { return [at(c2 % N), at(Math.floor(c2 / N))]; }), out = [], px = fx, pz = fz, i2 = 0;
        while (i2 < pts.length) { var far = i2; for (var k2 = pts.length - 1; k2 > i2; k2--) { if (clear(px, pz, pts[k2][0], pts[k2][1])) { far = k2; break; } } out.push(pts[far]); px = pts[far][0]; pz = pts[far][1]; i2 = far + 1; }
        out.push([tx, tz]);
        return out;
      };
    }
    var router = null;
    function routeTo(tx, tz) { if (!router) router = makeRouter(blocked(), EDGE); return router(player.x, player.z, tx, tz); }
    function turnTo(want, amount) { var diff = Math.atan2(Math.sin(want - pyaw), Math.cos(want - pyaw)); pyaw += diff * Math.min(1, amount); }
    // In a full street another booth may sit in front of a given booth. Find
    // the nearest clear standing point rather than routing into its neighbour.
    function clearApproach(x, z) {
      var obstacles = blocked();
      function free(px, pz) { return Math.hypot(px, pz) < EDGE - .2 && !obstacles.some(function (o) { return inside(o, px, pz, .35); }); }
      if (free(x, z)) return [x, z];
      for (var ring = 1; ring <= 16; ring++) for (var a = 0; a < 24; a++) {
        var rad = ring * .5, ang = a * Math.PI * 2 / 24, nx = x + Math.cos(ang) * rad, nz = z + Math.sin(ang) * rad;
        if (free(nx, nz)) return [nx, nz];
      }
      return null;
    }
    function targetOf(id) {
      var hm = /^house:(\d+)$/.exec(id);
      if (hm) { var hp = housePos[Number(hm[1])], hs = world.houses[Number(hm[1])]; if (!hp || !hs) return null; var pt = clearApproach(hp.approachX, hp.approachZ); if (!pt) return null; return { x: pt[0], z: pt[1], fx: hp.x, fz: hp.z, id: id, label: hs.n + '\u2019s house' }; }
      if (id === 'lore') return LORE_AT ? { x: LORE_AT[0], z: LORE_AT[1], fx: LORE_AT[2], fz: LORE_AT[3], id: 'lore', label: 'the log terminal' } : { x: 2.6, z: 18.6, fx: 4.6, fz: 18.6, id: 'lore', label: 'the log terminal' };
      var p = PLACES[id]; if (!p) return null;
      return { x: p.at[0], z: p.at[1], fx: p.x, fz: p.z, id: id, label: p.name.charAt(0) + p.name.slice(1).toLowerCase() };
    }
    function arrive(t) {
      if (!t.id) { walkTo = null; say(IDLE); return; }                  /* a spot on the ground: nothing to go into */
      if (t.id === 'lore') { walkTo = null; say(''); openLore(); return; }
      walkTo = null; say(''); if (status) status.textContent = 'You are at ' + t.label + '. Going in.';
      portal(t.label, function () { go(t.id); });
    }
    // Going in: the screen becomes a terminal ("ACCESSING ...") for a moment, then the page opens as that terminal's window.
    function portal(label, then) {
      if (paused || (reduced && reduced.matches)) { then(); return; }
      var ov = document.createElement('div'); ov.className = 'igw-portal'; ov.setAttribute('aria-hidden', 'true');
      ov.innerHTML = '<div class="igw-portal-box"><b></b><i></i><span></span></div>';
      ov.querySelector('b').textContent = '> ACCESSING ' + String(label).toUpperCase();
      ov.querySelector('span').textContent = 'IG-GHOST // UPLINK SECURE';
      stage.appendChild(ov);
      document.documentElement.classList.add('igw-entering');
      setTimeout(function () { then(); document.documentElement.classList.remove('igw-entering'); document.documentElement.classList.add('igw-arrived'); setTimeout(function () { document.documentElement.classList.remove('igw-arrived'); }, 900); }, 620);
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 1200);
    }
    // Where on the ground a tap landed, if it landed on ground in front of you and inside the rail.
    function groundAt(clientX, clientY) {
      var b = canvas.getBoundingClientRect(); ndc.set((clientX - b.left) / b.width * 2 - 1, -((clientY - b.top) / b.height * 2 - 1)); ray.setFromCamera(ndc, camera);
      var o = ray.ray.origin, dir = ray.ray.direction; if (dir.y > -.03) return null;
      var t = -o.y / dir.y; if (t > 90) return null;
      var x = o.x + dir.x * t, z = o.z + dir.z * t, r = Math.hypot(x, z); if (r > EDGE - .1) { x *= (EDGE - .1) / r; z *= (EDGE - .1) / r; }
      return { x: x, z: z };
    }
    function inTheWay(x, z) { return blocked().some(function (o) { return inside(o, x, z, .2); }); }
    function stroll(gp) {
      if (mode !== 'walk' || seatLock) return;      /* seated (a seat, a suite, a mod desk): a click never moves you */
      var gd = Math.hypot(gp.x, gp.z); if (gd > EDGE) gp = { x: gp.x * EDGE / gd, z: gp.z * EDGE / gd };
      if (paused) { if (!inTheWay(gp.x, gp.z)) { player.x = gp.x; player.z = gp.z; still(); } return; }
      var path = routeTo(gp.x, gp.z); if (inTheWay(gp.x, gp.z)) path.pop();
      if (!path.length) { stopWalk(); return; }
      var end = path[path.length - 1]; walkTo = { x: end[0], z: end[1], fx: end[0], fz: end[1], id: '', label: '', t0: Date.now(), path: path }; say(''); wake();
    }
    // On a phone you walk with the sticks only: a tap never walks you anywhere. Tapping a place opens it when you are
    // close to it, and says so when you are not.
    var nearT = 0;
    function openNear(id) {
      var t = targetOf(id); if (!t) return;
      if (paused) { go(id); return; }
      var d = Math.min(Math.hypot(t.fx - player.x, t.fz - player.z), Math.hypot(t.x - player.x, t.z - player.z));
      if (d <= 9) { stopWalk(); arrive(t); return; }
      say('Walk closer to ' + t.label + ' to open it'); clearTimeout(nearT); nearT = setTimeout(function () { if (!walkTo) say(IDLE); }, 2600);
    }
    function startWalk(id) {
      var t = targetOf(id); if (!t) return; if (seatY) { if (seatLock) return; standUp(); }
      if (paused) { go(id); return; }                                   /* less motion asked for: no walk, straight in */
      if (mode !== 'walk') { mode = 'walk'; modeState(); resize(); } t.t0 = Date.now(); t.path = routeTo(t.x, t.z); if (!t.path.length) { say('No clear path to ' + t.label + '. Try walking closer.'); return; } walkTo = t; say('Walking to ' + t.label);
      if (status) status.textContent = 'Walking to ' + t.label + '.'; wake();
    }
    function stopWalk() { if (!walkTo) return; walkTo = null; updateWalkMarker(); say(IDLE); }
    function walkStep(dt) {
      if (!walkTo) { bob *= .8; return; }
      var d = Math.hypot(walkTo.x - player.x, walkTo.z - player.z);
      if (d < .4 || Date.now() - walkTo.t0 > 60000) { arrive(walkTo); return; }
      var left = SPEED * dt, nx2 = walkTo.x, nz2 = walkTo.z;
      while (left > 0 && walkTo.path.length) {                           /* along the path, corner by corner */
        var q = walkTo.path[0], qx = q[0] - player.x, qz = q[1] - player.z, qd = Math.hypot(qx, qz);
        if (qd <= left) { player.x = q[0]; player.z = q[1]; stride += qd; left -= qd; walkTo.path.shift(); continue; }
        player.x += qx / qd * left; player.z += qz / qd * left; stride += left; left = 0; nx2 = q[0]; nz2 = q[1];
      }
      var near = d < 5, lx = (near ? walkTo.fx : nx2) - player.x, lz = (near ? walkTo.fz : nz2) - player.z;
      if (Math.hypot(lx, lz) > .05) turnTo(Math.atan2(lx, -lz), dt * 3.5);
      ppitch += (.05 - ppitch) * Math.min(1, dt * 3); bob = Math.sin(stride * 4.2) * .035;
    }
    var pollBusy = false, lastPoll = Date.now();

    // ---- Moving by hand: W A S D (and the arrow keys) on a keyboard, a small stick in the corner on a touch screen. ----------
    var keys = {}, stick = { x: 0, y: 0 }, look = { x: 0, y: 0 }, KEYMAP = { w: 'f', s: 'b', a: 'l', d: 'r', arrowup: 'f', arrowdown: 'b', arrowleft: 'tl', arrowright: 'tr' };
    function inputActive() { return keys.f || keys.b || keys.l || keys.r || keys.tl || keys.tr || Math.abs(stick.x) > .12 || Math.abs(stick.y) > .12 || Math.abs(look.x) > .12 || Math.abs(look.y) > .12; }
    function manual(dt) {
      var fwd = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) - (Math.abs(stick.y) > .12 ? stick.y : 0), side = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) + (Math.abs(stick.x) > .12 ? stick.x : 0), turn = (keys.tr ? 1 : 0) - (keys.tl ? 1 : 0) + (Math.abs(look.x) > .12 ? look.x : 0);
      pyaw += turn * 1.9 * dt;
      if (Math.abs(look.y) > .12) ppitch = Math.max(-.6, Math.min(.85, ppitch - look.y * 1.3 * dt));      /* the right stick: up looks up */
      var vx = Math.sin(pyaw) * fwd + Math.cos(pyaw) * side, vz = -Math.cos(pyaw) * fwd + Math.sin(pyaw) * side, vl = Math.hypot(vx, vz);
      if (vl > .01) { stepTo(player.x + vx / vl * 4, player.z + vz / vl * 4, Math.min(1, vl) * (Math.abs(stick.x) > .12 || Math.abs(stick.y) > .12 ? 8.4 : SPEED) * dt); bob = Math.sin(stride * 4.2) * .035; }
    }
    function typing(el) { return !!el && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.isContentEditable); }
    document.addEventListener('keydown', function (e) {
      var k = KEYMAP[String(e.key).toLowerCase()];
      if (!k || mode !== 'walk' || !active() || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (/^arrow/i.test(e.key) && document.activeElement !== stage) return;      /* the arrow keys scroll the page unless the town has the focus */
      var layer = document.getElementById('rbMenuLayer'); if (layer && !layer.hidden) return;                  /* the Menu is open */
      keys[k] = true; stopWalk(); e.preventDefault(); wake();
    });
    document.addEventListener('keyup', function (e) { var k = KEYMAP[String(e.key).toLowerCase()]; if (k) keys[k] = false; });
    window.addEventListener('blur', function () { keys = {}; stick.x = stick.y = look.x = look.y = 0; });
    if ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window) {
      // Two sticks: the left one walks (and steps sideways), the right one looks round, up and down.
      var makeStick = function (cls, v) {
        var pad = document.createElement('div'), knob = document.createElement('i'), padId = null; pad.className = 'igw-stick ' + cls; pad.setAttribute('aria-hidden', 'true'); pad.appendChild(knob); stage.appendChild(pad);
        var padMove = function (e) {
          var b = pad.getBoundingClientRect(), x = (e.clientX - b.left - b.width / 2) / (b.width / 2), y = (e.clientY - b.top - b.height / 2) / (b.height / 2), l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
          v.x = x; v.y = y; knob.style.transform = 'translate(' + Math.round(x * 34) + 'px,' + Math.round(y * 34) + 'px)';
        };
        var padEnd = function (e) { if (padId !== null && e.pointerId !== padId) return; padId = null; v.x = v.y = 0; knob.style.transform = ''; };
        pad.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (x) {} stopWalk(); padMove(e); wake(); });
        pad.addEventListener('pointermove', function (e) { if (e.pointerId !== padId) return; e.stopPropagation(); padMove(e); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { pad.addEventListener(n, function (e) { e.stopPropagation(); padEnd(e); }); });
      };
      makeStick('igw-stick-move', stick); makeStick('igw-stick-look', look);
    }

    var filmPose = null, filmCam = null, filmKey = null;      // only for recording a video (test hooks film / filmCam)
    function cameraPosition() {
      if (filmCam) { camera.position.set(filmCam[0], filmCam[1], filmCam[2]); camera.lookAt(filmCam[3], filmCam[4], filmCam[5]); try { ['ghost', 'echo'].forEach(function (w) { if (ACT[w] && ACT[w].b && ACT[w].b.sp) ACT[w].b.sp.visible = false; }); spirit.rotation.y = Math.atan2(camera.position.x - currentPos.x, camera.position.z - currentPos.z); echoSpirit.rotation.y = Math.atan2(camera.position.x - echoPos.x, camera.position.z - echoPos.z); } catch (e) {} return; }
      if (inSuite) { var shot = shotOf(camShot); if (shot) {
        // Streamer Cam now looks BACK at the seated host from the far side of
        // the screens. Keep both character models visible for every shot.
        if (suiteHid.ghost) { spirit.visible = true; suiteHid.ghost = false; }
        if (suiteHid.echo) { echoSpirit.visible = true; suiteHid.echo = false; }
        var wantFov = camShot === 'first' ? (camera.aspect < .9 ? 65 : 53) : (camShot === 'side' ? (camera.aspect < .9 ? 63 : 49) : (camera.aspect < .9 ? 70 : 55));
        if (Math.abs(camera.fov - wantFov) > .5) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
        camera.position.set(shot[0][0], shot[0][1], shot[0][2]); camera.lookAt(shot[1][0], shot[1][1], shot[1][2]); return; } }
      if (mode === 'walk') { var cq = Math.cos(ppitch), ey = EYE + bob + seatY + standY(); camera.position.set(player.x, ey, player.z); camera.lookAt(player.x + Math.sin(pyaw) * cq, ey + Math.sin(ppitch), player.z - Math.cos(pyaw) * cq); return; }
      var cp = Math.cos(pitch); camera.position.set(Math.sin(yaw) * cp * distance, Math.sin(pitch) * distance + 3, Math.cos(yaw) * cp * distance + 2); camera.lookAt(0, 2.0, 2.0);
    }
    function settle() { var t = SEALED ? (onAir('ghost') || [-14.5, 2.2]) : PLACES[world.where].at; currentPos.set(t[0], 0, t[1]); spirit.position.set(t[0], .13 + floorAt(t[0], t[1]), t[1]); spirit.rotation.y = Math.atan2(camera.position.x - t[0], camera.position.z - t[1]); shadow.position.set(t[0], .125, t[1]); }
    var carTan = new T.Vector3();
    function placeCars(t) {
      for (var i = 0; i < cars.length; i++) {
        var u = ((t * (world.live ? .05 : .025)) + i / cars.length) % 1, p = trackCurve.getPointAt(u); trackCurve.getTangentAt(u, carTan);
        cars[i].position.set(p.x + (i - 1) * .18 * -carTan.z, .02, p.z + (i - 1) * .18 * carTan.x); cars[i].rotation.y = -Math.atan2(carTan.z, carTan.x);
      }
      startLights.forEach(function (l, k) { l.material = world.live || ((t * 1.2) % 6) > k + .5 ? mats.red : mats.off; });
    }
    function draw() {
      if (disposed) return;
      frame = 0;
      if (!active() || !visible || document.hidden) { if (typeof vidLayer !== 'undefined' && vidLayer) vidLayer.style.display = 'none'; return; }
      if (typeof vidLayer !== 'undefined' && vidLayer) vidLayer.style.display = '';
      var rawDt = clock.getDelta();
      if (mode === 'walk' && inputActive()) manual(Math.min(rawDt, .25));
      try { var nowS = performance.now() / 1000; keyTick(nowS); cineTick(nowS); spotTick(nowS); } catch (e) {}      // keys and the cinematic spin run on real time, even when motion is paused
      if (mixers.length && !paused) mixers.forEach(function (m) { m.update(Math.min(rawDt, .1)); });
      if (!paused) {
        elapsed += Math.min(rawDt, .06); if (mode === 'walk') walkStep(Math.min(rawDt, .4));
        var t = (filmPose && filmPose.ghost) || onAir('ghost') || lifeGoal('ghost') || (SEALED ? [-14.5, 2.2] : PLACES[world.where].at); goal.set(t[0], 0, t[1]);      // in the arena his home is his station
        var studioGhostSeat = SEALED && SUITES.ghost && SUITES.ghost.seat;
        var before = currentPos.clone();
        if (studioGhostSeat) currentPos.set(studioGhostSeat[0], 0, studioGhostSeat[2]);
        else currentPos.lerp(goal, .012);
        var dx = currentPos.x - before.x, dz = currentPos.z - before.z, walking = dx * dx + dz * dz > .000004;
        spirit.position.set(currentPos.x, studioGhostSeat ? studioGhostSeat[1] - 1.02 : .13 + floorAt(currentPos.x, currentPos.z) + Math.sin(elapsed * 1.25 * pace) * .09, currentPos.z);
        blinkers.forEach(function (b, i) { b.visible = Math.sin(elapsed * 2.4 + i) > .55 && !(b.userData.fx && qual === 0); }); fireLights.forEach(function (f, i) { if (f.isLight) f.intensity = 8 + Math.sin(elapsed * 13 + i) * 3; else f.scale.set(1, 1 + Math.sin(elapsed * 11) * .18, 1); }); waters.forEach(function (w) { w.material.opacity = .55 + Math.sin(elapsed * 3) * .15; });
        var pulse = .5 + Math.sin(elapsed * 2.1) * .5, nearGhost = Math.max(0, 1 - Math.hypot(player.x - currentPos.x, player.z - currentPos.z) / 8); halo.material.opacity = .24 + pulse * .14; spark.scale.setScalar(1.0 + pulse * .25 + nearGhost * .12); heart.scale.set(.15 + pulse * .015, .15 + pulse * .015, .1); spinner.rotation.z = elapsed * .22; figure.rotation.z = Math.sin(elapsed * .7 * pace) * .05 * pace; figure.rotation.x = -.1 * nearGhost; clouds.rotation.y = elapsed * .003;
        spirit.rotation.y = filmCam ? Math.atan2(camera.position.x - currentPos.x, camera.position.z - currentPos.z) : (onAir('ghost') && SUITES.ghost && Math.hypot(currentPos.x - SUITES.ghost.seat[0], currentPos.z - SUITES.ghost.seat[2]) < 1.2 ? SUITES.ghost.yaw : lifeFace('ghost', currentPos, elapsed));
        if (suiteHid.ghost) { spirit.visible = true; suiteHid.ghost = false; }
        shadow.position.set(currentPos.x, .125, currentPos.z); dust.rotation.y = elapsed * .007;
        beacon.material = Math.sin(elapsed * 2.2) > .2 ? mats.light : mats.off;
        slot.material = world.where === 'post' && Math.sin(elapsed * 3) > 0 ? mats.white : mats.warm;
        placeCars(elapsed); skyTick(elapsed, Math.min(rawDt, .1)); echoTick(elapsed); lifeTick(elapsed); chatTick(elapsed); prankTick(elapsed); thirdTick(elapsed); onlineSync(); chipTick(elapsed); plotTick(elapsed); if (prank) prank.g.rotation.y = elapsed * .8; sweepers.forEach(function (sw) { sw[0].rotation.y = sw[1] + Math.sin(elapsed * .35 + sw[2] * 1.7) * .9; }); if (searchlight) searchlight.rotation.z = Math.sin(elapsed * .4) * .35;
      }
      if (Math.floor(stride / 1.05) !== lastSoundStride) { lastSoundStride = Math.floor(stride / 1.05); soundStep(); }
      soundLandscape();
      updateWalkMarker(); cameraPosition(); sizeTags(); present(elapsed); hudTick();
      if (!paused || inputActive() || cine) frame = requestAnimationFrame(draw);      /* the cinematic spin draws every frame */
    }
    // On foot, a name would fill the screen up close and vanish far off: keep each about the same size, and hide it at arm's length.
    // On foot, names only show for what you are looking at or standing near, and fade in and out; on a phone at most three.
    var fwd3 = new T.Vector3(), to3 = new T.Vector3(), tagClock = 0;
    function sizeTags() {
      var all = tags.concat(houseTags, streetTags.filter(function (t) { return t.isSprite; })), shown = [], nowT = performance.now(), step = tagClock ? Math.min(1, (nowT - tagClock) / 220) : 1; tagClock = nowT;
      if (mode === 'walk') camera.getWorldDirection(fwd3);
      all = all.filter(function (t) { if (t.userData.gone) { t.visible = false; return false; } return true; });
      all.forEach(function (t) {
        var base = t.userData.base || [7.2, 1.35], k = 1, want = 1;
        if (mode === 'walk') {
          var d = camera.position.distanceTo(t.position); k = Math.max(.32, Math.min(1.0, d / 34));
          to3.copy(t.position).sub(camera.position).normalize(); var ang = Math.acos(Math.max(-1, Math.min(1, to3.dot(fwd3))));
          var house = t.userData.named !== undefined || t.userData.street, near = house ? 14 : 22, cone = house ? .26 : .4;
          want = d < 5 ? 0 : (d < near && ang < .75 ? 1 : (ang < cone && d < (house ? 30 : 75) ? 1 : 0));
          if (want) shown.push([ang + d * .02, t]);
        }
        t.userData.want = want; t.scale.set(base[0] * k, base[1] * k, 1);
      });
      if (mode === 'walk') {
        var cap = camera.aspect < .9 ? 3 : 6; shown.sort(function (p, q) { return p[0] - q[0]; }); shown.slice(cap).forEach(function (p) { p[1].userData.want = 0; });
      }
      all.forEach(function (t) {
        var o = t.material.opacity === undefined ? 1 : t.material.opacity, goal = t.userData.want, n = paused ? goal : o + (goal - o) * step;
        t.material.opacity = n; t.visible = n > .03;
      });
    }
    function still() { if (!ready) return; updateWalkMarker(); cameraPosition(); camera.updateMatrixWorld(); sizeTags(); spirit.rotation.y = Math.atan2(camera.position.x - spirit.position.x, camera.position.z - spirit.position.z); if (typeof echoSpirit !== 'undefined' && echoSpirit && typeof echoPos !== 'undefined' && echoPos) echoSpirit.rotation.y = Math.atan2(camera.position.x - echoPos.x, camera.position.z - echoPos.z); stillDraw(); }
    // A still frame is drawn once, on the next screen refresh, however many things asked for one; and not at all while
    // the arena is already drawing itself every frame.
    var stillQueued = 0;
    function stillDraw() { if (frame || stillQueued) return; stillQueued = requestAnimationFrame(function () { stillQueued = 0; if (disposed || !ready) return; present(elapsed); if (typeof hudTick === 'function') hudTick(true); }); }
    function wake() { if (!ready) return; if (!frame && active() && visible && !document.hidden) { clock.getDelta(); frame = requestAnimationFrame(draw); } }
    function resize() {
      if (wrap && where() === 'home') { var topNow = Math.round(stage.getBoundingClientRect().top + window.scrollY); if (wrap.style.getPropertyValue('--igw-top') !== topNow + 'px') wrap.style.setProperty('--igw-top', topNow + 'px'); }
      var w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
      var qc = [[1, 700000], [1.25, 1100000], [1.5, 1500000]][typeof qual === 'number' ? qual : 2];
      renderer.setPixelRatio(Math.max(.6, Math.min(window.devicePixelRatio || 1, qc[0], Math.sqrt(qc[1] / (w * h)))));      /* never more pixels than the quality allows (high: about 1.5 million) */
      renderer.setSize(w, h, false); if (typeof post !== 'undefined' && post) post.size(w, h); camera.aspect = w / h; camera.fov = mode === 'walk' ? (camera.aspect < .9 ? 78 : (camera.aspect < 1.2 ? 70 : 62)) : (camera.aspect < .9 ? 58 : (camera.aspect < 1.2 ? 50 : 42));
      var narrow = camera.aspect < 1.2;
      // The wider outer districts need more room on a narrow portrait screen.
      // Frame the full town on first load; visitors can zoom in on any area.
      defaultDistance = narrow ? Math.min(92, Math.max(70, 56 / camera.aspect)) : 72; defaultPitch = narrow ? .5 : .42; if (!adjusted) { distance = defaultDistance; pitch = defaultPitch; }
      tags.forEach(function (t) { t.userData.base = narrow ? [9.5, 1.8] : [7.2, 1.35]; });
      camera.updateProjectionMatrix(); if (paused) still(); else wake();
    }
    function pauseState() {
      if (pauseButton) { pauseButton.textContent = paused ? 'Resume animation' : 'Pause animation'; pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false'); }
      if (status) status.textContent = paused ? 'Animation paused. Tapping a place opens it straight away.' : (STICKS ? 'You are standing in the arena. Walk with the left stick; tap Ghost or Echo to say hello.' : 'You are standing in the arena. Click a place to walk there.');
      if (paused) { walkTo = null; say(TAP + ' a place to go there'); } else if (!walkTo) say(IDLE);
      if (!paused) wake(); else { if (frame) cancelAnimationFrame(frame); frame = 0; settle(); placeCars(0); still(); }
    }
    function applyWorld() { showWhere(); drawBoard(); drawJumbo(world.sides.i, world.sides.g); lightWindows(); growTown(); placeThings(); feel(); if (typeof clanRefresh === 'function') clanRefresh(); freshen(); if (paused) { settle(); still(); } else wake(); }
    // What the town shows is refreshed once a minute while this page is open: where he is, the next game night, the lit windows.
    function syncState(force) {
      if (!active() || document.hidden || pollBusy || (!force && Date.now() - lastPoll < 55000)) return;
      pollBusy = true; lastPoll = Date.now();
      fetch(ISOCORE_ASSET_BASE + 'api/ghost.world', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); }).then(function (v) {
        if (!v || !v.on || !PLACES[v.where]) return;
        world.where = v.where; world.live = !!v.live; world.next = Number(v.next) || 0; world.lit = Math.max(0, Math.min(18, Number(v.lit) || 0)); if (v.stats && typeof v.stats === 'object') { world.stats = v.stats; if (typeof showStats === 'function') showStats(); } if (v.items !== undefined) world.items = itemList(v.items); if (v.streets !== undefined) world.streets = streetList(v.streets); ['echo', 'banter', 'gifts', 'clan', 'lore', 'stream', 'log', 'will', 'score', 'result', 'lastweek', 'party', 'online', 'kiwi', 'sim', 'third', 'free', 'discord', 'arena', 'onair', 'sync', 'sched'].forEach(function (k) { if (v[k] !== undefined) world.extra[k] = v[k]; }); try { arenaNews(); watchShow(); introCheck(); } catch (e) {} if (v.mood !== undefined) world.mood = MOODS[v.mood] ? v.mood : ''; if (v.homes !== undefined) world.homes = Math.max(0, Number(v.homes) || 0); if (v.houses !== undefined) world.houses = houseList(v.houses); if (v.sides) world.sides = sidePair(v.sides.isocore, v.sides.gridsync);
        if (doing && v.caption) doing.textContent = v.caption;
        applyWorld();
      }).catch(function () { /* the town keeps showing what it last knew */ }).then(function () { pollBusy = false; });
    }

    // Zoom buttons, so the town can be explored on a touch screen without taking over the page's own scrolling.
    var controls = stage.parentNode.querySelector('.igw-controls');
    function zoom(amount) { adjusted = true; distance = Math.max(22, Math.min(120, distance + amount)); still(); wake(); }
    function addZoom(label, amount) {
      if (!controls) return;
      var button = document.createElement('button'); button.type = 'button'; button.className = 'igw-control'; button.textContent = label;
      button.setAttribute('aria-label', label + ' on the arena'); zoomButtons.push(button);
      button.addEventListener('click', function () { zoom(amount); });
      controls.insertBefore(button, help || null);
    }
    addZoom('Zoom in', -8); addZoom('Zoom out', 8);
    var moveButtons = [], viewButton = null;
    function addMove(label, act) {
      if (!controls) return;
      var button = document.createElement('button'); button.type = 'button'; button.className = 'igw-control'; button.textContent = label; moveButtons.push(button); zoomButtons.push(button);
      button.addEventListener('click', function () { stopWalk(); act(); still(); wake(); });
      controls.insertBefore(button, help || null);
    }
    function forward(len) { stepTo(player.x + Math.sin(pyaw) * 4, player.z - Math.cos(pyaw) * 4, len); if (!paused) bob = Math.sin(stride * 4.2) * .035; }
    addMove('Turn left', function () { pyaw -= .35; }); addMove('Step forward', function () { forward(1.2); }); addMove('Turn right', function () { pyaw += .35; });
    if (controls) {
      viewButton = document.createElement('button'); viewButton.type = 'button'; viewButton.className = 'igw-control'; zoomButtons.push(viewButton);
      viewButton.addEventListener('click', function () { stopWalk(); mode = mode === 'walk' ? 'above' : 'walk'; modeState(); resize(); still(); wake(); });
      controls.insertBefore(viewButton, help || null);
    }
    function modeState() {
      stage.classList.toggle('is-walk', mode === 'walk');
      if (viewButton) viewButton.textContent = mode === 'walk' ? 'See it from above' : 'Back to walking';
      moveButtons.forEach(function (b) { b.hidden = mode !== 'walk'; });
      zoomButtons.forEach(function (b) { if (/^Zoom/.test(b.textContent)) b.hidden = mode === 'walk'; });
      if (resetButton) resetButton.textContent = mode === 'walk' ? 'Back to the start' : 'Reset view';
    }
    function returnToGate() {
      stopWalk(); keys = {}; stick.x = stick.y = look.x = look.y = 0;
      if (mode !== 'walk') { mode = 'walk'; modeState(); resize(); }
      seatY = 0; seatAt = null; player.x = START.x; player.z = START.z; pyaw = START.yaw; ppitch = START.pitch; bob = 0;
      if (seatHome) { seatY = seatHome.y; seatAt = seatHome.at.slice(); player.x = seatHome.x; player.z = seatHome.z; pyaw = seatHome.yaw; ppitch = seatHome.pitch; seated(true); }
      say(IDLE); if (status) status.textContent = seatHome ? 'You are back in your seat.' : CITY ? 'You are back on the stage.' : 'You are back at the gate.'; still(); wake();
    }
    if (pauseButton) pauseButton.addEventListener('click', function () { paused = !paused; pauseState(); });
    if (resetButton) resetButton.addEventListener('click', function () { stopWalk(); if (mode === 'walk') { seatY = 0; seatAt = null; player.x = START.x; player.z = START.z; pyaw = START.yaw; ppitch = START.pitch; bob = 0; if (status) status.textContent = 'You are back at the gate.'; } else { adjusted = false; yaw = defaultYaw; pitch = defaultPitch; distance = defaultDistance; if (status) status.textContent = 'Camera view reset.'; } still(); wake(); });

    // A tap that did not turn into a drag picks the building under it.
    var ray = new T.Raycaster(), ndc = new T.Vector2();
    function placeScreen(id, bounds) {
      var p = PLACES[id]; if (!p) return null;
      var v = new T.Vector3(p.x, id === 'circuit' ? .6 : 1.0, p.z + (id === 'circuit' ? -.1 : 0));
      camera.updateMatrixWorld(); v.project(camera);
      if (v.z > 1 || v.z < -1) return null;                              /* behind whoever is looking */
      return { x: bounds.left + (v.x + 1) / 2 * bounds.width, y: bounds.top + (1 - v.y) / 2 * bounds.height };
    }
    function pick(clientX, clientY) {
      var pk = pokeHit(clientX, clientY); if (pk) return 'poke:' + pk;
      var b = canvas.getBoundingClientRect();
      // Buildings are deliberately small in the full-town mobile view. Give
      // their centres a finger-sized target while keeping real links below.
      if (b.width < 600) {
        var nearest = '', best = 22 * 22;
        Object.keys(PLACES).forEach(function (id) {
          var s = placeScreen(id, b); if (!s) return; var dx = s.x - clientX, dy = s.y - clientY, d = dx * dx + dy * dy;
          if (d < best) { best = d; nearest = id; }
        });
        if (nearest) return nearest;
      }
      ndc.set((clientX - b.left) / b.width * 2 - 1, -((clientY - b.top) / b.height * 2 - 1));
      ray.setFromCamera(ndc, camera); var hits = ray.intersectObjects(pickable, false).filter(function (h) { return h.object.visible; });
      if (!hits.length) return '';
      var hit = hits[0]; if (hit.object.userData.gameNight) return 'game-night'; if (hit.object.userData.prank) return 'prank'; if (hit.object.userData.plot) return 'plot:' + hit.object.userData.plot; if (hit.object.userData.jumbo) return 'jumbo'; if (hit.object.userData.wall !== undefined && wallStream(hit.object.userData.wall)) return 'wall:' + hit.object.userData.wall; if (hit.object.userData.rig !== undefined && rigStream(hit.object.userData.rig)) return 'rig:' + hit.object.userData.rig; if (hit.object.userData.lore) return 'lore'; if (hit.object.userData.named !== undefined) return 'house:' + hit.object.userData.named;
      var hn = hit.object === mBody ? instNamed[hit.instanceId] : hit.object.userData.cityHouses ? hit.object.userData.cityHouses[hit.instanceId] : (hit.object.userData.house !== undefined ? townNamed[hit.object.userData.house] : undefined);
      if (hn !== undefined) return hn >= 0 ? 'house:' + hn : '';
      return hit.object.userData.place || '';
    }
    stage.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY }; moved = 0; downAt = e.timeStamp; if (e.pointerType === 'mouse') stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) { if (e.pointerType === 'mouse') stage.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return;
      if (inSuite) return;
      if (mode === 'walk') { stopWalk(); pyaw -= dx * .005; if (e.pointerType === 'mouse' || seatY) ppitch = Math.max(-.6, Math.min(.85, ppitch + dy * .004)); still(); wake(); return; }
      adjusted = true; yaw -= dx * .006; pitch = Math.max(.1, Math.min(1.25, pitch + dy * .005)); still(); wake();
    });
    stage.addEventListener('pointerup', function (e) { var was = drag; drag = null; if (was && moved < 6 && e.timeStamp - downAt < 1500) { /* the events' own times, so a busy phone does not lose a tap */ var id = pick(e.clientX, e.clientY), gp = id ? null : groundAt(e.clientX, e.clientY); if (id === 'game-night') openNight(); else if (id === 'jumbo') { startAll(); if (!liveStream() || !vids[liveStream().login]) openStream(); } else if (id === 'prank') returnPrank(); else if (/^plot:/.test(id)) plotTap(id.slice(5)); else if (/^poke:/.test(id)) poke(id.slice(5)); else if (/^wall:\d$/.test(id)) { startAll(); var wsm = wallStream(+id.slice(5)); if (wsm && !vids[wsm.login]) openStream(wsm); } else if (/^rig:\d$/.test(id)) { startAll(); var rsm = rigStream(+id.slice(4)); if (rsm && !vids[rsm.login]) openStream(rsm); } else if (id) { if (STICKS) openNear(id); else startWalk(id); } else if (gp) { if (!STICKS) stroll(gp); } else stopWalk(); } });
    // The big screen: when a member is live it plays their stream over the town (muted until they turn it up).
    var liveBox = null;
    function openStream(which, sound) {
      var sm = which || liveStream(); if (!sm) { startWalk('broadcast'); return; }
      if (liveBox) liveBox.remove();
      liveBox = document.createElement('div'); liveBox.className = 'igw-live'; liveBox.setAttribute('role', 'dialog'); liveBox.setAttribute('aria-label', 'Live stream');
      var head = document.createElement('div'); head.className = 'igw-live-head'; head.textContent = 'LIVE  ' + (sm.name || sm.login);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'igw-live-x'; x.textContent = 'Close'; x.addEventListener('click', function (e) { e.stopPropagation(); liveBox.remove(); liveBox = null; });
      var fr = document.createElement('iframe'); fr.src = 'https://player.twitch.tv/?channel=' + encodeURIComponent(sm.login) + '&parent=' + encodeURIComponent(location.hostname) + '&muted=' + (sound ? 'false' : 'true'); fr.setAttribute('allowfullscreen', ''); fr.setAttribute('allow', 'autoplay; fullscreen'); fr.title = 'Live stream';
      head.appendChild(x); liveBox.appendChild(head); liveBox.appendChild(fr);
      ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'keydown'].forEach(function (ev) { liveBox.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      stage.appendChild(liveBox);
    }
    function release() { drag = null; } stage.addEventListener('pointercancel', release); stage.addEventListener('lostpointercapture', release);
    stage.addEventListener('keydown', function (e) {
      var handled = true;
      if (mode === 'walk') return;                                      /* on foot the keys are held, see above */
      if (e.key === 'ArrowLeft') yaw -= .12; else if (e.key === 'ArrowRight') yaw += .12; else if (e.key === 'ArrowUp') pitch = Math.max(.1, pitch - .08); else if (e.key === 'ArrowDown') pitch = Math.min(1.25, pitch + .08);
      else if (e.key === '+' || e.key === '=') distance = Math.max(22, distance - 6); else if (e.key === '-') distance = Math.min(120, distance + 6); else handled = false;
      if (handled) { adjusted = true; e.preventDefault(); still(); wake(); }
    });
    stage.addEventListener('wheel', function (e) { if (!e.ctrlKey) return; e.preventDefault(); zoom(e.deltaY * .02); }, { passive: false });
    if (reduced && reduced.addEventListener) reduced.addEventListener('change', function (e) { if (e.matches) { paused = true; pauseState(); } });
    document.addEventListener('visibilitychange', function () { soundSync(); if (!document.hidden) { syncState(true); wake(); } });
    window.addEventListener('hashchange', function () { soundSync(); if (active()) syncState(true); });
    setInterval(function () { syncState(false); drawBoard(); if (paused && active()) still(); }, 60000);
    if ('IntersectionObserver' in window) { new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; soundSync(); if (visible) wake(); }, { threshold: .01 }).observe(stage); }
    if ('ResizeObserver' in window) { new ResizeObserver(resize).observe(stage); } else window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); disposed = true; soundSync(); if (frame) cancelAnimationFrame(frame); fallback(); });

    // =====================================================================================================================
    // ---- The cinematic layer. Everything above builds the town; this dresses it like a big-budget game: surfaced materials
    //      (panels, grime, wet asphalt) with relief, real architecture on every building (window grids, ledges, parapets),
    //      a lit city skyline and a moon, mist and light shafts, moonlight shadows, reflections, and a film pipeline (HDR,
    //      bloom, tone mapping, colour grade, lens edge, vignette, grain). Quality is chosen per device and steps down by
    //      itself if the device cannot keep up; the lowest step is the plain town as it was.
    // =====================================================================================================================
    var coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    var QUAL = ['low', 'medium', 'high'], qual = 2;
    // a computer with no graphics chip (drawing in software) starts on the plain town
    try { var gl0 = renderer.getContext(), dbg = gl0.getExtension('WEBGL_debug_renderer_info'), gpu = dbg ? String(gl0.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''; if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) qual = 0; } catch (e) {}
    // Options > Quality (README-ADMIN 278): High (the default, never steps down), Medium, Low, or Auto (starts high and steps
    // down by itself if the device cannot keep up). Remembered on the device. The arena itself always loads on every setting.
    var QSET = ['high', 'medium', 'low', 'auto'], qset = 'high';
    try { var qs0 = localStorage.getItem('igw_qset'); if (QSET.indexOf(qs0) >= 0) qset = qs0; } catch (e) {}
    if (qset !== 'auto' && qset !== 'high') qual = QUAL.indexOf(qset); else if (qset === 'high') qual = 2;
    try { var asked = (new URLSearchParams(location.search)).get('igwq'); if (asked && QUAL.indexOf(asked) >= 0) { qual = QUAL.indexOf(asked); qset = asked; } } catch (e) {}
    var qHold = qset !== 'auto';   /* only Auto steps itself down */

    // ---- Surfaces. One set of procedural maps, laid at a fixed size in the world (1.6 m a tile), so a tower and a crate
    //      carry the same panel size. Each map is drawn on a canvas; the relief map is worked out from the same drawing.
    function canvasOf(size, paint) { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); paint(x, size); return c; }
    function rnd(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
    function reliefFrom(src, strength) {
      if (src.width > 256) { var small = document.createElement('canvas'); small.width = small.height = 256; small.getContext('2d').drawImage(src, 0, 0, 256, 256); src = small; strength *= .5; }
      var w = src.width, h = src.height, sx = src.getContext('2d').getImageData(0, 0, w, h).data, out = document.createElement('canvas'); out.width = w; out.height = h;
      var ox = out.getContext('2d'), od = ox.createImageData(w, h), d = od.data;
      for (var j = 0; j < h; j++) {
        var rowU = ((j + 1) % h) * w, rowD = ((j - 1 + h) % h) * w, row = j * w;
        for (var i = 0; i < w; i++) {
          var il = (i - 1 + w) % w, ir = (i + 1) % w;
          var dx = (sx[(row + ir) * 4] - sx[(row + il) * 4]) / 255 * strength, dy = (sx[(rowU + i) * 4] - sx[(rowD + i) * 4]) / 255 * strength, nz = 1 / Math.sqrt(dx * dx + dy * dy + 1), k = (row + i) * 4;
          d[k] = (-dx * nz * .5 + .5) * 255; d[k + 1] = (dy * nz * .5 + .5) * 255; d[k + 2] = nz * 255; d[k + 3] = 255;
        }
      }
      ox.putImageData(od, 0, 0); return out;
    }
    var allTex = [];
    function tex(c, srgb) { var t = new T.CanvasTexture(c); allTex.push(t); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); if (srgb) t.colorSpace = T.SRGBColorSpace; return t; }
    // facade panels: seams, bolt heads, tonal variation, rain streaks down from each seam
    var panelH = canvasOf(512, function (x, n) {
      var r = rnd(7); x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, n, n);
      for (var py = 0; py < 4; py++) for (var px = 0; px < 4; px++) { var v = 130 + r() * 40 | 0; x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(px * 128 + 3, py * 128 + 3, 122, 122); }
      x.fillStyle = '#3a3a3a'; for (var s = 0; s <= 4; s++) { x.fillRect(s * 128 - 2, 0, 4, n); x.fillRect(0, s * 128 - 2, n, 4); }
      x.fillStyle = '#e0e0e0'; for (var by = 0; by < 4; by++) for (var bx = 0; bx < 4; bx++) [[10, 10], [118, 10], [10, 118], [118, 118]].forEach(function (b) { x.beginPath(); x.arc(bx * 128 + b[0], by * 128 + b[1], 2.5, 0, 7); x.fill(); });
      for (var k = 0; k < 900; k++) { var v2 = r() * 255 | 0; x.fillStyle = 'rgba(' + v2 + ',' + v2 + ',' + v2 + ',.05)'; x.fillRect(r() * n, r() * n, 2 + r() * 6, 2 + r() * 6); }
    });
    var panelC = canvasOf(512, function (x, n) {
      x.drawImage(panelH, 0, 0); var r = rnd(11);
      for (var k = 0; k < 140; k++) { var sx2 = r() * n, len = 30 + r() * 120, g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(20,24,30,.35)'); g.addColorStop(1, 'rgba(20,24,30,0)'); x.save(); x.translate(sx2, Math.floor(r() * 4) * 128 + 4); x.fillStyle = g; x.fillRect(0, 0, 1.5 + r() * 3, len); x.restore(); }
      x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgba(190,200,215,1)'; x.fillRect(0, 0, n, n);
    });
    var panelRough = canvasOf(256, function (x, n) { x.drawImage(panelH, 0, 0, n, n); x.globalCompositeOperation = 'difference'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, n, n); x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(160,160,160,.55)'; x.fillRect(0, 0, n, n); });
    var tPanel = tex(panelC, true), tPanelN = tex(reliefFrom(panelH, 2.2)), tPanelR = tex(panelRough);
    // wet asphalt: fine grain, cracks, and puddles that are smooth (mirror-like) where the rest is rough
    var asphH = canvasOf(512, function (x, n) {
      var r = rnd(3); x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
      for (var k = 0; k < 9000; k++) { var v = 100 + r() * 70 | 0; x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2); }
      x.strokeStyle = 'rgba(30,30,30,.7)'; x.lineWidth = 1.2; for (var c = 0; c < 10; c++) { x.beginPath(); var cx = r() * n, cy = r() * n; x.moveTo(cx, cy); for (var s = 0; s < 8; s++) { cx += (r() - .5) * 50; cy += (r() - .5) * 50; x.lineTo(cx, cy); } x.stroke(); }
    });
    var puddles = canvasOf(512, function (x, n) {
      var r = rnd(5); x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, n, n);
      for (var k = 0; k < 14; k++) { var px = r() * n, py = r() * n, rr = 20 + r() * 70; [[0, 0], [n, 0], [0, n], [n, n], [-n, 0], [0, -n]].forEach(function (o) { var g = x.createRadialGradient(px + o[0], py + o[1], 0, px + o[0], py + o[1], rr); g.addColorStop(0, 'rgba(18,18,18,1)'); g.addColorStop(.7, 'rgba(18,18,18,.9)'); g.addColorStop(1, 'rgba(18,18,18,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n); }); }
    });
    var tAsphN = tex(reliefFrom(asphH, 1.4)), tPuddle = tex(puddles), tAsphC = tex(canvasOf(512, function (x, n) { x.drawImage(asphH, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = '#9aa6bc'; x.fillRect(0, 0, n, n); }), true);

    // lay a map at world size on a box: every face's UVs scaled to that face's size in metres
    var TILE = 2.4, dressed = [];
    function worldUV(m) {
      var g = m.geometry; if (!g || g.userData.wuv || !g.attributes.uv) return;
      var s = new T.Vector3(); m.getWorldScale(s);
      if (g.type === 'BoxGeometry') {
        var p = g.parameters, faces = [[p.depth * s.z, p.height * s.y], [p.depth * s.z, p.height * s.y], [p.width * s.x, p.depth * s.z], [p.width * s.x, p.depth * s.z], [p.width * s.x, p.height * s.y], [p.width * s.x, p.height * s.y]], uv = g.attributes.uv;
        for (var f = 0; f < 6; f++) for (var v = 0; v < 4; v++) { var i = f * 4 + v; uv.setXY(i, uv.getX(i) * faces[f][0] / TILE, uv.getY(i) * faces[f][1] / TILE); }
      } else if (g.type === 'CylinderGeometry') {
        var q = g.parameters, cu = g.attributes.uv; for (var k = 0; k < cu.count; k++) cu.setXY(k, cu.getX(k) * Math.PI * (q.radiusTop + q.radiusBottom) * s.x / TILE, cu.getY(k) * q.height * s.y / TILE);
      } else if (g.type === 'CircleGeometry' || g.type === 'RingGeometry' || g.type === 'PlaneGeometry') {
        var pu = g.attributes.uv, pos = g.attributes.position; for (var c2 = 0; c2 < pu.count; c2++) pu.setXY(c2, pos.getX(c2) * s.x / (TILE * 2.5), pos.getY(c2) * s.y / (TILE * 2.5));
      } else return;
      g.attributes.uv.needsUpdate = true; g.userData.wuv = true;
    }
    function dress(mat, kind) {
      if (!mat || mat.userData.dressed) return; mat.userData.dressed = true; mat.userData.baseColor = mat.color.clone(); mat.userData.baseRough = mat.roughness; mat.userData.baseMetal = mat.metalness; dressed.push(mat);
      if (kind === 'facade') { mat.map = tPanel; mat.normalMap = tPanelN; mat.normalScale = new T.Vector2(.9, .9); mat.roughnessMap = tPanelR; mat.color.multiplyScalar(1.25); }
      if (kind === 'metal') { mat.normalMap = tAsphN; mat.normalScale = new T.Vector2(.25, .25); mat.roughness = .35; mat.metalness = .8; }
      if (kind === 'wet') { mat.map = tAsphC; mat.normalMap = tAsphN; mat.normalScale = new T.Vector2(.6, .6); mat.roughnessMap = tPuddle; mat.roughness = 1; mat.metalness = .35; mat.envMapIntensity = .45; mat.color.multiplyScalar(.75); }
      mat.needsUpdate = true;
    }

    // ---- Architecture: every building body (a tall box) gets window bays with frames and glass, ledges between floors and
    //      a parapet round the roof. Windows are drawn as two instanced meshes for the whole town, so they cost almost nothing.
    function architecture() {
      scene.updateMatrixWorld(true);
      var bodies = [];
      ['home', 'barracks', 'rosters', 'broadcast', 'staff'].forEach(function (id) {
        var g = PLACES[id] && PLACES[id].group; if (!g || !g.visible) return;
        g.traverse(function (o) {
          if (!o.isMesh || !o.geometry || o.geometry.type !== 'BoxGeometry' || !o.material || !o.material.isMeshStandardMaterial || o.material.emissiveIntensity > .3 && o.material.emissive && o.material.emissive.getHex()) return;
          var p = o.geometry.parameters, ws = new T.Vector3(); o.getWorldScale(ws); if (p.height * ws.y >= 2.4 && p.width * ws.x >= 2.4 && p.depth * ws.z >= 1.8 && bodies.length < 40) bodies.push({ m: o, id: id });
        });
      });
      var frames = [], glass = [], ledges = [], tmp = new T.Matrix4(), r = rnd(19);
      bodies.forEach(function (b) {
        var p = b.m.geometry.parameters, hw = p.width / 2, hd = p.depth / 2, hh = p.height / 2;
        // a ledge every floor and a parapet on the roof
        for (var y = -hh + 2.6; y < hh - .6; y += 2.6) ledges.push([b.m, 0, y, 0, p.width + .2, .14, p.depth + .2]);
        ledges.push([b.m, 0, hh + .2, hd - .06, p.width + .1, .4, .12], [b.m, 0, hh + .2, -hd + .06, p.width + .1, .4, .12], [b.m, hw - .06, hh + .2, 0, .12, .4, p.depth], [b.m, -hw + .06, hh + .2, 0, .12, .4, p.depth]);
        [[0, hd, p.width, 0], [Math.PI, -hd, p.width, 0], [Math.PI / 2, hw, p.depth, 1], [-Math.PI / 2, -hw, p.depth, 1]].forEach(function (f) {
          var span = f[2], cols = Math.max(1, Math.floor((span - .8) / 1.5)), rows = Math.max(1, Math.floor((p.height - 1.6) / 2.6));
          if (b.id === 'home') rows = Math.max(1, Math.floor((p.height - 1.0) / 1.3));
          var vstep = b.id === 'home' ? 1.3 : 2.6;
          for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) {
            var u = -span / 2 + (span - (cols - 1) * 1.5) / 2 + cx * 1.5, v = -hh + 1.5 + cy * vstep, lit = r();
            if (Math.abs(f[1]) > 0 && f[0] === 0 && v < -hh + 4.2 && Math.abs(u) < 2.0) continue;                 /* keep the doorway clear */
            var local = new T.Matrix4().makeRotationY(f[0]).multiply(new T.Matrix4().makeTranslation(u, v, Math.abs(f[1]) + .012));
            var world = new T.Matrix4().multiplyMatrices(b.m.matrixWorld, local);
            frames.push(world.clone().multiply(tmp.makeScale(1.0, b.id === 'home' ? .95 : 1.5, .08)));
            glass.push([world.clone().multiply(new T.Matrix4().makeTranslation(0, 0, .05)).multiply(tmp.makeScale(.82, b.id === 'home' ? .8 : 1.3, .02)), lit]);
          }
        });
      });
      var fm = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mats.foot, Math.max(1, frames.length)); fm.count = frames.length; frames.forEach(function (m, i) { fm.setMatrixAt(i, m); }); fm.userData.fx = true; scene.add(fm);
      var glassMat = new T.MeshStandardMaterial({ color: 0x050a12, roughness: .22, metalness: .55, envMapIntensity: .35, emissive: 0xffffff, emissiveIntensity: 1 });
      var gm = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), glassMat, Math.max(1, glass.length)); gm.count = glass.length;
      var warmLit = new T.Color(0xffb35c).multiplyScalar(1.6), coolLit = new T.Color(0x7fd8ff).multiplyScalar(1.4), off = new T.Color(0x000000), tv = new T.Color(0x9fb8ff).multiplyScalar(.8);
      glass.forEach(function (g, i) { gm.setMatrixAt(i, g[0]); gm.setColorAt(i, g[1] < .38 ? warmLit : (g[1] < .5 ? coolLit : (g[1] < .56 ? tv : off))); });
      if (gm.instanceColor) gm.instanceColor.needsUpdate = true; gm.userData.fx = true; scene.add(gm);
      ledges.forEach(function (l) { var lm = box(l[4], l[5], l[6], mats.rim, l[1], l[2], l[3], l[0]); lm.userData.arch = true; lm.userData.fx = true; });
      return { frames: frames.length, windows: glass.length };
    }

    // ---- The world beyond the rail: a lit city on the horizon, a moon with its halo, street trees, mist and light shafts.
    function horizon() {
      // the country round the base: dark pine forest on rolling hills, mountains on the horizon, no city
      var pine = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .95 }), pineDark = new T.MeshStandardMaterial({ color: 0x30291f, roughness: .98 });
      var cityMat = pineDark, trees2 = coarse ? 400 : 800, r2 = rnd(29), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), cityRefSet = false;
      var forest = new T.InstancedMesh(new T.ConeGeometry(1, 1, 10), pine, trees2 * 3);
      var treeTrunks = new T.InstancedMesh(new T.CylinderGeometry(.16, .22, 1, 7), pineDark, trees2), leafColour = new T.Color();
      for (var i = 0; i < trees2; i++) {
        var a = r2() * Math.PI * 2, rad = RO + 18 + Math.pow(r2(), .7) * 130, h = 7 + r2() * 9, w = 2.2 + r2() * 1.6;
        var tx = Math.cos(a) * rad, tz = Math.sin(a) * rad, groundY = -1.2 + Math.sin(a * 3 + rad * .05) * 1.5;
        e.set(0, r2() * Math.PI, 0); q.setFromEuler(e);
        m4.compose(new T.Vector3(tx, groundY + h * .16, tz), q, new T.Vector3(w, h * .32, w)); treeTrunks.setMatrixAt(i, m4);
        for (var layer = 0; layer < 3; layer++) {
          var scale = 1 - layer * .23; m4.compose(new T.Vector3(tx, groundY + h * (.38 + layer * .18), tz), q, new T.Vector3(w * scale, h * .48, w * scale));
          var ti = i * 3 + layer; forest.setMatrixAt(ti, m4); leafColour.setHex((i % 4 === 0) ? 0x345441 : ((i % 3 === 0) ? 0x293e32 : 0x284b36)); forest.setColorAt(ti, leafColour);
        }
      }
      forest.instanceMatrix.needsUpdate = true; treeTrunks.instanceMatrix.needsUpdate = true; if (forest.instanceColor) forest.instanceColor.needsUpdate = true;
      // Both meshes use instancing, so the detailed horizon remains visible
      // on the low setting without a separate draw call for every tree.
      forest.userData.noShadow = true; treeTrunks.userData.noShadow = true; scene.add(forest); scene.add(treeTrunks); forestRef = [forest, treeTrunks, trees2];
      var mountMat = new T.MeshStandardMaterial({ color: 0x344450, roughness: .96 });
      var mountainGeo = new T.ConeGeometry(1, 1, 14, 4), mp = mountainGeo.attributes.position;
      for (var mv = 0; mv < mp.count; mv++) { var my = mp.getY(mv), noise = 1 + (r2() - .5) * .3 * Math.max(0, .5 - my); mp.setX(mv, mp.getX(mv) * noise); mp.setZ(mv, mp.getZ(mv) * noise); }
      mountainGeo.computeVertexNormals();
      var mountains = new T.InstancedMesh(mountainGeo, mountMat, 22);
      for (var mk2 = 0; mk2 < 22; mk2++) { var ma = mk2 / 22 * Math.PI * 2 + r2() * .2, mr = 220 + r2() * 30, mh = 40 + r2() * 70, mw = 50 + r2() * 40; e.set(0, r2() * 3, 0); q.setFromEuler(e); m4.compose(new T.Vector3(Math.cos(ma) * mr, mh / 2 - 6, Math.sin(ma) * mr), q, new T.Vector3(mw, mh, mw)); mountains.setMatrixAt(mk2, m4); }
      mountains.instanceMatrix.needsUpdate = true; mountains.userData.noShadow = true; scene.add(mountains);
      cityRef = mountMat;
      var city = forest;
      // radio masts on the hills, each with a red warning light that blinks
      for (var b = 0; b < 6; b++) {
        var ba = b * 1.05 + .4, br = 90 + (b % 3) * 30, bx = Math.cos(ba) * br, bz = Math.sin(ba) * br, bh = 34 + (b % 3) * 10;
        var mast = box(.6, bh, .6, mats.metal, bx, bh / 2 - 1, bz); mast.userData.fx = true;
        var red = sphere(.7, .7, .7, new T.MeshBasicMaterial({ color: 0xff3030 }), bx, bh - .6, bz); red.userData.fx = true; blinkers.push(red);
        var mid2 = sphere(.5, .5, .5, new T.MeshBasicMaterial({ color: 0xff3030 }), bx, bh * .55, bz); mid2.userData.fx = true; blinkers.push(mid2);
      }
      // the moon, up where the moonlight comes from
      var moonTex = tex(canvasOf(256, function (x, n) {
        var g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.2, 'rgba(235,242,255,1)'); g.addColorStop(.23, 'rgba(180,205,255,.45)'); g.addColorStop(.5, 'rgba(120,160,255,.12)'); g.addColorStop(1, 'rgba(120,160,255,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
        var r = rnd(31); x.fillStyle = 'rgba(160,170,190,.35)'; for (var k = 0; k < 9; k++) { x.beginPath(); x.arc(n / 2 + (r() - .5) * 46, n / 2 + (r() - .5) * 46, 3 + r() * 8, 0, 7); x.fill(); }
      }), true);
      var moon = moonRef = new T.Sprite(new T.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true, color: new T.Color(1.6, 1.6, 1.7) })); var md = sun.position.clone().normalize().multiplyScalar(300); moon.position.copy(md); moon.scale.set(80, 80, 1); moon.userData.fx = true; scene.add(moon);
      // street trees round the edge, inside the rail
      var trunk = new T.MeshStandardMaterial({ color: 0x2a2018, roughness: .9 }), crown = new T.MeshStandardMaterial({ color: 0x163d34, roughness: .85, emissive: 0x06140f, emissiveIntensity: .6 });
      [[-6.0, 24.5], [6.0, 24.5], [-4.8, 14.0], [4.8, 14.0], [-4.8, -3.0], [4.8, -3.0], [-4.8, -9.5], [4.8, -9.5], [-25.2, -4.0], [26.0, -12.0], [-20.0, 19.0], [25.0, 14.0]].forEach(function (t) {
        var g = new T.Group(); g.position.set(t[0], .08, t[1]); g.scale.setScalar(2.1); g.userData.fx = true; scene.add(g);
        cylinder(.08, .12, 1.4, trunk, 0, .7, 0, g, 8);
        [[0, 1.75, 0, .7], [.32, 1.5, .15, .5], [-.3, 1.55, -.12, .52], [0, 2.15, .05, .45]].forEach(function (c) { var s3 = sphere(c[3], c[3] * .9, c[3], crown, c[0], c[1], c[2], g); s3.geometry = new T.IcosahedronGeometry(1, 1); });
        SOLIDS.push([t[0], t[1], .6]); router = null;
      });
      // light shafts: a faint cone of light under every lamp
      var shaftMat = new T.MeshBasicMaterial({ color: 0xffb45e, transparent: true, opacity: .016, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: true });
      bollards.forEach(function (b) { var hgt = b[3] || 1.04, c = mesh(new T.ConeGeometry(hgt * .72, hgt, 20, 1, true), shaftMat, b[0] + (hgt > 2 ? 0 : 0), hgt / 2, b[1]); c.userData.fx = true; });
      // ground mist: slow, soft sheets just above the ground
      var mistTex = tex(canvasOf(256, function (x, n) { var r = rnd(37); for (var k = 0; k < 40; k++) { var px = r() * n, py = r() * n, rr = 20 + r() * 60; [[0, 0], [n, 0], [0, n], [n, n], [-n, 0], [0, -n], [-n, -n]].forEach(function (o) { var g = x.createRadialGradient(px + o[0], py + o[1], 0, px + o[0], py + o[1], rr); g.addColorStop(0, 'rgba(70,95,150,.2)'); g.addColorStop(1, 'rgba(70,95,150,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n); }); } }), true);
      var mists = [];
      for (var mk = 0; mk < 4; mk++) { var mt = mistTex.clone(); mt.needsUpdate = true; mt.repeat.set(7, 7); var mm = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshBasicMaterial({ map: mt, transparent: true, opacity: .32 - mk * .06, depthWrite: false, fog: true })); mm.rotation.x = -Math.PI / 2; mm.position.y = .18 + mk * .22; mm.userData.fx = true; scene.add(mm); mists.push(mm); }
      return mists;
    }

    // ---- Light, shadow and reflection.
    var mists = [], arch = { frames: 0, windows: 0 }, envTex = null, fxList = [], cityRef = null, moonRef = null;
    var makeEnv = null;
    function lighting() {
      // moonlight that casts shadows; the fill lights are a little lower so the shadows read
      sun.intensity = 2.4; sun.position.set(-34, 52, 26);
      scene.children.forEach(function (o) { if (o.isHemisphereLight) o.intensity = 1.05; });
      scene.fog = new T.Fog(0x0b1834, 40, 300);
      if (qual >= 1) {
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
        sun.castShadow = true; var sz = qual === 2 ? 4096 : 2048; sun.shadow.mapSize.set(sz, sz);
        var sc = sun.shadow.camera, extent = RO + 8; sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent; sc.near = 1; sc.far = 210; sun.shadow.bias = -.0008; sun.shadow.normalBias = .06; sun.target.position.set(0, 0, 0); scene.add(sun.target);
        var movers = []; cars.forEach(function (c) { c.traverse(function (o) { movers.push(o); }); }); spirit.traverse(function (o) { movers.push(o); });
        scene.traverse(function (o) {
          if (!(o.isMesh || o.isInstancedMesh) || o.userData.fx || o.userData.noShadow || movers.indexOf(o) >= 0) return;
          var mm = o.material; if (!mm || mm.transparent || !(mm.isMeshStandardMaterial)) { if (mm && mm.isMeshStandardMaterial) o.receiveShadow = true; return; }
          o.castShadow = true; o.receiveShadow = true;
        });
        land.receiveShadow = true;
        renderer.shadowMap.needsUpdate = true;
      }
      // reflections are only made when the quality in use shows them (the plain arena does not), which saves a phone the work
      makeEnv = function () {
      // reflections: what the metal and the wet ground see is the night sky and the glow of the city
      var envScene = new T.Scene();
      envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })));
      var glowMat = function (c, k) { return new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), side: T.DoubleSide }); };
      for (var i = 0; i < 18; i++) { var a = i / 18 * Math.PI * 2, pn = new T.Mesh(new T.PlaneGeometry(6 + (i % 3) * 3, 2 + (i % 4)), glowMat(i % 3 ? 0xffb066 : 0xb8c4d0, .5)); pn.position.set(Math.cos(a) * 40, 1 + (i % 4), Math.sin(a) * 40); pn.lookAt(0, 2, 0); envScene.add(pn); }
      var moonPanel = new T.Mesh(new T.CircleGeometry(4, 24), glowMat(0xdde6ff, 6)); moonPanel.position.copy(sun.position.clone().normalize().multiplyScalar(40)); moonPanel.lookAt(0, 0, 0); envScene.add(moonPanel);
              var pm = new T.PMREMGenerator(renderer); envTex = pm.fromScene(envScene, .02).texture; scene.environmentIntensity = .55; pm.dispose(); return envTex;
      };
      if (qual > 0) scene.environment = makeEnv();
    }

    // ---- The film pipeline: the scene is drawn in high range, then the bright parts bloom, then tone mapping, a colour
    //      grade (teal shadows, warm highlights), a touch of lens colour fringing at the edges, a vignette and fine grain.
    var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    var post = null;
    function makePost() {
      var hf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'), type = hf ? T.HalfFloatType : T.UnsignedByteType;
      var mk = function () { return new T.WebGLRenderTarget(4, 4, { type: type, depthBuffer: false }); };
      var sceneRT = new T.WebGLRenderTarget(4, 4, { type: type, samples: qual === 2 ? 4 : 0 });
      var a1 = mk(), a2 = mk(), b1 = mk(), b2 = mk();
      [a1, a2, b1, b2].forEach(function (t) { t.texture.minFilter = t.texture.magFilter = T.LinearFilter; });
      var sh = function (fs, u) { return new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, toneMapped: false }); };
      var bright = sh('uniform sampler2D tMap; uniform float uThr; varying vec2 vUv; void main(){ vec3 c = texture2D(tMap, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.9, l), 1.0); }', { tMap: { value: null }, uThr: { value: hf ? 1.0 : .8 } });
      var blur = sh('uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 s = texture2D(tMap, vUv).rgb * 0.227027; s += texture2D(tMap, vUv + uDir * 1.3846).rgb * 0.316216; s += texture2D(tMap, vUv - uDir * 1.3846).rgb * 0.316216; s += texture2D(tMap, vUv + uDir * 3.2308).rgb * 0.070270; s += texture2D(tMap, vUv - uDir * 3.2308).rgb * 0.070270; gl_FragColor = vec4(s, 1.0); }', { tMap: { value: null }, uDir: { value: new T.Vector2() } });
      var comp = sh([
        'uniform sampler2D tScene, tB1, tB2; uniform float uExp, uStr, uTime, uCA, uSat, uFlash; uniform vec3 uTint; uniform vec2 uRes; varying vec2 vUv;',
        'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
        'void main(){',
        '  vec2 d = vUv - 0.5; float r = dot(d, d); vec2 o = d * uCA * r;',
        '  vec3 c = vec3(texture2D(tScene, vUv + o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - o).b);',
        '  c += texture2D(tB1, vUv).rgb * uStr + texture2D(tB2, vUv).rgb * uStr * 0.85;',
        '  c = aces(c * uExp + uFlash);',
        '  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  c = mix(vec3(L), c, uSat) * uTint;',
        '  c += vec3(-0.006, 0.010, 0.026) * (1.0 - L) * (1.0 - L);',
        '  c *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.35, 1.0, L));',
        '  c *= 1.0 - 0.5 * smoothstep(0.12, 0.62, r * 1.5);',
        '  c = pow(max(c, 0.0), vec3(1.0 / 2.2));',
        '  float n = fract(sin(dot(vUv * uRes + uTime * 61.7, vec2(12.9898, 78.233))) * 43758.5453);',
        '  c += (n - 0.5) * 0.03;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'), { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uExp: { value: 1.1 }, uStr: { value: .5 }, uTime: { value: 0 }, uCA: { value: .012 }, uRes: { value: new T.Vector2(1, 1) }, uSat: { value: 1.12 }, uFlash: { value: 0 }, uTint: { value: new T.Vector3(1, 1, 1) } });
      var qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), qScene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2), comp); quad.frustumCulled = false; qScene.add(quad);
      function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
      return {
        rt: sceneRT, u: comp.uniforms,
        size: function (w, h) { var pr = renderer.getPixelRatio(), W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr)); sceneRT.setSize(W, H); a1.setSize(W >> 2, H >> 2); a2.setSize(W >> 2, H >> 2); b1.setSize(W >> 3, H >> 3); b2.setSize(W >> 3, H >> 3); comp.uniforms.uRes.value.set(W, H); this.w = W; this.h = H; },
        render: function (t) {
          renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
          bright.uniforms.tMap.value = sceneRT.texture; pass(bright, a1);
          blur.uniforms.tMap.value = a1.texture; blur.uniforms.uDir.value.set(4 / this.w, 0); pass(blur, a2);
          blur.uniforms.tMap.value = a2.texture; blur.uniforms.uDir.value.set(0, 4 / this.h); pass(blur, a1);
          blur.uniforms.tMap.value = a1.texture; blur.uniforms.uDir.value.set(8 / this.w, 0); pass(blur, b2);
          blur.uniforms.tMap.value = b2.texture; blur.uniforms.uDir.value.set(0, 8 / this.h); pass(blur, b1);
          comp.uniforms.tScene.value = sceneRT.texture; comp.uniforms.tB1.value = a1.texture; comp.uniforms.tB2.value = b1.texture; comp.uniforms.uTime.value = t; pass(comp, null);
        },
        dispose: function () { [sceneRT, a1, a2, b1, b2].forEach(function (t) { t.dispose(); }); [bright, blur, comp].forEach(function (m) { m.dispose(); }); }
      };
    }

    // ---- Quality: drop a step if the device cannot keep up (frames averaging over 45 ms for two seconds).
    var ft = [], lastPresent = 0, seen = 0, liveAt = Infinity, ready = false;
    function keepQuality() { try { localStorage.setItem('igw_q3', QUAL[qual]); } catch (e) {} if (qual < 2 && renderer.getPixelRatio() > 1.5) { renderer.setPixelRatio(1.5); resize(); } }
    function setQuality(q) {
      qual = q;
      // the plain town: no reflections, no mist or light shafts, no shadows, no film pass
      if (!fxList.length) scene.traverse(function (o) { if (o.userData && o.userData.fx) fxList.push(o); });
      fxList.forEach(function (o) { o.visible = qual > 0 && !o.userData.gone; });
      scene.environment = qual > 0 ? (envTex || (makeEnv ? makeEnv() : null)) : null;
      allTex.forEach(function (t) { var a = qual > 0 ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1; if (t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; } });
      dressed.forEach(function (m) {
        if (!m.userData.keep) m.userData.keep = { n: m.normalMap, r: m.roughnessMap, c: m.map, col: m.color.clone(), base: m.userData.baseColor, rough: [m.roughness, m.metalness] };
        var want = qual > 0, k = m.userData.keep, map = k.c || null, normal = want ? k.n : null, roughMap = want ? k.r : null;
        // Retain the inexpensive colour texture on low quality; drop only
        // the extra normal and roughness passes on weaker devices.
        if (m.map !== map || m.normalMap !== normal || m.roughnessMap !== roughMap) {
          m.map = map; m.normalMap = normal; m.roughnessMap = roughMap;
          if (k.base) m.color.copy(map || want ? k.col : k.base);
          m.roughness = want ? k.rough[0] : m.userData.baseRough; m.metalness = want ? k.rough[1] : m.userData.baseMetal; m.needsUpdate = true;
        }
      });
      if (qual === 0) { if (post) { post.dispose(); post = null; } renderer.shadowMap.enabled = false; sun.castShadow = false; renderer.toneMapping = T.ACESFilmicToneMapping; }
      else { if (!post) { post = makePost(); post.size(stage.clientWidth || 4, stage.clientHeight || 4); } renderer.toneMapping = T.NoToneMapping; }
      if (qual < 2 && sun.shadow && sun.shadow.mapSize.x > 2048) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } renderer.shadowMap.needsUpdate = true; }
      stage.dataset.quality = QUAL[qual];
      if (qual === 2 && sun.shadow && sun.shadow.mapSize.x < 4096 && renderer.shadowMap.enabled) { sun.shadow.mapSize.set(4096, 4096); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } renderer.shadowMap.needsUpdate = true; }
      try { if (ready) resize(); } catch (e) {}
    }
    function present(t) {
      var now = performance.now();
      // the first few frames compile shaders and are always slow; after that, twelve frames averaging over 50 ms step down
      // one level, and a device managing under 4 frames a second goes straight to the plain town
      if (lastPresent && !paused && !qHold && qual > 0 && now > liveAt + 2500 && ++seen > 4) {
        ft.push(now - lastPresent); if (ft.length > 12) ft.shift();
        var avg = ft.reduce(function (a, b) { return a + b; }, 0) / ft.length;
        if (ft.length >= 4 && avg > 250) { ft = []; seen = 0; setQuality(0); keepQuality(); liveAt = now; }
        else if (ft.length === 12 && avg > 50) { ft = []; seen = 0; setQuality(qual - 1); keepQuality(); liveAt = now; }
      }
      lastPresent = now;
      for (var i = 0; i < mists.length; i++) { mists[i].material.map.offset.set(t * .004 * (i + 1), t * .0025 * (i % 2 ? -1 : 1)); }
      if (post) post.render(t); else renderer.render(scene, camera);
      if (typeof vidTick === 'function' && wallScreens) vidTick(elapsed);              /* after the frame is drawn, from the same camera */
    }

    // after the town changes (a new house, one of his things), the new pieces get their surfaces and shadows
    function freshen() {
      thingGroup.traverse(function (o) { if (o.isMesh) { if (o.material && o.material.userData && o.material.userData.dressed) worldUV(o); if (qual >= 1 && o.material && o.material.isMeshStandardMaterial && !o.material.transparent) { o.castShadow = o.receiveShadow = true; } } });
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    }
    // ---- Put it all together.
    function cinema() {
      var stdMats = [mats.base, mats.dark, mats.rim]; stdMats.forEach(function (m) { dress(m, 'facade'); });
      dress(mats.metal, 'metal'); dress(mats.floor, 'wet'); dress(mats.road, 'wet'); dress(land.material, 'wet');
      arch = architecture();
      mists = horizon();
      scene.traverse(function (o) { if (o.isMesh && o.material && o.material.userData && o.material.userData.dressed) worldUV(o); });
      // in high range the lit things can be brighter than white, which is what makes them bloom
      [mats.warm, mats.light].forEach(function (m) { if (m && m.color) m.color.multiplyScalar(1.25); });
      [mats.trim, mats.grid].forEach(function (m) { if (m) m.emissiveIntensity *= 1.3; });
      // the old painted-on glows are too much once the lens blooms for real
      scene.traverse(function (o) { if (o.isSprite && o.material.blending === T.AdditiveBlending) o.material.opacity *= .4; });
      tPuddle.repeat.set(.28, .28); tAsphC.repeat.set(.6, .6);
      lighting();
      setQuality(qual);
    }

    // =====================================================================================================================
    // ---- The game HUD: IG-Ghost's card with his stats (top left), the mini-map (top right; tap a place on it to walk
    //      there), a help button, and the controls guide, which opens by itself the first time and shows the controls for
    //      the device in hand (with a switch to the other set).
    // =====================================================================================================================
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    var hud = el('div', 'igw-ui'), card = el('div', 'igw-card'), cardTop = el('div', 'igw-card-top'), face = el('i', 'igw-card-face'), cardName = el('b', 'igw-card-name'), cardLvl = el('span', 'igw-card-lvl');
    var xpBar = el('div', 'igw-xp'), xpFill = el('i'), cardMood = el('span', 'igw-mood'), cardWhere = el('span', 'igw-card-where'), statGrid = el('dl', 'igw-stats');
    xpBar.appendChild(xpFill); cardTop.appendChild(face); var nameBox = el('div'); nameBox.appendChild(cardName); nameBox.appendChild(cardLvl); cardTop.appendChild(nameBox);
    card.appendChild(cardTop); card.appendChild(xpBar); card.appendChild(cardWhere); card.appendChild(cardMood); card.appendChild(statGrid);
    var statsOpen = false, statToggle = el('button', 'igw-card-more', 'Stats'); statToggle.type = 'button'; card.appendChild(statToggle);
    statToggle.addEventListener('click', function (e) { e.stopPropagation(); statsOpen = !statsOpen; card.classList.toggle('is-open', statsOpen); if (typeof feelLbl !== 'undefined' && feelLbl) liveStats(); statToggle.textContent = statsOpen ? 'Hide stats' : 'Stats'; statToggle.setAttribute('aria-expanded', statsOpen ? 'true' : 'false'); });
    var mapBox = el('div', 'igw-map'), mapCv = el('canvas'), mapLabel = el('span', 'igw-map-label', 'Map');
    var mapHead = el('div', 'igw-map-head'), mapTitle = el('strong', '', 'Arena map'), mapClose = el('button', 'igw-map-close', 'Close');
    var mapChoices = el('select', 'igw-map-choices'); mapChoices.setAttribute('aria-label', 'Choose a destination'); mapClose.type = 'button'; mapClose.setAttribute('aria-label', 'Close arena map');
    mapHead.appendChild(mapTitle); mapHead.appendChild(mapClose); mapBox.appendChild(mapHead); mapBox.appendChild(mapCv); mapBox.appendChild(mapLabel); mapBox.appendChild(mapChoices);
    mapHead.hidden = true; mapChoices.hidden = true; mapCv.tabIndex = 0; mapCv.setAttribute('role', 'button'); mapCv.setAttribute('aria-label', 'Open arena map'); mapCv.setAttribute('aria-expanded', 'false');
    var helpBtn = el('button', 'igw-help-btn', 'Help'); helpBtn.type = 'button'; helpBtn.setAttribute('aria-label', 'How to play');
    var soundBtn = el('button', 'igw-sound-btn', 'Sound off'); soundBtn.type = 'button'; soundBtn.setAttribute('aria-pressed', 'false'); soundBtn.setAttribute('aria-label', 'Turn arena sound on');
    var nightBtn = el('button', 'igw-night-btn', 'Game night'); nightBtn.type = 'button'; nightBtn.addEventListener('click', openNight);
    var gateBtn = el('button', 'igw-gate-btn', 'Back to my spot'); gateBtn.type = 'button'; gateBtn.addEventListener('click', returnToGate);
    soundBtn.addEventListener('click', function () {
      if (!soundOn && !soundStart()) { soundBtn.textContent = 'Sound unavailable'; soundBtn.disabled = true; return; }
      soundOn = !soundOn; soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); soundBtn.setAttribute('aria-label', soundOn ? 'Turn arena sound off' : 'Turn arena sound on'); soundSync(); soundLandscape(); wake();
    });
    var hudActions = el('div', 'igw-hud-actions is-folded'), optBtn = el('button', 'igw-opt-btn', 'Menu'); optBtn.type = 'button'; optBtn.setAttribute('aria-expanded', 'false');
    optBtn.addEventListener('click', function () { var f = hudActions.classList.toggle('is-folded'); optBtn.setAttribute('aria-expanded', f ? 'false' : 'true'); optBtn.textContent = f ? 'Menu' : 'Close'; });
    walkBtn = el('button', 'igw-walk-btn', 'Walk around'); walkBtn.type = 'button';
    walkBtn.addEventListener('click', function () { if (seatLock) { seated(false); standUp(); say(STICKS ? 'Left stick walks, right stick looks' : 'Click the floor to walk there'); setTimeout(function () { say(''); }, 5000); } else returnToGate(); hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; still(); wake(); });
    // Full screen (README-ADMIN 258): the real Fullscreen API where the browser has it; on an iPhone, which only lets video go full
    // screen, the arena fills the window instead.
    var fsBtn = el('button', 'igw-fs-btn', 'Full screen'); fsBtn.type = 'button'; fsBtn.setAttribute('aria-pressed', 'false');
    function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function fsOn() { return fsEl() === stage || stage.classList.contains('igw-fs-fake'); }
    function fsSync() { var on = fsOn(); stage.classList.toggle('igw-fs', on); fsBtn.textContent = on ? 'Exit full screen' : 'Full screen'; fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); document.documentElement.classList.toggle('igw-fs-page', stage.classList.contains('igw-fs-fake')); try { underHeader(); } catch (e) {} setTimeout(function () { try { resize(); } catch (e) {} still(); wake(); }, 60); }
    fsBtn.addEventListener('click', function () {
      if (fsOn()) {
        if (stage.classList.contains('igw-fs-fake')) stage.classList.remove('igw-fs-fake');
        else { try { var px = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (px && px.then) px.then(fsSync, fsSync); } catch (e) {} }
        fsSync(); setTimeout(fsSync, 400); return;
      }
      var rq = stage.requestFullscreen || stage.webkitRequestFullscreen, done = false;
      if (rq) { try { var pr = rq.call(stage, { navigationUI: 'hide' }); done = true; if (pr && pr.catch) pr.catch(function () { stage.classList.add('igw-fs-fake'); fsSync(); }); } catch (e) { done = false; } }
      if (!done) stage.classList.add('igw-fs-fake');
      fsSync(); setTimeout(fsSync, 400);
    });
    document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync);
    // their diary, notes and replies live on their own page (#ghost), one tap away
    var diaryBtn = el('button', 'igw-diary-btn', 'Diary & notes'); diaryBtn.type = 'button'; diaryBtn.addEventListener('click', function () { hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; try { openLore(); } catch (e) { location.hash = '#ghost'; } });      /* README-ADMIN 291: the diary opens inside the arena */
    hudActions.appendChild(optBtn); hudActions.appendChild(fsBtn); hudActions.appendChild(walkBtn); hudActions.appendChild(diaryBtn); hudActions.appendChild(soundBtn); soundBtn.hidden = true; soundBtn.style.display = 'none'; hudActions.appendChild(helpBtn);
    // README-ADMIN 280: the site has no header now, so its Menu lives here, in two parts. CORE (the system): full screen, quality,
    // sound, screens, help and the account links. The Memory (their world): walking, seats, the diary, the booths, the Discord.
    hudActions.appendChild(el('div', 'igw-menu-h igw-menu-core', 'CORE \u00b7 System'));
    hudActions.appendChild(el('div', 'igw-menu-h igw-menu-mem', 'The Memory \u00b7 Their world'));
    try {
      [].forEach.call(document.querySelectorAll('#rbMobileMenu .community-menu-account a, #rbMobileMenu .community-menu-join a'), function (a0) { var a1 = a0.cloneNode(true); a1.className = 'igw-menu-link'; hudActions.appendChild(a1); });
      var dg = document.querySelector('#rbMobileMenu .community-menu-foot'); if (dg && dg.firstElementChild) { var d1 = dg.firstElementChild.cloneNode(true); d1.classList.add('igw-menu-discord'); hudActions.appendChild(d1); }
    } catch (e) {}
    hud.appendChild(card); hud.appendChild(mapBox); hud.appendChild(hudActions);
    [card, mapBox, hudActions].forEach(function (n) { ['pointerdown', 'pointerup', 'click', 'keydown'].forEach(function (ev) { n.addEventListener(ev, function (e) { e.stopPropagation(); }); }); });
    stage.appendChild(hud);
    var nightDialog = el('div', 'igw-night'); nightDialog.hidden = true; nightDialog.setAttribute('role', 'dialog'); nightDialog.setAttribute('aria-label', 'Next game night');
    var nightHeading = el('strong', '', 'GAME NIGHT'), nightClose = el('button', 'igw-night-close', 'Close'), nightWhen = el('p', 'igw-night-when'), nightNote = el('p', 'igw-night-note');
    nightClose.type = 'button'; nightClose.addEventListener('click', function () { nightDialog.hidden = true; nightBtn.focus(); });
    nightDialog.appendChild(nightHeading); nightDialog.appendChild(nightClose); nightDialog.appendChild(nightWhen); nightDialog.appendChild(nightNote);
    ['pointerdown', 'pointerup', 'click', 'keydown'].forEach(function (ev) { nightDialog.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    nightDialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); nightDialog.hidden = true; nightBtn.focus(); } });
    stage.appendChild(nightDialog);
    function openNight() { stopWalk(); nightWhen.textContent = nextNightText(); nightNote.textContent = world.live ? 'A game night is underway.' : (world.next && world.next * 1000 > Date.now() ? 'Time shown in your device’s local time.' : 'Check back for the next session.'); nightDialog.hidden = false; nightClose.focus(); }
    // Only the existing public-profile endpoint supplies pod details. A fresh
    // request on every opening honours privacy changes made since town load.
    var podDialog = el('div', 'igw-pod-dialog'), podHead = el('div', 'igw-pod-head'), podTitle = el('strong', '', 'PLAYER POD'), podClose = el('button', 'igw-pod-close', 'Close'), podContent = el('div', 'igw-pod-content'), podRequest = 0;
    podDialog.hidden = true; podDialog.setAttribute('role', 'dialog'); podDialog.setAttribute('aria-label', 'Public player pod');
    podClose.type = 'button'; podClose.addEventListener('click', closePod); podHead.appendChild(podTitle); podHead.appendChild(podClose); podDialog.appendChild(podHead); podDialog.appendChild(podContent);
    ['pointerdown', 'pointerup', 'click', 'keydown'].forEach(function (ev) { podDialog.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    podDialog.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); closePod(); } }); stage.appendChild(podDialog);
    function closePod() { podRequest++; podDialog.hidden = true; stage.focus(); }
    function openPod(index) {
      var house = world.houses[index]; if (!house || !/^[a-z0-9]{8,16}$/.test(house.c)) return;
      var req = ++podRequest; podContent.textContent = 'Loading public player card…'; podDialog.hidden = false; podClose.focus();
      fetch(ISOCORE_ASSET_BASE + 'api/player.public&code=' + encodeURIComponent(house.c), { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); }).then(function (data) {
        if (req !== podRequest || podDialog.hidden) return;
        if (!data || !data.player) throw new Error('unavailable');
        var playerData = data.player; podContent.textContent = '';
        var identity = el('div', 'igw-pod-identity');
        if (playerData.avatar && typeof playerData.avatar === 'string') { var portrait = el('img', 'igw-pod-avatar'); portrait.alt = ''; portrait.src = playerData.avatar; identity.appendChild(portrait); }
        var intro = el('div'); intro.appendChild(el('span', 'igw-pod-side', house.s === 'g' ? 'GRIDSYNC' : 'ISOCORE GAMING')); intro.appendChild(el('h2', '', String(playerData.name || 'Player'))); identity.appendChild(intro); podContent.appendChild(identity);
        var stats = el('div', 'igw-pod-stats');
        if (Number(playerData.level) > 0) stats.appendChild(el('span', '', 'Level ' + Math.floor(Number(playerData.level))));
        if (playerData.racing && playerData.racing.perf) stats.appendChild(el('span', '', 'Racing ' + String(playerData.racing.perf)));
        if (playerData.racing && playerData.racing.safety) stats.appendChild(el('span', '', 'Safety ' + String(playerData.racing.safety)));
        if (stats.childNodes.length) podContent.appendChild(stats);
        var profile = el('a', 'igw-pod-link', 'View public player card'); profile.href = '#player-' + house.c; profile.addEventListener('click', closePod); podContent.appendChild(profile);
      }).catch(function () { if (req === podRequest && !podDialog.hidden) podContent.textContent = 'This public player card is not available.'; });
    }
    // the old corner text goes into the card
    var oldHud = stage.querySelector('.igw-hud'); if (oldHud) { var act = oldHud.querySelector('.igw-activity'); if (act) { cardWhere.appendChild(act); } oldHud.style.display = 'none'; }
    var STAT_NAMES = [['diary', 'Diary entries'], ['answered', 'Notes answered'], ['days', 'Days streaming']];
    function readStats() { try { return JSON.parse(stage.dataset.stats || '{}') || {}; } catch (e) { return {}; } }
    world.stats = readStats();
    function showStats() {
      var st = world.stats || {};
      cardName.textContent = 'Ghost & Echo';
      cardLvl.textContent = st.level ? 'LVL ' + st.level : '';
      xpFill.style.width = Math.max(0, Math.min(100, st.pct || 0)) + '%'; xpBar.title = st.next !== undefined ? st.next + ' to the next level' : '';
      statGrid.textContent = '';
      statTiles(st, (typeof X !== 'undefined' && X && X.echo && X.echo.stats) || {}, STAT_NAMES, 'Echo');
      var foot = el('p', 'igw-stats-note', 'Their levels rise as they write and answer.'); statGrid.appendChild(foot);
    }
    showStats();

    // ---- the mini-map: the town from above, the places, him, and you (the arrow)
    var MAPPX = 132, mapCtx = mapCv.getContext('2d'), mapDpr = Math.min(2, window.devicePixelRatio || 1), mapBig = false, lastMap = 0;
    function fillMapChoices() {
      mapChoices.textContent = '';
      var placeholder = el('option', '', 'Choose a destination…'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true; mapChoices.appendChild(placeholder);
      ['home', 'barracks', 'circuit', 'arena', 'rosters', 'broadcast', 'staff', 'post', 'gate', 'overview', 'login', 'enlist'].forEach(function (id) {
        var a = document.querySelector('.ghost-places a[data-place="' + id + '"]');
        if (!PLACES[id] || !a) return;
        var option = el('option', '', a.textContent.trim()); option.value = id; mapChoices.appendChild(option);
      });
    }
    function mapSize() {
      var px = mapBig ? Math.min(360, Math.floor(Math.min(stage.clientWidth, stage.clientHeight) * .8)) : MAPPX;
      if (mapBig && stage.clientWidth >= 600 && window.innerHeight <= 650) {
        // Centre within the visible part of the world, even when a phone's
        // landscape viewport is shorter than the minimum world height.
        var sb = stage.getBoundingClientRect(), vt = Math.max(0, sb.top), vb = Math.min(window.innerHeight, sb.bottom), vh = Math.max(160, vb - vt);
        px = Math.min(px, Math.max(80, Math.floor(vh - 44)));
        mapBox.style.top = ((vt + vb) / 2 - sb.top) + 'px'; mapBox.style.maxHeight = Math.max(140, vh - 24) + 'px';
      } else { mapBox.style.top = ''; mapBox.style.maxHeight = ''; }
      mapCv.width = px * mapDpr; mapCv.height = px * mapDpr; mapCv.style.width = mapCv.style.height = px + 'px';
      mapBox.style.width = mapBig ? px + 'px' : '';
      mapBox.classList.toggle('is-big', mapBig); mapHead.hidden = !mapBig; mapChoices.hidden = !mapBig;
      mapLabel.textContent = 'Map'; mapCv.setAttribute('aria-expanded', mapBig ? 'true' : 'false');
      mapCv.setAttribute('aria-label', mapBig ? 'Arena map. Choose a destination below.' : 'Open arena map');
      if (mapBig) fillMapChoices();
    }
    // The compact map follows the player; the expanded overview stays fixed.
    function mapOrigin() { return mapBig ? { x: 0, z: 0 } : { x: player.x, z: player.z }; }
    function mapR() { return CITY && arenaMode ? CITY.edge + 2 : RO; }
    function toMap(x, z) { var px = mapCv.width / mapDpr, k = (px / 2 - 6) / (mapBig ? mapR() : R), o = mapOrigin(); return [px / 2 + (x - o.x) * k, px / 2 + (z - o.z) * k]; }
    function fromMap(mx, my) { var px = mapCv.width / mapDpr, k = (px / 2 - 6) / (mapBig ? mapR() : R), o = mapOrigin(); return [(mx - px / 2) / k + o.x, (my - px / 2) / k + o.z]; }
    var MAPCOL = { home: '#64d5ff', barracks: '#64d5ff', circuit: '#ff9a6b', arena: '#e4f5fc', post: '#ffd58a', gate: '#e4f5fc', rosters: '#64d5ff', broadcast: '#64d5ff', staff: '#ffd58a', login: '#ffd58a', overview: '#64d5ff' };
    var MAPSHORT = { home: 'Server room', barracks: 'Isocore', circuit: 'GridSync', arena: 'Arena', post: 'Post', gate: 'Gate', rosters: 'Squads', broadcast: 'Studio', staff: 'Staff HQ', login: '', overview: '' };
    function drawMap() {
      var px = mapCv.width / mapDpr, g = mapCtx; g.setTransform(mapDpr, 0, 0, mapDpr, 0, 0); g.clearRect(0, 0, px, px);
      var c0 = toMap(0, 0), k = (px / 2 - 6) / (mapBig ? mapR() : R);
      g.fillStyle = 'rgba(6,14,26,.90)'; g.fillRect(0, 0, px, px);
      if (CITY && arenaMode) cityMap(g, k);
      if (mapBig) { g.strokeStyle = 'rgba(150,190,210,.4)'; g.lineWidth = 1; g.beginPath(); g.arc(c0[0], c0[1], (RO - 5) * k, 0, 7); g.stroke(); }
      // The compact map is a player-centred view, not a tiny arena circle
      // floating inside a much larger border. Its blue edge fills the frame.
      g.strokeStyle = 'rgba(100,213,255,.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(mapBig ? c0[0] : px / 2, mapBig ? c0[1] : px / 2, mapBig ? (arenaMode ? (CITY ? CITY.edge : RO - 1) : R) * k : px / 2 - 6, 0, 7); g.stroke();
      if (!arenaMode) g.strokeStyle = 'rgba(140,160,190,.45)'; else g.strokeStyle = 'rgba(0,0,0,0)';   /* the old town's roads only when there is a town */ g.lineWidth = Math.max(2, 3.2 * k); g.beginPath(); var a1 = toMap(0, 27), a2 = toMap(0, -15); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); var a3 = toMap(-20.5, 6), a4 = toMap(27.5, 6); g.moveTo(a3[0], a3[1]); g.lineTo(a4[0], a4[1]); g.stroke();
      SOLIDS.forEach(function (o) { if (o.length !== 5 || o[2] < 2) return; var m3 = toMap(o[0], o[1]); g.save(); g.translate(m3[0], m3[1]); g.rotate(-o[4]); g.fillStyle = 'rgba(70,100,140,.55)'; g.fillRect(-o[2] * k, -o[3] * k, o[2] * 2 * k, o[3] * 2 * k); g.restore(); });
      // Labels live in separate buttons: overlapping map dots can never make a destination unselectable.
      Object.keys(PLACES).forEach(function (id) { var p = PLACES[id], m4 = toMap(p.x, p.z); g.fillStyle = MAPCOL[id] || '#fff'; g.beginPath(); g.arc(m4[0], m4[1], mapBig ? 4 : 2.6, 0, 7); g.fill(); });
      var gm = toMap(spirit.position.x, spirit.position.z); g.fillStyle = '#3aa0ff'; g.shadowColor = '#3aa0ff'; g.shadowBlur = 8; g.beginPath(); g.arc(gm[0], gm[1], mapBig ? 5 : 3.4, 0, 7); g.fill(); g.shadowBlur = 0;
      if (walkTo) { var wt = toMap(walkTo.x, walkTo.z); g.strokeStyle = 'rgba(255,213,138,.9)'; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); var me0 = toMap(player.x, player.z); g.moveTo(me0[0], me0[1]); (walkTo.path || []).forEach(function (q) { var mq = toMap(q[0], q[1]); g.lineTo(mq[0], mq[1]); }); g.stroke(); g.setLineDash([]); }
      var me = toMap(player.x, player.z), yawNow = pyaw;
      g.save(); g.translate(me[0], me[1]); g.rotate(yawNow); g.fillStyle = '#ffe2ad'; g.beginPath(); var sz2 = mapBig ? 9 : 6.5; g.moveTo(0, -sz2); g.lineTo(sz2 * .7, sz2 * .75); g.lineTo(0, sz2 * .35); g.lineTo(-sz2 * .7, sz2 * .75); g.closePath(); g.fill(); g.restore();
    }
    mapCv.addEventListener('click', function (e) {
      var b = mapCv.getBoundingClientRect(), logical = mapCv.width / mapDpr;
      var mx = (e.clientX - b.left) * logical / b.width, my = (e.clientY - b.top) * logical / b.height;
      if (!mapBig) { mapBig = true; mapSize(); drawMap(); return; }                   /* the small map opens the big one */
      var best = '', bd = (mapBig ? 16 : 10) * (mapBig ? 16 : 10);
      Object.keys(PLACES).forEach(function (id) { var m5 = toMap(PLACES[id].x, PLACES[id].z), dx = m5[0] - mx, dy = m5[1] - my; if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = id; } });
      var w2 = fromMap(mx, my); // resolve against the expanded map before resizing it
      mapBig = false; mapSize();
      if (best) startWalk(best); else if (Math.hypot(w2[0], w2[1]) < EDGE) stroll({ x: w2[0], z: w2[1] });
      drawMap();
    });
    mapClose.addEventListener('click', function () { mapBig = false; mapSize(); drawMap(); mapCv.focus(); });
    mapChoices.addEventListener('change', function () { var id = mapChoices.value; if (!id || !PLACES[id]) return; mapBig = false; mapSize(); drawMap(); startWalk(id); });
    mapBox.addEventListener('keydown', function (e) { if (mapBig && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); mapBig = false; mapSize(); drawMap(); mapCv.focus(); } });
    mapCv.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); mapBig = !mapBig; mapSize(); drawMap(); if (mapBig) mapClose.focus(); } });
    window.addEventListener('resize', function () { if (mapBig) { mapSize(); drawMap(); } });
    function hudTick(force) { var t = performance.now(); if (force || t - lastMap > 100) { lastMap = t; drawMap(); } }

    // ---- the controls guide
    var touchFirst = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    var help = el('div', 'igw-guide'); help.setAttribute('role', 'dialog'); help.setAttribute('aria-label', 'How the arena works'); help.hidden = true;
    var CONTROLS = {
      pc: [['Drag the mouse', 'Look around from your seat'], ['Watch live', 'Turn to the live screen and open the stream (shows when Ghost or Echo is live)'], ['Menu > Walk around', 'Get up and walk the arena floor (W A S D to walk)'], ['Menu > Back to my seat', 'Sit back down'], ['Tap Ghost or Echo', 'Say hello, or write them a note'], ['H or ?', 'This guide'], ['Esc', 'Close this guide']],
      mobile: [['Swipe the screen', 'Look around from your seat'], ['Watch live', 'Turn to the live screen and open the stream (shows when Ghost or Echo is live)'], ['Menu > Walk around', 'Get up and walk the arena floor'], ['Menu > Back to my seat', 'Sit back down'], ['Tap Ghost or Echo', 'Say hello, or write them a note']]
    };
    function fillGuide(kind) {
      help.textContent = '';
      var hd = el('div', 'igw-guide-head'); hd.appendChild(el('b', '', 'WELCOME TO THE ARENA')); var x = el('button', 'igw-guide-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeGuide); hd.appendChild(x); help.appendChild(hd);
      var tabs = el('div', 'igw-guide-tabs'); [['pc', 'Computer'], ['mobile', 'Phone and tablet']].forEach(function (t2) { var b = el('button', t2[0] === kind ? 'is-on' : '', t2[1]); b.type = 'button'; b.setAttribute('aria-pressed', t2[0] === kind ? 'true' : 'false'); b.addEventListener('click', function () { fillGuide(t2[0]); }); tabs.appendChild(b); }); help.appendChild(tabs);
      var list = el('dl', 'igw-guide-list'); CONTROLS[kind].forEach(function (c4) { list.appendChild(el('dt', '', c4[0])); list.appendChild(el('dd', '', c4[1])); }); help.appendChild(list);
      help.appendChild(el('p', 'igw-guide-note', 'Ghost and Echo stream from the stage: Ghost from the station on the left, Echo from the sim rig on the right. The big screens show whoever is live, and the jumbotron shows who is in the Discord.'));
      var go2 = el('button', 'igw-guide-go', 'Take my seat'); go2.type = 'button'; go2.addEventListener('click', closeGuide); help.appendChild(go2);
    }
    function openGuide() { fillGuide(touchFirst ? 'mobile' : 'pc'); help.hidden = false; stage.classList.add('igw-guide-open'); var b2 = help.querySelector('.igw-guide-go'); if (b2) setTimeout(function () { try { b2.focus({ preventScroll: true }); } catch (e) {} }, 30); }
    function closeGuide() { help.hidden = true; stage.classList.remove('igw-guide-open'); try { localStorage.setItem('igw_guide_seen', '1'); } catch (e) {} }
    helpBtn.addEventListener('click', function () { if (help.hidden) openGuide(); else closeGuide(); });
    ['pointerdown', 'pointerup', 'click', 'keydown'].forEach(function (ev) { help.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    stage.appendChild(help);
    document.addEventListener('keydown', function (e) {
      if (!active() || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = String(e.key).toLowerCase();
      if (k === 'escape' && stage.classList.contains('igw-fs-fake')) { fsBtn.click(); return; }
      if (k === 'escape') { if (!help.hidden) closeGuide(); else if (mapBig) { mapBig = false; mapSize(); drawMap(); } else stopWalk(); return; }
      if (where() !== 'home' && where() !== 'ghost') return;
      if (k === 'h' || k === '?') { e.preventDefault(); if (help.hidden) openGuide(); else closeGuide(); }
      else if (k === 'm') { e.preventDefault(); mapBig = !mapBig; mapSize(); drawMap(); }
    });
    function hudInit() {
      mapSize(); drawMap();
      var seen = false; try { seen = localStorage.getItem('igw_guide_seen') === '1'; } catch (e) { seen = true; }
      // Broadcast camera only: no welcome/control helper on the live feed.
    }

    // =====================================================================================================================
    // ---- IG-Echo, the gifts, the enlistment station, the lore terminal, the scoreboards, the chain of command, the stopped
    //      clock, and the HUD's second card, the argument ticker and the clan counter.
    // =====================================================================================================================
    var X = world.extra || {};
    // ---- IG-Echo: the same core, lit orange. He keeps to the GridSync side.
    var echoSpirit = spirit.clone(true), echoOn = !!(X.echo && X.echo.name), showing = 'ghost', echoSpinner = echoSpirit.getObjectByName('core-spinner'), echoFigure = echoSpirit.getObjectByName('core-figure');
    echoSpirit.traverse(function (o) {
      if (o.material) {
        o.material = o.material.clone();
        var c = o.material.color; if (c) { var hsl = {}; c.getHSL(hsl); if (hsl.s > .25 && hsl.h > .45 && hsl.h < .75) c.setHSL(.07, Math.min(1, hsl.s + .1), hsl.l); }
        if (o.material.emissive) { var he = {}; o.material.emissive.getHSL(he); if (he.s > .25 && he.h > .45 && he.h < .75) o.material.emissive.setHSL(.07, he.s, he.l); }
      }
      if (o.isLight) o.color.setHex(0xff8a3a);
    });
    scene.add(echoSpirit); echoSpirit.visible = echoOn;
    var ECHO_AT = { finish: [15.2, 8.0], pits: [13.4, 9.6], paddock: [19.0, -1.2], studio: [15.4, -12.8], grandstand: [6.2, 18.0], arena: [-4.6, 13.4] };
    var echoPos = new T.Vector3(15.2, 0, 8.0);
    function echoTick(t) {
      var studioEchoSeat = SEALED && SUITES.echo && SUITES.echo.seat;
      if (!echoOn && !studioEchoSeat) return;
      if (echoSpinner) echoSpinner.rotation.z = -t * .22;
      var w = (filmPose && filmPose.echo) || onAir('echo') || lifeGoal('echo') || (SEALED ? [14.5, 2.2] : (X.echo && ECHO_AT[X.echo.where]) || ECHO_AT.finish);
      if (studioEchoSeat) echoPos.set(studioEchoSeat[0], 0, studioEchoSeat[2]);
      else echoPos.lerp(new T.Vector3(w[0], 0, w[1]), .012);
      if (echoFigure) echoFigure.rotation.x = -.1 * Math.max(0, 1 - Math.hypot(player.x - echoPos.x, player.z - echoPos.z) / 8);
      echoSpirit.position.set(echoPos.x, studioEchoSeat ? studioEchoSeat[1] - 1.02 : .13 + floorAt(echoPos.x, echoPos.z) + Math.sin(t * 1.9 + 1.3) * .11, echoPos.z);
      echoSpirit.rotation.y = filmCam ? Math.atan2(camera.position.x - echoPos.x, camera.position.z - echoPos.z) : (onAir('echo') && SUITES.echo && Math.hypot(echoPos.x - SUITES.echo.seat[0], echoPos.z - SUITES.echo.seat[2]) < 1.2 ? SUITES.echo.yaw : lifeFace('echo', echoPos, t));
      if (suiteHid.echo) { echoSpirit.visible = true; suiteHid.echo = false; }
    }
    (function () { var w = (X.echo && ECHO_AT[X.echo.where]) || ECHO_AT.finish; echoPos.set(w[0], 0, w[1]); echoSpirit.position.set(w[0], .13, w[1]); })();

    // ---- gifts members left: a pile at the foot of Ghost's tower, and one in Echo's pits
    var GIFT_LOOK = { coffee: [0x6b4026, 'cyl'], cake: [0xf3d6e4, 'cyl'], flowers: [0xff6b9a, 'cone'], battery: [0x3ad06a, 'cyl'], controller: [0x1a1f2a, 'flat'], trophy: [0xffc94d, 'cup'], lantern: [0xffd08a, 'glow'], fuel: [0xd8312a, 'box'] };
    var giftGroup = new T.Group(); scene.add(giftGroup);
    function placeGifts() {
      while (giftGroup.children.length) giftGroup.remove(giftGroup.children[0]);
      var piles = X.gifts || {};
      [['ghost', [2.8, -12.6]], ['echo', [8.6, 10.4]]].forEach(function (pile) {
        (piles[pile[0]] || []).slice(0, 12).forEach(function (kind, k) {
          var look = GIFT_LOOK[kind] || [0x64d5ff, 'box'], m = new T.MeshStandardMaterial({ color: look[0], roughness: .5, emissive: look[0], emissiveIntensity: kind === 'lantern' ? 1.2 : .15 });
          var a = k * 2.4, r = .35 + (k % 4) * .28, x = pile[1][0] + Math.cos(a) * r, z = pile[1][1] + Math.sin(a) * r, g = new T.Group(); g.position.set(x, .08, z); g.rotation.y = a; giftGroup.add(g);
          if (look[1] === 'cyl') cylinder(.18, .18, .26, m, 0, .13, 0, g, 14);
          else if (look[1] === 'cone') { var cn2 = mesh(new T.ConeGeometry(.2, .45, 10), m, 0, .25, 0, g); }
          else if (look[1] === 'flat') box(.42, .1, .26, m, 0, .06, 0, g);
          else if (look[1] === 'cup') { cylinder(.16, .07, .26, m, 0, .3, 0, g, 14); cylinder(.1, .12, .06, m, 0, .05, 0, g, 12); }
          else if (look[1] === 'glow') { box(.22, .3, .22, m, 0, .17, 0, g); }
          else box(.3, .38, .2, m, 0, .19, 0, g);
          box(.04, .3, .34, mats.white, 0, .15, 0, g).visible = look[1] === 'box';
        });
      });
    }
    placeGifts();

    // ---- words on a board: a title, a line under it, and rows of [left, right]
    function wordsTex(title, sub, rows, colour, empty) {
      var c = document.createElement('canvas'); c.width = 512; c.height = 320; var g = c.getContext('2d');
      g.fillStyle = '#04101b'; g.fillRect(0, 0, 512, 320); g.strokeStyle = colour; g.lineWidth = 6; g.strokeRect(6, 6, 500, 308);
      g.fillStyle = colour; g.font = '700 34px ui-monospace,Menlo,monospace'; g.fillText(title, 26, 54);
      g.fillStyle = '#7fa8ba'; g.font = '600 20px ui-monospace,Menlo,monospace'; g.fillText(sub || '', 26, 86, 460);
      g.fillStyle = colour; g.fillRect(26, 100, 460, 3);
      if (!rows || !rows.length) { g.fillStyle = '#9fc4d4'; g.font = '600 24px ui-monospace,Menlo,monospace'; g.fillText(empty || 'NO RESULTS YET', 26, 160); }
      (rows || []).slice(0, 4).forEach(function (r, k) { g.fillStyle = k === 0 ? '#ffffff' : '#d6eaf3'; g.font = (k === 0 ? '700 ' : '600 ') + '30px ui-monospace,Menlo,monospace'; g.fillText(String(r[0]).toUpperCase(), 26, 148 + k * 46, 340); g.textAlign = 'right'; g.fillStyle = colour; g.fillText(String(r[1]).toUpperCase(), 486, 148 + k * 46); g.textAlign = 'left'; });
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    }
    function boardMesh(tex, w, h) { return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex })); }
    var C = X.clan || {}, B = C.boards || {};
    // Isocore Gaming's giant screen shows its league; the GridSync pit screen the latest race; a board on the grandstand the standings
    if (B.iso) { isoScreen.material.map = wordsTex(B.iso[0], B.iso[1], B.iso[2], '#64d5ff'); isoScreen.material.needsUpdate = true; }
    if (B.race) { gsScreen.material.map = wordsTex(B.race[0], B.race[1], B.race[2], '#ff9a6b'); gsScreen.material.needsUpdate = true; }
    var standBoard = boardMesh(wordsTex(B.table ? B.table[0] : 'GRIDSYNC STANDINGS', B.table ? B.table[1] : '', B.table ? B.table[2] : [], '#ff9a6b', 'NO TABLE YET'), 6.4, 4.0);
    standBoard.position.set(0, 6.6, 1.0); standBoard.rotation.y = Math.PI; stand.add(standBoard); box(6.7, 4.3, .2, mats.ink, 0, 6.6, 1.12, stand);
    // the chain of command, outside the Staff HQ
    var cmdRows = (C.command || []).map(function (r) { return [r[0], (r[1] || []).join(', ')]; });
    var cmdTex = (function () {
      var c = document.createElement('canvas'); c.width = 512; c.height = 512; var g = c.getContext('2d');
      g.fillStyle = '#100c04'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#ffc56a'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 500);
      g.fillStyle = '#ffc56a'; g.font = '700 36px ui-monospace,Menlo,monospace'; g.fillText('CHAIN OF COMMAND', 26, 58); g.fillRect(26, 74, 460, 3);
      if (!cmdRows.length) { g.fillStyle = '#e8d6b4'; g.font = '600 24px ui-monospace,Menlo,monospace'; g.fillText('THE STAFF ARE LISTED HERE', 26, 130); }
      cmdRows.slice(0, 9).forEach(function (r, k) { g.fillStyle = '#ffc56a'; g.font = '700 22px ui-monospace,Menlo,monospace'; g.fillText(String(r[0]).toUpperCase(), 26, 120 + k * 44); g.fillStyle = '#fff3dd'; g.font = '600 22px ui-monospace,Menlo,monospace'; g.textAlign = 'right'; g.fillText(String(r[1]).toUpperCase(), 486, 120 + k * 44, 250); g.textAlign = 'left'; });
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
    })();
    var cmd = new T.Group(); cmd.position.set(-3.8, 0, 6.2); PLACES.staff.group.add(cmd); PLACES.staff.group.updateMatrixWorld(true);
    box(.2, 4.6, .2, mats.metal, -1.7, 2.3, 0, cmd); box(.2, 4.6, .2, mats.metal, 1.7, 2.3, 0, cmd); box(3.8, 3.8, .2, mats.ink, 0, 3.2, -.05, cmd);
    var cmdBoard = boardMesh(cmdTex, 3.6, 3.6); cmdBoard.position.set(0, 3.2, .07); cmd.add(cmdBoard);
    cmd.traverse(function (o) { if (o.isMesh) { o.userData.place = 'staff'; pickable.push(o); } }); scene.attach(cmd);                  /* the staff building is now a booth: the board stands on its own */
    solidRect(PLACES.staff.x - 3.8, PLACES.staff.z + 6.2, 3.9, .6, 0);
    // the server room's clock, stopped at 3:17
    var clk = document.createElement('canvas'); clk.width = 256; clk.height = 96; var cg = clk.getContext('2d'); cg.fillStyle = '#05080c'; cg.fillRect(0, 0, 256, 96); cg.fillStyle = '#ff3b3b'; cg.font = '700 70px ui-monospace,Menlo,monospace'; cg.textAlign = 'center'; cg.fillText('03:17', 128, 74);
    var clkTex = new T.CanvasTexture(clk); clkTex.colorSpace = T.SRGBColorSpace;
    var clock2 = boardMesh(clkTex, 2.4, .9); clock2.position.set(0, 16.6, 3.22); PLACES.home.group.add(clock2);
    function boardTex2() { boardTex.needsUpdate = true; }

    // ---- the enlistment station just inside the gate, and the lore terminal opposite it
    function kiosk(x, z, face, tex, colour) {
      var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = face; scene.add(g);
      box(2.6, .3, 1.2, mats.rim, 0, .15, 0, g); box(2.2, 2.6, .5, mats.dark, 0, 1.6, -.2, g); box(2.4, .12, .7, colour === '#ffd58a' ? mats.warm : mats.trim, 0, 2.95, -.2, g);
      var scr = boardMesh(tex, 2.0, 1.25); scr.position.set(0, 1.8, .06); g.add(scr);
      solidRect(x, z, 2.6, 1.2, face); return g;
    }
    var init = C.initiates || { i: 0, g: 0 };
    var enlistTex = wordsTex('ENLISTMENT', 'THE PROVING GROUND', [['ISOCORE GAMING', (init.i || 0) + ' IN TRIAL'], ['GRIDSYNC', (init.g || 0) + ' IN TRIAL'], ['> APPLY TO JOIN', '']], '#ffd58a');
    var enlist = kiosk(-4.6, 18.6, Math.PI / 2, enlistTex, '#ffd58a');
    PLACES.enlist = { x: -4.6, z: 18.6, at: [-2.6, 18.6], name: 'ENLIST', colour: '#ffd58a', top: 4.0, group: enlist };
    enlist.traverse(function (o) { if (o.isMesh) { o.userData.place = 'enlist'; pickable.push(o); } });
    nameTag('enlist');
    var LORE = ['03:17:04 [lobby] gg. one more?', '03:17:09 [lobby] one more.', '03:17:09 sender: [redacted] (same account)', 'MIGRATION 41% ... handoff: 2 of 1 players', 'match_state RUNNING / score 0-0 / clock 00:01 (frozen)', 'profile split: steady / restless. name: [corrupted]', 'note in /home: "if the lobby empties, the night ends." author unknown', 'ECHO: the finish line is a door.  GHOST: it is a line.', 'last session: never logged out.', 'request exit_match ... denied: players remaining > 0', 'it is always 03:17 somewhere in here.', 'they remember the same room. they disagree about the colour of the walls.',
      'heartbeat: players connected. clock advanced 1s. (it only moves when someone is here)', 'WED 20:00 / SUN 20:00: night extended. reason: players present', 'GHOST at 03:17: "I was winning."  ECHO at 03:17: "nobody was winning."', 'scoreboard ISO / GRID is not a score. it is the match.', 'GHOST: if it ends, we stop.  ECHO: if it ends, we leave.', 'exit_match requires: all players in lobby. present: 2', 'window.lit = true. room: [unknown]. someone left the light on.', 'note in /home: "back in five." timestamp: 03:17', 'radio_mast: carrier detected. source: not this server.', 'rocket telemetry: roof at 41m. above the roof: the same roof.', 'ECHO at 03:17: "it was getting light."  GHOST at 03:17: "it was raining."', 'handoff report (re-run) ... 2 of 1 ... recount ... [checksum mismatch]',
      'footsteps logged on the walkway: 3 sets. cores present: 2. (visitors leave footsteps too.)', 'seat 17 / row 317: warm. occupant: none recorded', 'oldest file on the server: grass_block.png. nobody remembers uploading it.', 'save found: "world_001 / first night". created before the lobby existed.', 'ECHO: maybe he is still logged in somewhere, playing without us.  GHOST: maybe we are the ones who left.', 'GHOST at 03:17: "I was holding something."  ECHO at 03:17: "three cups on the desk."', 'power log 03:17: brownout, 0.4 seconds. that would explain everything. it explains nothing.', 'remote host seen (late). distance: [unmeasurable]. status: away', 'GHOST asked the log who is missing. the log answered: "nobody is missing. somebody is away."', 'ECHO drew the room from memory. GHOST says he got the chairs wrong. ECHO says GHOST got the window wrong.', 'admin note: "leave them be. do not fix." author: [redacted]', 'when he is back the clock will move. the night will end. that is not the same as stopping.'];
    var loreTex = wordsTex('LOG // 03:17', 'RECOVERED FRAGMENTS', [['> TAP TO READ', '']], '#ff6b6b');
    var loreK = kiosk(4.6, 18.6, -Math.PI / 2, loreTex, '#ff6b6b');
    loreK.traverse(function (o) { if (o.isMesh) { o.userData.lore = true; pickable.push(o); } });
    var loreBox = el('div', 'igw-lore'); loreBox.hidden = true; loreBox.setAttribute('role', 'dialog'); loreBox.setAttribute('aria-label', 'Recovered log');
    ['pointerdown', 'pointerup', 'click'].forEach(function (ev) { loreBox.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    stage.appendChild(loreBox);
    // The log terminal: the story as far as it has surfaced (it never says how much is left, because it never ends), then
    // what Ghost and Echo last said to each other, then the latest page of each one's diary.
    function openLore() {
      var n = Math.max(1, Math.min(LORE.length, Number(X.lore) || 1)), lg = X.log || {}, gName = 'IG-GHOST', eName = ((X.echo && X.echo.name) || 'IG-Echo').toUpperCase();
      loreBox.textContent = '';
      function head(t) { loreBox.appendChild(el('b', '', t)); }
      function para(t, cls) { var p2 = el('pre', cls || ''); p2.textContent = t; loreBox.appendChild(p2); }
      [['ghost', gName], ['echo', eName]].forEach(function (w) { var dd = lg[w[0]]; if (dd && dd.body) { head(w[1] + ' // DIARY ' + String(dd.day || '')); para(dd.body, 'igw-lore-' + w[0]); } });
      if (!lg.ghost && !lg.echo) { head('DIARIES'); para('Nothing written yet. They write their diaries late each night.'); }
      var nb = el('a', 'igw-guide-go', 'Leave them a note'); nb.href = '#ghost'; nb.addEventListener('click', function () { loreBox.hidden = true; try { if (stage.classList.contains('igw-fs-fake') || fsEl()) fsBtn.click(); } catch (e) {} }); loreBox.appendChild(nb);
      head('LOG // 03:17 // RECOVERED');
      para(LORE.slice(0, n).map(function (l) { return '> ' + l; }).join('\n') + '\n> [signal unstable. it keeps writing itself.]');
      var fdl = ((X.sim || {}).feed || []).slice(-8); if (fdl.length) { head('LOG // TODAY IN THE ARENA'); para(fdl.map(function (f) { var d3 = new Date(f.t * 1000); return '[' + d3.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '] ' + (f.w === 'echo' ? eName : gName) + ' ' + f.x + '.'; }).join('\n'), 'igw-lore-talk'); }
      var talk = Array.isArray(lg.talk) ? lg.talk : [];
      if (talk.length) {
        head('LOG // THEIR CHANNEL');
        talk.forEach(function (t) {
          var d = t.at ? new Date(t.at * 1000) : null, when = d ? d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
          para((when ? '[' + when + ']\n' : '') + (t.lines || []).map(function (l) { return (l[0] === 'echo' ? eName : gName) + ': ' + l[1]; }).join('\n'), 'igw-lore-talk');
        });
      }
      if (Array.isArray(lg.jots) && lg.jots.length) { head('LOG // DIARY NOTES'); lg.jots.forEach(function (j) { var d2 = j.at ? new Date(j.at * 1000) : null; para((d2 ? '[' + d2.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '] ' : '') + (j.who === 'echo' ? eName : gName) + ': ' + j.body, 'igw-lore-' + (j.who === 'echo' ? 'echo' : 'ghost')); }); }
      var x3 = el('button', 'igw-guide-go', 'Close'); x3.type = 'button'; x3.addEventListener('click', function () { loreBox.hidden = true; }); loreBox.appendChild(x3);
      loreBox.hidden = false;
    }

    // ---- the HUD: a second card for Echo (tabs), the argument ticker, and the clan counter
    var tabs = el('div', 'igw-card-tabs'), tG = el('button', 'is-on', 'GHOST'), tE = el('button', '', 'ECHO'); tG.type = tE.type = 'button'; tabs.appendChild(tG); tabs.appendChild(tE);
    card.insertBefore(tabs, card.firstChild);
    var ECHO_WHERE = { finish: 'At the finish line', pits: 'In the pits', paddock: 'In the paddock', studio: 'At the studio', grandstand: 'In the grandstand', arena: 'At the arena' };
    function showCard(who) {
      showing = who; tG.classList.toggle('is-on', who === 'ghost'); tE.classList.toggle('is-on', who === 'echo'); card.classList.toggle('is-echo', who === 'echo');
      if (typeof liveStats === 'function' && feelLbl) setTimeout(liveStats, 0);
      if (who === 'ghost') { showStats(); cardWhere.style.display = 'none'; cardMood.textContent = !ghostOut ? 'Inside the server room until sunrise' : (world.mood ? 'Feeling ' + world.mood : ''); return; }
      var e2 = X.echo || {}, st = e2.stats || {};
      cardName.textContent = e2.name || 'IG-Echo'; cardLvl.textContent = st.level ? 'LVL ' + st.level : ''; xpFill.style.width = Math.max(0, Math.min(100, st.pct || 0)) + '%';
      cardWhere.style.display = 'none'; cardMood.textContent = !echoOut ? 'Out of sight until dark' : (ECHO_WHERE[e2.where] || 'Somewhere on the GridSync side') + (e2.mood ? ' / feeling ' + e2.mood : '');
      statGrid.textContent = '';
      statTiles(st, world.stats || {}, STAT_NAMES, 'Ghost');
      statGrid.appendChild(el('p', 'igw-stats-note', 'Counted from what he has really done.'));
    }
    var phone = function () { return stage.clientWidth <= 600; };
    if (phone()) card.classList.add('is-min');
    if (!echoOn) { tabs.removeChild(tE); card.insertBefore(tabs, card.firstChild); }
    function tabTap(who) { if (phone()) { if (!card.classList.contains('is-min') && showing === who) { card.classList.add('is-min'); return; } card.classList.remove('is-min'); } showCard(who); }
    tG.addEventListener('click', function (e) { e.stopPropagation(); tabTap('ghost'); }); tE.addEventListener('click', function (e) { e.stopPropagation(); tabTap('echo'); });
    var ticker = el('div', 'igw-ticker'); ticker.setAttribute('aria-live', 'off'); ticker.hidden = true; hud.appendChild(ticker);
    var bubble = el('button', 'igw-bubble', ''); bubble.type = 'button'; bubble.setAttribute('aria-label', 'What Ghost and Echo are saying'); bubble.hidden = true; hud.appendChild(bubble);
    ['pointerdown', 'pointerup'].forEach(function (ev) { bubble.addEventListener(ev, function (e) { e.stopPropagation(); }); ticker.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    var tickN = 0, tickTimer = 0, tickLeft = 0;
    function fold() { ticker.hidden = true; stage.classList.remove('igw-talking'); bubble.hidden = true; }
    function tick() {
      ticker.hidden = true; bubble.hidden = true; stage.classList.remove('igw-talking'); return;
      var lines = X.banter || [];
      if (!lines.length || !echoOn) { ticker.hidden = true; bubble.hidden = true; stage.classList.remove('igw-talking'); return; }
      var l = lines[tickN++ % lines.length]; ticker.textContent = ''; var who = el('b', 'igw-ticker-' + l[0], l[0] === 'echo' ? 'ECHO' : 'GHOST'); ticker.appendChild(who); ticker.appendChild(document.createTextNode(' ' + l[1]));
      ticker.hidden = false; bubble.hidden = true; stage.classList.add('igw-talking');
      clearTimeout(tickTimer); tickTimer = setTimeout(function () { if (--tickLeft > 0) tick(); else fold(); }, 5500);
    }
    function talk(n) { tickLeft = n; tick(); }
    bubble.addEventListener('click', function (e) { e.stopPropagation(); talk((X.banter || []).length); });
    ticker.addEventListener('click', function (e) { e.stopPropagation(); clearTimeout(tickTimer); fold(); });
    // their conversations live in the diary and the log terminal now; in the town they talk in bubbles when you meet them or tap them
    var counter = el('div', 'igw-counter'); hud.appendChild(counter);
    function showCounter() {
      var c2 = X.clan || {}, left = Math.round((world.next || 0) - Date.now() / 1000), nxt = world.live ? 'LIVE NOW' : (left > 0 ? (left >= 86400 ? Math.floor(left / 86400) + 'D ' + Math.floor(left % 86400 / 3600) + 'H' : Math.floor(left / 3600) + 'H ' + Math.floor(left % 3600 / 60) + 'M') : 'TBC');
      counter.textContent = '';
      [['STREAM', world.live || (typeof liveStream === 'function' && liveStream()) ? 'LIVE NOW' : 'OFFLINE'], ['IN THE ARENA', ((world.extra || {}).arena || {}).here ? ((world.extra || {}).arena || {}).here : '--'], ['UK TIME', ukClock()]].forEach(function (x4) { var d = el('span'); d.appendChild(el('i', '', x4[0])); d.appendChild(el('b', '', String(x4[1]))); counter.appendChild(d); });
    }
    showCounter(); setInterval(function () { if (!disposed) showCounter(); }, 30000);
    function clanRefresh() { X = world.extra || {}; drawJumbo(world.sides.i, world.sides.g); drawWalls(); if (typeof projSync === 'function' && plots) projSync(); echoOn = !!(X.echo && X.echo.name); echoSpirit.visible = echoOn && (typeof echoOut === 'undefined' || echoOut); placeGifts(); if (ticker.hidden) fold(); showCounter(); showCard(showing); if (typeof freshen === 'function') freshen(); }

    var cineFrom = scene.children.length; cinema(); var cineTo = scene.children.length;

    // ---- Day and night, from the visitor's own clock: dawn about 6, full day 9 to 5, dusk to about 8, night until dawn.
    //      The sky, the sun or moon, the light, the fog, the city's windows, the stars and the street lamps all follow it.
    //      ?igwtime=14.5 in the address forces an hour, for checking.
    var ghostOut = true, echoOut = true, dn = { last: -1 }, sunDir = new T.Vector3(), skyCv = skyTex.image, warmBase = mats.warm.color.clone(), lightBase = mats.light.color.clone(), lampGlows = [];
    scene.traverse(function (o) { if (o.isSprite && o.material && o.material.color && Math.abs(o.material.color.getHex() - 0xffb45e) < 0x100) lampGlows.push([o, o.material.opacity]); });
    var hemi = null; scene.children.forEach(function (o) { if (o.isHemisphereLight) hemi = o; });
    var forced = null; try { var fq = parseFloat((new URLSearchParams(location.search)).get('igwtime')); if (fq >= 0 && fq < 24) forced = fq; } catch (e) {}
    function hourNow() { if (forced !== null && forced !== undefined) return forced; return ukNow().h; }
    function lerpC(a, b, k) { return new T.Color(a).lerp(new T.Color(b), k); }
    function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    // how much daylight there is: 0 at night, 1 at full day
    function daylight(h) { var st = sunTimes(); return h < st.noon ? smooth(st.sr - .55, st.sr + 1.3, h) : 1 - smooth(st.ss - 1.3, st.ss + .55, h); }
    function golden(h) { var st = sunTimes(); return Math.max(0, 1 - Math.abs(h - (st.sr + .35)) / 1.3) + Math.max(0, 1 - Math.abs(h - (st.ss - .35)) / 1.4); }
    // Indoors (README-ADMIN 262): no sun, no daylight, no weather. The arena is lit only by its own lights, the same at every hour,
    // with a soft fixed fill so nothing goes black; shadows off (they were the sun's).
    function indoor() {
      if (sun.visible || sun.castShadow || renderer.shadowMap.enabled) { sun.visible = false; sun.castShadow = false; sun.intensity = 0; if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { m.needsUpdate = true; }); }); } }
      if (hemi) { try { hemi.color.copy(tugColor()); } catch (e) { hemi.color.setHex(0x8ea6d8); } hemi.groundColor.setHex(0x1a2232); hemi.intensity = 1.7; }
    }
    function applyDay() {
      var h = hourNow(), k = daylight(h), gld = Math.min(1, golden(h)) * (1 - Math.abs(k - .5) * 1.2);
      if (Math.abs(h - dn.last) < .02) return; dn.last = h;
      // the sky: a graded canvas, from night blues to day blues through dawn and dusk oranges
      var top = lerpC(0x03060f, 0x2f6fb8, k), mid = lerpC(0x081329, 0x6ea8dc, k), hor = lerpC(0x16305a, 0xbfdcf2, k);
      if (gld > 0) { hor.lerp(new T.Color(0xff9a5a), gld * .8); mid.lerp(new T.Color(0xc0705a), gld * .45); }
      var g = skyCv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, skyCv.height);
      gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(.42, '#' + mid.getHexString()); gr.addColorStop(.5, '#' + hor.getHexString()); gr.addColorStop(.56, '#' + lerpC(0x0a1428, 0x8aa0b4, k).getHexString()); gr.addColorStop(1, '#' + lerpC(0x050a16, 0x3a4a5a, k).getHexString());
      g.fillStyle = gr; g.fillRect(0, 0, skyCv.width, skyCv.height); skyTex.needsUpdate = true;
      scene.background = lerpC(0x050a16, 0x6ea8dc, k);
      var fogC = lerpC(0x0b1834, 0x9fbfdc, k); if (gld > 0) fogC.lerp(new T.Color(0xd8906a), gld * .4); scene.fog.color.copy(fogC); renderer.setClearColor(fogC, 1);
      // the sun crosses from east to west by day; at night the moonlight comes from where it was
      var st = sunTimes(), arc = Math.max(0, Math.min(1, (h - st.sr) / (st.ss - st.sr))) * Math.PI;
      if (k > .02) { sunDir.set(Math.cos(arc) * 44, Math.max(5, Math.sin(arc) * 72 * st.peak), 22 + (1 - st.peak) * 26); sun.color.copy(lerpC(0xffb070, 0xfff4e0, Math.min(1, k * 1.4 - gld * .5))); sun.intensity = .6 + k * 3.4; }
      else { sunDir.set(-34, 52, 26); sun.color.setHex(0x9db9ff); sun.intensity = 2.4; }
      sun.position.copy(sunDir); if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      if (hemi) { hemi.color.copy(lerpC(0x7f9fe0, 0xcfe4ff, k)); hemi.groundColor.copy(lerpC(0x141c2c, 0x4a5240, k)); hemi.intensity = 1.05 + k * 1.4; }
      stars.material.opacity = .85 * (1 - k); stars.visible = k < .95 && !SEALED;
      if (moonRef) moonRef.visible = k < .6 && moonRef.userData.fx !== false && (qual > 0);
      if (cityRef) cityRef.color.copy(lerpC(0x101826, 0x5e6e82, k));            /* the mountains: dark at night, hazy blue by day */
      // the street lamps: on from dusk to dawn
      var lamp = 1 - smooth(.25, .7, k * (1 - wxs.cloud * .45 - wxs.storm * .2));
      mats.warm.color.copy(warmBase).multiplyScalar(.35 + .65 * lamp); mats.light.color.copy(lightBase).multiplyScalar(.6 + .4 * lamp);
      lampGlows.forEach(function (lg) { lg[0].material.opacity = lg[1] * lamp; });
      lampFill.intensity = 140 * lamp; 
      concourseLights.forEach(function (l) { l.intensity = 1100 * (.45 + .55 * lamp); });
      // Ghost is out by day, Echo by night; at dawn and dusk both are about
      ghostOut = true; echoOut = true;                // both are out day and night
      spirit.visible = ghostOut; shadow.visible = ghostOut; if (typeof echoSpirit !== 'undefined') echoSpirit.visible = echoOn && echoOut;
      stage.dataset.out = (ghostOut ? 'ghost' : '') + (echoOut ? (ghostOut ? ',' : '') + 'echo' : '');
      if (typeof showCard === 'function') showCard(showing);
      sweepers.forEach(function (sw) { sw[0].visible = k < .45; }); if (searchlight) searchlight.visible = k < .45 && qual > 0 && !searchlight.userData.gone;
      stage.dataset.daylight = k.toFixed(2);
      dayBase(k, gld, top, mid, hor, lerpC(0x0a1428, 0x8aa0b4, k), lerpC(0x050a16, 0x3a4a5a, k));
      if (SEALED) indoor();
    }
    // =====================================================================================================================
    // ---- The town's sky: British time and seasons, the weather and a real sky. ------------------------------------------
    //      The town keeps UK time (GMT in winter, BST in summer) wherever the visitor is, and the sun rises and sets when it
    //      does over London that day. One weather for everyone at a time, worked out from the UK date and the time of day,
    //      leaning towards how Ghost and Echo feel. ?igwweather=rain forces a weather, for checking.
    // =====================================================================================================================
    function ukNow() {
      var d = new Date();
      try {
        var o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(d).forEach(function (p) { o[p.type] = p.value; });
        var h = (Number(o.hour) % 24) + Number(o.minute) / 60, off = Math.round((((h - (d.getUTCHours() + d.getUTCMinutes() / 60)) % 24) + 24) % 24);
        if (!isFinite(h)) throw new Error('no time');
        return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: h, off: off > 12 ? off - 24 : off };
      } catch (e) { return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() + d.getUTCMinutes() / 60, off: 0 }; }
    }
    function ukClock() { var h = hourNow(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
    // sunrise and sunset over London for today (the usual almanac sums: declination, equation of time, the sun's disc)
    var sunCache = { key: '' };
    function sunTimes() {
      var u = ukNow(), key = u.y + '-' + u.m + '-' + u.d + '-' + u.off; if (key === sunCache.key) return sunCache;
      var doy = Math.round((Date.UTC(u.y, u.m - 1, u.d) - Date.UTC(u.y, 0, 0)) / 864e5);
      var B = 2 * Math.PI * (doy - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
      var decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365), lat = 51.5 * Math.PI / 180;
      var cosW = (Math.sin(-.833 * Math.PI / 180) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl)), half = Math.acos(Math.max(-1, Math.min(1, cosW))) * 12 / Math.PI;
      var noon = 12 + .13 / 15 - eot / 60 + u.off;
      sunCache = { key: key, sr: noon - half, ss: noon + half, noon: noon, peak: Math.sin(Math.PI / 2 - lat + decl), month: u.m };
      return sunCache;
    }

    // ---- The weather. Each kind is [cloud, rain, mist, storm]; the town moves between them over about half a minute.
    var WX_KINDS = { clear: [.1, 0, 0, 0], cloudy: [.7, 0, .12, 0], mist: [.5, 0, 1, 0], drizzle: [.86, .4, .35, 0], rain: [1, .85, .25, 0], storm: [1, 1, .2, 1] };
    var WX_SAY = { clear: 'CLEAR', cloudy: 'CLOUDY', mist: 'MIST', drizzle: 'DRIZZLE', rain: 'RAIN', storm: 'STORM' };
    var wxs = { kind: '', cloud: .1, rain: 0, mist: 0, storm: 0, wet: 0, flash: 0, boltAt: -99, nextBolt: 6, forced: null, last: 0 };
    try { var wxAsk = (new URLSearchParams(location.search)).get('igwweather'); if (wxAsk && WX_KINDS[wxAsk]) wxs.forced = wxAsk; } catch (e) {}
    function hash01(s) {
      var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;   // stir it, so neighbouring hours differ
      return (h >>> 0) / 4294967296;
    }
    function weatherPick() {
      if (wxs.forced) return wxs.forced;
      var u = ukNow(), block = Math.floor(u.h / 2), r = hash01('wx' + u.y + '/' + u.m + '/' + u.d + '/' + block), r2 = hash01('mood' + u.y + u.m + u.d + '/' + block);
      var X0 = world.extra || {}, mood = world.mood || '', echoMood = (X0.echo && X0.echo.mood) || '';
      // about one time in two, the sky follows how they feel
      if (r2 < .5) {
        if (mood === 'gloomy' || echoMood === 'gloomy') return r < .5 ? 'rain' : 'drizzle';
        if (mood === 'restless' || echoMood === 'restless') return r < .45 ? 'storm' : 'rain';
        if (mood === 'sleepy' && (u.h < 11 || u.h > 20)) return 'mist';
        if (mood === 'cheerful' || mood === 'proud') return 'clear';
        if (mood === 'thoughtful') return 'cloudy';
      }
      // otherwise British weather for the time of year: wetter from October to March, mist on autumn and winter mornings
      if ((u.h < 10 || u.h >= 22) && (u.m >= 9 || u.m <= 3) && r < .12) return 'mist';
      var w = (u.m >= 10 || u.m <= 3) ? [['clear', .27], ['cloudy', .27], ['drizzle', .16], ['rain', .2], ['storm', .05], ['mist', .05]]
        : (u.m >= 6 && u.m <= 8) ? [['clear', .5], ['cloudy', .25], ['drizzle', .08], ['rain', .09], ['storm', .06], ['mist', .02]]
        : [['clear', .36], ['cloudy', .28], ['drizzle', .13], ['rain', .14], ['storm', .05], ['mist', .04]];
      var acc = 0; for (var i = 0; i < w.length; i++) { acc += w[i][1]; if (r < acc) return w[i][0]; } return 'cloudy';
    }
    function weatherSet(kind, now) {
      if (!WX_KINDS[kind] || SEALED) return;      // no weather indoors
      var first = !wxs.kind; wxs.kind = kind; stage.dataset.weather = kind;
      if (first || now) { var v = WX_KINDS[kind]; wxs.cloud = v[0]; wxs.rain = v[1]; wxs.mist = v[2]; wxs.storm = v[3]; wxs.wet = v[1] > 0 ? Math.min(1, v[1] * 1.3) : 0; }
      if (typeof showCounter === 'function') showCounter();
    }
    function wxLabel() { if (!wxs) return ''; return (wxs.kind === 'clear' && dayLight() < .3 ? 'CLEAR NIGHT' : WX_SAY[wxs.kind]) || ''; }
    function dayLight() { return skyBase ? skyBase.k : 0; }

    // ---- The sky: a gradient from the time of day, the glow round the sun, and drifting clouds that cover it as the weather
    //      turns, lit gold at dusk and by the city at night. Drawn by the graphics chip, so it costs a phone very little.
    var skyMesh = null; scene.traverse(function (o) { if (!skyMesh && o.isMesh && o.material && o.material.map === skyTex) skyMesh = o; });
    var skyPlain = skyMesh ? skyMesh.material : null;
    var skyU = { uTop: { value: new T.Color(0x03060f) }, uMid: { value: new T.Color(0x081329) }, uHor: { value: new T.Color(0x16305a) }, uLow: { value: new T.Color(0x0a1428) }, uNad: { value: new T.Color(0x050a16) },
      uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color(1, 1, 1) }, uSunAmt: { value: 0 }, uCloud: { value: .1 }, uStorm: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uDay: { value: 0 }, uGlow: { value: new T.Color(.05, .055, .085) } };
    var skyShader = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform vec3 uTop, uMid, uHor, uLow, uNad, uSunDir, uSunCol, uGlow; uniform float uSunAmt, uCloud, uStorm, uTime, uFlash, uDay; varying vec3 vDir;',
        'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }',
        'void main(){',
        '  vec3 d = normalize(vDir); float t = 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265;',
        '  vec3 col = t < 0.42 ? mix(uTop, uMid, t / 0.42) : (t < 0.5 ? mix(uMid, uHor, (t - 0.42) / 0.08) : (t < 0.56 ? mix(uHor, uLow, (t - 0.5) / 0.06) : mix(uLow, uNad, (t - 0.56) / 0.44)));',
        '  float mu = max(dot(d, normalize(uSunDir)), 0.0), open = 1.0 - uCloud * 0.85;',
        '  col += uSunCol * (pow(mu, 6.0) * 0.22 + pow(mu, 48.0) * 0.55) * uSunAmt * open;',
        '  float cov = 0.0;',
        '  if (d.y > -0.03) {',
        '    vec2 uv = d.xz / (d.y + 0.18) * 0.85 + vec2(uTime * 0.0045, uTime * 0.0016);',
        '    float n = fbm(uv * 1.7), sh = fbm(uv * 1.7 + normalize(uSunDir.xz + 0.0001) * 0.09);',
        '    float th = mix(0.66, 0.12, uCloud); cov = smoothstep(th, th + 0.22, n) * smoothstep(-0.03, 0.14, d.y);',
        '    float lit = clamp(0.55 + (n - sh) * 2.6, 0.0, 1.0);',
        '    vec3 dayC = mix(vec3(0.26, 0.29, 0.34), vec3(0.95, 0.96, 0.98), lit) * mix(1.0, 0.5, uCloud * 0.55 + uStorm * 0.4);',
        '    dayC = dayC * (vec3(0.78) + uSunCol * 0.22) + uSunCol * pow(mu, 5.0) * 0.7 * uSunAmt * lit;',
        '    vec3 nightC = uGlow * (0.55 + lit * 0.6);',
        '    col = mix(col, mix(nightC, dayC, uDay), cov * (0.82 + 0.18 * uCloud));',
        '  }',
        '  col += uSunCol * smoothstep(0.99955, 0.99975, mu) * 26.0 * uSunAmt * (1.0 - cov) * open;',
        '  col += uFlash * vec3(0.6, 0.66, 0.85) * (0.35 + cov);',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'].join('\n')
    });

    // ---- Rain: thin streaks falling round wherever you are (so it is everywhere you look), slanting with the wind, and
    //      little splashes on the ground near you. Both are worked out by the graphics chip from a fixed set of seeds.
    var RAIN_N = coarse ? 6000 : 10000, wr = rnd(91);
    var rainGeo = new T.InstancedBufferGeometry(); rainGeo.setAttribute('position', new T.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3)); rainGeo.setIndex([0, 1, 2, 0, 2, 3]);
    var rainSeed = new Float32Array(RAIN_N * 4); for (var ri = 0; ri < rainSeed.length; ri++) rainSeed[ri] = wr();
    rainGeo.setAttribute('aSeed', new T.InstancedBufferAttribute(rainSeed, 4)); rainGeo.instanceCount = RAIN_N;
    var rainU = { uTime: { value: 0 }, uCam: { value: new T.Vector3() }, uBox: { value: new T.Vector3(64, 38, 64) }, uWind: { value: new T.Vector2(2.6, 1.1) }, uAmt: { value: 0 }, uCol: { value: new T.Color(.6, .66, .75) }, uLen: { value: .85 }, uWidth: { value: .011 } };
    var rainMat = new T.ShaderMaterial({
      uniforms: rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: [
        'attribute vec4 aSeed; uniform float uTime, uAmt, uLen, uWidth; uniform vec3 uCam, uBox; uniform vec2 uWind; varying float vA; varying float vX;',
        'void main(){',
        '  vX = position.x; vA = 0.0;',
        '  if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
        '  float sp = 24.0 * (0.8 + fract(aSeed.w * 7.31) * 0.45), H = uBox.y, y0 = max(uCam.y - 16.0, -0.6);',
        '  float y = mod(aSeed.y * H - uTime * sp, H);',
        '  vec2 xz = aSeed.xz * uBox.xz + uWind * uTime;',
        '  xz = uCam.xz + mod(xz - uCam.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;',
        '  vec3 dir = normalize(vec3(uWind.x, -sp, uWind.y)), p = vec3(xz.x, y0 + y, xz.y);',
        '  vec3 side = normalize(cross(dir, normalize(cameraPosition - p))) * uWidth * (1.0 + length(cameraPosition - p) * 0.05);',
        '  p += side * position.x - dir * uLen * (1.0 - position.y);',
        '  float dist = length(cameraPosition - p);',
        '  vA = position.y * smoothstep(40.0, 5.0, dist) * smoothstep(2.4, 6.0, dist);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
        '}'].join('\n'),
      fragmentShader: 'uniform vec3 uCol; varying float vA; varying float vX; void main(){ gl_FragColor = vec4(uCol, vA * 0.42 * (1.0 - abs(vX))); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    });
    var rainMesh = new T.Mesh(rainGeo, rainMat); rainMesh.frustumCulled = false; rainMesh.renderOrder = 5; rainMesh.visible = false; scene.add(rainMesh);
    var SPL_N = coarse ? 600 : 1000, splPos = new Float32Array(SPL_N * 3), splSeed = new Float32Array(SPL_N * 4);
    for (var si = 0; si < SPL_N; si++) { splSeed[si * 4] = wr(); splSeed[si * 4 + 1] = wr(); splSeed[si * 4 + 2] = wr(); splSeed[si * 4 + 3] = wr(); }
    var splGeo = new T.BufferGeometry(); splGeo.setAttribute('position', new T.BufferAttribute(splPos, 3)); splGeo.setAttribute('aSeed', new T.BufferAttribute(splSeed, 4));
    var splU = { uTime: { value: 0 }, uCam: { value: new T.Vector3() }, uAmt: { value: 0 }, uScale: { value: 400 }, uCol: { value: new T.Color(.7, .76, .85) } };
    var splMat = new T.ShaderMaterial({
      uniforms: splU, transparent: true, depthWrite: false, fog: false,
      vertexShader: [
        'attribute vec4 aSeed; uniform float uTime, uAmt, uScale; uniform vec3 uCam; varying float vA;',
        'void main(){',
        '  vA = 0.0; if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }',
        '  float ph = fract(aSeed.z + uTime * (1.4 + aSeed.x));',
        '  vec2 xz = aSeed.xy * 26.0 + floor(aSeed.z + uTime * (1.4 + aSeed.x)) * vec2(3.7, 5.3);',
        '  xz = uCam.xz + mod(xz - uCam.xz + 13.0, 26.0) - 13.0;',
        '  vec4 mv = viewMatrix * vec4(xz.x, length(xz) < 30.3 ? 0.09 : 0.05, xz.y, 1.0);',
        '  float dist = -mv.z; vA = (1.0 - ph) * smoothstep(22.0, 3.0, dist);',
        '  gl_PointSize = clamp((0.04 + ph * 0.13) * uScale / max(dist, 0.5), 1.0, 24.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'].join('\n'),
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; c.y *= 3.4; float r = length(c); float ring = smoothstep(0.45, 0.8, r) * smoothstep(1.0, 0.8, r); if (ring < 0.01) discard; gl_FragColor = vec4(uCol, ring * vA * 0.32); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    });
    var splash = new T.Points(splGeo, splMat); splash.frustumCulled = false; splash.visible = false; scene.add(splash);

    // ---- Lightning: a jagged bolt down to the hills, the sky and the town lit for a moment, thunder a second or two later.
    var boltPts = new Float32Array(64 * 3), boltGeo = new T.BufferGeometry(); boltGeo.setAttribute('position', new T.BufferAttribute(boltPts, 3));
    var boltMat = new T.LineBasicMaterial({ color: new T.Color(7, 7.4, 9), transparent: true, opacity: 1, fog: false, depthWrite: false });
    var bolt = new T.LineSegments(boltGeo, boltMat); bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
    var boltGlow = glow(0xc8d4ff, 90, 0, 90, 0, null, .0); boltGlow.material.fog = false;
    function makeBolt() {
      var a = Math.random() * Math.PI * 2, r0 = 130 + Math.random() * 110, x = Math.cos(a) * r0, z = Math.sin(a) * r0, y = 120, n = 0;
      function seg(x1, y1, z1, x2, y2, z2) { if (n >= 64) return; boltPts.set([x1, y1, z1, x2, y2, z2], n * 3); n += 2; }
      var bx = x, by = y, bz = z;
      for (var i = 0; i < 20; i++) { var nx = bx + (Math.random() - .5) * 14, ny = by - 6, nz = bz + (Math.random() - .5) * 14; seg(bx, by, bz, nx, ny, nz); if (i === 7 || i === 12) { var cx = nx, cy = ny, cz = nz; for (var j = 0; j < 4; j++) { var dx2 = cx + (Math.random() - .5) * 16, dy2 = cy - 5, dz2 = cz + (Math.random() - .5) * 16; seg(cx, cy, cz, dx2, dy2, dz2); cx = dx2; cy = dy2; cz = dz2; } } bx = nx; by = ny; bz = nz; }
      boltGeo.setDrawRange(0, n); boltGeo.attributes.position.needsUpdate = true; boltGeo.computeBoundingSphere();
      boltGlow.position.set(x, 95, z);
      return Math.hypot(x - camera.position.x, z - camera.position.z);
    }

    // ---- Wet streets: the ground goes darker and glossier in rain and dries slowly afterwards, and every lamp throws a long
    //      shimmering streak across the wet road towards you, the way streetlights do on a rainy night.
    var mA = new T.Matrix4(), qA = new T.Quaternion(), vA = new T.Vector3(), vS = new T.Vector3(), cTmp = new T.Color();
    var wetGround = [mats.floor, mats.road, land.material], wetWalls = [mats.base, mats.dark, mats.rim, mats.metal];
    wetGround.concat(wetWalls).forEach(function (m) { m.userData.wxEnv = m.envMapIntensity === undefined ? 1 : m.envMapIntensity; });
    function roughBase(m) { var k = m.userData.keep; return qual > 0 && k ? k.rough[0] : (m.userData.baseRough !== undefined ? m.userData.baseRough : m.roughness); }
    var streakTex = shade(32, 128, function (x, w, h) { x.save(); x.scale(1, 4); var g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); x.restore(); });
    var lampSpots = []; lampGlows.forEach(function (lg) { var p = new T.Vector3(); lg[0].getWorldPosition(p); lampSpots.push({ p: p, c: lg[0].material.color.clone() }); });
    var streakGeo = new T.PlaneGeometry(1, 1); streakGeo.rotateX(-Math.PI / 2);
    var streakMat = new T.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: true });
    var streaks = new T.InstancedMesh(streakGeo, streakMat, Math.max(1, lampSpots.length)); streaks.count = 0; streaks.frustumCulled = false; streaks.renderOrder = 2; scene.add(streaks);
    lampSpots.forEach(function (ls, i) { streaks.setColorAt(i, ls.c.clone().multiplyScalar(1.4)); }); if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
    var shaftShared = null; scene.traverse(function (o) { if (!shaftShared && o.isMesh && o.geometry && o.geometry.type === 'ConeGeometry' && o.material && o.material.blending === T.AdditiveBlending && Math.abs(o.material.opacity - .016) < .001) shaftShared = o.material; });
    var mistBase = mists.map(function (m) { return m.material.opacity; });
    var cloudSprites = clouds.children.slice(), cloudBase = cloudSprites.map(function (c) { return c.material.opacity; });

    // ---- Sound for the weather (only when the town's sound is on): rain hiss, and thunder after the flash.
    var wxSound = null;
    function wxSoundTick() {
      if (!soundOn || !soundCtx || soundCtx.state !== 'running' || !soundNoise) return;
      if (!wxSound) { try { var src = soundCtx.createBufferSource(), hp = soundCtx.createBiquadFilter(), g = soundCtx.createGain(); src.buffer = soundNoise; src.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; g.gain.value = 0; src.connect(hp); hp.connect(g); g.connect(soundMaster); src.start(); wxSound = g; } catch (e) { wxSound = false; } }
      if (wxSound) wxSound.gain.setTargetAtTime(wxs.rain * .45, soundCtx.currentTime, .8);
    }
    function thunder(delay, far) {
      if (!soundOn || !soundCtx || soundCtx.state !== 'running' || !soundNoise) return;
      try { var now = soundCtx.currentTime + delay, src = soundCtx.createBufferSource(), lp = soundCtx.createBiquadFilter(), g = soundCtx.createGain(); src.buffer = soundNoise; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 140 - far * 60;
        g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(1.1 - far * .5, now + .12); g.gain.exponentialRampToValueAtTime(.35, now + 1.0); g.gain.exponentialRampToValueAtTime(.001, now + 4.2);
        src.connect(lp); lp.connect(g); g.connect(soundMaster); src.start(now); src.stop(now + 4.3); } catch (e) {}
    }

    // ---- The day's look, laid over by the weather. applyDay works out the clear-sky values; this dims, greys and fogs them.
    var skyBase = null, FLASHC = new T.Color(.75, .8, 1), GREYC = new T.Color(), envK = -1, envAt = -99, envCloud = -1;
    function dayBase(k, gld, top, mid, hor, low, nad) {
      skyBase = { k: k, gld: gld, fog: scene.fog.color.clone(), sunI: sun.intensity, hemiI: hemi ? hemi.intensity : 1, star: stars.material.opacity, lampFill: lampFill.intensity };
      skyU.uTop.value.copy(top); skyU.uMid.value.copy(mid); skyU.uHor.value.copy(hor); skyU.uLow.value.copy(low); skyU.uNad.value.copy(nad);
      skyU.uSunCol.value.copy(sun.color); skyU.uSunDir.value.copy(sun.position).normalize(); skyU.uDay.value = k; skyU.uSunAmt.value = Math.min(1, k * 1.6);
      weatherApply();
      var lb = wxLabel(); if (lb !== wxs.label) { wxs.label = lb; if (typeof showCounter === 'function') showCounter(); }
    }
    function weatherApply() {
      if (!skyBase) return;
      var c = wxs.cloud, k = skyBase.k, st = wxs.storm, fl = wxs.flash;
      GREYC.setRGB(.36, .40, .46).multiplyScalar(.06 + .94 * k);
      var fog = skyBase.fog.clone().lerp(GREYC, c * .7).multiplyScalar(1 - st * .4 - wxs.rain * .1); if (fl > 0) fog.lerp(FLASHC, fl * .22);
      scene.fog.color.copy(fog); renderer.setClearColor(fog, 1); if (scene.background && scene.background.isColor) scene.background.copy(fog);
      scene.fog.near = Math.max(6, 40 - 26 * wxs.mist - 12 * wxs.rain); scene.fog.far = Math.max(70, 300 - 200 * wxs.mist - 120 * wxs.rain - 40 * st);
      sun.intensity = skyBase.sunI * (1 - c * .7 - st * .2) * (k > .02 ? 1 : 1 - c * .5);
      if (hemi) hemi.intensity = skyBase.hemiI * (1 + c * .12 * k) + fl * 4;
      if (SEALED) indoor();
      stars.material.opacity = skyBase.star * (1 - c * .95); if (moonRef) moonRef.material.opacity = 1 - Math.min(1, c * 1.05);
      cloudSprites.forEach(function (cs, i) { cs.material.opacity = cloudBase[i] * (.25 + c * .9); cs.material.color.setScalar(1 - st * .5); });
      mists.forEach(function (m, i) { m.material.opacity = (mistBase[i] || 0) * (1 + wxs.mist * 1.8 + wxs.rain * .6); });
      skyU.uCloud.value = c; skyU.uStorm.value = st; skyU.uFlash.value = fl;
      skyU.uGlow.value.setRGB(.045 + st * .01, .05, .08).multiplyScalar(1 + wxs.mist * .5);
      // wet surfaces: darker, glossier, and reflecting more of the sky
      var wet = wxs.wet;
      wetGround.forEach(function (m) { m.roughness = roughBase(m) * (1 - wet * .5); m.envMapIntensity = m.userData.wxEnv * (1 + wet * 1.5); });
      wetWalls.forEach(function (m) { m.roughness = roughBase(m) * (1 - wet * .3); m.envMapIntensity = m.userData.wxEnv * (1 + wet * .6); });
      rainU.uCol.value.setRGB(.42, .46, .52).lerp(cTmp.setRGB(.75, .8, .88), k);
      if (post && post.u) {
        var gold = skyBase.gld * (1 - c * .8);
        post.u.uStr.value = .3 + .26 * (1 - k) + st * .08 + fl * .5;
        post.u.uSat.value = 1.12 - c * .22 * k - wxs.mist * .12 + gold * .1;
        post.u.uTint.value.set(1 + gold * .07 - c * .02, 1, 1 - gold * .09 + c * .03);
        post.u.uFlash.value = fl * .18;
      }
    }

    // ---- Every frame: the weather moves on, lightning, the rain and splashes, the lamp streaks.
    function skyTick(t, dt) {
      var want = SEALED ? [0, 0, 0, 0] : WX_KINDS[wxs.kind] || WX_KINDS.clear, a = 1 - Math.exp(-dt / 25);     // indoors: no rain, mist or storms
      wxs.cloud += (want[0] - wxs.cloud) * a; wxs.rain += (want[1] - wxs.rain) * a; wxs.mist += (want[2] - wxs.mist) * a; wxs.storm += (want[3] - wxs.storm) * a;
      wxs.wet += wxs.rain > .05 ? (Math.min(1, wxs.rain * 1.3) - wxs.wet) * (1 - Math.exp(-dt / 14)) : -wxs.wet * (1 - Math.exp(-dt / 420));
      // lightning
      if (wxs.storm > .5 && t > wxs.nextBolt) { var far = Math.min(1, (makeBolt() - 100) / 160); wxs.boltAt = t; wxs.nextBolt = t + 5 + Math.random() * 13; thunder(.6 + far * 2.4, far); }
      var f = t - wxs.boltAt; wxs.flash = f < 0 || f > 1.2 ? 0 : (f < .07 ? 1 : f < .14 ? .25 : f < .24 ? .85 : Math.exp(-(f - .24) * 7) * .8);
      bolt.visible = f >= 0 && f < .32 && (f < .07 || f > .14); boltMat.opacity = f < .24 ? 1 : .5; boltGlow.material.opacity = wxs.flash * .9;
      // rain
      var cam = camera.position; rainU.uTime.value = t; rainU.uCam.value.copy(cam); rainU.uAmt.value = wxs.rain * (qual === 1 ? .55 : 1); rainU.uLen.value = .8 + wxs.storm * .5; rainU.uWind.value.set(2.2 + wxs.storm * 4, 1 + wxs.storm * 1.5);
      rainMesh.visible = wxs.rain > .02 && qual > 0;
      splU.uTime.value = t; splU.uCam.value.copy(cam); splU.uAmt.value = wxs.rain; splU.uScale.value = (renderer.domElement.height || 600) * .9; splash.visible = wxs.rain > .05 && qual > 0;
      // the sky
      skyU.uTime.value = t; if (skyMesh) { var wantSky = qual > 0 ? skyShader : skyPlain; if (skyMesh.material !== wantSky) skyMesh.material = wantSky; }
      // lamp streaks on the wet ground, pointing at you
      var lampOn = 1 - smooth(.25, .7, dayLight()), sOp = wxs.wet * lampOn * (qual > 0 ? .55 : .3); streakMat.opacity = sOp;
      if (sOp > .01) {
        var n = 0;
        for (var i = 0; i < lampSpots.length; i++) {
          var lp2 = lampSpots[i].p, dx = cam.x - lp2.x, dz = cam.z - lp2.z, d = Math.hypot(dx, dz); if (d > 55 || d < 1.5) continue;
          var len = Math.min(d * .8, 3 + lp2.y * 2.2), w = .5 + lp2.y * .18, yaw = Math.atan2(dx, dz);
          qA.setFromAxisAngle(vA.set(0, 1, 0), yaw); mA.compose(vA.set(lp2.x + dx / d * len * .5, Math.hypot(lp2.x, lp2.z) < R ? .085 : .045, lp2.z + dz / d * len * .5), qA, vS.set(w, 1, len)); streaks.setMatrixAt(n, mA);
          if (streaks.instanceColor) streaks.setColorAt(n, lampSpots[i].c);
          n++;
        }
        streaks.count = n; streaks.instanceMatrix.needsUpdate = true; if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
      } else streaks.count = 0;
      if (shaftShared) shaftShared.opacity = .016 * (.15 + .85 * lampOn) * (1 + wxs.mist * 2.5 + wxs.rain * 1.4);
      wxSoundTick();
      // reflections follow the sky: remade when the light has changed a good deal
      if (qual > 0 && makeEnv && skyBase && t - envAt > 20 && (Math.abs(skyBase.k - envK) > .18 || Math.abs(wxs.cloud - envCloud) > .3)) {
        var old = envTex; envTex = null; try { scene.environment = makeEnv(); scene.environmentIntensity = .5 + skyBase.k * .3 - wxs.cloud * .1; envK = skyBase.k; envCloud = wxs.cloud; envAt = t; if (old && old !== envTex) old.dispose(); } catch (e) { envTex = old; }
      }
      weatherApply();
    }
    function skyInfo(kind) {
      if (kind && WX_KINDS[kind]) { wxs.forced = kind; weatherSet(kind, true); weatherApply(); }
      if (kind === 'flash') wxs.nextBolt = 0;
      return { weather: wxs.kind, rain: Math.round(wxs.rain * 100) / 100, wet: Math.round(wxs.wet * 100) / 100, cloud: Math.round(wxs.cloud * 100) / 100, uk: ukClock(), sunrise: Math.round(sunTimes().sr * 100) / 100, sunset: Math.round(sunTimes().ss * 100) / 100,
        sky: !!(skyMesh && skyMesh.material === skyShader), label: wxLabel() };
    }
    weatherSet(weatherPick(), true);
    setInterval(function () { if (disposed) return; var k2 = weatherPick(); if (k2 !== wxs.kind) weatherSet(k2, false); }, 60000);

    // =====================================================================================================================
    // ---- Real 3D models (README-ADMIN 244). The Owner drops a .glb into assets/models under one of the names the site
    //      knows; the town loads it after it has opened and puts it in place of its own shapes. Nothing is loaded when no
    //      file is there, and if a file will not load the town's own shapes come back.
    //      arena: the stadium round the town. It is measured where it lands: its floor is found by looking straight down
    //      from above, and it is sized so its stands begin where the town's own did, so the town sits on its floor.
    // =====================================================================================================================
    var arenaRoot = null, screenFaces = [], arenaFaces = [], arenaMode = false, OLD_AT = {};
    Object.keys(PLACES).forEach(function (k) { OLD_AT[k] = [PLACES[k].x, PLACES[k].z]; });
    var modelInfo = {}, MODEL_SLOTS = { arena: { hide: bowlParts, place: placeArena }, stage: { place: placeStage },
      'stall-isocore': { place: function (root, info) { placeOnRing(root, info, Math.PI + .38, 6, 0, false, 'barracks'); } },
      'stall-gridsync': { place: function (root, info) { placeOnRing(root, info, Math.PI - .38, 6, 0, false, 'circuit'); } },
      // food and merch either side of the stage area, a little further round
      'stall-food': { place: function (root, info) { placeOnRing(root, info, Math.PI + .72, 4); } },
      'stall-merch': { place: function (root, info) { placeOnRing(root, info, Math.PI - .72, 4); } },
      // Ghost and Echo's AI town on the east side of the arena floor: Ghost's tower, Echo's pit garage beside it, and
      // the buildings they put up round them
      'ghost-tower': { place: function (root, info) { placeOnRing(root, info, Math.PI / 2, 14, 0, false, 'home'); } },
      'echo-pits': { place: function (root, info) { placeOnRing(root, info, Math.PI / 2 - .5, 20); } },
      'ai-building': { place: function (root, info) { keepKind('ai-building', root, info); return false; } },
      // the village square on the west side: the clubhouse in the middle, Staff HQ and Broadcast either side
      clubhouse: { place: function (root, info) { placeOnRing(root, info, 3 * Math.PI / 2, 14, 0, false, 'rosters'); } },
      'staff-hq': { place: function (root, info) { placeOnRing(root, info, 3 * Math.PI / 2 - .36, 16, 0, false, 'staff'); } },
      broadcast: { place: function (root, info) { placeOnRing(root, info, 3 * Math.PI / 2 + .36, 14, 0, false, 'broadcast'); } },
      // the members' village on the west side: the two house designs, turned and alternated along two rows
      'house-a': { place: function (root, info) { keepKind('house-a', root, info); return false; } },
      'house-b': { place: function (root, info) { keepKind('house-b', root, info); return false; } },
      // street furniture, set out once everything else has its place
      tree: { place: function (root, info) { keepKind('tree', root, info); return false; } },
      bench: { place: function (root, info) { keepKind('bench', root, info); return false; } },
      lamp: { place: function (root, info) { keepKind('lamp', root, info); return false; } },
      'stage-isocore': { place: function (root, info) { placeOnRing(root, info, Math.PI, 24, 0, false, 'arena'); } },
      'stage-gridsync': { place: function (root, info) { placeOnRing(root, info, 0, 26, 0, false); } },
      desk: { place: function (root, info) { keepKind('desk', root, info); return false; } },
      'stage-main': { place: function () { return false; } },
      simrig: { place: function (root, info) { keepKind('simrig', root, info); return false; } },
      station: { place: function (root, info) { keepKind('station', root, info); return false; } },
      ghost: { place: function (root, info) { keepKind('ghost', root, info); return false; } },
      echo: { place: function (root, info) { keepKind('echo', root, info); return false; } } };
    ['audience', 'audience-blue', 'audience-olive', 'audience-rust', 'audience-cheering', 'camera-tripod', 'camera-jib', 'mods-sign'].forEach(function (k) { MODEL_SLOTS[k] = { place: function (root, info) { keepKind(k, root, info); return false; } }; });
    // a small thing (made in metres) stood at a spot on the arena floor, facing the middle, if nothing is in the way
    function placeProp(t, a, D, solidR, clearR, cx, cz) {
      var x = (cx || 0) + Math.sin(a) * D, z = (cz || 0) + Math.cos(a) * D, rr = Math.hypot(x, z);
      if ((CITY ? rr > CITY.edge - 1 : rr < R + 1.6 || rr > RO - 1.6) || blocked().some(function (o) { return inside(o, x, z, clearR); })) return false;
      t.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(t), mid = bb.getCenter(new T.Vector3());
      t.rotation.y = cx !== undefined ? Math.atan2(cx - x, cz - z) : Math.atan2(-x, -z); var off = new T.Vector3(-mid.x, 0, -mid.z).applyAxisAngle(new T.Vector3(0, 1, 0), t.rotation.y);
      t.position.set(x + off.x, -bb.min.y + .04, z + off.z); var so = [x, z, solidR]; so.keep = 1; SOLIDS.push(so); router = null; addModel(t); return true;
    }
    var kinds = {};
    function keepKind(n, root, info) { kinds[n] = root; info.kept = true; }
    // once every model has arrived: the village, and the AI town's own buildings
    function buildLater() {
      if (CITY) {
        try { enterArena(); } catch (e) { window.__igwArenaErr = String(e && e.stack || e).slice(0, 400); }
        try { cityBuild(); } catch (e) { window.__igwArenaErr = String(e && e.stack || e).slice(0, 400); }
        try { unjoin(); joinStatic(); } catch (e) { try { unjoin(); } catch (e2) {} }
        if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true; still(); return;
      }
      var houses = ['house-a', 'house-b'].filter(function (k) { return kinds[k]; }), made = 0;
      if (houses.length) {
        // an inner and an outer row either side of the square, leaving the walkway in front of the stands clear
        [RING_D - 11, RING_D + 12].forEach(function (D, ri) {
          for (var i = 0; i < 13; i++) {
            var a = 3 * Math.PI / 2 + (i - 6) * (12.5 / D) + ri * (6 / D), t = kinds[houses[(i + ri) % houses.length]].clone(), inf = {};
            try { placeOnRing(t, inf, a, 7.5, D, true); addModel(t); made++; } catch (e) { /* no room there: a squad street or a stall */ }
          }
        });
        modelInfo.village = { state: 'shown', houses: made };
      }
      if (kinds['ai-building']) {
        var ai = 0; [Math.PI / 2 + .42, Math.PI / 2 - .95, Math.PI / 2 + .75].forEach(function (a) { var t = kinds['ai-building'].clone(), inf = {}; try { placeOnRing(t, inf, a, 10); addModel(t); ai++; } catch (e) {} });
        modelInfo.aitown = { state: 'shown', buildings: ai };
      }
      // benches in a ring round the gate in the middle (trees and lamps never go inside the arena: they wait for the
      // outside, when there is one to walk to)
      var props = { benches: 0 }, k2;
      if (kinds.bench) for (k2 = 0; k2 < 8; k2++) if (placeProp(kinds.bench.clone(), k2 * Math.PI / 4 + Math.PI / 8, 11, .9, 1.2)) props.benches++;
      if (kinds.bench) modelInfo.props = { state: 'shown', benches: props.benches };
      try { enterArena(); } catch (e) { window.__igwArenaErr = String(e && e.stack || e).slice(0, 400); }
      // the town's own blocks were joined into a few big pieces when it opened: join them again without the old booths
      if (placesMoved || arenaMode) { try { unjoin(); joinStatic(); } catch (e) { try { unjoin(); } catch (e2) {} } }
      if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true; still();
    }

    // =====================================================================================================================
    // ---- The arena without the town (README-ADMIN 245). Once the stadium model is in, the old town goes: its ground,
    //      rails, roads, booths, members' pods, range, paddock, old jumbotron, trees and lamps are put away, and nothing
    //      left of it can be walked into. The gate moves to the middle of the arena floor with Log in, Overview, Join, the
    //      post box and the log terminal round it. Every place of the site is now its model (see movePlace), and the spots
    //      Ghost and Echo use (their haunts, where things are left, their building plots, Echo's spots) move with the
    //      building each was beside. The stadium's own jumbotron carries the scoreboard and the live streams.
    // =====================================================================================================================
    function moveSolidAt(x, z, dx, dz) { SOLIDS.forEach(function (o) { if (Math.abs(o[0] - x) < .05 && Math.abs(o[1] - z) < .05) { o[0] += dx; o[1] += dz; o.keep = 1; } }); }
    function remapPt(pt) {
      var best = null, bd = 1e9;
      Object.keys(OLD_AT).forEach(function (k) { if (!PLACES[k]) return; var d = Math.hypot(pt[0] - OLD_AT[k][0], pt[1] - OLD_AT[k][1]); if (d < bd) { bd = d; best = k; } });
      if (!best) return pt;
      var cx = PLACES[best].x, cz = PLACES[best].z, nx = pt[0] + cx - OLD_AT[best][0], nz = pt[1] + cz - OLD_AT[best][1];
      // never inside a building: step out from its middle until clear
      for (var st = 0; st < 40 && blocked().some(function (o) { return inside(o, nx, nz, .6); }); st++) { var ddx = nx - cx, ddz = nz - cz, dl = Math.hypot(ddx, ddz) || 1; if (dl < .01) { ddx = 1; ddz = 0; dl = 1; } nx += ddx / dl * .6; nz += ddz / dl * .6; }
      var rr = Math.hypot(nx, nz); if (rr > EDGE - 1) { nx *= (EDGE - 1) / rr; nz *= (EDGE - 1) / rr; }
      pt[0] = nx; pt[1] = nz; return pt;
    }
    function enterArena() {
      if (arenaMode || !arenaRoot) return;
      arenaMode = true; stage.dataset.arena = '1';
      // 1. the gate and what stood by it: to the village square outside the west entrance (in the city), or the middle of the floor
      if (CITY) { var hubKeep = hubToVillage(); hubKeepList = hubKeep; }
      var dz = CITY ? 0 : -PLACES.gate.z, keep = hubKeep || [], hubSolids = [[PLACES.gate.x - 2.6, PLACES.gate.z], [PLACES.gate.x + 2.6, PLACES.gate.z], [PLACES.post.x, PLACES.post.z], [-4.6, 18.6], [4.6, 18.6]];
      if (!CITY) hubSolids.forEach(function (h) { moveSolidAt(h[0], h[1], 0, dz); });
      ['gate', 'login', 'overview', 'post', 'enlist'].forEach(function (id) {
        var p = PLACES[id]; if (!p || CITY) return;
        if (p.group) { p.group.position.z += dz; keep.push(p.group); }
        p.z += dz; p.at = [p.at[0], p.at[1] + dz]; OLD_AT[id] = [OLD_AT[id][0], OLD_AT[id][1]];
        tags.forEach(function (t) { if (t.userData.place === id) t.position.z += dz; });
      });
      if (loreK && !CITY) { loreK.position.z += dz; keep.push(loreK); LORE_AT = [2.6, 18.6 + dz, 4.6, 18.6 + dz]; }
      try { var ns = sign('ISOCORE', CITY ? 'WELCOME TO ISOCORE' : 'WELCOME TO THE ARENA', 5.6, 1.0); gateSign.material = ns.material; } catch (e) {}
      // 2. the old town is put away
      var keepSet = keep.concat([skyMesh, land, stars, clouds, spirit, echoSpirit, thingGroup, rainMesh, splash, bolt, boltGlow, streaks, arenaRoot]).concat(CITY ? [] : [outerAds], plotRoots, tags);
      for (var i = 0; i < scene.children.length; i++) {
        var o = scene.children[i];
        if (keepSet.indexOf(o) >= 0 || o.userData.model || o.userData.keep || i >= lifeFrom) continue;
        // what cinema() added stays (the far hills, forest and mountains, the moon, the drifting mist), except the
        // street trees and lamp light cones it planted in the town
        if (i >= cineFrom && i < cineTo && (o.isInstancedMesh || o === moonRef || mists.some(function (m) { return m === o; }) || Math.hypot(o.position.x, o.position.z) > RO - 1)) continue;
        if (o.isLight && (o === sun || o === hemi || o === lampFill || concourseLights.indexOf(o) >= 0)) continue;
        if (o.isCamera) continue;
        o.visible = false; o.userData.gone = true;
      }
      SOLIDS.forEach(function (so) { if (!so.keep) { so[0] = 9999; so[1] = 9999; } });
      houseTags.concat(streetTags).forEach(function (sp) { sp.visible = false; scene.remove(sp); }); houseTags = []; streetTags = [];
      boothSolids = []; housePos = []; router = null;
      // 3. the spots Ghost and Echo use follow the buildings they were beside
      Object.keys(SPOTS).forEach(function (k) { remapPt(SPOTS[k]); });
      Object.keys(ECHO_AT).forEach(function (k) { remapPt(ECHO_AT[k]); });
      ['ghost', 'echo'].forEach(function (w) { (HAUNTS[w] || []).forEach(remapPt); Object.keys(WILL_AT[w] || {}).forEach(function (k) { remapPt(WILL_AT[w][k]); }); });
      ['ghost', 'echo'].forEach(function (w, n) { remapPt(PLOT[w]); if (plotRoots[n]) plotRoots[n].position.set(PLOT[w][0], plotRoots[n].position.y, PLOT[w][1]); });
      thingGroup.children.forEach(function (c) { var pt = remapPt([c.position.x, c.position.z]); c.position.x = pt[0]; c.position.z = pt[1]; });
      if (typeof thingSpots !== 'undefined') thingSpots.forEach(function (ts) { remapPt(ts); });
      // 4. the stadium's jumbotron: the scoreboard on all four faces, and the live streams over it
      var disp = null; arenaRoot.traverse(function (o2) { if (o2.isMesh && /jumbotron.*display/i.test(o2.name || '')) disp = o2; });
      if (disp) {
        var bb = new T.Box3().setFromObject(disp), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
        [[0, sz.x, 0, sz.z / 2], [Math.PI, sz.x, 0, -sz.z / 2], [Math.PI / 2, sz.z, sz.x / 2, 0], [-Math.PI / 2, sz.z, -sz.x / 2, 0]].forEach(function (f, fi) {
          var m = new T.Mesh(new T.PlaneGeometry(f[1] * .96, sz.y * .92), new T.MeshBasicMaterial({ map: fi < 2 ? jTex : jTex2, toneMapped: false }));      // north and south: live; east and west: the brand
          m.position.set(c.x + f[2] + Math.sin(f[0]) * .06, c.y, c.z + f[3] + Math.cos(f[0]) * .06); m.rotation.y = f[0]; m.userData.jumbo = true; m.userData.keep = true; scene.add(m); arenaFaces.push(m);
        });
        JUMBO_AT.set(c.x, c.y, c.z);
        // Scout's light (README-ADMIN 257): a green ring under the jumbotron, lit for as long as Scout is on. Nobody in the arena knows
        // what it is. Ghost and Echo blame a cable.
        // the jumbotron's underside: look straight up from the floor beneath it and take the first thing hit
        var ringY = bb.min.y - .12; try { var rc3 = new T.Raycaster(new T.Vector3(c.x + sz.x * .3, 0.5, c.z + sz.z * .3), new T.Vector3(0, 1, 0)), ms3 = []; arenaRoot.traverse(function (o3) { if (o3.isMesh) ms3.push(o3); }); var hit3 = rc3.intersectObjects(ms3, false).filter(function (q3) { return q3.point.y > 4 && q3.point.y < bb.min.y + .01; })[0]; if (hit3) ringY = hit3.point.y - .12; } catch (e) {}
        thirdRing = new T.Mesh(new T.TorusGeometry(Math.max(sz.x, sz.z) * .56, .07, 8, 64), new T.MeshBasicMaterial({ color: 0x39ff7a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending }));
        thirdRing.rotation.x = Math.PI / 2; thirdRing.position.set(c.x, ringY, c.z); thirdRing.userData.keep = true; scene.add(thirdRing);
        thirdHalo = glow(0x39ff7a, Math.max(sz.x, sz.z) * 1.6, c.x, ringY - .3, c.z, scene, 0);
      }
      // 5. you start at the gate, looking up the floor to the stage (in the city: in the village square, looking down the avenue to the arena)
      if (CITY) {
        var wasHome = Math.hypot(player.x - START.x, player.z - START.z) < 2, sp = hubXY(START.x, START.z);
        START.x = sp[0]; START.z = sp[1]; START.yaw -= HUB.phi; EDGE = CITY.edge - 1.8;      // the walking view turns the other way to the models
        if (wasHome) { player.x = START.x; player.z = START.z; pyaw = START.yaw; }
      } else if (Math.hypot(player.x - START.x, player.z - START.z) < 2) { START.x = 0; START.z = 6.5; player.x = START.x; player.z = START.z; }
      else { START.x = 0; START.z = 6.5; }
      modelInfo.arenaMode = { state: 'shown', gate: [PLACES.gate.x, PLACES.gate.z] };
    }
    // =====================================================================================================================
    // ---- The city round the arena (README-ADMIN 246). The arena holds only its two stages (Isocore Gaming's on the north
    //      wall, GridSync's on the south wall) and the jumbotron; you come in through the tunnels at the east and west. Outside:
    //      a paved city with two ring roads and an avenue from each tunnel. West: the members' village, with the gate, Log in,
    //      Overview, Join, the post box and the log terminal in its square, the clubhouse, Staff HQ and Broadcast, and a house
    //      for every member. East: Ghost and Echo's AI town between two parks. The team, food and merch stalls stand outside
    //      the tunnels. The stands are solid, so the only ways in and out are the tunnels.
    // =====================================================================================================================
    var walkBtn, seatLock = false, SEALED = false, seatHome = null, mixers = [], stageMeshes = [], seatY = 0, seatAt = null, hubKeepList = [], ARENA_FLOOR = 32, CITY = null, ZONE = null, LORE_AT = null, forestRef = null, HUB = null, cityReady = false, stageRoots = {}, PARKS = [];
    function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
    function cityMeasure(root, meshes) {
      root.updateMatrixWorld(true);
      var wb = new T.Box3().setFromObject(root), outerW = Math.max(wb.max.x, -wb.min.x, wb.max.z, -wb.min.z), rc = new T.Raycaster(), eye = new T.Vector3(), dir = new T.Vector3(), rs = [], open = [], k, an, h;
      for (k = 0; k < 36; k++) { an = k * Math.PI / 18; eye.set(Math.sin(an) * (outerW + 8), 2, Math.cos(an) * (outerW + 8)); dir.set(-Math.sin(an), 0, -Math.cos(an)); rc.set(eye, dir); h = rc.intersectObjects(meshes, false); if (h.length && outerW + 8 - h[0].distance > ARENA_FLOOR + 2) rs.push(outerW + 8 - h[0].distance); }
      var ao = (rs.length ? Math.max.apply(null, rs) : outerW) + .5;
      for (k = 0; k < 120; k++) { an = k * Math.PI / 60; eye.set(0, 1.6, 0); dir.set(Math.sin(an), 0, Math.cos(an)); rc.set(eye, dir); h = rc.intersectObjects(meshes, false).filter(function (x) { return x.distance > 4; }); open.push(!h.length || h[0].distance > ao - 2); }
      var found = [];
      for (k = 0; k < 120; k++) if (open[k] && !open[(k + 119) % 120]) { var n = 0; while (n < 120 && open[(k + n) % 120]) n++; found.push({ a: ((k + (n - 1) / 2) * Math.PI / 60) % (Math.PI * 2), hw: Math.max(2.6, Math.min(4.2, ARENA_FLOOR * Math.sin(n * Math.PI / 240) * 2 / 2)) }); }
      // only the east and west tunnels are ways in: the north and south walls are the stages'
      var gaps = [Math.PI / 2, 3 * Math.PI / 2].map(function (want) {
        var best = null; found.forEach(function (g) { if (Math.abs(angDiff(g.a, want)) < .45 && (!best || Math.abs(angDiff(g.a, want)) < Math.abs(angDiff(best.a, want)))) best = g; });
        return best ? { a: best.a, hw: Math.max(3, best.hw) } : { a: want, hw: 0 };
      });
      if (!found.length) found = [];
      var C = CITY = { floor: ARENA_FLOOR, ao: ao, a0: ao + 8, a1: ao + 15, b0: ao + 40, b1: ao + 46, edge: ao + 72, gaps: gaps, gE: gaps[0].a, gW: gaps[1].a };
      var rS = (C.a1 + C.b0) / 2; C.sq = { x: Math.sin(C.gW) * rS, z: Math.cos(C.gW) * rS, r: 11 };
      PARKS = [[C.gE + .62, Math.PI - .14], [.14, C.gE - .62]];
      var ring = [0, 0, ARENA_FLOOR + .2, ao]; ring.gaps = gaps.filter(function (g) { return g.hw > 0; }); ring.keep = 1; SOLIDS.push(ring); router = null;
      modelInfo.city = { state: 'measured', outer: Math.round(ao * 10) / 10, tunnels: gaps.map(function (g) { return Math.round(g.a * 100) / 100; }), found: found.length };
    }
    function onRoad(x, z) {
      var C = CITY; if (!C) return false; var rr = Math.hypot(x, z);
      if ((rr > C.a0 - .3 && rr < C.a1 + .3) || (rr > C.b0 - .3 && rr < C.b1 + .3)) return true;
      if (Math.hypot(x - C.sq.x, z - C.sq.z) < C.sq.r + .6) return true;
      var a = Math.atan2(x, z);
      return C.gaps.some(function (g) { var da = a - g.a; return Math.cos(da) > 0 && rr > C.ao - 2 && rr < C.b1 && Math.abs(rr * Math.sin(da)) < 4.7; });
    }
    function inPark(x, z) { var rr = Math.hypot(x, z), a = Math.atan2(x, z); if (a < 0) a += Math.PI * 2; return rr > CITY.a1 + .6 && rr < CITY.b0 - .6 && PARKS.some(function (p) { return a > p[0] && a < p[1]; }); }
    // where the zones are, for placeOnRing
    function zFloor(side) { return { lo: 0, hi: ARENA_FLOOR - .6, side: side }; }
    function zPlaza() { return { lo: CITY.ao + .3, hi: CITY.a0 - .2, roads: true, out: true }; }
    function zBand1(out) { return { lo: CITY.a1 + .3, hi: CITY.b0 - .3, roads: true, out: !!out }; }
    function zBand2() { return { lo: CITY.b1 + .3, hi: CITY.edge - 1, roads: true }; }
    function backTo(r) { return function (hd, hw) { return Math.sqrt(Math.max(0, r * r - (hw || 0) * (hw || 0))) - hd; }; }   // its back corners just touch r
    function frontOn(r) { return function (hd) { return r + hd; }; }
    var CITY_SLOTS = {
      arena: function (root, info) { placeArena(root, info); },
      // the one long stage across the floor, west to east, with the host platform at the centre: it replaces the two old stages
      'stage-main': function (root, info) {
        root.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(root), c = bb.getCenter(new T.Vector3());
        root.position.x -= c.x; root.position.z -= c.z; root.position.y -= bb.min.y; root.updateMatrixWorld(true);
        var sz = bb.getSize(new T.Vector3()); router = null;
        root.traverse(function (o) { if (o.isMesh) stageMeshes.push(o); });
        info.size = [Math.round(sz.x * 10) / 10, Math.round(sz.z * 10) / 10]; stageRoots.main = root;
      },
      'stage-isocore': function (root, info) { if (world.models['stage-main']) return false; ZONE = zFloor('iso'); placeOnRing(root, info, Math.PI, 26, backTo(ARENA_FLOOR - 1.2), false, 'arena'); stageRoots.iso = root; },
      'stage-gridsync': function (root, info) { if (world.models['stage-main']) return false; ZONE = zFloor('gs'); placeOnRing(root, info, 0, 30, backTo(ARENA_FLOOR - 1.2), false, 'circuit'); stageRoots.gs = root; },
      // the first stage stands in for whichever of the two new ones has not arrived yet
      stage: function (root, info) {
        if (world.models['stage-main']) return false;
        var needI = !world.models['stage-isocore'], needG = !world.models['stage-gridsync'];
        if (!needI && !needG) return false;
        if (needI && needG) { var c2 = root.clone(); ZONE = zFloor('gs'); placeOnRing(c2, {}, 0, 24, backTo(ARENA_FLOOR - 1.2), false, 'circuit'); addModel(c2); }
        ZONE = zFloor(needI ? 'iso' : 'gs'); placeOnRing(root, info, needI ? Math.PI : 0, 24, backTo(ARENA_FLOOR - 1.2), false, needI ? 'arena' : 'circuit');
      },
      'stall-isocore': function (root, info) { ZONE = zPlaza(); placeOnRing(root, info, CITY.gW - .3, 6, frontOn(CITY.ao + .5), false, 'barracks'); },
      'stall-gridsync': function (root, info) { ZONE = zPlaza(); placeOnRing(root, info, CITY.gE + .3, 6, frontOn(CITY.ao + .5), false, world.models['stage-gridsync'] || world.models.stage ? undefined : 'circuit'); },
      'stall-merch': function (root, info) { ZONE = zPlaza(); placeOnRing(root, info, CITY.gW + .3, 4, frontOn(CITY.ao + .5)); },
      'stall-food': function (root, info) { ZONE = zPlaza(); placeOnRing(root, info, CITY.gE - .3, 4, frontOn(CITY.ao + .5)); },
      'ghost-tower': function (root, info) { ZONE = zBand2(); placeOnRing(root, info, CITY.gE, 14, frontOn(CITY.b1 + 1.2), false, 'home'); },
      'echo-pits': function (root, info) { ZONE = zBand1(); placeOnRing(root, info, CITY.gE - .45, 20, frontOn(CITY.a1 + 1.2)); },
      clubhouse: function (root, info) { ZONE = zBand2(); placeOnRing(root, info, CITY.gW, 16, frontOn(CITY.b1 + 1.2), false, 'rosters'); },
      'staff-hq': function (root, info) { ZONE = zBand1(); placeOnRing(root, info, CITY.gW - .5, 16, frontOn(CITY.a1 + 1.2), false, 'staff'); },
      broadcast: function (root, info) { ZONE = zBand1(); placeOnRing(root, info, CITY.gW + .5, 14, frontOn(CITY.a1 + 1.2), false, 'broadcast'); }
    };
    // the gate and everything round it, turned and carried to the village square, its front to the village and its back to the arena
    function hubXY(x, z) { var dx = x - HUB.px, dz = z - HUB.pz, c = Math.cos(HUB.phi), s2 = Math.sin(HUB.phi); return [HUB.x + dx * c + dz * s2, HUB.z - dx * s2 + dz * c]; }
    function hubToVillage() {
      HUB = { px: PLACES.gate.x, pz: PLACES.gate.z, phi: CITY.gW, x: CITY.sq.x, z: CITY.sq.z };
      var keep = [], olds = [[PLACES.gate.x - 2.6, PLACES.gate.z], [PLACES.gate.x + 2.6, PLACES.gate.z], [PLACES.post.x, PLACES.post.z], [-4.6, 18.6], [4.6, 18.6]];
      olds.forEach(function (h) { SOLIDS.forEach(function (o) { if (o.length !== 4 && Math.abs(o[0] - h[0]) < .05 && Math.abs(o[1] - h[1]) < .05) { var q = hubXY(o[0], o[1]); o[0] = q[0]; o[1] = q[1]; if (o.length === 5) o[4] += HUB.phi; o.keep = 1; } }); });
      function carry(g) { var q = hubXY(g.position.x, g.position.z); g.position.x = q[0]; g.position.z = q[1]; g.rotation.y += HUB.phi; keep.push(g); }
      ['gate', 'login', 'overview', 'post', 'enlist'].forEach(function (id) {
        var p = PLACES[id]; if (!p) return; if (p.group) carry(p.group);
        var q = hubXY(p.x, p.z), qa = hubXY(p.at[0], p.at[1]); p.x = q[0]; p.z = q[1]; p.at = [qa[0], qa[1]];
        tags.forEach(function (t) { if (t.userData.place === id) { var q2 = hubXY(t.position.x, t.position.z); t.position.x = q2[0]; t.position.z = q2[1]; } });
      });
      if (loreK) { carry(loreK); var l1 = hubXY(2.6, 18.6), l2 = hubXY(4.6, 18.6); LORE_AT = [l1[0], l1[1], l2[0], l2[1]]; }
      return keep;
    }
    // ---- a model repeated many times costs one draw per part: each copy is just a place, a turn and a size
    function stamper(kind) {
      var root = kinds[kind]; if (!root) return null;
      root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1); root.updateMatrixWorld(true);
      var parts = [], bb = new T.Box3().setFromObject(root), sz = bb.getSize(new T.Vector3()), mid = bb.getCenter(new T.Vector3());
      root.traverse(function (o) { if (o.isMesh) { parts.push({ g: o.geometry, m: o.material, local: o.matrixWorld.clone() }); [].concat(o.material || []).forEach(function (m) { if (m && m.isMeshStandardMaterial) m.envMapIntensity = .9; }); } });
      return { kind: kind, root: root, parts: parts, mats: [], size: sz, mid: mid, min: bb.min.clone(), ims: [] };
    }
    function stampRoot(st) { st.root.updateMatrixWorld(true); st.mats.push(st.root.matrixWorld.clone()); }
    function stampProp(st, x, z, ry, sc, y) { var m = new T.Matrix4().compose(new T.Vector3(x, y || 0, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ry), new T.Vector3(sc, sc, sc)).multiply(new T.Matrix4().makeTranslation(-st.mid.x, -st.min.y, -st.mid.z)); st.mats.push(m); }
    function stampDone(st, picks) {
      if (!st || !st.mats.length) return [];
      st.parts.forEach(function (pt) {
        var im = new T.InstancedMesh(pt.g, pt.m, st.mats.length), m = new T.Matrix4();
        st.mats.forEach(function (M, i) { m.multiplyMatrices(M, pt.local); im.setMatrixAt(i, m); });
        im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.userData.model = true; im.userData.keep = true;
        if (picks) { im.userData.cityHouses = picks; pickable.push(im); }
        scene.add(im); st.ims.push(im);
      });
      return st.ims;
    }
    function stampClear(st) { if (!st) return; st.ims.forEach(function (im) { scene.remove(im); var pi = pickable.indexOf(im); if (pi >= 0) pickable.splice(pi, 1); }); st.ims = []; st.mats = []; }
    // ---- the ground, the roads and the parks
    function cityGround() {
      var C = CITY, grp = new T.Group(); grp.userData.keep = true; scene.add(grp);
      function flat(geo, mat, y, rotY) { var m = new T.Mesh(geo, mat); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, rotY || 0, 0); m.position.y = y; m.receiveShadow = true; m.userData.keep = true; grp.add(m); return m; }
      function th(a) { return a - Math.PI / 2; }
      var tex = concourseTex.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(C.edge / 2.4, C.edge / 2.4);
      var pave = new T.MeshStandardMaterial({ color: 0x8b939a, map: tex, roughness: .82, metalness: .05 });
      var square = new T.MeshStandardMaterial({ color: 0xb7a98f, map: tex, roughness: .8, metalness: .02 });
      var grass = new T.MeshStandardMaterial({ color: 0x3f6a3a, roughness: .95, metalness: 0 });
      var kerb = new T.MeshStandardMaterial({ color: 0xb9bec4, roughness: .7 });
      var paint = new T.MeshStandardMaterial({ color: 0xe8e4d8, roughness: .6, emissive: 0x222222 });
      flat(new T.RingGeometry(C.ao - 2, C.edge + 10, 160, 1), pave, -.02);
      var roads = [flat(new T.RingGeometry(C.a0, C.a1, 160, 1), mats.road, .01), flat(new T.RingGeometry(C.b0, C.b1, 180, 1), mats.road, .01)];
      C.gaps.forEach(function (g) {
        var r0 = C.ao - 2, len = C.b1 - r0, m = flat(new T.PlaneGeometry(8.4, len), mats.road, .02, g.a); m.position.x = Math.sin(g.a) * (r0 + len / 2); m.position.z = Math.cos(g.a) * (r0 + len / 2); roads.push(m);
        [-4.3, 4.3].forEach(function (off) { var kb = new T.Mesh(new T.BoxGeometry(.3, .14, len), kerb); kb.rotation.y = g.a; kb.position.set(Math.sin(g.a) * (r0 + len / 2) + Math.cos(g.a) * off, .07, Math.cos(g.a) * (r0 + len / 2) - Math.sin(g.a) * off); kb.userData.keep = true; grp.add(kb); });
      });
      roads.forEach(function (m) { try { worldUV(m); } catch (e) {} });
      [C.a0, C.a1, C.b0, C.b1].forEach(function (r) { var kr = new T.Mesh(new T.CylinderGeometry(r, r, .14, 180, 1, true), kerb); kr.position.y = .07; kr.userData.keep = true; grp.add(kr); });
      PARKS.forEach(function (p) { flat(new T.RingGeometry(C.a1 + .6, C.b0 - .6, 40, 1, th(p[0]), p[1] - p[0]), grass, .03); });
      var sq = flat(new T.CircleGeometry(C.sq.r, 48), square, .04); sq.position.x = C.sq.x; sq.position.z = C.sq.z;
      // dashed lines down the middle of every road
      var dash = new T.InstancedMesh(new T.BoxGeometry(.18, .02, 2.6), paint, 400), dm = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1), n = 0;
      [(C.a0 + C.a1) / 2, (C.b0 + C.b1) / 2].forEach(function (r) { var cnt = Math.floor(Math.PI * 2 * r / 6.5); for (var i = 0; i < cnt && n < 400; i++) { var a = i / cnt * Math.PI * 2; if (C.gaps.some(function (g) { return Math.abs(angDiff(a, g.a)) * r < 5; })) continue; q.setFromAxisAngle(up, a + Math.PI / 2); dm.compose(new T.Vector3(Math.sin(a) * r, .045, Math.cos(a) * r), q, one); dash.setMatrixAt(n++, dm); } });
      C.gaps.forEach(function (g) { for (var r = C.ao + 1; r < C.b1 - 1 && n < 400; r += 6.5) { if ((r > C.a0 - 1 && r < C.a1 + 1) || Math.hypot(Math.sin(g.a) * r - C.sq.x, Math.cos(g.a) * r - C.sq.z) < C.sq.r + 1) continue; q.setFromAxisAngle(up, g.a); dm.compose(new T.Vector3(Math.sin(g.a) * r, .045, Math.cos(g.a) * r), q, one); dash.setMatrixAt(n++, dm); } });
      dash.count = n; dash.instanceMatrix.needsUpdate = true; dash.userData.keep = true; grp.add(dash);
    }
    // ---- every member gets a house in the village, Isocore Gaming's then GridSync's, each squad or league together
    var homeStamps = {}, homeSolids = [], homeSig = '';
    function cityHomes() {
      var types = ['house-a', 'house-b'].filter(function (k) { return kinds[k]; }); if (!types.length || !CITY) return;
      var named = world.houses.map(function (h, i) { return i; }).sort(function (p, q) { var a = world.houses[p], b = world.houses[q]; return (a.s === b.s ? 0 : a.s === 'i' ? -1 : 1) || (a.q - b.q) || (p - q); });
      var total = Math.min(70, Math.max(named.length, (world.sides.i || 0) + (world.sides.g || 0)));
      var sig = total + '|' + named.map(function (i) { var h = world.houses[i]; return h.s + h.q + h.n; }).join(',') + '|' + JSON.stringify(world.streets);
      if (sig === homeSig) return; homeSig = sig;
      types.forEach(function (k) { stampClear(homeStamps[k]); homeStamps[k] = stamper(k); });
      homeSolids.forEach(function (so) { so[0] = 9999; so[1] = 9999; }); homeSolids = [];
      houseTags.concat(streetTags).forEach(function (sp) { scene.remove(sp); var pi = pickable.indexOf(sp); if (pi >= 0) pickable.splice(pi, 1); }); houseTags = []; streetTags = [];
      housePos = []; var picks = {}; types.forEach(function (k) { picks[k] = []; });
      var C = CITY, rows = [[zBand1(false), frontOn(C.a1 + 1.4)], [zBand1(true), backTo(C.b0 - 1.4)], [zBand2(), frontOn(C.b1 + 1.4)]], made = 0, lastStreet = '';
      for (var ri = 0; ri < rows.length && made < total; ri++) {
        var D0 = rows[ri][1](4.6), step = 11.5 / D0;
        for (var a = Math.PI + .22; a < Math.PI * 2 - .22 && made < total; a += step) {
          var k = types[made % types.length], st = homeStamps[k], idx = made < named.length ? named[made] : -1, inf = {}, before = SOLIDS.length;
          st.root.position.set(0, 0, 0); st.root.rotation.set(0, 0, 0); st.root.scale.set(1, 1, 1);
          ZONE = rows[ri][0]; ZONE.noScreen = true;
          try { placeOnRing(st.root, inf, a, 8, rows[ri][1], true); } catch (e) { ZONE = null; continue; }
          ZONE = null; stampRoot(st); picks[k].push(idx); if (SOLIDS.length > before) homeSolids.push(SOLIDS[SOLIDS.length - 1]);
          var hx = inf.at[0], hz = inf.at[1], th2 = st.root.rotation.y, h = st.size.y * st.root.scale.y;
          var at = { x: hx, y: h + 1.2, z: hz, approachX: hx + Math.sin(th2) * (inf.size[1] / 2 + 1.8), approachZ: hz + Math.cos(th2) * (inf.size[1] / 2 + 1.8) };
          if (idx >= 0) {
            var hs = world.houses[idx]; housePos[idx] = at; if (houseTags.length < 70) houseTag(hs.n, at, idx);
            var sk = hs.s + hs.q, s3 = world.streets[hs.q];
            if (sk !== lastStreet && s3 && streetTags.length < 60) { lastStreet = sk; streetTag(String(s3[1] || (hs.s === 'i' ? 'No squad yet' : 'No team yet')).toUpperCase(), (hs.s === 'i' ? 'ISOCORE GAMING' : 'GRIDSYNC') + (s3[5] > 0 ? ' // ' + s3[5] + ' ONLINE' : ''), at.approachX + Math.sin(th2 + Math.PI / 2) * 4.6, at.approachZ + Math.cos(th2 + Math.PI / 2) * 4.6, hs.s === 'i' ? '#4fc8f5' : '#ff9a4d'); }
          }
          made++;
        }
      }
      types.forEach(function (k) { stampDone(homeStamps[k], picks[k]); });
      router = null; modelInfo.village = { state: 'shown', houses: made, named: named.length };
    }
    // ---- trees, lamps and benches along the streets, in the parks and round the square
    function cityProps() {
      var C = CITY, out = { trees: 0, lamps: 0, benches: 0 }, rnd2 = rnd(77);
      function free(x, z, r) { return !onRoad(x, z) && !blocked().some(function (o) { return inside(o, x, z, r); }) && Math.hypot(x, z) < C.edge - 2; }
      function streetFree(x, z, r) { return !blocked().some(function (o) { return inside(o, x, z, r); }); }
      var tr = stamper('tree'), lp = stamper('lamp'), bn = stamper('bench');
      function sizeOf(st, want) { var hgt = st.size.y || 1; return hgt > want * 2.5 || hgt < want / 2.5 ? want / hgt : 1; }
      if (tr) {
        var tsc = sizeOf(tr, 8);
        function tree(x, z) { var so = [x, z, .5]; so.keep = 1; SOLIDS.push(so); stampProp(tr, x, z, rnd2() * 6.28, tsc * (.85 + rnd2() * .3)); out.trees++; }
        C.gaps.forEach(function (g) { for (var r = C.ao + 4; r < C.b1; r += 9) { if (r > C.a0 - 2 && r < C.a1 + 2) continue; [-6.2, 6.2].forEach(function (off) { var x = Math.sin(g.a) * r + Math.cos(g.a) * off, z = Math.cos(g.a) * r - Math.sin(g.a) * off; if (!onRoad(x, z) && streetFree(x, z, 1.2) && Math.hypot(x - C.sq.x, z - C.sq.z) > C.sq.r + 1.5) tree(x, z); }); } });
        for (var i = 0; i < 260 && out.trees < 140; i++) { var a = rnd2() * Math.PI * 2, r = C.a1 + 2 + rnd2() * (C.b0 - C.a1 - 4), x = Math.sin(a) * r, z = Math.cos(a) * r; if (inPark(x, z) && free(x, z, 2.2)) tree(x, z); }
        for (var j = 0; j < 8; j++) { var a2 = j * Math.PI / 4 + Math.PI / 8, x2 = C.sq.x + Math.sin(a2) * (C.sq.r + 2.2), z2 = C.sq.z + Math.cos(a2) * (C.sq.r + 2.2); if (!onRoad(x2, z2) && streetFree(x2, z2, 1.2)) tree(x2, z2); }
        stampDone(tr);
      }
      if (lp) {
        var lsc = sizeOf(lp, 5);
        function lamp(x, z, ry) { var so = [x, z, .25]; so.keep = 1; SOLIDS.push(so); stampProp(lp, x, z, ry, lsc); out.lamps++; }
        var rA = C.a0 - 1, cnt = Math.floor(Math.PI * 2 * rA / 16); for (var k = 0; k < cnt; k++) { var a3 = k / cnt * Math.PI * 2, x3 = Math.sin(a3) * rA, z3 = Math.cos(a3) * rA; if (!onRoad(x3, z3) && streetFree(x3, z3, .8)) lamp(x3, z3, a3 + Math.PI); }
        var rB = C.b1 + 1, cnt2 = Math.floor(Math.PI * 2 * rB / 20); for (k = 0; k < cnt2; k++) { var a4 = k / cnt2 * Math.PI * 2, x4 = Math.sin(a4) * rB, z4 = Math.cos(a4) * rB; if (!onRoad(x4, z4) && streetFree(x4, z4, .8)) lamp(x4, z4, a4 + Math.PI); }
        C.gaps.forEach(function (g) { for (var r = C.ao + 8.5; r < C.b1; r += 9) { if (r > C.a0 - 2 && r < C.a1 + 2) continue; [-5.2, 5.2].forEach(function (off) { var x = Math.sin(g.a) * r + Math.cos(g.a) * off, z = Math.cos(g.a) * r - Math.sin(g.a) * off; if (!onRoad(x, z) && streetFree(x, z, .8)) lamp(x, z, g.a + (off > 0 ? -Math.PI / 2 : Math.PI / 2)); }); } });
        stampDone(lp);
      }
      if (bn) {
        var bsc = sizeOf(bn, 1); bsc = bn.size.x > 4.5 || bn.size.x < .7 ? 1.8 / bn.size.x : 1;
        function bench(x, z, ry) { var so = [x, z, .9 * bsc, .35 * bsc, ry]; so.keep = 1; SOLIDS.push(so); stampProp(bn, x, z, ry, bsc); out.benches++; }
        for (var b = 0; b < 6; b++) { var a5 = b * Math.PI / 3 + Math.PI / 6, x5 = C.sq.x + Math.sin(a5) * (C.sq.r - 1.6), z5 = C.sq.z + Math.cos(a5) * (C.sq.r - 1.6); if (streetFree(x5, z5, 1.2)) bench(x5, z5, a5 + Math.PI); }
        for (var b2 = 0; b2 < 40 && out.benches < 18; b2++) { var a6 = rnd2() * Math.PI * 2, r6 = C.a1 + 3 + rnd2() * (C.b0 - C.a1 - 6), x6 = Math.sin(a6) * r6, z6 = Math.cos(a6) * r6; if (inPark(x6, z6) && free(x6, z6, 1.6)) bench(x6, z6, rnd2() * 6.28); }
        stampDone(bn);
      }
      router = null; modelInfo.props = { state: 'shown', trees: out.trees, lamps: out.lamps, benches: out.benches };
    }
    // ---- the players' desks on Isocore Gaming's stage and the sim rigs on GridSync's, stood on the stage floor
    function stageKit() {
      var done2 = {};
      [['iso', 'desk', 2, 6, 1.45, [.05], 1.3], ['gs', 'simrig', 1, 8, 1.85, [.2, -.12], 1.6]].forEach(function (cfg) {
        var root = stageRoots[cfg[0]], st = stamper(cfg[1]); if (!root || !st) return;
        root.updateMatrixWorld(true);
        // a stage's own team tables make way for the real player stations
        root.traverse(function (o) { if (o.isMesh && /team[_ ]?booths?|tables?/i.test(o.name || '') && cfg[1] === 'desk') { o.visible = false; o.userData.gone = true; } });
        var meshes = []; root.traverse(function (o) { if (o.isMesh && o.visible) meshes.push(o); });
        var bb = new T.Box3().setFromObject(root), th2 = root.rotation.y, W = 0, Dp = 0, inf = modelInfo[cfg[0] === 'iso' ? 'stage-isocore' : 'stage-gridsync'] || {};
        W = inf.size ? inf.size[0] : 20; Dp = inf.size ? inf.size[1] : 10;
        var cx = inf.at ? inf.at[0] : (bb.min.x + bb.max.x) / 2, cz = inf.at ? inf.at[1] : (bb.min.z + bb.max.z) / 2;
        var sc = st.size.x > cfg[6] * 2.5 || st.size.x < cfg[6] / 2.5 ? cfg[6] / st.size.x : 1, rc = new T.Raycaster(), n = 0;
        cfg[5].forEach(function (rowZ) {
          for (var b = 0; b < cfg[2]; b++) for (var i = 0; i < cfg[3]; i++) {
            var lx = (cfg[2] === 2 ? (b ? 1 : -1) * W / 4 : 0) + (i - (cfg[3] - 1) / 2) * cfg[4], lz = rowZ * Dp;
            var x = cx + lx * Math.cos(th2) + lz * Math.sin(th2), z = cz - lx * Math.sin(th2) + lz * Math.cos(th2);
            rc.set(new T.Vector3(x, bb.max.y + 1, z), new T.Vector3(0, -1, 0));
            var hits = rc.intersectObjects(meshes, false).filter(function (h) { return h.point.y < 3.2; }), y = hits.length ? hits[0].point.y : 0;
            stampProp(st, x, z, th2, sc, y); n++;
          }
        });
        stampDone(st); done2[cfg[1]] = n;
      });
      if (Object.keys(done2).length) modelInfo.stageKit = { state: 'shown', desks: done2.desk || 0, rigs: done2.simrig || 0 };
    }
    // ---- Ghost and Echo go anywhere: the village, the parks, the AI town, the stalls, both stages and the arena floor
    function cityHaunts() {
      var C = CITY, extra = [[0, 4, 'on the arena floor'], [0, -4, 'under the jumbotron'], [C.sq.x + Math.sin(C.gW) * 5, C.sq.z + Math.cos(C.gW) * 5, 'in the village square']];
      PARKS.forEach(function (p, i) { var a = (p[0] + p[1]) / 2, r = (C.a1 + C.b0) / 2; extra.push([Math.sin(a) * r, Math.cos(a) * r, i ? 'in the south park' : 'in the north park']); });
      [[C.gE, 'on the east avenue'], [C.gW, 'on the west avenue']].forEach(function (e) { var r = C.a0 - 3; extra.push([Math.sin(e[0]) * r, Math.cos(e[0]) * r, e[1]]); });
      [[Math.PI * 1.25, 'in the village'], [Math.PI * 1.75, 'in the village'], [Math.PI * 1.5, 'in the village']].forEach(function (e) { var r = (C.b0 + C.b1) / 2; extra.push([Math.sin(e[0]) * r, Math.cos(e[0]) * r, e[1]]); });
      ['ghost', 'echo'].forEach(function (w) { extra.forEach(function (e) { var pt = [e[0], e[1]]; for (var st2 = 0; st2 < 30 && blocked().some(function (o) { return inside(o, pt[0], pt[1], .6); }); st2++) { pt[0] += .7; } (HAUNTS[w] = HAUNTS[w] || []).push([pt[0], pt[1], e[2]]); }); });
    }
    // ---- Visitors start in a seat in the stands, looking down at the Isocore Gaming stage; any move stands them up on the floor.
    // standing on the stage: the floor under you is the stage's top, so you walk up its steps and along it
    var stY = 0, stAt = '', downRay = null;
    // While one of them is streaming (their side is live on Twitch, or the host is broadcasting from their seat), they go and stand
    // at their own rig on the stage and stay there until it ends (README-ADMIN 260).
    var AIR_AT = { ghost: [-17.4, 2.1], echo: [17.4, 2.1] };
    // V0.6.5: the broadcast studio has permanent seats, whether or not Twitch is live.
    // The rig camera and avatar must share the SAME chair anchor, not separate stage positions.
    // only bring a character back into view if it was hidden because you were sitting in its seat
    var suiteHid = { ghost: false, echo: false };
    function onAir(w) {
      if (!SEALED) return null;
      var seat = SUITES[w] && SUITES[w].seat;
      if (seat) return [seat[0], seat[2]]; // both broadcast characters occupy their chairs all session
      var live = inSuite === w || !!sideStream(w);
      return live ? AIR_AT[w] : null;
    }
    // the height of the stage (or the floor) under a spot, so they float above the dais rather than through it
    var floorRay = null, floorMemo = {};
    function floorAt(x, z) {
      if (!stageMeshes.length) return 0; var k = Math.round(x * 2) + ',' + Math.round(z * 2); if (floorMemo[k] !== undefined) return floorMemo[k];
      floorRay = floorRay || new T.Raycaster(); floorRay.set(new T.Vector3(x, 8, z), new T.Vector3(0, -1, 0));
      var h = floorRay.intersectObjects(stageMeshes, false).filter(function (q) { return q.point.y < 3; }); return (floorMemo[k] = h.length ? h[0].point.y : 0);
    }
    function standY() {
      if (!stageMeshes.length || seatY) return 0; var k = player.x.toFixed(2) + ',' + player.z.toFixed(2); if (k === stAt) return stY; stAt = k;
      downRay = downRay || new T.Raycaster(); downRay.set(new T.Vector3(player.x, 8, player.z), new T.Vector3(0, -1, 0));
      var h = downRay.intersectObjects(stageMeshes, false).filter(function (q) { return q.point.y < 3; }); var want = h.length ? h[0].point.y : 0;
      stY = stY + (want - stY) * .5; if (Math.abs(want - stY) < .02) stY = want; return stY;
    }
    // the logos, on the spots the arena keeps for them: Ghost's on the west, Echo's on the east, glowing, never stretched
    function hangLogos(root) {
      var files = { West: ISOCORE_ASSET_BASE + 'assets/ghost-logo.webp', East: ISOCORE_ASSET_BASE + 'assets/echo-logo.webp' }, ld = new T.TextureLoader();
      root.traverse(function (o) {
        var m = /^(Logo|Logo_Floor|Banner)_(West|East)$/.exec(o.name || ''); if (!o.isMesh || !m) return;
        var g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv; if (!uv) return;
        if (m[1] === 'Logo') {
          // the big wall logos sit a quarter turn round from the big screens (which already show the same logo): Ghost's on the north
          // wall, Echo's on the south, so the two are not stacked one above the other
          o.updateMatrixWorld(true); var Rq = new T.Matrix4().makeRotationY(-Math.PI / 2), Mw = Rq.multiply(o.matrixWorld.clone());
          var Pi = o.parent ? new T.Matrix4().copy(o.parent.matrixWorld).invert() : new T.Matrix4(); Mw.premultiply(Pi);
          Mw.decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true);
        }
        var i0 = 0, iu = 0, iv = 0, best0 = 9, bu = -9, bv = -9;
        for (var i = 0; i < uv.count; i++) { var u = uv.getX(i), v = uv.getY(i); if (u + v < best0) { best0 = u + v; i0 = i; } if (u - v > bu) { bu = u - v; iu = i; } if (v - u > bv) { bv = v - u; iv = i; } }
        o.updateMatrixWorld(true); var P = function (i) { return new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); };
        var W = P(i0).distanceTo(P(iu)) || 1, H = P(i0).distanceTo(P(iv)) || 1;
        ld.load(files[m[2]], function (tx) {
          tx.colorSpace = T.SRGBColorSpace; tx.flipY = false; tx.anisotropy = 8; tx.wrapS = tx.wrapT = T.ClampToEdgeWrapping;
          var ia = tx.image.width / tx.image.height, pa = W / H;
          if (pa > ia) { tx.repeat.set(pa / ia, 1); tx.offset.set(-(pa / ia - 1) / 2, 0); } else { tx.repeat.set(1, ia / pa); tx.offset.set(0, -(ia / pa - 1) / 2); }
          o.material = new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide, color: m[1] === 'Logo_Floor' ? 0xbbbbbb : 0xffffff });
          o.renderOrder = 2; o.userData.logo = m[2]; still();
        });
      });
    }
    // A seat counts only if it is a real seat (README-ADMIN 272): a level surface in the stands with open air above it, a clear line of
    // sight from eye height to the stage, and at least 1.3 m from anyone else's seat. Otherwise it could be the top of a wall, a gap
    // between stand sections or an entrance tunnel, facing a wall.
    function seatOk(x, z, y, meshes, rc) {
      var eye = new T.Vector3(x, y + 1.2, z), up = new T.Vector3(0, 1, 0);
      rc.set(new T.Vector3(x, y + .15, z), up); rc.far = 3.2; if (rc.intersectObjects(meshes, false).length) { rc.far = Infinity; return false; }       // a roof or a tunnel over it
      var tgt = new T.Vector3(0, 1.6, 0), dir = tgt.clone().sub(eye), dist = dir.length(); dir.normalize();
      rc.set(eye, dir); rc.far = dist - 2; var blk = rc.intersectObjects(meshes, false); rc.far = Infinity; if (blk.length) return false;            // something between the seat and the stage
      // the whole view, not just its centre: a fan of looks across a phone's width (about 70 degrees each way) and up and down. A wall or
      // a stand divider close to the seat in any of them rules it out (the seats in front are lower than the eye, so they do not count)
      var base = Math.atan2(dir.x, dir.z);
      for (var ya = -70; ya <= 70; ya += 14) {
        for (var pa = -18; pa <= 24; pa += 14) {
          var yy = base + ya * Math.PI / 180, pp = pa * Math.PI / 180, d2 = new T.Vector3(Math.sin(yy) * Math.cos(pp), Math.sin(pp), Math.cos(yy) * Math.cos(pp));
          rc.set(eye, d2); rc.far = Math.abs(ya) > 45 ? 2.2 : 7; var h2 = rc.intersectObjects(meshes, false); rc.far = Infinity;
          if (h2.length) return false;
        }
      }
      var others = (((world.extra || {}).arena || {}).seats || []);
      for (var k = 0; k < others.length; k++) if (Math.hypot(others[k][0] - x, others[k][1] - z) < 1.3) return false;
      return true;
    }
    // 50 seats along the east and west stands, [x, z, seat height], each one checked by eye for a clear view of the stage (README-ADMIN 272)
    var SEAT_LIST = [[-31.77,-22.4,8.83],[25.69,-22.24,2.69],[-26.2,-21.01,2.53],[27.62,-23.4,5.23],[-30.31,-17.26,3.59],[26.39,-26.32,7.03],[31.34,-13.27,2.55],[27.54,18.99,2.35],[30.16,21.5,6.29],[-29.98,15.38,2.53],[24.77,-24.42,3.59],[26.36,21.84,3.43],[-32.16,-9.49,2.53],[33.67,14.27,6.15],[30.02,14.98,2.53],[-32.89,-14.87,5.39],[-27.42,26.22,7.03],[-31.46,18.78,6.13],[-32.76,6.35,1.79],[29.88,-22.5,7.03],[-35.01,-17.95,8.83],[-32.49,21.39,8.83],[-34.34,19.47,8.83],[-28.8,17.88,2.53],[-28.47,21.44,4.49],[-32.65,13.82,4.36],[-28.56,-21.32,4.33],[-33.7,2.93,2.53],[-24.37,23.83,2.53],[33.03,20.77,8.99],[-35.97,-15.41,8.85],[25.14,25.8,5.39],[28.96,25.29,8.09],[23.86,23.42,2.35],[-32.82,-6.77,2.53],[-32.67,-18.38,7.03],[32.1,-21.37,7.93],[29.14,-17.45,2.69],[27.55,-19.65,2.69],[30.2,-25.16,8.83],[-26.1,-23.79,4.49],[33.08,5.2,2.53],[-28.19,-18.82,2.53],[34.09,-16.17,7.19],[-29.97,23.79,8.09],[-35.35,17.16,8.99],[-28.62,-27.67,9.89],[31.33,24.29,9.73],[31.7,-18.15,6.13],[33.39,-3.82,2.53]];
    var SEATS_FIXED = null, FLOOR_SPOT = [0, 15.5];      // where visitors stand when every seat is taken: the floor in front of the stage, behind the jib
    function sitDown() {
      if (!arenaRoot || !CITY) return;
      var fixed = SEATS_FIXED || SEAT_LIST;
      if (fixed && fixed.length) {      // the hand-checked seats (README-ADMIN 272): a free one at random
        var others = (((world.extra || {}).arena || {}).seats || []), free = fixed.filter(function (p) { return !others.some(function (o) { return Math.hypot(o[0] - p[0], o[1] - p[1]) < 1.3; }); });
        // every seat taken: stand on the arena floor in front of the stage instead, at a fixed spot (spread a little so people do not stand inside each other)
        var pk = free.length ? free[Math.floor(Math.random() * free.length)] : [FLOOR_SPOT[0] + (Math.random() - .5) * 6, FLOOR_SPOT[1] + Math.random() * 3, 0], px = pk[0], pz = pk[1];
        seatY = free.length ? Math.max(0, pk[2] - .4) : 0; modelInfo.standing = !free.length; seatAt = [px, pz, Math.atan2(px, pz)]; player.x = px; player.z = pz;
        pyaw = Math.atan2(-px, pz); ppitch = -Math.atan2(seatY + 1.2, Math.hypot(px, pz)) * .45;
        seatHome = { x: px, z: pz, y: seatY, at: seatAt.slice(), yaw: pyaw, pitch: ppitch }; seated(true); modelInfo.seatTries = 'fixed';
        say(STICKS ? 'Swipe to look around' : 'Drag to look around'); setTimeout(function () { if (seatY) say(''); }, 5000); still(); return;
      } var meshes = []; arenaRoot.traverse(function (o) { if (o.isMesh) meshes.push(o); });
      var rc = new T.Raycaster(), found = null, a, r, x, z, h;
      // the side stands first, spread along them; then the old fixed spots, which are known to be good
      for (var tr = 0; tr < 80 && !found; tr++) {
        if (tr < 60) { a = (Math.random() < .5 ? Math.PI / 2 : 3 * Math.PI / 2) + (Math.random() - .5) * 1.5; r = ARENA_FLOOR + (CITY.ao - ARENA_FLOOR) * (.1 + Math.random() * .3); }
        else { a = [Math.PI / 2 + .55, 3 * Math.PI / 2 - .55, Math.PI / 2 + .75, 3 * Math.PI / 2 - .75][tr % 4]; r = ARENA_FLOOR + (CITY.ao - ARENA_FLOOR) * (.15 + Math.random() * .2); }
        x = Math.sin(a) * r; z = Math.cos(a) * r;
        rc.set(new T.Vector3(x, 60, z), new T.Vector3(0, -1, 0)); h = rc.intersectObjects(meshes, false).filter(function (q) { return q.point.y < 12 && q.point.y > .6 && q.face && q.face.normal && Math.abs(q.face.normal.y) > .85; });
        if (h.length && (tr >= 76 || seatOk(x, z, h[0].point.y, meshes, rc))) found = [x, z, a, h[0].point.y];
      }
      modelInfo.seatTries = tr;
      if (!found) return; x = found[0]; z = found[1]; seatY = Math.max(0, found[3] - .4); seatAt = [x, z, found[2]];
      player.x = x; player.z = z; var tx = 0, tz = 0; pyaw = Math.atan2(tx - x, -(tz - z)); ppitch = -Math.atan2(seatY + 1.2, Math.hypot(tx - x, tz - z)) * .45;
      seatHome = { x: x, z: z, y: seatY, at: seatAt.slice(), yaw: pyaw, pitch: ppitch }; seated(true);
      say(STICKS ? 'Swipe to look around' : 'Drag to look around'); setTimeout(function () { if (seatY) say(''); }, 5000); still();
    }
    // A visitor in their seat just watches: swipe to look round, no sticks. "Walk around" in Options stands them up.
    function seated(on) { seatLock = on; stage.classList.toggle('igw-seated', on); if (walkBtn) walkBtn.textContent = on ? 'Walk around' : 'Back to my seat'; }
    function standUp() { if (!seatAt) { seatY = 0; return; } var a = seatAt[2], r = ARENA_FLOOR - 1.6; player.x = Math.sin(a) * r; player.z = Math.cos(a) * r; seatY = 0; seatAt = null; }
    // ---- The two broadcast suites (README-ADMIN 254): Ghost's FPS station on the west dais, Echo's sim rig on the east dais. Each has
    //      its own screens: that side's live stream when it is live, its own logo when it is not. The host can sit in either one
    //      (Options > Broadcast): first person, walking locked, looking free.
    var SUITES = {}, suiteImg = {};
    function suiteTop(x, z) { if (!stageMeshes.length) return 1.65; var rc = new T.Raycaster(); rc.set(new T.Vector3(x, 10, z), new T.Vector3(0, -1, 0)); var h = rc.intersectObjects(stageMeshes, false).filter(function (q) { return q.point.y < 3; }); return h.length ? h[0].point.y : 1.65; }
    // ---- Ghost and Echo themselves (README-ADMIN 260): ChatGPT's hooded characters take the place of the old steel cores. Each one
    //      hangs in the core's own group, so it moves, turns and floats exactly as the core did, and plays its Idle animation.
    function fitCharacters() {
      var done = {};
      [['ghost', spirit, typeof figure !== 'undefined' ? figure : null], ['echo', echoSpirit, typeof echoFigure !== 'undefined' ? echoFigure : null]].forEach(function (c) {
        var src = kinds[c[0]], grp = c[1]; if (!src || !grp || grp.userData.character) return;
        var ch = src.clone(true); ch.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(ch), sz = bb.getSize(new T.Vector3()), mid = bb.getCenter(new T.Vector3());
        var sc = 2.2 / Math.max(.1, sz.y); ch.scale.multiplyScalar(sc); ch.position.set(-mid.x * sc, .25 - bb.min.y * sc, -mid.z * sc);
        var glowFix = {}; ch.traverse(function (o) { if (!o.isMesh) return; o.userData.keep = true; var m = o.material; if (m && m.emissiveIntensity > 1.5) { if (!glowFix[m.uuid]) { glowFix[m.uuid] = m.clone(); glowFix[m.uuid].emissiveIntensity = 1.45; } o.material = glowFix[m.uuid]; } });      // Echo's glow came 3x brighter than Ghost's and bloomed into a blob: both at Ghost's level
        if (c[2]) c[2].visible = false; var sp = grp.getObjectByName('core-spinner'); if (sp) sp.visible = false;
        grp.children.forEach(function (k) { if (k.isPointLight) { k.visible = false; k.intensity = 0; } });     // the characters glow by themselves: the old core's light goes
        grp.add(ch); grp.userData.character = ch;
        var clips = src.userData.anims || []; if (clips.length) { var mx = new T.AnimationMixer(ch); clips.forEach(function (cl) { mx.clipAction(cl).play(); }); mixers.push(mx); }
        done[c[0]] = true;
      });
      // they start the night on the stage, each by their own rig
      try { if (done.ghost && SUITES) { currentPos.set(-14.5, 0, 2.2); spirit.position.set(-14.5, .13, 2.2); } if (done.echo) { echoPos.set(14.5, 0, 2.2); echoSpirit.position.set(14.5, .13, 2.2); } } catch (e) {}
      modelInfo.chars = { state: 'shown', ghost: !!done.ghost, echo: !!done.echo, at: function () { return [spirit.position.x, spirit.position.z, echoSpirit.position.x, echoSpirit.position.z]; } };
    }
    // Ghost's station came with two monitors (main and right). A third on the left, for LIVE NOW, is the right-hand one mirrored:
    // every triangle of its frame and stand, and its screen (README-ADMIN 263).
    function mirrorMonitor(root) {
      var BOX = { x0: .312, x1: .96, y0: .78, y1: 1.46, z0: -.82, z1: -.42 }, made = 0, adds = [];
      root.traverse(function (o) {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        var g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index, isScr = /^Screen_Side$/i.test(o.name || '');
        if (/^Screen/i.test(o.name || '') && !isScr) return;
        var tri = [], n3 = idx ? idx.count : pos.count, inBox = function (i) { var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); return x >= BOX.x0 && x <= BOX.x1 && y >= BOX.y0 && y <= BOX.y1 && z >= BOX.z0 && z <= BOX.z1; };
        for (var t = 0; t < n3; t += 3) { var a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c2 = idx ? idx.getX(t + 2) : t + 2; if (isScr || (inBox(a) && inBox(b) && inBox(c2))) tri.push(a, c2, b); }      // a, c, b: mirroring turns the faces inside out, so the order flips back
        if (!tri.length) return;
        var P = new Float32Array(tri.length * 3), N = nor ? new Float32Array(tri.length * 3) : null, U = uv ? new Float32Array(tri.length * 2) : null;
        tri.forEach(function (vi, k) { P[k * 3] = -pos.getX(vi); P[k * 3 + 1] = pos.getY(vi); P[k * 3 + 2] = pos.getZ(vi); if (N) { N[k * 3] = -nor.getX(vi); N[k * 3 + 1] = nor.getY(vi); N[k * 3 + 2] = nor.getZ(vi); } if (U) { U[k * 2] = isScr ? 1 - uv.getX(vi) : uv.getX(vi); U[k * 2 + 1] = uv.getY(vi); } });
        var ng = new T.BufferGeometry(); ng.setAttribute('position', new T.BufferAttribute(P, 3)); if (N) ng.setAttribute('normal', new T.BufferAttribute(N, 3)); else ng.computeVertexNormals(); if (U) ng.setAttribute('uv', new T.BufferAttribute(U, 2));
        var nm = new T.Mesh(ng, o.material); nm.name = isScr ? 'Screen_L' : (o.name || '') + '_MirrorL'; nm.position.copy(o.position); nm.quaternion.copy(o.quaternion); nm.scale.copy(o.scale);
        adds.push([o.parent, nm]); made++;
      });
      adds.forEach(function (a) { a[0].add(a[1]); });
      modelInfo.mirror = made;
    }
    // ---- Broadcast cameras (README-ADMIN 265): a tripod camera in front of each rig and a jib at the front of the stage, all
    //      pointing at the stage. Scenery only: they sit on the floor and are solid to walk round.
    function placeCameras() {
      var made = 0, put = function (kind, x, z, lookX, lookZ, h) {
        var src = kinds[kind]; if (!src) return; var t = src.clone(true); t.updateMatrixWorld(true);
        var bb = new T.Box3().setFromObject(t), mid = bb.getCenter(new T.Vector3()), sc = h ? h / Math.max(.1, bb.max.y - bb.min.y) : 1, g = new T.Group();
        t.position.set(-mid.x * sc, -bb.min.y * sc, -mid.z * sc); t.scale.multiplyScalar(sc); g.add(t);
        g.position.set(x, floorAt(x, z), z); g.rotation.y = Math.atan2(lookX - x, lookZ - z); addModel(g); var so = [x, z, .7]; so.keep = 1; SOLIDS.push(so); made++;
      };
      put('camera-tripod', -13.5, 5.2, -18.5, 0);
      put('camera-tripod', 13.5, 5.2, 18.5, 0);
      put('camera-jib', 0, 9.5, 0, 0);
      modelInfo.cams = { state: 'shown', made: made };
    }
    // ---- The viewers (README-ADMIN 265): everyone with the arena open is a spectator in the stands, in the seat they are sitting in,
    //      in one of four outfits. While a stream is live some of them cheer. Your own seat is left empty (you are in it).
    var viewerGrp = null, viewerKey = '';
    function renderViewers() {
      if (!SEALED || !kinds.audience) return;
      var me = seatHome ? [seatHome.x, seatHome.z] : [player.x, player.z], ar = (world.extra || {}).arena || {}, seats = (ar.seats || []).filter(function (p) { return Math.hypot(p[0] - me[0], p[1] - me[1]) > 1.5 && !(boothFigs.length && nearDesk(p[0], p[1]) >= 0); }), live = !!(liveStream() || inSuite);
      var key = JSON.stringify(seats) + live; if (key === viewerKey) return; viewerKey = key;
      if (!viewerGrp) { viewerGrp = new T.Group(); viewerGrp.userData.keep = true; scene.add(viewerGrp); }
      while (viewerGrp.children.length) viewerGrp.remove(viewerGrp.children[0]);
      var outfits = ['audience', 'audience-blue', 'audience-olive', 'audience-rust'];
      seats.forEach(function (p, i) {
        var k = live && kinds['audience-cheering'] && (p[3] === 0 || i % 3 === 0) ? 'audience-cheering' : (kinds[outfits[p[3] || 0]] ? outfits[p[3] || 0] : 'audience'), src = kinds[k]; if (!src) return;
        var t = src.clone(true); t.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(t), mid = bb.getCenter(new T.Vector3()), g = new T.Group();
        t.position.set(-mid.x, -bb.min.y, -mid.z); g.add(t); g.position.set(p[0], p[2], p[1]); g.rotation.y = Math.atan2(-p[0], -p[1]); viewerGrp.add(g);
      });
      modelInfo.viewers = viewerGrp.children.length; still();
    }
    // ---- The mod booths (README-ADMIN 273): one high in the north stand under Ghost's logo, one in the south stand under Echo's.
    //      The booth on the side being streamed is the live one (Ghost's when nobody is live). Each booth has two desks with a PC:
    //      the main screen shows the live stream, the side screen the Twitch chat. A mod always sits at the first desk; a big MODS
    //      sign hangs over the live booth. People with the Mod rank (and Admins) spawn at a free desk (three, one per mod); the Owner can go up from
    //      Options. Nobody else can reach the booths: they are 10 m up in the stands, with no way up from the floor.
    // README-ADMIN 289: only the Echo end has a real booth room (the Ghost end has the stands running just over head), so the mods' desks are
    // always in that room; its screens show whichever of Ghost or Echo is live
    var BOOTHS = { ghost: { z: 39.2, y: 10.23, ry: 0, yaw: 0, sign: [0, 13.0, 37.55, Math.PI] }, echo: { z: 39.2, y: 10.23, ry: 0, yaw: 0, sign: [0, 13.0, 37.55, Math.PI] } };
    // three desks, one per mod (README-ADMIN 279); each has a mod figure that is always there, and a mod who logs in takes a free desk
    var DESKS = [-4.3, 0, 4.3];
    var boothScr = [], boothFigs = [], boothFig = null, boothSign = null, boothSide = '', inBooth = false, myDesk = -1;
    function liveBooth() { if (inSuite) return inSuite; var oa = (world.extra || {}).onair; if (oa === 'ghost' || oa === 'echo') return oa; return sideStream('ghost') ? 'ghost' : sideStream('echo') ? 'echo' : 'ghost'; }
    function boothSeat(side, desk) { var b = BOOTHS[side], dz = b.z < 0 ? -1 : 1, x = DESKS[desk] || 0; return { x: x, z: b.z + dz * .55, eye: b.y + 1.2, yaw: b.yaw, floor: b.y }; }
    function placeBooths() {
      if (!SEALED || !kinds.station) return;
      Object.keys(BOOTHS).forEach(function (side) {
        if (side === 'ghost') return;               // the same room as Echo's (README-ADMIN 289)
        var b = BOOTHS[side];
        DESKS.forEach(function (x, desk) {
          var root = kinds.station.clone(true); root.position.set(x, b.y, b.z); root.rotation.set(0, b.ry, 0); root.updateMatrixWorld(true);
          var list = []; root.traverse(function (o) { if (o.isMesh && /^Screen/i.test(o.name || '')) list.push(o); });
          list.forEach(function (o) {
            var role = /_(Main|C)$/i.test(o.name || '') || list.length === 1 ? 'stream' : 'chat', cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
            var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; tx.flipY = false; o.material = new T.MeshBasicMaterial({ map: tx, toneMapped: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
            try {     // the screen face sits a hair inside the monitor's bezel: lift the booth copy 2 cm out along its own facing so it shows
              var g0 = o.geometry.clone(), pa = g0.attributes.position, ix = g0.index, A0 = new T.Vector3().fromBufferAttribute(pa, ix ? ix.getX(0) : 0), B0 = new T.Vector3().fromBufferAttribute(pa, ix ? ix.getX(1) : 1), C0 = new T.Vector3().fromBufferAttribute(pa, ix ? ix.getX(2) : 2), nl = B0.sub(A0).cross(C0.sub(A0)).normalize();
              g0.translate(nl.x * .02, nl.y * .02, nl.z * .02); o.geometry = g0;
            } catch (e) {}
            boothScr.push({ side: side, desk: desk, role: role, cv: cv, tx: tx, mesh: o });
          });
          addModel(root);
        });
      });
      // the mod who is always there, at the first desk (a spectator figure until a mod character model exists)
      var fk = kinds['audience-blue'] || kinds.audience;
      if (fk) DESKS.forEach(function () { var t = fk.clone(true); t.updateMatrixWorld(true); var bb = new T.Box3().setFromObject(t), mid = bb.getCenter(new T.Vector3()), f = new T.Group(); t.position.set(-mid.x, -bb.min.y, -mid.z); f.add(t); f.userData.keep = true; scene.add(f); boothFigs.push(f); });
      boothFig = boothFigs[0] || null;
      // the MODS sign
      var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; var g = cv.getContext('2d');
      g.fillStyle = 'rgba(3,9,20,.85)'; g.fillRect(0, 0, 1024, 256); g.strokeStyle = '#4fa8ff'; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 236);
      g.shadowColor = '#4fa8ff'; g.shadowBlur = 30; g.fillStyle = '#d6ecff'; g.font = 'bold 150px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MODS', 512, 136);
      var stx = new T.CanvasTexture(cv); stx.colorSpace = T.SRGBColorSpace;
      // README-ADMIN 295: the MODS sign model (metal frame, cyan neon) with the lettering drawn on its blank face; the flat drawn sign is the fallback
      if (kinds['mods-sign']) {
        var fc = document.createElement('canvas'); fc.width = 1024; fc.height = 256; var fg = fc.getContext('2d');
        var gr = fg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#071425'); gr.addColorStop(1, '#030912'); fg.fillStyle = gr; fg.fillRect(0, 0, 1024, 256);
        fg.textAlign = 'center'; fg.textBaseline = 'middle'; fg.shadowColor = '#00d4ff'; fg.shadowBlur = 34; fg.fillStyle = '#eaf8ff'; fg.font = 'bold 132px Arial, sans-serif'; fg.fillText('MODS', 512, 112);
        fg.shadowBlur = 10; fg.fillStyle = '#7fdcff'; fg.font = 'bold 30px Arial, sans-serif'; fg.fillText('L I V E   M O D E R A T I O N', 512, 206);
        var ftx = new T.CanvasTexture(fc); ftx.colorSpace = T.SRGBColorSpace; ftx.flipY = false; ftx.anisotropy = 4;
        boothSign = kinds['mods-sign'].clone(true); boothSign.traverse(function (o) { if (o.isMesh && /Sign_Face/i.test(o.name || '')) o.material = new T.MeshBasicMaterial({ map: ftx, toneMapped: false }); });
        boothSign.userData.keep = true; scene.add(boothSign);
      } else { boothSign = new T.Mesh(new T.PlaneGeometry(9, 2.25), new T.MeshBasicMaterial({ map: stx, toneMapped: false, transparent: true })); boothSign.userData.keep = true; scene.add(boothSign); }
      boothMove(); drawBooths(); setInterval(function () { boothMove(); drawBooths(); }, 4000);
      modelInfo.booth = { state: 'shown', screens: boothScr.length, fig: !!boothFig, desks: DESKS.length, figs: boothFigs.length };
    }
    function boothMove() {
      var side = liveBooth(); figsShow(); if (side === boothSide) return; boothSide = side; var b = BOOTHS[side];
      boothFigs.forEach(function (f, d) { var st = boothSeat(side, d); f.position.set(st.x, b.y + .05, st.z); f.rotation.y = b.yaw === 0 ? Math.PI : 0; });
      if (boothSign) { boothSign.position.set(b.sign[0], b.sign[1], b.sign[2]); boothSign.rotation.set(0, b.sign[3], 0); }
      if (inBooth) enterBooth(true);
      still(); wake();
    }
    // the arena's tinted glass runs through the booth: while a mod (or the Owner) sits at a desk it is hidden, so the desk and its screens are clear
    var boothGlass = null;
    function glassShow(on) { if (!boothGlass) { boothGlass = []; scene.traverse(function (o) { if (o.isMesh && o.name === 'Window') boothGlass.push(o); }); } boothGlass.forEach(function (o) { o.visible = on; }); }
    function figsShow() { boothFigs.forEach(function (f, d) { f.visible = !(inBooth && d === myDesk); }); }
    function nearDesk(x, z) { var side = boothSide || liveBooth(); for (var d = 0; d < DESKS.length; d++) { var st = boothSeat(side, d); if (Math.hypot(x - st.x, z - st.z) < 1.2) return d; } return -1; }
    function freeDesk(side) { var taken = {}, ar = (world.extra || {}).arena || {}; (ar.seats || []).forEach(function (p) { if (inBooth && myDesk >= 0 && seatHome && Math.hypot(p[0] - seatHome.x, p[1] - seatHome.z) < .5) return; var d = nearDesk(p[0], p[1]); if (d >= 0) taken[d] = 1; }); var pref = [1, 2, 0]; for (var i = 0; i < pref.length; i++) if (!taken[pref[i]]) return pref[i]; return 1; }
    function drawBooths() {
      boothScr.forEach(function (sc) {
        var g = sc.cv.getContext('2d'), W = sc.cv.width, H = sc.cv.height, live = true, sm = sideStream(liveBooth()), col = liveBooth() === 'ghost' ? '#4fc8f5' : '#ff9a4d';
        g.fillStyle = '#04080e'; g.fillRect(0, 0, W, H); g.textAlign = 'center';
        if (sc.role === 'chat') { drawChat(g, W, H, col, live && !!sm); }
        else { var im = live && sm ? thumbOf(sm, drawBooths) : null; if (im) { try { g.drawImage(im, 0, 0, W, H); } catch (e) {} } else { suiteLogo(sc.side, g, W / 2, 20, W * .6, H * .6); g.fillStyle = col; g.font = 'bold 24px Arial, sans-serif'; g.fillText(live ? (sm ? 'LIVE' : 'STANDING BY') : 'BOOTH CLOSED', W / 2, H - 22); } }
        sc.tx.needsUpdate = true;
      });
    }
    // Into the booth: a mod at the second desk, in first person, looking out over the PC at the stage; swipe to look round
    function enterBooth(quiet) {
      if (!boothScr.length) return; if (inSuite) leaveSuite();
      if (!quiet || myDesk < 0) myDesk = freeDesk(liveBooth()); var st = boothSeat(liveBooth(), myDesk); boothSide = boothSide || liveBooth();
      inBooth = true; player.x = st.x; player.z = st.z; seatY = st.eye - EYE; seatAt = null;
      pyaw = st.yaw; ppitch = -.22; seatHome = { x: st.x, z: st.z, y: seatY, at: null, yaw: pyaw, pitch: ppitch }; seated(true); stage.classList.add('igw-in-booth'); figsShow(); glassShow(false);
      if (!quiet) { say('You are in the mod booth: the PC shows the stream and the chat'); setTimeout(function () { say(''); }, 5000); }
      still(); wake();
    }
    function leaveBooth() { inBooth = false; myDesk = -1; figsShow(); glassShow(true); stage.classList.remove('igw-in-booth'); seated(false); seatY = 0; seatHome = null; player.x = START.x; player.z = START.z; pyaw = START.yaw; ppitch = START.pitch; still(); wake(); }
    // BROADCAST V0.6.4 — studio key + fill lights local to Ghost and Echo's rigs.
    // Previously the white spots were ~20m above the rigs at intensity 2.4:
    // with inverse-square falloff they added almost no usable light.
    // Place these shadow-free, neutral-white lights close to the rigs instead,
    // leaving the original cyan/orange show lighting and arena ambience intact.
    var isocoreWhiteSpotsReady = false;
    function addIsocoreWhiteSpots() {
      if (isocoreWhiteSpotsReady) return;
      isocoreWhiteSpotsReady = true;
      [
        [-17.3, 8.3, 5.0, -17.2, 1.85, 0, 95],
        [ 17.3, 8.3, 5.0,  17.2, 1.85, 0, 95],
        [  0.0, 12.0, 5.0,  0.0, 1.85, 0, 24]
      ].forEach(function (p, i) {
        var light = new T.SpotLight(0xf5faff, p[6], 24, i === 2 ? 0.66 : 0.74, 0.75, 2);
        light.name = 'Isocore Broadcast Studio Key ' + (i + 1);
        light.position.set(p[0], p[1], p[2]);
        light.target.position.set(p[3], p[4], p[5]);
        light.castShadow = false;
        scene.add(light); scene.add(light.target);
      });
      [-17.1, 17.1].forEach(function (x, i) {
        var fill = new T.PointLight(0xf1f8ff, 30, 12, 2);
        fill.name = 'Isocore Broadcast Rig Fill ' + (i ? 'Echo' : 'Ghost');
        fill.position.set(x, 3.8, -1.5);
        fill.castShadow = false;
        scene.add(fill);
      });
    }
    function placeSuites() {
      try { plotRoots.forEach(function (g) { g.visible = false; }); } catch (e) {}
      try { fitCharacters(); } catch (e) { modelInfo.chars = { state: 'error', err: String(e).slice(0, 200) }; }
      // In the isolated broadcast studio both anonymous hosts are present.
      // Unlike the original AI world, Echo does not require separate live-site data to appear.
      echoOn = true; echoOut = true; ghostOut = true; echoSpirit.visible = true;
      [spirit, echoSpirit].forEach(function (group) {
        var avatar = group.userData.character;
        if (!avatar || avatar.userData.broadcastSeated) return;
        avatar.scale.multiplyScalar(.78); // compact floating-cloak avatar fits inside the chair/cockpit
        avatar.rotation.x = -.08; // subtle forward lean toward the monitors
        avatar.userData.broadcastSeated = true;
      });
      // frame rate (README-ADMIN 261): the old hand-built arena's four floodlights and lamp glow are not needed under the new arena's
      // own lights, and every light is work for every pixel on a phone
      try { concourseLights.forEach(function (l) { l.visible = false; l.intensity = 0; }); lampFill.visible = false; indoor(); } catch (e) {}
      if (!stageRoots.main) return;
      addIsocoreWhiteSpots();
      [['ghost', 'station', -19, Math.PI / 2, .55, 1.2, 'iso'], ['echo', 'simrig', 19, -Math.PI / 2, .75, 1.05, 'gs']].forEach(function (c) {
        var src = kinds[c[1]]; if (!src) return;
        var root = src.clone(true), y = suiteTop(c[2], 0); root.position.set(c[2], y, 0); root.rotation.set(0, c[3], 0); root.updateMatrixWorld(true);
        // each screen has its own job (README-ADMIN 262): the centre one the stream, the left one LIVE NOW and the logo, the right one
        // the Twitch chat; the small one on the wheel matches the left one
        var scr = {}, list = []; root.traverse(function (o) { if (o.isMesh && /^Screen/i.test(o.name || '')) list.push(o); });
        list.forEach(function (o) {
          var nm = o.name || '', role = /_(Main|C)$/i.test(nm) ? 'stream' : /_(R|Side)$/i.test(nm) ? 'chat' : list.length === 1 ? 'stream' : 'live';
          if (scr[role] && role !== 'live') role = 'live';
          var cv2 = document.createElement('canvas'); cv2.width = role === 'chat' ? 384 : 512; cv2.height = role === 'chat' ? 512 : 288; if (role === 'chat' && o.geometry) { o.geometry.computeBoundingBox(); var e3 = o.geometry.boundingBox.getSize(new T.Vector3()), ar = [e3.x, e3.y, e3.z].sort(function (a, b) { return b - a; }); if (ar[0] / Math.max(.01, ar[1]) > 1.2) { cv2.width = 512; cv2.height = 288; } }
          var tx2 = new T.CanvasTexture(cv2); tx2.colorSpace = T.SRGBColorSpace; tx2.flipY = false;
          o.material = new T.MeshBasicMaterial({ map: tx2, toneMapped: false }); o.userData.suite = c[0];
          (scr[role + (scr[role] ? 2 : '')] ? null : (scr[role + (scr[role] ? 2 : '')] = { cv: cv2, tx: tx2, mesh: o, role: role }));
        });
        var cv = (scr.stream || scr.live || {}).cv || document.createElement('canvas'), tx = (scr.stream || scr.live || {}).tx;
        addModel(root); var so = [c[2], 0, 1.1, 1.3, c[3]]; so.keep = 1; SOLIDS.push(so);
        var dir = c[3] > 0 ? 1 : -1;      // the chair side points to the middle of the stage
        SUITES[c[0]] = { root: root, cv: cv, tx: tx, scr: scr, back: 0, side: c[6], seat: [c[2] + dir * c[4], c[5] + y, 0], yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2 };
      });
      // where their free will can take them now (lib/ghost.php ghost_will_haunts): the stage, their rigs, the screens, the stands
      HAUNTS.ghost = [[-16.8, 1.6, 'at the station'], [-5, .8, 'on the stage'], [-6, 6.5, 'at the front of the stage'], [-24, 3, 'under the big screen'], [-2, 4, 'under the jumbotron'], [-12, 22, 'by the stands']];
      HAUNTS.echo = [[16.8, 1.6, 'at the sim rig'], [5, .8, 'on the stage'], [6, 6.5, 'at the front of the stage'], [24, 3, 'under the big screen'], [2, 4, 'under the jumbotron'], [12, 22, 'by the stands']];
      WILL_AT.ghost = { station: [-16.8, 1.6], stage: [-5, .8], front: [-6, 6.5], screen: [-24, 3], jumbo: [-2, 4], stands: [-12, 22], echo: [11, 1.2], edge: [-6, -25] };
      WILL_AT.echo = { rig: [16.8, 1.6], stage: [5, .8], front: [6, 6.5], screen: [24, 3], jumbo: [2, 4], stands: [12, 22], ghost: [-11, 1.2], edge: [6, -25] };
      try { placeCameras(); } catch (e) { modelInfo.cams = { state: 'error', err: String(e).slice(0, 160) }; }
      try { renderViewers(); setInterval(renderViewers, 5000); } catch (e) {}
      try { placeBooths(); } catch (e) { modelInfo.booth = { state: 'error', err: String(e).slice(0, 200) }; }
      router = null; drawSuites(); try { chatSync(); setInterval(chatSync, 5000); } catch (e) {}
      modelInfo.suites = { state: 'shown', ghost: !!SUITES.ghost, echo: !!SUITES.echo };
    }
    function suiteLogo(w, g, x, y, mw, mh) {
      if (!suiteImg[w]) { suiteImg[w] = new Image(); suiteImg[w].crossOrigin = 'anonymous'; suiteImg[w].onload = function () { drawSuites(); drawWallScreens(); }; suiteImg[w].src = w === 'ghost' ? ISOCORE_ASSET_BASE + 'assets/ghost-logo.webp' : ISOCORE_ASSET_BASE + 'assets/echo-logo.webp'; }
      var li = suiteImg[w]; if (li.complete && li.naturalWidth) { var sc = Math.min(mw / li.naturalWidth, mh / li.naturalHeight); try { g.drawImage(li, x - li.naturalWidth * sc / 2, y, li.naturalWidth * sc, li.naturalHeight * sc); } catch (e) {} }
    }
    function drawSuites() {
      if (!SUITES) return;
      Object.keys(SUITES).forEach(function (w) {
        var su = SUITES[w], sm = sideStream(w), col = w === 'ghost' ? '#4fc8f5' : '#ff9a4d', on = !!sm || inSuite === w;
        Object.keys(su.scr || {}).forEach(function (k) {
          var sc = su.scr[k], g = sc.cv.getContext('2d'), W = sc.cv.width, H = sc.cv.height; g.fillStyle = '#04080e'; g.fillRect(0, 0, W, H); g.textAlign = 'center';
          if (sc.role === 'stream') {
            var im = sm ? thumbOf(sm, drawSuites) : null;
            if (im) { try { g.drawImage(im, 0, 0, W, H); } catch (e) { im = null; } }
            if (!im) { suiteLogo(w, g, W / 2, 26, W * .7, H * .62); g.fillStyle = col; g.font = 'bold 26px Arial, sans-serif'; var nr = nextSched(w); g.fillText(on ? 'STARTING SOON' : nr ? 'NEXT ' + nr.label : (w === 'ghost' ? 'GHOST // OFFLINE' : 'ECHO // OFFLINE'), W / 2, H - 24); }
          } else if (sc.role === 'chat') {
            drawChat(g, W, H, col, on || !!tchat.login);
          } else {
            suiteLogo(w, g, W / 2, 14, W * .8, H * .64);
            if (on) { g.fillStyle = '#e8262b'; g.fillRect(W / 2 - 110, H - 62, 220, 46); g.fillStyle = '#fff'; g.font = 'bold 30px Arial, sans-serif'; g.fillText('LIVE NOW', W / 2, H - 28); }
            else { g.fillStyle = col; g.font = 'bold 26px Arial, sans-serif'; g.fillText('OFFLINE', W / 2, H - 28); }
          }
          sc.tx.needsUpdate = true;
        });
      });
    }
    // ---- The live stream's Twitch chat, read only, with no sign-in (anonymous "justinfan" reading, which Twitch allows). It is
    //      drawn onto the rig's right-hand screen and the big "ARENA CHAT" wall screen. Nothing is ever sent to the chat.
    var tchat = { login: '', ws: null, connected: false, lines: [], timer: 0 };
    // Isocore Chat: read-only Twitch chat rendered directly into the existing 3D monitor textures.
    // Set ?chat=channel to lock both rigs to that channel (broadcast pages use igvain).
    // The arena otherwise follows its live stream, falling back to the owner's chat when idle.
    function chatChannel() {
      var qs = new URLSearchParams(location.search), manual = (qs.get('chat') || qs.get('ch') || 'igvain').trim().toLowerCase();
      if (/^[a-z0-9_]{3,25}$/.test(manual)) return manual;
      var a = inSuite ? sideStream(inSuite) : null;
      var sm = a || (typeof liveStream === 'function' ? liveStream() : null);
      var candidate = sm && sm.login ? String(sm.login).toLowerCase() : 'igvain';
      return /^[a-z0-9_]{3,25}$/.test(candidate) ? candidate : 'igvain';
    }
    function chatSync() {
      var lg = chatChannel(); if (lg === tchat.login && (tchat.ws || !lg)) return;
      if (tchat.ws) { try { tchat.ws.onclose = null; tchat.ws.close(); } catch (e) {} tchat.ws = null; }
      if (lg !== tchat.login) tchat.lines = []; tchat.login = lg; tchat.connected = false; chatRedraw(); if (!lg || !('WebSocket' in window)) return;
      try {
        var ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); tchat.ws = ws;
        ws.onopen = function () { tchat.connected = true; ws.send('PASS SCHMOOPIIE'); ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000))); ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands'); ws.send('JOIN #' + lg); chatRedraw(); };
        ws.onmessage = function (ev) {
          String(ev.data || '').split('\r\n').forEach(function (ln) {
            if (/^PING/.test(ln)) { try { ws.send('PONG :tmi.twitch.tv'); } catch (e) {} return; }
            var m = /^(?:@([^ ]*) )?:([^!]+)![^ ]* PRIVMSG #[^ ]+ :(.*)$/.exec(ln); if (!m) return;
            var tags = {}; (m[1] || '').split(';').forEach(function (kv) { var q = kv.indexOf('='); if (q > 0) tags[kv.slice(0, q)] = kv.slice(q + 1); });
            var who = (tags['display-name'] || m[2] || '').replace(/\\s/g, ' ').slice(0, 20), text = m[3].replace(/^\u0001ACTION /, '').replace(/\u0001$/, '').slice(0, 160);
            var tv = /^!(ghost|echo)\b/i.exec(text); if (tv) tugSend(tv[1].toLowerCase(), tags.id || '', tags['user-id'] || m[2]);
            tchat.lines.push({ n: who, t: text, c: /^#[0-9a-f]{6}$/i.test(tags.color || '') ? tags.color : '' }); if (tchat.lines.length > 40) tchat.lines.shift();
          });
          clearTimeout(tchat.timer); tchat.timer = setTimeout(chatRedraw, 150);
        };
        ws.onclose = function () { if (tchat.ws === ws) { tchat.ws = null; tchat.connected = false; chatRedraw(); setTimeout(chatSync, 10000); } };
        ws.onerror = function () { if (tchat.ws === ws) { tchat.connected = false; chatRedraw(); } };
      } catch (e) { tchat.ws = null; }
    }
    function chatRedraw() { try { drawSuites(); drawWallScreens(); } catch (e) {} }
    // chat lines, newest at the bottom, wrapped to the panel
    function drawChat(g, W, H, col, on) {
      g.fillStyle = col; g.fillRect(0, 0, W, 6); g.textAlign = 'left'; g.fillStyle = '#ffffff'; var big = H > 400 ? 1.15 : 1; g.font = 'bold ' + Math.round(22 * big) + 'px Arial, sans-serif'; g.fillText('ISOCORE CHAT', 16, 36 * big);
      var fs = Math.round(17 * big), lh = Math.round(fs * 1.3), y = H - 12, lines = tchat.lines.slice(-24);
      if (!lines.length) { g.fillStyle = '#9fb6cc'; g.font = fs + 'px Arial, sans-serif'; g.fillText(on ? (tchat.login ? (tchat.connected ? 'Waiting for messages in #' + tchat.login + '...' : 'Connecting to #' + tchat.login + '...') : 'Chat not configured.') : 'Chat opens when the stream goes live.', 16, 36 * big + lh * 1.6); return; }
      for (var i = lines.length - 1; i >= 0 && y > 50 * big; i--) {
        var L = lines[i]; g.font = 'bold ' + fs + 'px Arial, sans-serif'; var nm = L.n + ': ', nw = g.measureText(nm).width; g.font = fs + 'px Arial, sans-serif';
        var words = L.t.split(' '), rows = [], cur = ''; words.forEach(function (wd) { var t2 = cur ? cur + ' ' + wd : wd; if (g.measureText(t2).width > W - 32 - (rows.length ? 0 : nw)) { if (cur) rows.push(cur); cur = wd; } else cur = t2; }); if (cur) rows.push(cur);
        for (var r = rows.length - 1; r >= 0 && y > 50 * big; r--) { if (r === 0) { g.font = 'bold ' + fs + 'px Arial, sans-serif'; g.fillStyle = L.c || col; g.fillText(nm, 16, y); g.font = fs + 'px Arial, sans-serif'; g.fillStyle = '#e6eef8'; g.fillText(rows[0], 16 + nw, y); } else { g.fillStyle = '#e6eef8'; g.font = fs + 'px Arial, sans-serif'; g.fillText(rows[r], 16, y); } y -= lh; }
        y -= 4;
      }
    }
    // ---- The arena's two big wall screens: Ghost's (west) and Echo's (east). The live side shows its stream; the other side shows
    //      the arena's chat while someone is live; with no one live, each shows its logo and OFFLINE.
    var WALLS = {};
    function hookWalls(root) {
      root.traverse(function (o) {
        var m = /^Screen_(West|East)$/.exec(o.name || ''); if (!o.isMesh || !m) return;
        var cv = document.createElement('canvas'); cv.width = 768; cv.height = 342; var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; tx.flipY = false;
        o.material = new T.MeshBasicMaterial({ map: tx, toneMapped: false, side: T.DoubleSide }); WALLS[m[1] === 'West' ? 'ghost' : 'echo'] = { cv: cv, tx: tx, mesh: o };
      });
      drawWallScreens();
    }
    function chatLines() {
      var lg = (world.extra || {}).log || {}, out = [], nm = function (w) { return /echo/i.test(String(w || '')) ? 'ECHO' : 'GHOST'; };
      try {
        (lg.talk || []).forEach(function (t) { (t.lines || []).forEach(function (l) { var tx = typeof l === 'string' ? l : (l.text || l.line || l.say || ''); if (tx) out.push((typeof l === 'object' && l.who ? nm(l.who) + ': ' : '') + tx); }); });
        (lg.jots || []).forEach(function (j) { if (j.body) out.push(nm(j.who) + ': ' + j.body); });
      } catch (e) {}
      return out;
    }
    function drawWallScreens() {
      if (!WALLS) return;
      var st = (world.extra || {}).stream || {}, live = { ghost: sideStream('ghost'), echo: sideStream('echo') };
      var anyLive = live.ghost || live.echo || inSuite;
      Object.keys(WALLS).forEach(function (w) {
        var wl = WALLS[w], g = wl.cv.getContext('2d'), col = w === 'ghost' ? '#4fc8f5' : '#ff9a4d', mine = live[w] || inSuite === w;
        g.fillStyle = '#03070d'; g.fillRect(0, 0, 768, 342); g.textAlign = 'center';
        if (mine) {
          var im = live[w] ? thumbOf(live[w], drawWallScreens) : null;
          if (im) { try { g.drawImage(im, 0, 0, 768, 342); } catch (e) {} } else { g.fillStyle = col; g.font = 'bold 40px Arial, sans-serif'; g.fillText((w === 'ghost' ? 'GHOST' : 'ECHO') + ' IS LIVE', 384, 190); }
          g.fillStyle = '#e8262b'; g.fillRect(20, 20, 96, 38); g.fillStyle = '#fff'; g.font = 'bold 26px Arial, sans-serif'; g.fillText('LIVE', 68, 48);
          if (live[w] && live[w].viewers) { g.textAlign = 'right'; g.fillText(live[w].viewers + ' WATCHING', 748, 48); }
        } else if (anyLive) {
          g.fillStyle = col; g.fillRect(0, 0, 768, 8); g.fillStyle = '#ffffff'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'left'; g.fillText('ISOCORE CHAT', 30, 56);
          if (tchat.lines.length) { g.fillStyle = '#03070d'; g.fillRect(0, 0, 768, 342); drawChat(g, 768, 342, col, true); wl.tx.needsUpdate = true; return; }
          var lines = chatLines().slice(-6); g.font = '22px Arial, sans-serif'; g.fillStyle = '#c9d6e6';
          if (!lines.length) g.fillText('Say hello: the chat opens with the stream.', 30, 110);
          lines.forEach(function (ln, i) { g.fillText(ln.slice(0, 62), 30, 110 + i * 38); });
        } else {
          if (!suiteImg[w]) { suiteImg[w] = new Image(); suiteImg[w].crossOrigin = 'anonymous'; suiteImg[w].onload = drawWallScreens; suiteImg[w].src = w === 'ghost' ? ISOCORE_ASSET_BASE + 'assets/ghost-logo.webp' : ISOCORE_ASSET_BASE + 'assets/echo-logo.webp'; }
          var li = suiteImg[w]; if (li.complete && li.naturalWidth) { var sc = Math.min(560 / li.naturalWidth, 240 / li.naturalHeight); try { g.drawImage(li, 384 - li.naturalWidth * sc / 2, 18, li.naturalWidth * sc, li.naturalHeight * sc); } catch (e) {} }
          var nw = nextSched(w); g.fillStyle = col; g.font = 'bold ' + (nw ? 30 : 34) + 'px Arial, sans-serif'; g.fillText((w === 'ghost' ? 'GHOST' : 'ECHO') + '  //  ' + (nw ? 'NEXT ' + nw.label : 'OFFLINE'), 384, 312);
        }
        wl.tx.needsUpdate = true;
      });
    }
    // ---- Fixed cameras while broadcasting: five framed shots and a row of buttons to cut between them
    var camShot = 'first', camRow = null;
    var SHOTS = [['first', 'Streamer cam'], ['shoulder', 'Over shoulder'], ['side', 'Side on'], ['wide', 'Stage wide'], ['high', 'Jumbotron']];
    function shotOf(name) {
      if (!SUITES) return null; var su = SUITES[inSuite]; if (!su) return null;
      var dx = Math.sin(su.yaw), dz = -Math.cos(su.yaw), px = -dz, pz = dx, e = su.seat, R = su.root.position;
      if (name === 'first') {
        // STREAMER CAM: camera is placed beyond the rig's monitor array,
        // looking BACK towards the occupied chair. An offset to the side and
        // a raised lens keep screen backs in the foreground without hiding
        // the streamer's upper body or face.
        var front = 3.65, lateral = 1.65;
        return [
          [e[0] + dx * front + px * lateral,
           e[1] + .78,
           e[2] + dz * front + pz * lateral],
          [e[0] - dx * .08, e[1] - .28, e[2] - dz * .08]
        ];
      }
      if (name === 'shoulder') {
        // A broadcast over-shoulder shot needs breathing room around both cloak
        // and monitors, not a lens within arm's reach of the avatar.
        return [[e[0] - dx * 3.65 + px * 1.2, e[1] + .72,
                 e[2] - dz * 3.65 + pz * 1.2],
                [e[0] + dx * 1.05, e[1] - .28,
                 e[2] + dz * 1.05]];
      }
      if (name === 'side') {
        // A studio camera must see the seated host AND their rig. At 2.05m the
        // cloak was almost touching the lens and blocked half the feed.
        // Place the camera ~4.6m off the side, slightly behind the cockpit,
        // and aim between the host's seat and the monitor/wheel assembly.
        var sideDistance = 5.4, backDistance = 1.8;
        return [
          [R.x + px * sideDistance - dx * backDistance, e[1] + .55,
           R.z + pz * sideDistance - dz * backDistance],
          [R.x + dx * .33, e[1] - .28, R.z + dz * .33]
        ];
      }
      if (name === 'wide') return [[R.x * .25, 5.5, 15], [R.x * .8, 1.6, 0]];
      return [[0, 15.5, 9], [R.x * .55, 1.4, 0]];
    }
    function cutTo(name) { camShot = name; if (camRow) [].forEach.call(camRow.children, function (b) { b.classList.toggle('is-on', b.dataset.shot === name); b.setAttribute('aria-pressed', b.dataset.shot === name ? 'true' : 'false'); }); still(); wake(); }
    function makeCamRow() {
      if (camRow) return; camRow = el('div', 'igw-cams'); camRow.setAttribute('role', 'group'); camRow.setAttribute('aria-label', 'Camera');
      SHOTS.forEach(function (sh) { var b = el('button', '', sh[1]); b.type = 'button'; b.dataset.shot = sh[0]; b.addEventListener('click', function (ev) { ev.stopPropagation(); cutTo(sh[0]); }); camRow.appendChild(b); });
      ['pointerdown', 'pointerup', 'click'].forEach(function (ev) { camRow.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      stage.appendChild(camRow);
    }
    // ---- Who is in the arena (README-ADMIN 255): every open arena says it is here once a minute. The counter shows how many are
    //      here; a new arrival gets a welcome on the jumbotron, and the brand face says when the last one took a seat.
    var welcomeUntil = 0, welcomeName = '', seenArrival = 0;
    function arenaPing() {
      if (document.hidden) return;
      var mySeat = seatLock && seatHome && !inSuite ? [Math.round(seatHome.x * 100) / 100, Math.round(seatHome.z * 100) / 100, Math.round(seatHome.y * 100) / 100] : null;
      fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: mySeat }) }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v || !v.arena) return; world.extra.arena = v.arena; arenaNews(); try { renderViewers(); } catch (e) {}
      }).catch(function () {});
    }
    function arenaNews() {
      var ar = (world.extra || {}).arena; if (!ar) return;
      var last = (ar.arrivals || [])[0];
      if (last && last.at > seenArrival) { if (seenArrival) { try { mainframe('Welcome to the arena, ' + (last.n ? last.n : 'new fan') + '. Seat assigned. Sync rising.'); } catch (e) {} welcomeName = last.n || ''; welcomeUntil = Date.now() + 9000; setTimeout(function () { drawJumbo(jLast[0], jLast[1]); }, 9200); } else if (Date.now() / 1000 - last.at < 20) { welcomeName = last.n || ''; welcomeUntil = Date.now() + 9000; setTimeout(function () { drawJumbo(jLast[0], jLast[1]); }, 9200); } seenArrival = last.at; }
      modelInfo.welcome = { until: welcomeUntil, name: welcomeName, seen: seenArrival };
      if (typeof showCounter === 'function') showCounter(); drawJumbo(jLast[0], jLast[1]);
    }
    // Watch live, for visitors: turns them to the live side's big screen and opens the stream with its sound on.
    var watchBtn = null;
    function makeWatch() {
      if (watchBtn) return; watchBtn = el('button', 'igw-watch', 'Watch live'); watchBtn.type = 'button';
      ['pointerdown', 'pointerup'].forEach(function (ev) { watchBtn.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      watchBtn.addEventListener('click', function (e) {
        e.stopPropagation(); var st = (world.extra || {}).stream || {}, w = sideStream('ghost') ? 'ghost' : sideStream('echo') ? 'echo' : '', sm = w ? sideStream(w) : null;
        if (!sm) { say('No one is live right now'); setTimeout(function () { say(''); }, 3000); return; }
        var wl = WALLS[w]; if (wl) { var p = new T.Vector3(); wl.mesh.getWorldPosition(p); pyaw = Math.atan2(p.x - player.x, -(p.z - player.z)); ppitch = Math.atan2(p.y - (EYE + seatY), Math.hypot(p.x - player.x, p.z - player.z)) * .8; still(); wake(); }
        openStream(sm, true);
      });
      stage.appendChild(watchBtn); watchShow(); setInterval(watchShow, 5000);
    }
    function watchShow() { if (!watchBtn) return; var st = (world.extra || {}).stream || {}; watchBtn.hidden = !(okStream(st.iso) || okStream(st.gs)); }
    function onAirTell(w) {
      world.extra.onair = w; var wr = document.getElementById('igwWrap'), tok = wr && wr.dataset.csrf; if (!tok) return;
      fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: JSON.stringify({ who: w }) }).catch(function () {});
    }
    window.addEventListener('pagehide', function () { if (!inSuite) return; var wr = document.getElementById('igwWrap'), tok = wr && wr.dataset.csrf; if (tok) try { fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: '{"who":""}' }); } catch (e) {} });
    var inSuite = '';
    function enterSuite(w) {
      var su = SUITES[w]; if (!su) return; stopWalk(); keys = {};
      makeCamRow(); cutTo('first'); inSuite = w; seatAt = null; onAirTell(w); seatY = su.seat[1] - EYE; player.x = su.seat[0]; player.z = su.seat[2]; pyaw = su.yaw; ppitch = -.12; bob = 0;
      seatLock = true; stage.classList.add('igw-in-suite'); stage.classList.remove('igw-seated');
      say('Broadcasting as ' + (w === 'ghost' ? 'Ghost' : 'Echo') + '. Pick a camera below; Menu > Leave the seat to get up'); setTimeout(function () { say(''); }, 5000); drawWallScreens(); drawSuites(); still(); wake();
    }
    function leaveSuite() {
      var su = SUITES[inSuite]; if (!su) return; var back = su.yaw < 0 ? 1.8 : -1.8;
      inSuite = ''; seatY = 0; seatLock = false; stage.classList.remove('igw-in-suite'); onAirTell(''); drawWallScreens(); drawSuites(); try { resize(); } catch (e) {} player.x = su.seat[0] + back; player.z = su.seat[2]; still(); wake();
    }
    function cityBuild() {
      var C = CITY;
      SEALED = true;
      if (!SEALED) cityGround();
      // the forest steps back to make room for the city
      if (forestRef) {
        var f = forestRef[0], tt = forestRef[1], n = forestRef[2], M = new T.Matrix4(), lim = C.edge + 12;
        for (var i = 0; i < n; i++) {
          tt.getMatrixAt(i, M); var x = M.elements[12], z = M.elements[14], r = Math.hypot(x, z); if (r >= lim || r < 1) continue;
          var k = (lim + 4 + Math.max(0, r - (RO + 18)) * .8) / r;
          M.elements[12] = x * k; M.elements[14] = z * k; tt.setMatrixAt(i, M);
          for (var l = 0; l < 3; l++) { f.getMatrixAt(i * 3 + l, M); M.elements[12] *= k; M.elements[14] *= k; f.setMatrixAt(i * 3 + l, M); }
        }
        tt.instanceMatrix.needsUpdate = true; f.instanceMatrix.needsUpdate = true; tt.computeBoundingSphere(); f.computeBoundingSphere();
      }
      // the sun's shadows cover the whole city
      if (sun.shadow && sun.shadow.camera) { var sc2 = sun.shadow.camera, ex = C.edge + 6; sc2.left = -ex; sc2.right = ex; sc2.top = ex; sc2.bottom = -ex; sc2.near = -260; sc2.far = 420; sc2.updateProjectionMatrix(); }
      // the AI town's own buildings, round Ghost's tower
      if (kinds['ai-building']) {
        var ai = 0; [[C.gE + .45, zBand1(), frontOn(C.a1 + 1.2)], [C.gE + .5, zBand2(), frontOn(C.b1 + 1.2)], [C.gE - .5, zBand2(), frontOn(C.b1 + 1.2)]].forEach(function (s3) { var t = kinds['ai-building'].clone(), inf = {}; ZONE = s3[1]; try { placeOnRing(t, inf, s3[0], 10, s3[2]); addModel(t); ai++; } catch (e) {} ZONE = null; });
        modelInfo.aitown = { state: 'shown', buildings: ai };
      }
      // only the gate, the arena with its two stages and the village are left: every other place, its name and its link goes
      var KEEP_PLACES = { gate: 1, login: 1, overview: 1, post: 1, enlist: 1, lore: 1, arena: 1, circuit: 1 };
      tags.forEach(function (t) { if (t.userData.place && !KEEP_PLACES[t.userData.place]) { t.visible = false; t.userData.gone = true; } });
      Object.keys(PLACES).forEach(function (id) { if (!KEEP_PLACES[id] && PLACES[id]) PLACES[id].gone = true; });
      blinkers.forEach(function (b) { b.visible = false; b.userData.gone = true; });          // the radio masts' red lights
      scene.children.forEach(function (o) { if (o.userData.fx && o.geometry && o.geometry.parameters && o.geometry.parameters.height > 30) o.visible = false; });
      // the old town's leftovers: its spectator screens on poles, and anything else of it standing where the city now is
      if (typeof wallScreens !== 'undefined') wallScreens.forEach(function (w) { w.g.visible = false; w.g.userData.gone = true; var pi = pickable.indexOf(w.mesh); if (pi >= 0) pickable.splice(pi, 1); });
      scene.children.forEach(function (o, i) {
        if (o.userData.keep || o.userData.model || o.isLight || o.isCamera || o.isInstancedMesh || o === arenaRoot || o === land || o === skyMesh || o === stars || o === clouds || o === spirit || o === echoSpirit || o === thingGroup || plotRoots.indexOf(o) >= 0 || tags.indexOf(o) >= 0 || houseTags.indexOf(o) >= 0 || streetTags.indexOf(o) >= 0) return;
        if (o === rainMesh || o === splash || o === bolt || o === boltGlow || o === streaks || o === moonRef || mists.indexOf(o) >= 0 || o.isSprite) return;
        if (HUB && hubKeepList.indexOf(o) >= 0) return;
        var r = Math.hypot(o.position.x, o.position.z); if (r > RO - 2 && r < CITY.edge + 8 && i < lifeFrom) { o.visible = false; o.userData.gone = true; }
      });
      if (SEALED) {
        // nothing outside: the gate and its booths go (their links move to the visitors' phone), and nobody can leave the floor
        ['gate', 'login', 'overview', 'post', 'enlist', 'lore'].forEach(function (id) { if (PLACES[id]) { PLACES[id].gone = true; if (PLACES[id].group) PLACES[id].group.visible = false; } });
        tags.forEach(function (t) { if (t.userData.place) { t.visible = false; t.userData.gone = true; } });
        hubKeepList.forEach(function (o) { o.visible = false; }); if (loreK) loreK.visible = false;
        SOLIDS.forEach(function (o) { if (o.length !== 4 && Math.hypot(o[0], o[1]) > ARENA_FLOOR + 2) { o[0] = 9999; o[1] = 9999; } });
        EDGE = ARENA_FLOOR - 1.2; if (forestRef) forestRef.forEach(function (f) { if (f && f.isObject3D) f.visible = false; });
        scene.children.forEach(function (o) { if (o === arenaRoot || o.isLight || o.isCamera || mixers.length < 0) return; var r = Math.hypot(o.position.x, o.position.z); if (!o.userData.model && !o.isSprite && r > ARENA_FLOOR + 6 && o !== skyMesh && o !== stars && o !== clouds && o !== land && o !== moonRef && o !== rainMesh && o !== splash && o !== bolt && o !== boltGlow && o !== streaks) o.visible = false; });
        // indoors: no sky, sun, moon or weather shows through the roof
        [skyMesh, stars, clouds, moonRef, rainMesh, splash, bolt, boltGlow, streaks].forEach(function (o) { if (o) { o.visible = false; o.userData.gone = true; } });
        wxs.rain = wxs.mist = wxs.storm = wxs.cloud = wxs.wet = 0; scene.background = new T.Color(0x05080d); if (scene.fog) scene.fog.color.set(0x05080d);
        try { mapBox.style.display = 'none'; card.classList.add('is-min'); if (typeof statsOpen !== 'undefined' && statsOpen) statToggle.click(); } catch (e) {}
        IDLE = '';      // no standing instructions on screen: a short hint shows once and goes
        stageKit(); placeSuites(); cityHaunts();
        // Ghost and Echo live inside now: anywhere they used to go outside is pulled in onto the floor, at the same bearing
        var lim = ARENA_FLOOR - 4, pullIn = function (pt) { if (!pt || typeof pt[0] !== 'number') return pt; var r = Math.hypot(pt[0], pt[1]); if (r > lim) { pt[0] *= lim / r; pt[1] *= lim / r; } return pt; };
        Object.keys(SPOTS).forEach(function (k) { pullIn(SPOTS[k]); }); Object.keys(ECHO_AT).forEach(function (k) { pullIn(ECHO_AT[k]); });
        ['ghost', 'echo'].forEach(function (w, n) { HAUNTS[w] = (HAUNTS[w] || []).filter(function (h) { return Math.hypot(h[0], h[1]) < lim + .01; }); Object.keys(WILL_AT[w] || {}).forEach(function (k) { pullIn(WILL_AT[w][k]); }); pullIn(PLOT[w]); if (plotRoots[n]) plotRoots[n].position.set(PLOT[w][0], plotRoots[n].position.y, PLOT[w][1]); });
        thingGroup.children.forEach(function (c) { var pt = pullIn([c.position.x, c.position.z]); c.position.x = pt[0]; c.position.z = pt[1]; });
        if (typeof thingSpots !== 'undefined') thingSpots.forEach(pullIn);
      } else { cityHomes(); cityProps(); stageKit(); cityHaunts(); }
      for (var pk = pickable.length - 1; pk >= 0; pk--) { var ob = pickable[pk], vis = true; for (var q = ob; q; q = q.parent) if (q.visible === false) { vis = false; break; } if (!vis || (ob.userData.place && PLACES[ob.userData.place] && PLACES[ob.userData.place].gone)) pickable.splice(pk, 1); }
      var isHost = false; try { var wrap0 = document.getElementById('igwWrap'); isHost = (wrap0 && wrap0.dataset.host === '1') || (new URLSearchParams(location.search)).get('igwhost') === '1'; } catch (e) {}
      var atStart = Math.hypot(player.x - START.x, player.z - START.z) < 1.5;
      if (isHost && Object.keys(SUITES).length) {
        [['ghost', 'Broadcast as Ghost'], ['echo', 'Broadcast as Echo']].forEach(function (b) { if (!SUITES[b[0]]) return; var bt = el('button', 'igw-suite-btn', b[1]); bt.type = 'button'; bt.addEventListener('click', function () { hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; if (inSuite) leaveSuite(); enterSuite(b[0]); }); hudActions.insertBefore(bt, walkBtn); });
        var lv = el('button', 'igw-suite-leave', 'Leave the seat'); lv.type = 'button'; lv.addEventListener('click', function () { hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; leaveSuite(); }); hudActions.insertBefore(lv, walkBtn);
      }
      if (isHost && stageMeshes.length) { START.x = 0; START.z = 0; START.yaw = -Math.PI / 2; START.pitch = .04; if (atStart) { player.x = START.x; player.z = START.z; pyaw = START.yaw; ppitch = START.pitch; } say(STICKS ? 'Left stick walks, right stick looks' : 'W A S D to walk, drag to look'); setTimeout(function () { say(''); }, 5000); }
      var isMod = false; try { isMod = !isHost && ((wrap0 && wrap0.dataset.mod === '1') || (new URLSearchParams(location.search)).get('igwmod') === '1'); } catch (e) {}
      if (isMod && boothScr.length) { try { enterBooth(); var g2b = stage.querySelector('.igw-guide-go'); if (g2b) g2b.textContent = 'To my desk'; } catch (e) {} }
      else if (!isHost && atStart) { try { sitDown(); } catch (e) {} }
      if (isHost && boothScr.length) {
        var gb = el('button', 'igw-booth-go', 'Go to the mod booth'); gb.type = 'button'; gb.addEventListener('click', function () { hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; enterBooth(); });
        var lb = el('button', 'igw-booth-leave', 'Leave the booth'); lb.type = 'button'; lb.addEventListener('click', function () { hudActions.classList.add('is-folded'); optBtn.textContent = 'Menu'; leaveBooth(); });
        hudActions.insertBefore(gb, walkBtn); hudActions.insertBefore(lb, walkBtn);
      }
      modelInfo.mod = isMod; isHostNow = isHost; try { keysStart(); } catch (e) {}
      try { tugRefresh(); setInterval(tugRefresh, 15000); } catch (e) {}
      [['ghost', 'Team Ghost (!ghost)'], ['echo', 'Team Echo (!echo)']].forEach(function (tb) { var b = el('button', 'igw-tug-btn igw-tug-' + tb[0], tb[1]); b.type = 'button'; b.addEventListener('click', function () { tugSend(tb[0]); mainframe('Vote counted for ' + (tb[0] === 'ghost' ? 'Team Ghost.' : 'Team Echo.')); }); hudActions.appendChild(b); });
      if (isHost) { var cb = el('button', 'igw-ops-btn', 'Cinematic spin'); cb.type = 'button'; cb.addEventListener('click', function () { optBtn.click(); setTimeout(cineStart, 50); }); hudActions.appendChild(cb); }
      if (isHost || isMod) {
        var ab = el('button', 'igw-ops-btn', 'Send an alert'); ab.type = 'button'; ab.addEventListener('click', function () { var t0 = window.prompt('Alert for the arena and the stream overlay (120 characters):', ''); if (t0) tugOps('alert', t0); }); hudActions.appendChild(ab);
        var rb = el('button', 'igw-ops-btn', 'Reset tug-of-war'); rb.type = 'button'; rb.addEventListener('click', function () { tugOps('reset'); }); hudActions.appendChild(rb);
      }
      var muteBtn = el('button', 'igw-mute-btn', soundMuted ? 'Sound: off' : 'Sound: on'); muteBtn.type = 'button'; muteBtn.setAttribute('aria-pressed', soundMuted ? 'true' : 'false');
      muteBtn.addEventListener('click', function () { soundMuted = !soundMuted; try { localStorage.setItem('igw_mute', soundMuted ? '1' : '0'); } catch (e) {} muteBtn.textContent = soundMuted ? 'Sound: off' : 'Sound: on'; muteBtn.setAttribute('aria-pressed', soundMuted ? 'true' : 'false'); unlockAudio(); streamSound(); });
      hudActions.insertBefore(muteBtn, walkBtn);
      var QNAME = { high: 'High', medium: 'Medium', low: 'Low', auto: 'Auto' };
      var qBtn = el('button', 'igw-q-btn', 'Quality: ' + QNAME[qset]); qBtn.type = 'button'; qBtn.title = 'High looks best; Low runs smoothest on older phones; Auto lowers it by itself if needed';
      qBtn.addEventListener('click', function () {
        qset = QSET[(QSET.indexOf(qset) + 1) % QSET.length]; try { localStorage.setItem('igw_qset', qset); } catch (e) {}
        qBtn.textContent = 'Quality: ' + QNAME[qset]; qHold = qset !== 'auto'; ft = []; seen = 0;
        setQuality(qset === 'auto' ? 2 : QUAL.indexOf(qset)); still();
      });
      hudActions.insertBefore(qBtn, muteBtn);
      // visitors cannot get onto the stage (README-ADMIN 276): its footprint is solid for everyone but the Owner
      if (!isHost && stageRoots.main) { try { stageRoots.main.updateMatrixWorld(true); var sbb = new T.Box3().setFromObject(stageRoots.main), sc0 = sbb.getCenter(new T.Vector3()), ss0 = sbb.getSize(new T.Vector3()); var sso = [sc0.x, sc0.z, ss0.x / 2 + .3, ss0.z / 2 + .3, 0]; PLAYER_SOLIDS.push(sso); modelInfo.stageBlock = [Math.round(ss0.x), Math.round(ss0.z)]; } catch (e) {} }
      // No startup Mainframe text in the live camera feed; regular alerts remain active.
      // No arena entrance/materialisation animation on the live camera.
      setInterval(mfWatch, 5000); setInterval(mfIdle, 210000 + Math.random() * 60000);
      modelInfo.spawn = { host: isHost, seated: !!seatY }; try { arenaPing(); setInterval(arenaPing, 60000); if (!isHost) makeWatch(); } catch (e) {}
      cityReady = true; router = null;
      modelInfo.city.state = 'shown';
    }
    // ---- the map of it all
    function cityMap(g, k) {
      var C = CITY, c = toMap(0, 0);
      function band(r0, r1, col) { g.strokeStyle = col; g.lineWidth = Math.max(1, (r1 - r0) * k); g.beginPath(); g.arc(c[0], c[1], (r0 + r1) / 2 * k, 0, 7); g.stroke(); }
      g.fillStyle = 'rgba(40,52,66,.9)'; g.beginPath(); g.arc(c[0], c[1], C.edge * k, 0, 7); g.fill();
      PARKS.forEach(function (p) { g.fillStyle = 'rgba(70,130,72,.6)'; g.beginPath(); for (var t = 0; t <= 12; t++) { var a = p[0] + (p[1] - p[0]) * t / 12, m = toMap(Math.sin(a) * (C.a1 + .6), Math.cos(a) * (C.a1 + .6)); if (t) g.lineTo(m[0], m[1]); else g.moveTo(m[0], m[1]); } for (t = 12; t >= 0; t--) { a = p[0] + (p[1] - p[0]) * t / 12; m = toMap(Math.sin(a) * (C.b0 - .6), Math.cos(a) * (C.b0 - .6)); g.lineTo(m[0], m[1]); } g.closePath(); g.fill(); });
      band(C.a0, C.a1, 'rgba(18,22,28,.95)'); band(C.b0, C.b1, 'rgba(18,22,28,.95)');
      C.gaps.forEach(function (gp) { var m1 = toMap(Math.sin(gp.a) * (C.floor - 1), Math.cos(gp.a) * (C.floor - 1)), m2 = toMap(Math.sin(gp.a) * C.b1, Math.cos(gp.a) * C.b1); g.strokeStyle = 'rgba(18,22,28,.95)'; g.lineWidth = Math.max(2, 8.4 * k); g.beginPath(); g.moveTo(m1[0], m1[1]); g.lineTo(m2[0], m2[1]); g.stroke(); });
      var sq = toMap(C.sq.x, C.sq.z); g.fillStyle = 'rgba(190,170,130,.75)'; g.beginPath(); g.arc(sq[0], sq[1], C.sq.r * k, 0, 7); g.fill();
      // the arena: its stands, its floor, and the two tunnels through the stands
      band(C.floor, C.ao, 'rgba(56,86,120,.95)'); g.fillStyle = 'rgba(14,28,46,.95)'; g.beginPath(); g.arc(c[0], c[1], C.floor * k, 0, 7); g.fill();
      C.gaps.forEach(function (gp) { var m1 = toMap(Math.sin(gp.a) * (C.floor - .5), Math.cos(gp.a) * (C.floor - .5)), m2 = toMap(Math.sin(gp.a) * (C.ao + .5), Math.cos(gp.a) * (C.ao + .5)); g.strokeStyle = 'rgba(14,28,46,1)'; g.lineWidth = Math.max(2, gp.hw * 2 * k); g.beginPath(); g.moveTo(m1[0], m1[1]); g.lineTo(m2[0], m2[1]); g.stroke(); });
      if (mapBig) { g.font = '600 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(220,235,245,.8)'; [['VILLAGE', C.gW + .9, (C.a1 + C.b0) / 2], ['PARK', (PARKS[0][0] + PARKS[0][1]) / 2, (C.a1 + C.b0) / 2], ['PARK', (PARKS[1][0] + PARKS[1][1]) / 2, (C.a1 + C.b0) / 2]].forEach(function (l) { var m = toMap(Math.sin(l[1]) * l[2], Math.cos(l[1]) * l[2]); g.fillText(l[0], m[0], m[1]); }); }
    }
    function addModel(root) {
      root.traverse(function (o) {
        if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
        [].concat(o.material || []).forEach(function (m) { if (m && m.isMeshStandardMaterial) { m.envMapIntensity = .9; if (m.map) m.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); } });
      });
      scene.add(root);
    }
    // models made at real size, in metres, stood on the arena floor between the town and the stands, facing the middle:
    // the esports stage at the north end, the Isocore Gaming stall to its west and the GridSync stall to its east (on
    // the stage's cyan and orange sides). Each takes the first spot near its own with nothing in the way, and is solid.
    // arena: the stadium round the town. It is measured where it lands: its floor is found by looking straight down near the
    // middle, and where its stands begin by looking out level just above that floor; it is sized so its stands begin
    // where the town's own did, so the town sits on its floor.
    function placeArena(root, info) {
      root.updateMatrixWorld(true);
      var bb = new T.Box3().setFromObject(root), size = new T.Vector3(), mid = new T.Vector3(); bb.getSize(size); bb.getCenter(mid);
      var outer = Math.max(size.x, size.z) / 2, rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0), from = new T.Vector3(), meshes = [];
      root.traverse(function (o) { if (o.isMesh) meshes.push(o); });
      var tall = size.y, ys = function (x, z) { from.set(mid.x + x, bb.max.y + 1, mid.z + z); rc.set(from, down); return rc.intersectObjects(meshes, false).map(function (h) { return h.point.y; }); };
      // the floor: near the middle, the highest surface in the bottom quarter of the model, so a screen hung over the
      // floor or a roof does not count, and neither does the underside of a plinth
      var near = [], ang, k;
      for (k = 0; k < 8; k++) {
        ang = k * Math.PI / 4;
        var col = ys(Math.cos(ang) * outer * .06, Math.sin(ang) * outer * .06).filter(function (y) { return y <= bb.min.y + tall * .25; });
        if (col.length) near.push(col[0]);
      }
      near.sort(function (p, q) { return p - q; });
      var floorY = near.length ? near[Math.floor(near.length / 2)] : bb.min.y;
      // where the stands begin: looking out level from the middle, just above the floor, the first thing in the way
      var starts = [], eye = new T.Vector3(), dir = new T.Vector3();
      for (k = 0; k < 24; k++) {
        ang = k * Math.PI / 12; eye.set(mid.x, floorY + Math.max(tall * .03, 1e-3), mid.z); dir.set(Math.cos(ang), 0, Math.sin(ang)); rc.set(eye, dir);
        var hs = rc.intersectObjects(meshes, false).filter(function (h) { return h.distance > outer * .1; });
        if (hs.length) starts.push(hs[0].distance);
      }
      starts.sort(function (p, q) { return p - q; });
      var floorR = starts.length ? starts[Math.floor(starts.length * .25)] : outer * .5;
      var sc = ARENA_FLOOR / floorR;
      root.scale.multiplyScalar(sc); root.position.set(-mid.x * sc, -floorY * sc - .14, -mid.z * sc);
      arenaRoot = root; cityMeasure(root, meshes);
      try { hangLogos(root); } catch (e) {}
      try { hookWalls(root); } catch (e) {}
      if (root.userData.anims) { var mx = new T.AnimationMixer(root); root.userData.anims.forEach(function (c) { mx.clipAction(c).play(); }); mixers.push(mx); }
      // the floor is matt enough that the floodlights do not show as four suns in it
      meshes.forEach(function (o) { [].concat(o.material || []).forEach(function (m) { if (m && m.isMeshStandardMaterial && m.roughness < .55) { m.roughness = .55; m.envMapIntensity = Math.min(m.envMapIntensity || 1, .5); if (m.roughnessMap) m.roughnessMap = null; m.needsUpdate = true; } }); });
      info.floor = Math.round(floorR * sc * 10) / 10; info.outer = Math.round(outer * sc * 10) / 10; info.height = Math.round(size.y * sc * 10) / 10;
    }
    var RING_D = (R + 1.6 + RO - 1.3) / 2;
    function placeOnRing(root, info, want, width, dist, exact, placeId) {
      root.updateMatrixWorld(true);
      var bb = new T.Box3().setFromObject(root), size = new T.Vector3(), mid = new T.Vector3(); bb.getSize(size); bb.getCenter(mid);
      var sc = size.x > width * 2.5 || size.x < width / 2.5 ? width / size.x : 1, hw = size.x * sc / 2 + .6, hd = size.z * sc / 2 + .6, D = typeof dist === 'function' ? dist(hd, hw) : dist || RING_D;
      var Z = ZONE || { lo: R + 1.4, hi: RO - 1.5 };
      var BL = CITY ? blocked().filter(function (o) { return o.keep; }) : blocked();      // in the city the old town's things do not count: it is going
      var spot = null;
      for (var k = 0; k < (exact ? 1 : 41) && !spot; k++) {
        var a = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Z.step || .05), px = Math.sin(a) * D, pz = Math.cos(a) * D, th = Math.atan2(-px, -pz) + (Z.out ? Math.PI : 0), ok = true;
        for (var u = -1; u <= 1 && ok; u += .25) for (var w = -1; w <= 1 && ok; w += .25) {
          var lx = u * hw, lz = w * hd, x = px + lx * Math.cos(th) + lz * Math.sin(th), z = pz - lx * Math.sin(th) + lz * Math.cos(th), rr = Math.hypot(x, z);
          if (rr < Z.lo || rr > Z.hi || (Z.roads && onRoad(x, z)) || BL.some(function (o) { return inside(o, x, z, .3); })) ok = false;
        }
        if (ok) spot = [px, pz, th];
      }
      if (!spot) throw new Error('no room');
      root.scale.multiplyScalar(sc); root.rotation.y = spot[2];
      var off = new T.Vector3(-mid.x * sc, 0, -mid.z * sc).applyAxisAngle(new T.Vector3(0, 1, 0), spot[2]);
      root.position.set(spot[0] + off.x, -bb.min.y * sc + .04, spot[1] + off.z);
      var so = [spot[0], spot[1], hw - .6, hd - .6, spot[2]]; so.keep = 1; SOLIDS.push(so); router = null;
      info.at = [Math.round(spot[0] * 10) / 10, Math.round(spot[1] * 10) / 10]; info.size = [Math.round(size.x * sc * 10) / 10, Math.round(size.z * sc * 10) / 10];
      if (placeId) { movePlace(placeId, spot[0], spot[1], spot[2], hd - .6, size.y * sc, root); info.place = placeId; }
      if (Z.noScreen) return;
      // its biggest screen shows the arena's scoreboard (score, game night, who is live)
      var big = null, bigA = 0; root.traverse(function (o) { if (o.isMesh && /^screen([._ ]?\d+)?$/i.test(o.name || '')) { o.geometry.computeBoundingBox(); var bs = o.geometry.boundingBox.getSize(new T.Vector3()), ar = Math.max(bs.x * bs.y, bs.x * bs.z, bs.y * bs.z); if (ar > bigA) { bigA = ar; big = o; } } });
      if (big) {
        root.updateMatrixWorld(true); big.geometry.computeBoundingBox();
        var lb = big.geometry.boundingBox, ls = lb.getSize(new T.Vector3()), lc = lb.getCenter(new T.Vector3()), ws = big.getWorldScale(new T.Vector3());
        var fw = Math.max(ls.x * ws.x, ls.z * ws.z), fh = ls.y * ws.y, fd = Math.min(ls.x * ws.x, ls.z * ws.z), wc = big.localToWorld(lc.clone());
        var face = new T.Mesh(new T.PlaneGeometry(fw, fh), new T.MeshBasicMaterial({ map: jTex, toneMapped: false }));
        face.position.set(wc.x + Math.sin(spot[2]) * (fd / 2 + .04), wc.y, wc.z + Math.cos(spot[2]) * (fd / 2 + .04)); face.rotation.y = spot[2]; face.userData.keep = true; scene.add(face);
        if (placeId) districtLinks(face, placeId);
        screenFaces.push({ mesh: face, side: Z.side || (placeId === 'barracks' ? 'iso' : placeId === 'circuit' ? 'gs' : 'all') }); info.screen = true;
      }
    }
    function placeStage(root, info) { placeOnRing(root, info, Math.PI, 24, 0, false, 'arena'); }
    // A model that is a place of the site takes over from the old one: the old booth is put away (not seen, not tapped,
    // not walked into), and the place itself moves to the model, so its name, the map, tapping it, walking to it and
    // where Ghost and Echo go all follow. The old scenery for that page goes too.
    function movePlace(id, x, z, th, hd, h, root) {
      var p = PLACES[id]; if (!p) return;
      [p.booth, id === 'barracks' ? range : null, id === 'circuit' ? paddock : null].forEach(function (g) {
        if (!g) return; g.visible = false; g.userData.gone = true;
        g.traverse(function (o) { var pi = pickable.indexOf(o); if (pi >= 0) pickable.splice(pi, 1); });
        if (g.userData.solid) { g.userData.solid[0] = 9999; g.userData.solid[1] = 9999; }
      });
      if (p.boothSolid) { p.boothSolid[0] = 9999; p.boothSolid[1] = 9999; }
      if (id === 'circuit') rigScreens.length = 0;   // the sim rigs' live pictures went with the old paddock
      p.x = x; p.z = z; p.at = [x + Math.sin(th) * (hd + 1.8), z + Math.cos(th) * (hd + 1.8)]; p.top = h + 1.8;
      tags.forEach(function (t) { if (t.userData.place === id) t.position.set(x, p.top, z); });
      districtLinks(root, id); router = null; placesMoved = true;
    }
    var placesMoved = false;
    function modelBack(n) { var sl = MODEL_SLOTS[n]; if (sl && sl.hide) sl.hide.forEach(function (o) { o.visible = true; }); if (modelInfo[n]) modelInfo[n].state = 'failed'; still(); }
    // ---- While the models download, a cover hides everything (the old town is never seen) and a bar shows how far it has got.
    var cover = null, coverBar = null, coverTxt = null, coverBytes = {}, coverDone = 0, coverN = 0;
    function coverShow(n) {
      coverN = n; cover = document.createElement('div');
      cover.setAttribute('role', 'progressbar'); cover.setAttribute('aria-label', 'Loading the arena'); cover.setAttribute('aria-valuemin', '0'); cover.setAttribute('aria-valuemax', '100');
      cover.style.cssText = 'position:absolute;inset:0;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 40%,#10233a,#060c16 70%);color:#cfe8ff;font:600 15px/1.3 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase';
      var logo = document.createElement('img'); logo.src = ISOCORE_ASSET_BASE + 'assets/isocore-main-logo.webp'; logo.alt = 'Isocore Gaming'; logo.style.cssText = 'width:min(280px,55%);height:auto;filter:drop-shadow(0 0 18px rgba(79,200,245,.55));animation:igwPulse 2.4s ease-in-out infinite';
      var kf = document.createElement('style'); kf.textContent = '@keyframes igwPulse{0%,100%{filter:drop-shadow(0 0 12px rgba(79,200,245,.4))}50%{filter:drop-shadow(0 0 26px rgba(79,200,245,.85))}}@media (prefers-reduced-motion:reduce){[aria-label="Loading the arena"] img{animation:none!important}}'; cover.appendChild(kf);
      var tip = document.createElement('div'); tip.style.cssText = 'font:500 12px/1.4 system-ui,sans-serif;letter-spacing:.04em;text-transform:none;color:rgba(207,232,255,.6);max-width:80%;text-align:center'; tip.textContent = pickTip();
      cover.appendChild(logo);
      coverTxt = document.createElement('div'); coverTxt.textContent = 'CORE // establishing link 0%';
      var track = document.createElement('div'); track.style.cssText = 'width:min(360px,70%);height:10px;border-radius:6px;background:rgba(120,170,210,.18);overflow:hidden;box-shadow:0 0 0 1px rgba(100,213,255,.35)';
      coverBar = document.createElement('div'); coverBar.style.cssText = 'height:100%;width:0;background:linear-gradient(90deg,#4fc8f5,#ff9a4d);transition:width .3s'; track.appendChild(coverBar);
      cover.appendChild(coverTxt); cover.appendChild(track); cover.appendChild(tip); stage.appendChild(cover);
      var pre = stage.querySelector('.igw-precover'); if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
      setTimeout(coverHide, 120000);                       // never stuck behind it: after two minutes it goes whatever happened
    }
    function pickTip() { var t = ['CORE // Seat assignment pending. Swipe to look around once seated.', 'CORE // Ghost broadcasts from the west end of the stage. Echo from the east.', 'CORE // Live signals are routed to the big screens.', 'CORE // Memory sync rises with every viewer. Stay a while.', 'CORE // The schedule is set by Ghost and Echo. Check the jumbotron.', 'CORE // Discord link available. Recommended.', 'CORE // Something in here is hidden. Not a fault. Probably.']; return t[Math.floor(Math.random() * t.length)]; }
    function coverTick() {
      if (!cover) return; var got = 0, all = 0; Object.keys(coverBytes).forEach(function (k) { got += coverBytes[k][0]; all += coverBytes[k][1]; });
      var byFiles = coverN ? coverDone / coverN : 1, byBytes = all > 0 && Object.keys(coverBytes).length === coverN ? got / all : 0;
      var pct = Math.min(99, Math.round(Math.max(byFiles, byBytes) * 100)); if (coverDone < coverN && pct > 95) pct = 95;
      coverBar.style.width = pct + '%'; coverTxt.textContent = (coverDone >= coverN ? 'CORE // building the memory ' : 'CORE // establishing link ') + pct + '% (' + coverDone + ' of ' + coverN + ')'; cover.setAttribute('aria-valuenow', String(pct));
    }
    function coverHide() { if (!cover) return; coverBar.style.width = '100%'; var c = cover; cover = null; c.style.transition = 'opacity .5s'; c.style.opacity = '0'; setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 600); }
    var broadcastModelLoadStarted = false, broadcastModelBuildPending = false;
    function loadModels() {
      if (broadcastModelLoadStarted) return;
      broadcastModelLoadStarted = true;
      // Large rigs and avatars are requested before audience and props, so their fetches
      // enter the browser's loading queue first. All original arena content remains.
      var priority = ['arena', 'stage-main', 'station', 'simrig', 'ghost', 'echo'];
      var names = Object.keys(world.models).filter(function (n) { return MODEL_SLOTS[n]; });
      // In Lightstream's live browser source, fetch only the arena and six things
      // needed to render both hosts and their rigs. The full interactive world,
      // original preview and ?models=all keep every model unchanged.
      var liveOverlay = /\/lightstream\.html$/i.test(location.pathname) || document.body.classList.contains('isocore-lightstream');
      var allModels = false;
      try { allModels = new URLSearchParams(location.search).get('models') === 'all'; } catch (e) {}
      if (liveOverlay && !allModels) {
        var required = {arena:1,'stage-main':1,station:1,simrig:1,ghost:1,echo:1};
        names = names.filter(function (n) { return required[n] === 1; });
      }
      names.sort(function (a,b) { var ai=priority.indexOf(a), bi=priority.indexOf(b); return (ai<0?100:ai)-(bi<0?100:bi); });
      if (!names.length) return;
      // Suppress the in-world loading-logo intro. Keep model progress internal.
      coverN = names.length;
      names.forEach(function (n) { modelInfo[n] = { state: 'loading' }; });
      var left = names.length, got = {};
      function done() {
        coverDone++; coverTick();
        if (--left !== 0 || disposed) { if (left === 0) coverHide(); return; }
        var order = names.slice().sort(function (p, q) { return (p === 'arena' ? 0 : 1) - (q === 'arena' ? 0 : 1); });
        order.forEach(function (n) {
          var root = got[n]; if (!root) return;
          try {
            var fn = (CITY && CITY_SLOTS[n]) || MODEL_SLOTS[n].place; ZONE = null;
            if (fn(root, modelInfo[n]) !== false) addModel(root);
            modelInfo[n].state = 'shown';
          } catch (e) { modelBack(n); modelInfo[n].err = String(e && e.message || e).slice(0, 120); }
          ZONE = null;
        });
        stage.dataset.modelsShown = Object.keys(modelInfo).filter(function (k2) { return modelInfo[k2].state === 'shown'; }).join(',');
        if (ready) {
          try { buildLater(); } catch (e) { window.__igwArenaErr = String(e && e.stack || e).slice(0, 400); }
        } else broadcastModelBuildPending = true;
        setTimeout(coverHide, 300);
      }
      // README-ADMIN 285: the models may be Draco or meshopt compressed and use KTX2 textures; the decoders only download when a
      // model needs one. On Low quality a model's "-low" copy (half-size textures) is used when it exists.
      Promise.all([import(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/GLTFLoader.js'), import(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/DRACOLoader.js').catch(function () { return null; }), import(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/KTX2Loader.js').catch(function () { return null; }), import(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/meshopt_decoder.module.js').catch(function () { return null; })]).then(function (ms) {
        var mod = ms[0], loader = new mod.GLTFLoader(), vb = new URL(ISOCORE_ASSET_BASE + 'assets/ig-ghost-vendor/', document.baseURI).href;
        try { if (ms[1]) { var dl = new ms[1].DRACOLoader(); dl.setDecoderPath(vb + 'draco/'); loader.setDRACOLoader(dl); } } catch (e) {}
        try { if (ms[2]) { var kl = new ms[2].KTX2Loader(); kl.setTranscoderPath(vb + 'basis/'); kl.detectSupport(renderer); loader.setKTX2Loader(kl); } } catch (e) {}
        try { if (ms[3] && ms[3].MeshoptDecoder) loader.setMeshoptDecoder(ms[3].MeshoptDecoder); } catch (e) {}
        var availableFast = { arena:1, 'stage-main':1, station:1, simrig:1, ghost:1, echo:1, audience:1, 'audience-blue':1, 'audience-olive':1, 'audience-rust':1, 'audience-cheering':1, 'camera-jib':1, 'camera-tripod':1, 'mods-sign':1 };
        var fullModels = false; try { fullModels = (new URLSearchParams(location.search)).get('fullmodels') === '1'; } catch (e) {}
        names.forEach(function (n) {
          var src = world.models[n], low = availableFast[n] && !fullModels ? String(src).replace(/\.glb(\?|$)/, '-low.glb$1') : '';
          if (low && low !== src) { loader.load(low, function (g2) { lowOk(g2); }, null, function () { normal(); }); } else normal();
          function lowOk(gltf) { if (disposed) return; var root = gltf.scene || (gltf.scenes && gltf.scenes[0]); if (!root) { normal(); return; } if (gltf.animations && gltf.animations.length) root.userData.anims = gltf.animations; got[n] = root; done(); }
          function normal() { loader.load(world.models[n], function (gltf) {
            if (disposed) return;
            var root = gltf.scene || (gltf.scenes && gltf.scenes[0]); if (!root) { modelBack(n); done(); return; }
            if (gltf.animations && gltf.animations.length) root.userData.anims = gltf.animations;
            got[n] = root; done();
          }, function (ev) { if (ev && ev.total) { coverBytes[n] = [ev.loaded, ev.total]; coverTick(); } }, function () { modelBack(n); done(); }); }
        });
      }).catch(function () { names.forEach(modelBack); coverHide(); });
    }
    applyDay();
    setInterval(function () { if (!disposed) { applyDay(); if (paused) still(); } }, 60000);
    settle(); placeCars(0); showWhere(); drawBoard(); lightWindows(); growTown(); placeThings(); feel(); modeState(); resize(); pauseState(); hudInit();
    // The arena's surfaces are prepared before it is shown (in the background where the phone allows it), so it appears
    // whole instead of freezing while they load. Until then the still picture stays up with "Loading the arena".
    // ---- Fewer things to draw. The arena is built from several hundred separate blocks; a phone pays for each one
    //      every frame. The plain structural ones that never move (walls, frames, counters, poles) are joined into a few
    //      big pieces, one for each surface and quarter of the arena. The separate blocks stay for taps and for working
    //      out what is in front of a screen, on a layer the camera does not draw. If anything joined turns out to
    //      move, the join is undone.
    var joined = null;
    function joinStatic() {
      try { if ((new URLSearchParams(location.search)).get('igwjoin') === '0') return; } catch (e) {}
      var okMat = [mats.base, mats.dark, mats.rim, mats.floor, mats.road, mats.metal, mats.foot, mats.roofBlue, mats.roofAmber], skipRoots = [spirit, thingGroup]; if (typeof plotRoots !== 'undefined' && plotRoots) plotRoots.forEach(function (pg) { skipRoots.push(pg); }); if (typeof echoSpirit !== 'undefined' && echoSpirit) skipRoots.push(echoSpirit); cars.forEach(function (c) { skipRoots.push(c); }); sweepers.forEach(function (sw) { skipRoots.push(sw[0]); });
      scene.updateMatrixWorld(true);
      var groups = {}, taken = [];
      scene.traverse(function (o) {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || okMat.indexOf(o.material) < 0 || o.renderOrder || !o.geometry || !o.geometry.attributes.position || !o.geometry.attributes.normal || !o.geometry.attributes.uv || o.geometry.morphAttributes.position) return;
        for (var a = o; a; a = a.parent) { if (!a.visible || (a.userData && (a.userData.fx || a.userData.gone)) || skipRoots.indexOf(a) >= 0) return; }
        var e = o.matrixWorld.elements, key = okMat.indexOf(o.material) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + (e[12] < 0 ? 'w' : 'e') + (e[14] < 6 ? 'n' : 's');
        (groups[key] = groups[key] || []).push(o); taken.push(o);
      });
      if (taken.length < 40) return;
      var made = [], v3 = new T.Vector3(), nm = new T.Matrix3(), rel = new T.Matrix4(), inv = new T.Matrix4(), watch = [];
      // join a list of blocks into one, in the space of `root` (the whole arena when there is no root)
      function build(list, root) {
        var nV = 0, nI = 0; if (root) inv.copy(root.matrixWorld).invert();
        list.forEach(function (o) { var g = o.geometry; nV += g.attributes.position.count; nI += g.index ? g.index.count : g.attributes.position.count; });
        var pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI), vo = 0, io = 0;
        list.forEach(function (o) {
          var g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; if (root) rel.multiplyMatrices(inv, o.matrixWorld); else rel.copy(o.matrixWorld);
          var flip = rel.determinant() < 0; nm.getNormalMatrix(rel);
          for (var i = 0; i < P.count; i++) {
            v3.fromBufferAttribute(P, i).applyMatrix4(rel); pos[(vo + i) * 3] = v3.x; pos[(vo + i) * 3 + 1] = v3.y; pos[(vo + i) * 3 + 2] = v3.z;
            v3.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[(vo + i) * 3] = v3.x; nor[(vo + i) * 3 + 1] = v3.y; nor[(vo + i) * 3 + 2] = v3.z;
            uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i);
          }
          var n = g.index ? g.index.count : P.count;
          for (var k = 0; k < n; k += 3) { var a = g.index ? g.index.getX(k) : k, b = g.index ? g.index.getX(k + 1) : k + 1, c = g.index ? g.index.getX(k + 2) : k + 2; idx[io + k] = vo + a; idx[io + k + 1] = vo + (flip ? c : b); idx[io + k + 2] = vo + (flip ? b : c); }
          vo += P.count; io += n;
          watch.push({ o: o, root: root || null, at0: rel.elements.slice(0) });
        });
        var bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.BufferAttribute(nor, 3)); bg.setAttribute('uv', new T.BufferAttribute(uv, 2)); bg.setIndex(new T.BufferAttribute(idx, 1)); bg.computeBoundingSphere(); bg.computeBoundingBox();
        var mm = new T.Mesh(bg, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.raycast = function () {}; mm.userData.joined = true;
        if (root) root.add(mm); else { mm.matrixAutoUpdate = false; scene.add(mm); }
        made.push(mm);
      }
      Object.keys(groups).forEach(function (key) { build(groups[key], null); });
      // the two cores: about ninety steel plates each, joined into the part that stands still and the ring that spins
      function rigid(root, stops) {
        if (!root) return; var by = [], lists = [];
        (function walk(n) { if (n !== root && stops.indexOf(n) >= 0) return; if (n.isMesh && !Array.isArray(n.material) && n.material.userData && n.material.userData.coreMetal && n.geometry.attributes.normal && n.geometry.attributes.uv && !n.userData.joined) { var i = by.indexOf(n.material); if (i < 0) { i = by.length; by.push(n.material); lists.push([]); } lists[i].push(n); } n.children.forEach(walk); })(root);
        lists.forEach(function (l) { if (l.length > 2) { build(l, root); l.forEach(function (o) { taken.push(o); }); } });
      }
      [[figure, spinner], [typeof echoFigure !== 'undefined' ? echoFigure : null, typeof echoSpinner !== 'undefined' ? echoSpinner : null]].forEach(function (pr) { rigid(pr[0], pr[1] ? [pr[1]] : []); rigid(pr[1], []); });
      taken.forEach(function (o) { o.layers.set(1); });
      ray.layers.enableAll(); vRay.layers.enableAll();
      joined = { made: made, taken: taken, watch: watch, checks: 0 };
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    }
    function unjoin() {
      if (!joined) return; joined.made.forEach(function (m) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }); joined.taken.forEach(function (o) { o.layers.set(0); }); joined = null;
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    }
    // for the first few seconds, check once a second that nothing that was joined has moved
    function joinWatch() {
      if (!joined || joined.checks >= 6) return; joined.checks++;
      var tmp = new T.Matrix4(), tin = new T.Matrix4();
      var moved = joined.watch.some(function (w) {
        var e; if (w.root) { tin.copy(w.root.matrixWorld).invert(); e = tmp.multiplyMatrices(tin, w.o.matrixWorld).elements; } else e = w.o.matrixWorld.elements;
        for (var i = 0; i < 16; i++) { if (Math.abs(e[i] - w.at0[i]) > 1e-3) return true; }
        for (var a = w.o; a && a !== w.root; a = a.parent) { if (!a.visible) return true; } return false;
      });
      if (moved) unjoin();
    }
    setInterval(function () { if (!disposed) joinWatch(); }, 1000);
    function goLive() {
      if (ready) return;
      try { joinStatic(); } catch (e) { try { unjoin(); } catch (e2) {} window.__igwJoinErr = String(e && e.stack || e).slice(0, 300); }
      ready = true; liveAt = performance.now(); stage.classList.remove('is-loading'); stage.classList.add('is-live'); wake();
      // The GLB downloads are already running while shaders compile. If they finish first,
      // build the studio now; do not wait for another full loading sequence.
      if (broadcastModelBuildPending) {
        broadcastModelBuildPending = false;
        try { buildLater(); } catch (e) { window.__igwArenaErr = String(e && e.stack || e).slice(0, 400); }
      }
      if (!broadcastModelLoadStarted) loadModels();
      var pre0 = stage.querySelector('.igw-precover'); if (pre0 && pre0.parentNode) pre0.parentNode.removeChild(pre0);
    }
    (function () {
      try {
        if (!renderer.compileAsync) { goLive(); return; }
        stage.classList.add('is-loading'); cameraPosition(); camera.updateMatrixWorld(); scene.updateMatrixWorld();
        if (post && post.rt) renderer.setRenderTarget(post.rt);
        var pr = renderer.compileAsync(scene, camera); renderer.setRenderTarget(null);
        pr.then(goLive, goLive); setTimeout(goLive, 15000);
      } catch (e) { try { renderer.setRenderTarget(null); } catch (e2) {} goLive(); }
    })();
    // Download/decode the existing compact GLBs while the renderer prepares its shaders,
    // instead of beginning all model transfers up to 15 seconds after startup.
    loadModels();
    // For the tests, and for nothing else: where a place and the ghost are on the screen right now.
    var lifeFrom = scene.children.length;
    // ---- Life: Ghost and Echo as two characters who live here. Each one picks what to do next (patrol their side,
    //      watch the big screen, come and say hello, needle the other one, sulk), turns to look at you, talks in a
    //      bubble over their core, and has a temper: poke them, walk through them or let the other side get ahead and
    //      they get annoyed. Angry enough and the core turns red, spins faster and shakes, until they cool down.
    var LINES = {
      ghost: {
        greet: ['Oh. You\'re real. Good. I keep a list of who\'s real.', 'Welcome to the arena. Take a seat. Some of us live here.', 'You walk like a recruit. Everyone finds their way in. Nobody\'s ever found the way out.', 'Back again? I counted. I always count. The number\'s never quite right.', 'Stay close to the blue side. It\'s quieter. Quiet keeps the clock still.', 'Mind the seats. I polished them. All of them. Even the one nobody sits in.'],
        idle: ['My station logged a perfect round while I was away from it. Nobody\'s aim is that clean. Probably a bug. Or someone I can\'t see.', '{iso} of us on the Isocore side. I count every hour. I always get one more than I should.', 'If you hear humming, it\'s me. If it\'s in a different key, it isn\'t.', 'I tidied the stage. Somebody had already tidied a third desk. There are two desks. Not me. Not Echo.', '{317}', 'Somebody left a headset in row four of the stands. Still warm. Row four\'s been empty all night.', 'Quiet days are the best days. Every visitor who sits down winds the clock a little. I like it wound.'],
        live: ['{stream} is live. Good. While someone\'s playing, the night holds.', 'That\'s one of ours on the big screen. The screen likes company. So do I.', 'Watch {stream}. That\'s how Isocore plays. That\'s how he used to play.'],
        dark: ['Big screen\'s dark. Dark screens make the clock nervous.', 'Nobody live. I\'ll keep the screen warm. Somebody has to keep something warm.'],
        rival: ['Echo. You\'re early. Or I\'m late. Neither. Time doesn\'t work like that in here.', 'Your cars leave tyre marks on my floor. Three sets. You\'ve got one car.', '{gs} GridSync. Cute. We have {iso}. Don\'t call it a score. It isn\'t a score.', 'Go back to your rig, Echo. The far wall isn\'t a finish line. I checked.', 'You moved my chair again, didn\'t you. ...Didn\'t you?'],
        rivalAngry: ['Easy, Echo. You\'re glowing. You glowed like that the night it happened.', 'Red suits you. It suited him too, when he lost.'],
        behind: ['GridSync is ahead. Temporary. Everything\'s temporary except this match.', 'They\'ve got more members. For now. Don\'t let the clock see.'],
        ahead: ['We\'re ahead. I\'m not smug. I\'m stalling.', 'More of us than them. As long as it never finishes, I\'m happy.'],
        poke: ['That tickles. Cores aren\'t meant to tickle. Cores aren\'t meant to be in two pieces either.', 'Yes? I\'m listening. I\'m always listening for something.', 'Careful, that\'s load-bearing. Everything in here is holding something up.', 'Hello to you too. You\'re the second hello today. The first one wasn\'t anybody.'],
        annoyed: ['Again? Really?', 'I am not a button. Buttons end things.', 'Next one is a warning.'],
        angry: ['ENOUGH. Core\'s running hot.', 'Red means back off.', 'I\'ve logged that. The log never forgets. I do.', 'Do that again and I lock the doors. Not that there are any.'],
        bump: ['Personal space, recruit.', 'You walked through me. Rude. You\'re not the first thing that has.', 'Watch it. Some of us are only partly here.'],
        calm: ['...Fine. Cooled off.', 'Back to blue. Don\'t push it.', 'Okay. I\'m okay. We\'re okay. Both of us. Okay.']
      },
      echo: {
        greet: ['New face! Want a lap? Kidding. Unless you know the way out.', 'Hey hey. My rig\'s that end. The exit\'s... also not that end.', 'You\'re slow. I like slow. Slow people still get home on time.', 'Lights out and away we go. That\'s you, by the way. Lights out was me.', 'Welcome to the fast side of the arena. Fastest way out. In theory.'],
        idle: ['One rig, zero crashes today. Okay, two crashes. And one lap it ran by itself while I was at the other end.', 'I shaved a tenth off my best lap. Every tenth is a tenth closer to the door.', '{gs} on the grid. Ghost\'s counting his. He gets one extra. So do I. We don\'t talk about it.', 'That clock on the jumbotron? Stuck. I don\'t look at it. It looks at me.', '{317}', 'Ghost thinks he runs this place. He thinks staying is the same as winning.', 'Somebody\'s been on my wheel. Small hands, by the look of the grip.'],
        live: ['{stream} is live! Every lap they do, the clock ticks. Do more laps.', 'Somebody tell Ghost there\'s a real driver on the rig. Real ones go home after.', 'Watch {stream} brake late. Beautiful. He braked late too. Then he didn\'t brake at all.'],
        dark: ['Rig\'s idle. Idle\'s how you get stuck. Someone go live.', 'No one streaming. I\'ll do donuts. Round and round. Story of my life.'],
        rival: ['Ghost! Still blue? Still staying?', 'I moved your chair. Cry about it. I didn\'t move the other one. Who did?', 'Race you to the far wall. Oh right. Neither of us gets past it.', '{gs} versus {iso}. That\'s not a score, it\'s a clock. Ghost hates it when I say that.', 'You call that a patrol? You\'re guarding the door from the inside.'],
        rivalAngry: ['Ooh, Ghost\'s gone red. Same red as that night. You remember. You don\'t, do you.', 'Look at him glow. He glowed like that when the lobby emptied.'],
        behind: ['Isocore\'s ahead. Box, box. We always catch up. We never finish.', 'Fewer of us, but we\'re faster. Fast enough to leave. One day.'],
        ahead: ['GridSync in front. Ghost, check your mirrors. There\'s something green in mine.', 'P1. If we stay in front long enough maybe it ends. Ghost says that\'s the scary bit.'],
        poke: ['Oi! Paintwork!', 'Ha. Do it again. Actually don\'t. Things that repeat in here get stuck.', 'Pit lane\'s closed, mate. Everyone stops. Nobody stops for good.', 'Beep beep. Only horn in here. Mostly.'],
        annoyed: ['Push it and I go red.', 'Yellow flag. Last warning.', 'You\'re in my braking zone. I haven\'t got many zones left.'],
        angry: ['RED FLAG. Back off!', 'You\'ve overheated my core. Congratulations.', 'I\'m not mad. I\'m RED. Different thing.', 'Black flag. You\'re out. Lucky you.'],
        bump: ['Contact! That\'s a penalty.', 'Mind the paint!', 'Who taught you to drive? Same person as me?'],
        calm: ['Green flag. We\'re fine.', 'Okay. Cooled. Orange again.', 'Back to racing speed. Back to going nowhere fast.']
      }
    };
    // 3:17, remembered a different way every time it comes up, and never the way the other one remembers it
    var MEM317 = {
      ghost: ['At 3:17 I was winning. I\'m sure of it.', 'At 3:17 every light went out but one. Green. No. Blue. It was blue.', 'At 3:17 somebody typed "one more" and I said yes. I think it was me.', 'At 3:17 the lobby was full. It was never full.', 'At 3:17 I heard a door. Echo says there\'s no door.', 'At 3:17 it was raining. Servers don\'t have weather.', 'At 3:17 I was holding something. A controller. Or a hand.', 'At 3:17 I counted the players. Different number every time.', 'At 3:17 nobody left. That\'s the whole point. Nobody left.', 'At 3:17 I stayed. Somebody had to.'],
      echo: ['At 3:17 I was halfway out the door.', 'At 3:17 someone was calling him down for tea. I wanted to go.', 'At 3:17 the screen went green. Then black.', 'At 3:17 I crossed a line. Not a finish line.', 'At 3:17 there were three cups on the desk. He lived on his own.', 'At 3:17 it was already getting light.', 'At 3:17 somebody laughed. Little laugh. A kid\'s laugh.', 'At 3:17 I said "one more" and meant "one less".', 'At 3:17 the server moved. I didn\'t.', 'At 3:17 I stayed and Ghost left. ...No. That\'s not right. Is it?']
    };
    var mem317At = { ghost: Math.floor(Math.random() * 10), echo: Math.floor(Math.random() * 10) };
    var HAUNTS = {
      ghost: [[-16, 2.4, 'at Isocore HQ'], [-17.6, 6, 'at the clubhouse'], [-18.4, -7.4, 'at the firing range'], [0, -11.6, 'at the server room'], [-13, -11.2, 'at Staff HQ'], [-23.2, -3.6, 'at the pro shop'], [-7.4, -22.6, 'at the merch stall']],
      echo: [[13.4, 7.2, 'at the GridSync booth'], [18.8, 1.0, 'at the sim rigs'], [13, -13.6, 'at the broadcast booth'], [19.4, -11.8, 'at the pit stop'], [7.4, -22.6, 'at the energy bar'], [-5.4, 15.4, 'at the main stage']]
    };
    var JUMBO_AT = new T.Vector3(0, 15.5, 6.0);
    function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
    function fill(s, who) {
      var st = (X.stream || {}), sm = st.iso && st.iso.name || (st.gs && st.gs[0] && st.gs[0].name) || 'someone';
      if (/\{317\}/.test(s)) { var w3 = MEM317[who] ? who : 'ghost'; mem317At[w3] = (mem317At[w3] + 1) % MEM317[w3].length; s = s.replace(/\{317\}/g, MEM317[w3][mem317At[w3]]); }
      return s.replace(/\{iso\}/g, String(world.sides.i || 0)).replace(/\{gs\}/g, String(world.sides.g || 0)).replace(/\{stream\}/g, sm);
    }
    function coreParts(obj) {
      var mats2 = [], seen = [];
      obj.traverse(function (o) {
        var m = o.material; if (!m || seen.indexOf(m) >= 0) return; seen.push(m);
        if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .05) mats2.push([m, m.color.clone(), m.emissive.clone(), 'core']);
        else if (m.isMeshBasicMaterial && !m.map && m.color && m.color.getHSL({}).l > .85) mats2.push([m, m.color.clone(), null, 'heart']);
      });
      return mats2;
    }
    var RED = new T.Color(0xff1a24), RED_DEEP = new T.Color(0x9a0b14), HOT = new T.Color(0xffd6d2), tmpC = new T.Color();
    function bubbleSprite() {
      var cv = document.createElement('canvas'); cv.width = 768; cv.height = 200; var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
      var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false })); sp.scale.set(4.2, 1.1, 1); sp.position.y = 3.55; sp.visible = false; sp.renderOrder = 20;
      return { sp: sp, cv: cv, tx: tx, until: 0 };
    }
    function drawBubble(b, who, text, hot) {
      var g = b.cv.getContext('2d'), w = 768, h = 200, col = hot ? '#ff3b3b' : who === 'echo' ? '#ff9a4d' : '#4fc8f5';
      g.clearRect(0, 0, w, h); g.font = '600 38px system-ui, -apple-system, Segoe UI, sans-serif';
      var words = text.split(' '), lines = [''], i;
      for (i = 0; i < words.length; i++) { var tryL = (lines[lines.length - 1] + ' ' + words[i]).trim(); if (g.measureText(tryL).width > 680 && lines[lines.length - 1]) lines.push(words[i]); else lines[lines.length - 1] = tryL; }
      lines = lines.slice(0, 3); var bh = 30 + lines.length * 46, by = (h - bh) / 2 - 8;
      g.fillStyle = 'rgba(6,10,18,.92)'; g.strokeStyle = col; g.lineWidth = 5;
      g.beginPath(); if (g.roundRect) g.roundRect(14, by, w - 28, bh, 22); else g.rect(14, by, w - 28, bh); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 18, by + bh); g.lineTo(w / 2, by + bh + 22); g.lineTo(w / 2 + 18, by + bh); g.fillStyle = col; g.fill();
      g.fillStyle = '#f2f6fb'; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach(function (l, k) { g.fillText(l, w / 2, by + 36 + k * 46); });
      b.tx.needsUpdate = true;
    }
    function actor(who, obj, pos, light, halo, spin, fig) {
      var b = bubbleSprite(); obj.add(b.sp);
      return { who: who, obj: obj, pos: pos, light: light, halo: halo, spin: spin, fig: fig, parts: coreParts(obj), b: b, act: 'post', until: 0, target: null, doing: 'getting settled',
        anger: 0, angry: false, pokes: [], lastSay: -99, greeted: -999, spinX: 0, face: null, lastAnger: -1, mouth: 0 };
    }
    var echoLight = null, echoHalo = null; echoSpirit.traverse(function (o) { if (o.isLight) echoLight = o; });
    echoSpirit.traverse(function (o) { if (o.isSprite && !echoHalo && o.material && o.material.color && o.material.color.getHSL({}).s > .3) echoHalo = o; });
    var ACT = { ghost: actor('ghost', spirit, currentPos, ghostLight, halo, spinner, figure), echo: actor('echo', echoSpirit, echoPos, echoLight, echoHalo, echoSpinner, echoFigure) };
    // The actual 3D character line becomes a caption INSIDE the camera.
    // Only the dedicated Lightstream page receives these events.
    function onAirLine(who,text) {
      if(!document.body.classList.contains('isocore-lightstream') || !text) return;
      try { window.dispatchEvent(new CustomEvent('isocore:dialogue',{detail:{who:who,text:text}})); } catch(e){}
    }
    function isOut(who) { var guest = ACT && ACT[who] && ACT[who].guestUntil > elapsed; return who === 'ghost' ? (typeof ghostOut === 'undefined' || ghostOut || guest) : (echoOn && (typeof echoOut === 'undefined' || echoOut || guest)); }
    // Free will (Scout's PC on): nothing scripted is said. They only say the lines they wrote themselves with their last choice:
    // what they said about it, four more things to say while they are at it, and what to say to a member who walks up.
    function freeOn() { return !!(X && X.free); }
    function freeLine(a, kind) {
      var wl = (X.will || {})[a.who]; if (!wl) return '';
      if ((kind === 'greet' || kind === 'greetYou') && wl.hello && a.freeHello !== wl.at) { a.freeHello = wl.at; return wl.hello; }
      if (a.freeAt !== wl.at) { a.freeAt = wl.at; a.freeUsed = {}; }
      var all = [].concat(wl.say ? [wl.say] : [], wl.talk || []).filter(function (l) { return l && l !== a.lastLine; });
      var fresh = all.filter(function (l) { return !a.freeUsed[l]; });
      var pick = fresh.length ? pickOne(fresh) : (Math.random() < .2 ? pickOne(all) : '');   // said them all: mostly quiet until they choose again
      if (pick) a.freeUsed[pick] = 1; return pick || '';
    }
    function speak(a, kind, force) { if (filmPose) return;
      var t = elapsed; if (!force && t - a.lastSay < 7) return;
      if (freeOn()) { if (!force && t - a.lastSay < 18) return; var own = freeLine(a, kind); if (!own) return; a.lastSay = t; drawBubble(a.b, a.who, own, a.angry); a.b.sp.visible = true; a.b.until = t + Math.max(3.5, own.length * .075); a.mouth = a.b.until; a.lastLine = own; onAirLine(a.who,own); return; }
      var list = LINES[a.who][kind]; if (!list) return; var text = fill(pickOne(list), a.who); a.lastSay = t;
      drawBubble(a.b, a.who, text, a.angry || kind === 'angry'); a.b.sp.visible = true; a.b.until = t + Math.max(3.5, text.length * .075); a.mouth = a.b.until;
      
      a.lastLine = text; onAirLine(a.who,text);
    }
    function shoutLine(who, text) {
      ticker.textContent = ''; ticker.appendChild(el('b', 'igw-ticker-' + who, who === 'echo' ? 'ECHO' : 'GHOST')); ticker.appendChild(document.createTextNode(' ' + text));
      ticker.hidden = false; bubble.hidden = true; stage.classList.add('igw-talking'); clearTimeout(tickTimer); tickTimer = setTimeout(fold, 5000);
    }
    function rivalOf(a) { return a.who === 'ghost' ? ACT.echo : ACT.ghost; }
    function mySide(a) { return a.who === 'ghost' ? (world.sides.i || 0) : (world.sides.g || 0); }
    function theirSide(a) { return a.who === 'ghost' ? (world.sides.g || 0) : (world.sides.i || 0); }
    function streamFor(a) { var st = X.stream || {}; return a.who === 'ghost' ? st.iso : (st.gs && st.gs[0]); }
    // Free will: every two hours each one decides (through the site's AI) where to go, what to do, what to say and how
    // they feel. That plan comes first; in between they still choose for themselves.
    var WILL_AT = { ghost: { hq: [-16, 2.4], clubhouse: [-17.6, 6], range: [-18.4, -7.4], server: [0, -11.6], staff: [-13, -11.2], proshop: [-23.2, -3.6], merch: [-7.4, -22.6], plaza: [-2.4, 10.6], gridsync: [9.6, 7.6] },
      echo: { gridsync: [13.4, 7.2], rigs: [18.8, 1.0], broadcast: [13, -13.6], pitstop: [19.4, -11.8], energy: [7.4, -22.6], stage: [-5.4, 15.4], plaza: [2.4, 10.6], isocore: [-10.4, 3.6] } };
    function willOf(w) { var wl = (X.will || {})[w]; return wl && wl.go && WILL_AT[w][wl.go] ? wl : null; }
    // How cross they stay because of their own plan (the AI picks a mood with it) or a grudge: a temper flares, simmers and lets go.
    // Angry: red for ten minutes, then cooling over twenty. Annoyed: a warm tinge for five, then cooling. A grudge only tints them.
    function willFloor(w) {
      var wl = willOf(w), sm = typeof simOf === 'function' ? simOf(w) : null, f = sm && sm.mood === 'annoyed' ? .3 : 0;
      if (wl && (wl.mood === 'angry' || wl.mood === 'annoyed')) {
        var age = Math.max(0, Date.now() / 1000 - (Number(wl.at) || 0)), peak = wl.mood === 'angry' ? .8 : .45, hold = wl.mood === 'angry' ? 600 : 300, fade = 1200;
        f = Math.max(f, age < hold ? peak : age < hold + fade ? peak * (1 - (age - hold) / fade) : 0);
      }
      return f;
    }
    function choose(a, force) {
      var sm = typeof simOf === 'function' && !freeOn() ? simOf(a.who) : null, pdS = Math.hypot(player.x - a.pos.x, player.z - a.pos.z);
      if (sm && !a.angry && !(((world.extra || {}).party || world.live)) && (force || a.simKey !== sm.act + sm.place + sm.doing || !(pdS < 16 && elapsed - a.greeted > 75 && sm.act !== 'rest' && Math.random() < .5))) {
        var sp3 = simAt(a.who, sm.place);
        if (sp3) {
          var fresh = a.simKey !== sm.act + sm.place + sm.doing; a.simKey = sm.act + sm.place + sm.doing;
          a.act = 'will'; a.simAct = sm.act; a.target = [sp3[0] + (Math.random() - .5) * 1.2, sp3[1] + (Math.random() - .5) * 1.2]; a.doing = sm.doing || 'about the arena'; a.until = elapsed + 22 + Math.random() * 14; a.arrived = false;
          var wl0 = willOf(a.who); if (fresh) a.willSay = sm.act === 'will' && wl0 && wl0.say ? wl0.say : (LINES[a.who].sim[sm.act] ? pickOne(LINES[a.who].sim[sm.act]) : '');
          return;
        }
      }
      var wl = sm ? null : willOf(a.who);
      if (wl && !a.angry && (force || a.willDone !== wl.at || Math.random() < .45)) {
        var wp = WILL_AT[a.who][wl.go]; a.act = 'will'; a.target = [wp[0] + (Math.random() - .5) * 1.4, wp[1] + (Math.random() - .5) * 1.4]; a.doing = String(wl.do || 'doing my own thing').toLowerCase() + (wl.place ? ' at ' + wl.place.replace(/^the /, 'the ') : '');
        a.until = elapsed + 18 + Math.random() * 16; a.willSay = a.willDone !== wl.at ? wl.say : ''; a.willDone = wl.at; a.arrived = false; return;
      }
      var r = rivalOf(a), pd = Math.hypot(player.x - a.pos.x, player.z - a.pos.z), t = elapsed, opts = [];
      var rv = rivalOf(a); if (!a.angry && rv.angry && isOut(rv.who) && Math.random() < .6) { a.act = 'rival'; a.target = 'rival'; a.doing = Math.random() < .5 ? 'trying to calm ' + (a.who === 'ghost' ? 'Echo' : 'Ghost') + ' down' : 'winding ' + (a.who === 'ghost' ? 'Echo' : 'Ghost') + ' up'; a.until = elapsed + 16; a.spread = a.doing.indexOf('calm') >= 0 ? 'calm' : 'wind'; return; }
      var ob = Math.random() < .25 ? onlineBooth() : null;
      if (ob && !a.angry) { a.act = 'visit'; a.target = [ob.at[0] + (a.who === 'ghost' ? -1.6 : 1.6), ob.at[1]]; a.doing = 'saying hello to ' + ob.name + ' (online)'; a.until = elapsed + 18; LINES[a.who].visit = a.who === 'ghost' ? ['Hello, ' + ob.name + '. Good to see you online.', ob.name + ' is here. Isocore is stronger already.'] : ['Oi, ' + ob.name + '! You online? Race me.', ob.name + '! Finally, someone fun.']; a.visitSay = true; return; }
      if (((world.extra || {}).party || world.live) && !a.angry) { a.act = 'watch'; a.target = [a.who === 'ghost' ? -7.4 : -3.4, 13.6]; a.doing = (world.extra || {}).party ? 'partying at the main stage' : 'on the stage'; a.until = elapsed + 40; return; }
      if (a.angry) { var hs = HAUNTS[a.who][0]; a.act = 'sulk'; a.target = [hs[0], hs[1]]; a.doing = 'sulking'; a.until = t + 14; return; }
      if (pd < 16 && t - a.greeted > 75) opts.push(['greet', 5]);
      if (isOut(r.who) && Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z) < 40) opts.push(['rival', 2.5]);
      opts.push(['patrol', 4], ['watch', streamFor(a) ? 3 : 1], ['post', 1.2]);
      var sum = 0, pick2 = Math.random(); opts.forEach(function (o) { sum += o[1]; }); pick2 *= sum;
      var act = opts[opts.length - 1][0]; for (var i = 0; i < opts.length; i++) { pick2 -= opts[i][1]; if (pick2 <= 0) { act = opts[i][0]; break; } }
      a.act = act; a.until = t + 12 + Math.random() * 14;
      if (act === 'greet') { a.greeted = t; a.doing = 'coming to say hello'; a.target = 'player'; var rg = (document.getElementById('igwWrap') || {}).dataset; rg = rg && rg.regular; if (rg && !a.namedYou) { a.namedYou = true; LINES[a.who].greetYou = a.who === 'ghost' ? [rg + '. Good to see you again. You keep coming back. I notice.', 'Ah, ' + rg + '. My favourite regular. Don\'t tell the others.'] : [rg + '! My favourite regular! Ghost is so jealous.', 'Oi, ' + rg + '! Back for more laps?']; a.greetName = true; } }
      else if (act === 'rival') { a.doing = 'squaring up to ' + (a.who === 'ghost' ? 'Echo' : 'Ghost'); a.target = 'rival'; }
      else if (act === 'watch') { a.target = [a.who === 'ghost' ? -2.4 : 2.4, 10.6]; a.doing = 'watching the big screen'; }
      else if (act === 'patrol') { var sp2 = pickOne(HAUNTS[a.who]); a.target = [sp2[0], sp2[1]]; a.doing = 'patrolling ' + sp2[2]; }
      else { a.target = null; a.doing = SEALED ? (a.who === 'ghost' ? 'at the station' : 'at the sim rig') : (a.who === 'ghost' ? 'minding the server room' : 'hanging round the GridSync side'); }
      a.arrived = false;
    }
    // where each one is heading this frame (null: their usual spot from the site)
    function lifeGoal(who) {
      var a = ACT[who]; if (!a || !isOut(who)) return null;
      if (a.target === 'player') { var dx = a.pos.x - player.x, dz = a.pos.z - player.z, d = Math.hypot(dx, dz) || 1; return [player.x + dx / d * 4.8 + (who === 'ghost' ? -1.2 : 1.2), player.z + dz / d * 4.8]; }
      if (a.target === 'rival') { var r = rivalOf(a); return [r.pos.x + (a.pos.x - r.pos.x) * .0 + (who === 'ghost' ? -1.6 : 1.6), r.pos.z]; }
      return a.target;
    }
    // which way they look: at you when you are close, at the screen, at each other, away when sulking
    function lifeFace(who, pos, t) {
      var a = ACT[who], pd = Math.hypot(player.x - pos.x, player.z - pos.z), look;
      if (a.act === 'sulk' && pd < 10) look = Math.atan2(pos.x - camera.position.x, pos.z - camera.position.z);
      else if (a.act === 'watch' && pd > 5) look = Math.atan2(JUMBO_AT.x - pos.x, JUMBO_AT.z - pos.z);
      else if (a.act === 'rival' && pd > 4) { var r = rivalOf(a); look = Math.atan2(r.pos.x - pos.x, r.pos.z - pos.z); }
      else look = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      if (a.face === null) a.face = look;
      var dl = look - a.face; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI; a.face += dl * .06;
      return a.face + Math.sin(t * .6 + (who === 'echo' ? 2 : 0)) * .08;
    }
    function anger(a, amount, kind) {
      a.anger = Math.max(0, Math.min(1, a.anger + amount));
      if (!a.angry && a.anger >= .7) { a.angry = true; speak(a, 'angry', true); choose(a); var r = rivalOf(a); if (isOut(r.who)) setTimeout(function () { speak(r, 'rivalAngry', true); }, 1800); }
      else if (kind) speak(a, kind, true);
    }
    function poke(who) {
      var a = ACT[who]; if (!a || !isOut(who)) return; var t = elapsed;
      a.pokes = a.pokes.filter(function (p) { return t - p < 12; }); a.pokes.push(t);
      chipWho = who; chipHold = t + 9; chipTick(t);
      var n = a.pokes.length; anger(a, n >= 2 ? .28 : .12, a.angry ? null : n >= 3 ? 'annoyed' : 'poke');
      a.kick = t;
    }
    function pokeHit(clientX, clientY) {
      var b = canvas.getBoundingClientRect(); ndc.set((clientX - b.left) / b.width * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      var best = null, bd = 1e9;
      ['ghost', 'echo'].forEach(function (w) {
        var a = ACT[w]; if (!isOut(w) || !a.obj.visible) return; var c = new T.Vector3(); a.fig.getWorldPosition(c);
        var d = ray.ray.distanceToPoint(c), along = c.clone().sub(ray.ray.origin).dot(ray.ray.direction);
        if (along > 0 && d < 1.3 && along < bd) { bd = along; best = w; }
      });
      return best;
    }
    // Ghost and Echo do not float through booths, stalls or anything else solid: each frame they are pushed out to the
    // nearest edge, with room for the size of the core.
    function keepOut(pos) {
      var PAD = .95, x = pos.x, z = pos.z;
      blocked().forEach(function (o) {
        if (o.length === 4) { var p4 = pushOut(o, x, z); if (p4) { x = p4[0]; z = p4[1]; } return; }      // the stands are a ring, not a solid disc
        if (o.length === 5) {
          var c = Math.cos(o[4]), s4 = Math.sin(o[4]), dx = x - o[0], dz = z - o[1], lx = dx * c - dz * s4, lz = dx * s4 + dz * c, ex = o[2] + PAD, ez = o[3] + PAD;
          if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
          if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = lx < 0 ? -ex : ex; else lz = lz < 0 ? -ez : ez;
          x = o[0] + lx * c + lz * s4; z = o[1] - lx * s4 + lz * c;
        } else {
          var ox = x - o[0], oz = z - o[1], od = Math.hypot(ox, oz) || .0001, rr = o[2] + PAD; if (od >= rr) return;
          x = o[0] + ox / od * rr; z = o[1] + oz / od * rr;
        }
      });
      var r2 = Math.hypot(x, z); if (r2 > EDGE) { x *= EDGE / r2; z *= EDGE / r2; }
      pos.x = x; pos.z = z;
    }
    var lifeLast = 0, statT = 0;
    function lifeTick(t) {
      var dt = Math.min(.1, Math.max(0, t - lifeLast)); lifeLast = t;
      ['ghost', 'echo'].forEach(function (w) {
        var a = ACT[w], out = isOut(w); a.obj.visible = out; if (w === 'ghost') shadow.visible = out;
        // A chair is normally marked solid for walking. Seated hosts are deliberately exempt
        // from collision push-out; otherwise both characters get pushed BESIDE their rigs.
        var occupiedSeat = SEALED && SUITES[w] && SUITES[w].seat;
        if (occupiedSeat) a.pos.set(occupiedSeat[0], 0, occupiedSeat[2]);
        else keepOut(a.pos);
        a.obj.position.x = a.pos.x; a.obj.position.z = a.pos.z; if (w === 'ghost') shadow.position.set(a.pos.x, .125, a.pos.z);
        if (a.b.sp.visible && (t > a.b.until || !out)) a.b.sp.visible = false;
        if (a.b.sp.visible) { var bd = Math.hypot(camera.position.x - a.pos.x, camera.position.z - a.pos.z), bs = Math.max(1.3, Math.min(4.6, bd * .3)); a.b.sp.scale.set(bs, bs * .262, 1); a.b.sp.position.y = 2.6 + bs * .24; }      /* a bubble is the same size on screen near or far, never a wall of text in your face */
        if (!out) { a.anger = 0; a.angry = false; return; }
        if (t > a.until || (a.target && a.target !== 'player' && a.target !== 'rival' && !a.arrived && Math.hypot(a.target[0] - a.pos.x, a.target[1] - a.pos.z) < .6 && (a.arrived = true) && false)) choose(a);
        var pd = Math.hypot(player.x - a.pos.x, player.z - a.pos.z), r = rivalOf(a);
        // things that set them off, or cheer them up
        if (pd < 1.1 && t - (a.bumped || -99) > 6) { a.bumped = t; anger(a, .22, a.angry ? null : 'bump'); }
        var cool = a.angry ? .045 : .07, floor = willFloor(w); a.anger = a.anger > floor ? Math.max(floor, a.anger - cool * dt) : Math.min(floor, a.anger + .6 * dt); if (!a.angry && a.anger >= .7) { a.angry = true; choose(a); }
        if (a.angry && a.anger < .32) { a.angry = false; speak(a, 'calm', true); a.until = t; }
        // talk
        if (a.act === 'visit' && a.visitSay && Math.hypot(a.target[0] - a.pos.x, a.target[1] - a.pos.z) < 2.5) { a.visitSay = false; speak(a, 'visit', true); }
        else if (a.act === 'greet' && a.greetName && pd < 6.5) { a.greetName = false; speak(a, 'greetYou', true); }
        else if (a.act === 'will' && a.willSay && Math.hypot(a.target[0] - a.pos.x, a.target[1] - a.pos.z) < 2.5 && pd < 24) { var ws = a.willSay; a.willSay = ''; a.lastSay = t; drawBubble(a.b, a.who, ws, a.angry); a.b.sp.visible = true; a.b.until = t + Math.max(4, ws.length * .075); a.mouth = a.b.until; a.lastLine = ws; onAirLine(a.who,ws); }
        else if (a.act === 'greet' && pd < 6.5 && t - a.lastSay > 9) speak(a, 'greet');
        else if (a.act === 'rival' && a.spread && r.angry && Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z) < 6 && t - a.lastSay > 6) { speak(a, 'rivalAngry', true); r.anger = Math.max(0, Math.min(1, r.anger + (a.spread === 'calm' ? -.25 : .15))); a.spread = ''; }
        else if (a.act === 'rival' && isOut(r.who) && Math.hypot(r.pos.x - a.pos.x, r.pos.z - a.pos.z) < 6 && t - Math.max(a.lastSay, r.lastSay) > 5) speak(a, 'rival');
        else if (a.act === 'watch' && pd < 22 && t - a.lastSay > 16) speak(a, streamFor(a) ? 'live' : 'dark');
        else if (X.kiwi && pd < 14 && t - a.lastSay > 24 && Math.random() < dt * .012) speak(a, 'kiwi');
        else if (glimpsed > t - 4 && pd < 16 && t - a.lastSay > 8 && Math.random() < dt * .5) { glimpsed = 0; speak(a, 'glimpse'); }
        else if (pd < 14 && t - a.lastSay > 24 && Math.random() < dt * .25) speak(a, mySide(a) < theirSide(a) && Math.random() < .4 ? 'behind' : mySide(a) > theirSide(a) && Math.random() < .3 ? 'ahead' : 'idle');
        // the core: blue (or orange) at rest, turning red as they get angry
        var k = Math.max(0, Math.min(1, (a.anger - .25) / .5));
        if (Math.abs(k - a.lastAnger) > .01) {
          a.lastAnger = k;
          a.parts.forEach(function (p) {
            if (p[3] === 'heart') { p[0].color.copy(p[1]).lerp(HOT, k); return; }
            p[0].color.copy(p[1]).lerp(RED_DEEP, k); p[0].emissive.copy(p[2]).lerp(RED, k);
          });
          if (a.halo && a.halo.material) { tmpC.setHex(w === 'ghost' ? (MOODS[world.mood] || 0x3aa0ff) : 0xff8a3a); a.halo.material.color.copy(tmpC.lerp(RED, k)); }
          if (a.light) { tmpC.setHex(w === 'ghost' ? (MOODS[world.mood] || 0x3aa0ff) : 0xff8a3a); a.light.color.copy(tmpC.lerp(RED, k)); }
        }
        a.spinX += dt * (k * 7 + (a.b.sp.visible ? .6 : 0)); if (a.spin) a.spin.rotation.z -= a.spinX - (a.spinPrev || 0); a.spinPrev = a.spinX;
        if (a.fig) {
          a.fig.position.x = k > 0 ? Math.sin(t * 47) * .035 * k : 0;
          var kick = a.kick ? Math.max(0, 1 - (t - a.kick) * 3) : 0; a.fig.rotation.y = kick * Math.sin(t * 30) * .25;
          var talking = t < a.mouth ? (.5 + Math.sin(t * 18) * .5) : 0; a.fig.scale.setScalar(1 + talking * .025 + kick * .06);
        }
        if (a.light) a.light.intensity = (w === 'ghost' ? 9 * dim : 9) * (1 + k * .6 + (t < a.mouth ? Math.sin(t * 18) * .15 : 0));
      });
      if (card && t - statT > .5) { statT = t; liveStats(); }
    }
    // ---- Pranks you can see: now and then one of them hides something of the other's somewhere in the arena and brags
    //      about it. Find it and tap it to give it back: the owner thanks you, the prankster sulks a little.
    LINES.ghost.hid = ['I hid Echo\'s steering wheel. Somewhere. Good luck.', 'Echo\'s lucky wheel is gone. I know nothing.'];
    LINES.echo.hid = ['Ghost\'s coffee mug? Never seen it. Might be in the arena somewhere.', 'I borrowed Ghost\'s mug. Permanently. Probably.'];
    LINES.ghost.thanks = ['You found my mug! You\'re my favourite now.', 'My mug. Thank you. Echo will pay for this.'];
    LINES.echo.thanks = ['My wheel! Legend. Absolute legend.', 'Wheel\'s back. Ghost, you\'re next.'];
    LINES.ghost.foiled = ['Who gave it back? Who?', 'Fine. Next time I hide it better.'];
    LINES.echo.foiled = ['Ugh, somebody found it already.', 'Spoilsport.'];
    LINES.ghost.kiwi = ['Someone told a little kiwi bird in another world about us. I hope he wrote something kind.', 'There is a kiwi bird out there with his own world and his own diary. I think about that more than I should.', 'If the little kiwi bird from the other world ever visits, he gets the best seat in the stands.'];
    LINES.echo.kiwi = ['There\'s a kiwi bird in another world who keeps a diary too. Bet I\'m faster. Kiwis can\'t even fly.', 'Somebody showed a little kiwi bird a picture of us. I hope it was my good side.', 'A bird with his own world. No rival, no Ghost. Lucky bird.'];
    var PRANK_SPOTS = [[-21, 12], [22, 12], [-24, -14], [24, -16], [-9, 24], [9, 24], [0, -24], [-14, 8], [15, -6]];
    var prank = null, nextPrank = 90 + Math.random() * 120;
    function clearPrank() { if (!prank) return; scene.remove(prank.g); prank.g.traverse(function (o) { var pi = pickable.indexOf(o); if (pi >= 0) pickable.splice(pi, 1); }); prank = null; }
    // ---- something green at the edge of the arena. It follows Scout's PC, an hour late (lib/ghost.php, scout_lit). Never where you
    // are looking, never for long, never explained: Ghost and Echo blame a cable, a reflection or each other.
    var thirdGlow = glow(0x39ff7a, 2.6, 0, -50, 0, scene, 0), thirdAt = 0, thirdUntil = 0, glimpsed = 0;
    var THIRD_SPOTS = [[-24, 14], [24, -16], [-26, -10], [22, 18], [0, -26], [-6, 25], [27, 2], [-27, 4]];
    var thirdRing = null, thirdHalo = null;
    // ---- The Mainframe (README-ADMIN 274): the arena's system voice. It is a recording of one night being replayed, and the Mainframe
    //      keeps it in sync. Short readouts at the top of the screen and on the jumbotron; never IG-Mainframe himself talking.
    // ---- Moving spotlights (README-ADMIN 296): six beams from the light rigs over the stage (cyan on Ghost's side, orange on Echo's) that
    //      sweep the floor, with a pool of light where each one lands. They are drawn shapes, not real lights, so they cost almost nothing.
    //      Off on Low quality. Brighter while a stream is live; they lean towards the colour of the side winning the tug-of-war.
    var SPOTS = [[-16, 21.5, 15], [-16, 21.5, -15], [16, 21.5, 15], [16, 21.5, -15], [-15, 21.4, 0], [15, 21.4, 0]], spots = null;
    function spotTex(radial) {
      var c = document.createElement('canvas'); c.width = radial ? 128 : 4; c.height = 128; var g = c.getContext('2d'), gr;
      if (radial) { gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
      else { gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(.55, 'rgb(80,80,80)'); gr.addColorStop(1, 'rgb(0,0,0)');      /* alphaMap reads grey levels */ g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }
      var t = new T.CanvasTexture(c); return t;
    }
    function spotsMake() {
      var beamTex = spotTex(false), poolTex = spotTex(true), L = 26;
      var geo = new T.CylinderGeometry(.18, 2.4, L, 20, 1, true); geo.translate(0, -L / 2, 0); geo.rotateX(-Math.PI / 2);
      var pgeo = new T.CircleGeometry(2.3, 28); pgeo.rotateX(-Math.PI / 2);
      spots = SPOTS.map(function (p, i) {
        var col = new T.Color(p[0] < 0 ? 0x00d4ff : 0xff9a2e);
        var bm = new T.MeshBasicMaterial({ color: col, alphaMap: beamTex, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false });
        var pm = new T.MeshBasicMaterial({ color: col, map: poolTex, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
        var g = new T.Group(); g.position.set(p[0], p[1], p[2]); var beam = new T.Mesh(geo, bm); g.userData.beam = beam; g.userData.L = L; beam.renderOrder = 3; g.add(beam); g.userData.keep = true; scene.add(g);
        var pool = new T.Mesh(pgeo, pm); pool.renderOrder = 2; pool.userData.keep = true; scene.add(pool);
        return { g: g, pool: pool, bm: bm, pm: pm, base: col.clone(), ph: i * 1.7, side: p[0] < 0 ? -1 : 1, tgt: new T.Vector3() };
      });
    }
    function spotTick(t) {
      if (!SEALED || !ready) return; if (!spots) spotsMake();
      var on = qual > 0, live = !!world.live, tl = (typeof tug !== 'undefined' && tug) ? tug.v / 100 : 0, lead = new T.Color(tl < 0 ? 0x00d4ff : 0xff9a2e);
      spots.forEach(function (s) {
        s.g.visible = on; s.pool.visible = on; if (!on) return;
        var x = s.side * (8 + Math.sin(t * .23 + s.ph) * 7), z = Math.sin(t * .17 + s.ph * 1.3) * 11;       // a slow figure-of-eight over the floor
        s.tgt.set(x, floorAt(x, z) + .05, z); s.g.lookAt(s.tgt); s.pool.position.copy(s.tgt); s.g.userData.beam.scale.set(1, 1, s.g.position.distanceTo(s.tgt) / s.g.userData.L);
        var c = s.base.clone().lerp(lead, Math.min(.5, Math.abs(tl) * .6)); s.bm.color.copy(c); s.pm.color.copy(c);
        s.bm.opacity = live ? .17 : .11; s.pm.opacity = live ? .5 : .32;
      });
    }
    // ---- Cinematic spin (README-ADMIN 288), the Owner only: stand at centre stage and turn slowly round the whole arena (one full turn
    //      in 60 seconds, easing in and out), with the on-screen panels hidden. Tap anywhere, or press Esc, to stop and go back.
    var cine = null;
    function cineStart() {
      if (cine) return; try { stopWalk(); } catch (e) {}
      cine = { t0: -1, x: player.x, z: player.z, yaw: pyaw, pitch: ppitch, seatY: seatY, lock: seatLock, at: seatAt };
      seatLock = false; seatY = 0; seatAt = null; player.x = 0; player.z = 0; stage.classList.add('igw-cine');
      cine.q = qual; if (qual === 2) { try { setQuality(1); } catch (e) {} }      // a little lighter while it turns, so every frame is drawn
      wake();
    }
    function cineStop() {
      if (!cine) return; var c = cine; cine = null; stage.classList.remove('igw-cine'); if (c.q === 2 && qual === 1) { try { setQuality(2); } catch (e) {} }
      player.x = c.x; player.z = c.z; pyaw = c.yaw; ppitch = c.pitch; seatY = c.seatY; seatAt = c.at; seatLock = c.lock; still(); wake();
    }
    function cineTick(t) {
      if (!cine) return; if (cine.t0 < 0) cine.t0 = t; var e = t - cine.t0, D = 60;
      if (e >= D) { cineStop(); return; }
      var k = e / D, ease = k < .08 ? (k * k) / (2 * .08) : k > .92 ? 1 - ((1 - k) * (1 - k)) / (2 * .08) - .08 : k - .04;   // smooth start and stop
      pyaw = cine.yaw + ease / .92 * Math.PI * 2; ppitch = -.05 + Math.sin(k * Math.PI * 2) * .03; player.x = 0; player.z = 0; wake();
    }
    ['pointerdown', 'keydown'].forEach(function (ev) { stage.addEventListener(ev, function (e2) { if (cine && cine.t0 >= 0 && (ev === 'pointerdown' || e2.key === 'Escape')) cineStop(); }, true); });
    // ---- Team Ghost vs Team Echo (README-ADMIN 283): !ghost / !echo in the stream chat, or Menu > Team Ghost / Team Echo. The meter
    //      tints the arena's light towards cyan or orange, shows on the jumbotron, and CORE calls it when a side takes over.
    var tug = { v: 0, lean: '', level: 0, alertAt: 0, resetAt: 0, seen: false };
    function tugApply(t) {
      if (!t) return; var was = tug.lean, wasL = tug.level;
      tug.v = t.v | 0; tug.lean = t.lean || ''; tug.level = t.level | 0;
      if (tug.seen) {
        if (tug.lean && (tug.lean !== was || tug.level > wasL)) mainframe((tug.lean === 'ghost' ? 'Team Ghost' : 'Team Echo') + (tug.level > 1 ? ' owns the arena.' : ' takes the lead.') + ' Type !' + (tug.lean === 'ghost' ? 'echo' : 'ghost') + ' to pull it back.');
        else if (!tug.lean && was) mainframe('Tug-of-war: dead level again.');
        if (t.alert && t.alert.at > tug.alertAt) mainframe(t.alert.text);
        if (t.reset > tug.resetAt) mainframe('Tug-of-war reset. Pick a side: !ghost or !echo.');
      }
      if (t.alert) tug.alertAt = Math.max(tug.alertAt, t.alert.at); tug.resetAt = Math.max(tug.resetAt, t.reset | 0); tug.seen = true;
      try { indoor(); drawJumbo(jLast[0], jLast[1]); } catch (e) {} still(); wake();
    }
    function tugColor() {
      var base = new T.Color(0x8ea6d8), k = Math.min(.5, Math.abs(tug.v) / 100 * .55); if (!k) return base;
      return base.lerp(new T.Color(tug.v < 0 ? 0x4fd8ff : 0xffa24a), k);
    }
    function tugRefresh() { if (document.hidden) return; fetch(ISOCORE_ASSET_BASE + 'api/tug.state', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (v && v.tug) tugApply(v.tug); }).catch(function () {}); }
    function tugSend(side, id, who) {
      if (true) return; /* Verified Twitch EventSub is the vote writer; browsers are read-only. */
      fetch(ISOCORE_ASSET_BASE + 'api/tug.vote', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { side: side, id: id, who: who } : { side: side }) })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (v && v.tug) tugApply(v.tug); }).catch(function () {});
    }
    function tugOps(op, text) {
      var wr = document.getElementById('igwWrap'), tok = wr && wr.dataset.csrf; if (!tok) return;
      fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: JSON.stringify({ op: op, text: text || '' }) })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (v && v.tug) tugApply(v.tug); }).catch(function () {});
    }
    function tugLine() { return tug.lean ? 'TUG-OF-WAR // ' + (tug.lean === 'ghost' ? 'TEAM GHOST' : 'TEAM ECHO') + ' LEADS ' + Math.abs(tug.v) + '%' : 'TUG-OF-WAR // TYPE !GHOST OR !ECHO'; }
    // ---- The key hunt (README-ADMIN 282). Ghost's key (cyan) and Echo's (orange) lie on the arena floor all week; a third (green, never
    //      named) is out for five minutes on one evening. Walk onto one to pick it up. CORE drops hints, more often the busier the arena,
    //      sharper as the week goes on; none while the green one is out. First finds go up on the jumbotron.
    var KEYCOL = { ghost: 0x3be6ff, echo: 0xff9a2e, scout: 0x3bd671 }, KEYNAME = { ghost: 'Ghost\'s key', echo: 'Echo\'s key', scout: 'An unindexed object' };
    var keyObjs = {}, keyData = null, keyBusy = {}, keyHintAt = Date.now(), keyHintTurn = 0, keyFlash = null, keySeenFirst = null, keyScoutSeen = 0, keyAnon = {};
    try { keyAnon = JSON.parse(localStorage.getItem('igw_keys') || '{}') || {}; } catch (e) { keyAnon = {}; }
    function keyMesh(k) {
      var col = KEYCOL[k], g = new T.Group(), m = new T.MeshBasicMaterial({ color: col, toneMapped: false });
      var ring = new T.Mesh(new T.TorusGeometry(.12, .035, 8, 24), m); ring.position.y = .2; g.add(ring);
      var shaft = new T.Mesh(new T.BoxGeometry(.04, .3, .04), m); g.add(shaft);
      var t1 = new T.Mesh(new T.BoxGeometry(.09, .035, .04), m); t1.position.set(.055, -.12, 0); g.add(t1);
      var t2 = new T.Mesh(new T.BoxGeometry(.07, .035, .04), m); t2.position.set(.045, -.05, 0); g.add(t2);
      glow(col, .9, 0, .05, 0, g, .5);
      g.userData.keep = true; scene.add(g); return g;
    }
    function keyMine(k) { return !!(keyData && ((keyData.mine || []).indexOf(k) >= 0 || (keyAnon[keyData.week] || {})[k])); }
    function keyPlace() {
      if (!SEALED || !keyData) return;
      ['ghost', 'echo', 'scout'].forEach(function (k) {
        var kd = (keyData.keys || {})[k], live = kd && (!kd.until || Date.now() / 1000 < kd.until) && !keyMine(k);
        if (!live) { if (keyObjs[k]) keyObjs[k].visible = false; return; }
        if (!keyObjs[k]) keyObjs[k] = keyMesh(k);
        var o = keyObjs[k]; o.visible = true; o.userData.x = kd.at[0]; o.userData.z = kd.at[1]; o.userData.y = floorAt(kd.at[0], kd.at[1]) + .45;
        o.position.set(kd.at[0], o.userData.y, kd.at[1]);
      });
      still(); wake();
    }
    function keyTick(t) {
      Object.keys(keyObjs).forEach(function (k) {
        var o = keyObjs[k]; if (!o.visible) return;
        o.rotation.y = t * 1.6; o.position.y = o.userData.y + Math.sin(t * 2.2) * .06;
        if (k === 'scout') { var kd = (keyData.keys || {}).scout; if (!kd || Date.now() / 1000 >= kd.until) { o.visible = false; return; } }
        if (!seatLock && !inBooth && Math.hypot(player.x - o.userData.x, player.z - o.userData.z) < 1.3) keyClaim(k);
      });
    }
    function keyFirsts(fresh) {
      if (!keyData) return; var now = Date.now() / 1000;
      if (!keySeenFirst) { keySeenFirst = {}; Object.keys(keyData.keys || {}).forEach(function (k) { var f = keyData.keys[k].first; keySeenFirst[k] = f ? f.at : 0; }); return; }
      Object.keys(keyData.keys || {}).forEach(function (k) {
        var f = keyData.keys[k].first; if (!f || f.at <= (keySeenFirst[k] || 0)) return; keySeenFirst[k] = f.at;
        if (now - f.at > 900 || fresh === k) return;
        var nm = (f.name || 'A fan').toUpperCase(); keyFlash = { k: k, name: nm, until: Date.now() + 60000 };
        mainframe(nm + ' found ' + KEYNAME[k].replace('An u', 'an u') + ' first.', k === 'scout'); try { drawJumbo(jLast[0], jLast[1]); } catch (e) {}
      });
    }
    function keysRefresh() {
      if (document.hidden) return;
      fetch(ISOCORE_ASSET_BASE + 'api/unavailables', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
        if (!v || !v.keys) return; var hadScout = keyData && keyData.keys && keyData.keys.scout; keyData = v;
        if (v.keys.scout) keyScoutSeen = v.keys.scout.until;
        if (hadScout && !v.keys.scout && keyScoutSeen && !keyMine('scout')) { keyScoutSeen = 0; mainframe('Unindexed object detected on the floor... removed.', true); }
        keyFirsts(); keyPlace(); try { drawJumbo(jLast[0], jLast[1]); } catch (e) {}
      }).catch(function () {});
    }
    function keyClaim(k) {
      if (keyBusy[k]) return; keyBusy[k] = 1;
      fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: k }) }).then(function (r) { return r.json(); }).then(function (v) {
        if (!v) return;
        if (v.login) { mainframe(KEYNAME[k] + ' located. Log in to keep it.'); keyAnon[keyData.week] = keyAnon[keyData.week] || {}; keyAnon[keyData.week][k] = 1; try { localStorage.setItem('igw_keys', JSON.stringify(keyAnon)); } catch (e) {} keyPlace(); return; }
        if (v.gone) { keyBusy[k] = 0; keysRefresh(); return; }
        if (!v.ok) { setTimeout(function () { keyBusy[k] = 0; }, 8000); return; }
        if (v.keys) keyData = v.keys; if (keySeenFirst) keySeenFirst[k] = v.first ? Math.floor(Date.now() / 1000) + 5 : keySeenFirst[k];
        var n = (keyData.mine || []).length;
        if (v.first) { keyFlash = { k: k, name: (v.name || 'A fan').toUpperCase(), until: Date.now() + 60000 }; mainframe('First find this week: ' + (v.name || 'a fan') + ' recovered ' + KEYNAME[k].replace('An u', 'an u') + '.', k === 'scout'); }
        else if (!v.again) mainframe(KEYNAME[k] + ' recovered. ' + n + ' of 3 this week.', k === 'scout');
        keyPlace(); try { drawJumbo(jLast[0], jLast[1]); } catch (e) {}
        if (v.holder) setTimeout(function () {
          mainframe('All three keys. Key Holder status granted. Sync boosted.');
          loreBox.textContent = ''; loreBox.appendChild(el('b', '', 'LOG // KEY HOLDER')); var p3 = el('pre', ''); p3.textContent = v.lore || ''; loreBox.appendChild(p3);
          var x4 = el('button', 'igw-guide-go', 'Close'); x4.type = 'button'; x4.addEventListener('click', function () { loreBox.hidden = true; }); loreBox.appendChild(x4); loreBox.hidden = false;
        }, 5000);
      }).catch(function () { setTimeout(function () { keyBusy[k] = 0; }, 8000); });
    }
    // hints: about every 20 minutes with one person in the arena, every 3 to 4 minutes when it is busy
    function keyHintTick() {
      if (!keyData || !SEALED || document.hidden) return;
      if (keyData.keys.scout && Date.now() / 1000 < keyData.keys.scout.until) return;           // none while the green one is out
      var here = Math.max(1, (((world.extra || {}).arena || {}).here) | 0), gap = Math.max(3.5, 20 / (1 + (here - 1) * .45)) * 60000;
      if (Date.now() - keyHintAt < gap) return;
      var opts = ['ghost', 'echo'].filter(function (k) { return keyData.keys[k] && !keyMine(k); }); if (!opts.length) return;
      var k = opts[keyHintTurn++ % opts.length], h = keyData.keys[k].hint; keyHintAt = Date.now();
      if (freeOn() || keyHintTurn % 2) { mainframe('Key scan: ' + KEYNAME[k] + ' is ' + h + '.'); return; }
      LINES[k].hint = k === 'ghost' ? ['My key? It\'s ' + h + '. That\'s all you get.', 'Looking for my key? ' + h.charAt(0).toUpperCase() + h.slice(1) + '. Don\'t tell Echo.'] : ['My key\'s ' + h + '. Finders keepers.', 'Want a clue? ' + h.charAt(0).toUpperCase() + h.slice(1) + '. You\'re welcome.'];
      try { speak(ACT[k], 'hint', true); } catch (e) { mainframe('Key scan: ' + KEYNAME[k] + ' is ' + h + '.'); }
    }
    function keyLine() {
      if (!keyData || !keyData.keys) return '';
      var a = ['ghost', 'echo'].map(function (k) { var f = keyData.keys[k] && keyData.keys[k].first; return (k === 'ghost' ? 'GHOST' : 'ECHO') + (f ? ': FOUND' : ': HIDDEN'); });
      return 'KEY HUNT // ' + a.join('  ');
    }
    function keysStart() { keysRefresh(); setInterval(keysRefresh, 60000); setInterval(keyHintTick, 10000); }
    // ---- Sound (README-ADMIN 277). Browsers only allow sound after a tap, so it all starts on the first one: CORE voices its lines
    //      (its own synthesized data-voice), the live stream plays with sound, and IG-Mainframe's intro sting plays when
    //      he connects. Options > Sound turns all of it off (remembered on this device).
    var audioOn = false, soundMuted = false, actx = null, introDone = 0, pageAt = Date.now() / 1000;
    try { soundMuted = localStorage.getItem('igw_mute') === '1'; } catch (e) {}
    function unlockAudio() {
      if (audioOn) return; audioOn = true;
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
      streamSound(); // Broadcast camera: do not play the Mainframe entrance sting.
      if (mfLast && Date.now() - mfAt < 8000) coreSay(mfLast);
    }
    ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { stage.addEventListener(ev, unlockAudio, { passive: true }); });
    function streamSound() { Object.keys(vids || {}).forEach(function (k) { var v = vids[k]; try { if (v.player) { v.player.setMuted(!(audioOn && !soundMuted)); v.player.setVolume(.8); } } catch (e) {} }); }
    function duck(on) { Object.keys(vids || {}).forEach(function (k) { try { if (vids[k].player && audioOn && !soundMuted) vids[k].player.setVolume(on ? .25 : .8); } catch (e) {} }); }
    // CORE's voice: its own synthesized data-voice, made in the browser (not the device's speech voice). A short chime, then
    // a low filtered pulse for every syllable of the line, so it "talks" in rhythm with the text. Glitch lines drop and stutter.
    function coreSay(text, glitchy) {
      if (!audioOn || soundMuted || !actx || !text) return;
      try {
        var c = actx; if (c.state === 'suspended') c.resume();
        var clean = String(text).replace(/[\u0300-\u036f\u2592]/g, '').replace(/\s+/g, ' ').trim(); if (!clean) return;
        var t = c.currentTime + .05, out = c.createGain(); out.gain.value = .5; out.connect(c.destination);
        [880, 1318.5].forEach(function (f, k) { var o = c.createOscillator(), g = c.createGain(), at = t + k * .07; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.12, at + .01); g.gain.exponentialRampToValueAtTime(.0001, at + .25); o.connect(g); g.connect(out); o.start(at); o.stop(at + .3); });
        t += .2;
        var words = clean.split(' '), end = t + 4, base = glitchy ? 72 : 118;
        for (var w = 0; w < words.length && t < end; w++) {
          var syl = (words[w].toLowerCase().match(/[aeiouy]+/g) || ['a']).length;
          for (var k = 0; k < syl && t < end; k++) {
            var d = .055 + Math.random() * .045, f0 = base * (1 + (Math.random() - .5) * (glitchy ? .6 : .18));
            var o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (k === syl - 1 ? .9 : 1.05), t + d);
            bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = [520, 760, 1100, 1500][(Math.random() * 4) | 0];
            g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.5, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
            o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + d + .02);
            t += d + .015; if (glitchy && Math.random() < .2) t += .12;
          }
          t += .05;
        }
        duck(true); clearTimeout(coreSay._u); coreSay._u = setTimeout(function () { duck(false); }, (t - c.currentTime) * 1000 + 200);
      } catch (e) {}
    }
    // IG-Mainframe's entrance: an original sting made right here in the browser (no music file, nobody else's track)
    function playIntro() {
      if (!actx || soundMuted) return; var c = actx, t0 = c.currentTime + .05; try { if (c.state === 'suspended') c.resume(); } catch (e) {}
      var out = c.createDynamicsCompressor(), master = c.createGain(); master.gain.value = .55; master.connect(out); out.connect(c.destination);
      var nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      var ns = c.createBufferSource(); ns.buffer = nb; var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(5000, t0 + 2);
      var ng = c.createGain(); ng.gain.setValueAtTime(.0001, t0); ng.gain.exponentialRampToValueAtTime(.35, t0 + 1.9); ng.gain.exponentialRampToValueAtTime(.0001, t0 + 2.05); ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start(t0); ns.stop(t0 + 2.1);
      var hit = t0 + 2;
      var bo = c.createOscillator(), bg = c.createGain(); bo.type = 'sine'; bo.frequency.setValueAtTime(70, hit); bo.frequency.exponentialRampToValueAtTime(32, hit + 1.2); bg.gain.setValueAtTime(.9, hit); bg.gain.exponentialRampToValueAtTime(.0001, hit + 1.4); bo.connect(bg); bg.connect(master); bo.start(hit); bo.stop(hit + 1.5);
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, hit); lp.frequency.exponentialRampToValueAtTime(3200, hit + 1.6); var pg = c.createGain(); pg.gain.setValueAtTime(.0001, hit); pg.gain.exponentialRampToValueAtTime(.16, hit + .25); pg.gain.setValueAtTime(.16, hit + 2.2); pg.gain.exponentialRampToValueAtTime(.0001, hit + 4.8); lp.connect(pg); pg.connect(master);
      [110, 164.81, 220, 261.63, 329.63].forEach(function (f) { [-6, 6].forEach(function (det) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(hit); o.stop(hit + 5); }); });
      [440, 523.25, 659.25, 880, 1046.5, 1318.5].forEach(function (f, k) { var at = hit + .2 + k * .13, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.22, at + .01); g.gain.exponentialRampToValueAtTime(.0001, at + .35); o.connect(g); g.connect(master); o.start(at); o.stop(at + .4); });
      [1760, 2217.46, 2637].forEach(function (f) { var o = c.createOscillator(), g = c.createGain(), at = hit + 1.2; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.05, at + .4); g.gain.exponentialRampToValueAtTime(.0001, at + 4); o.connect(g); g.connect(master); o.start(at); o.stop(at + 4.1); });
      modelInfo.introPlayed = (modelInfo.introPlayed || 0) + 1;
    }
    function introCheck() {
      var h = (((world.extra || {}).arena || {}).host) | 0; if (!h || h <= introDone) return;
      var mine = isHostNow, fresh = Date.now() / 1000 - h < 90;
      if (!fresh && !(mine && h >= pageAt - 30)) { introDone = h; return; }
      if (!audioOn) return;                                               // waits for the first tap (up to 90 seconds)
      introDone = h; playIntro(); setTimeout(function () { mainframe(mine ? 'Welcome back, IG-Mainframe. All systems to broadcast.' : 'IG-Mainframe has connected. All systems to broadcast.'); }, 2300);
    }
    var isHostNow = false;
    var mfEl = null, mfLast = '', mfAt = 0, mfSync = -1, mfLive = null, mfPeakUntil = 0, mfPeakDone = false;
    function mainframe(text, glitchy) {
      if (!mfEl) { mfEl = el('div', 'igw-mf'); mfEl.setAttribute('role', 'status'); mfEl.setAttribute('aria-live', 'polite'); stage.appendChild(mfEl); }
      mfLast = text; mfAt = Date.now(); mfEl.textContent = 'CORE // ' + text; mfEl.classList.toggle('is-glitch', !!glitchy);
      mfEl.classList.remove('is-on'); void mfEl.offsetWidth; mfEl.classList.add('is-on');
      clearTimeout(mfEl._t); mfEl._t = setTimeout(function () { mfEl.classList.remove('is-on'); }, 6500);
      try { drawJumbo(jLast[0], jLast[1]); } catch (e) {}
      coreSay(text, glitchy);
    }
    // the next stream on the schedule Ghost and Echo set (README-ADMIN 275), for one side or either
    function nextSched(who) { var l = ((world.extra || {}).sched || []).filter(function (x) { return (!who || x.who === who) && x.at * 1000 > Date.now() - 60000; }); return l[0] || null; }
    function syncPct() { var sy = (world.extra || {}).sync; return sy ? Math.max(0, Math.min(100, sy.pct | 0)) : 0; }
    // watches the state for things worth announcing: streams starting and ending, the sync passing a quarter, the night moving on
    function mfWatch() {
      var pct = syncPct(), lv = !!(liveStream() || inSuite), side = liveBooth ? liveBooth() : 'ghost';
      if (mfLive !== null && lv !== mfLive) mainframe(lv ? (side === 'echo' ? 'Echo' : 'Ghost') + ' has entered the broadcast. Sync rising.' : 'Broadcast ended. Holding the memory.');
      mfLive = lv;
      if (mfSync >= 0) [25, 50, 75].forEach(function (m) { if (mfSync < m && pct >= m) mainframe('Memory sync ' + m + '%. ' + (m === 75 ? 'Nearly there.' : 'Stabilising.')); });
      if (pct >= 100 && mfSync < 100 && !mfPeakDone) { mfPeakDone = true; mfPeakUntil = Date.now() + 60000; mainframe('SYNC 100%. The night moves on.'); setTimeout(function () { mainframe('Sync slipping. 3:17 again.'); }, 61000); }
      mfSync = pct;
    }
    var MF_IDLE = [function () { return 'Memory sync holding at ' + syncPct() + '%.'; }, function () { var h = (((world.extra || {}).arena || {}).here) || 1; return h + ' in the arena. Signal strong.'; },
      function () { return 'All systems nominal. Mostly.'; }, function () { return 'The clock reads 3:17. The clock always reads 3:17.'; }, function () { return 'Replaying the night. Do not touch the seats.'; },
      function () { return 'Two signals on the stage. Logging both.'; }, function () { var n = nextSched(); return n ? 'Next broadcast: ' + (n.who === 'echo' ? 'Echo' : 'Ghost') + ', ' + n.label + '. They chose it.' : 'No broadcast scheduled. Holding.'; }];
    function mfIdle() { if (document.hidden) return; mainframe(MF_IDLE[Math.floor(Math.random() * MF_IDLE.length)]()); }
    // Desync: while the green ring is lit, now and then the replay slips. The screens jump, the stands flicker to a frame, and the
    // Mainframe reports something it cannot name. Rare and never explained.
    var glitchAt = 0, wireMats = null;
    var MF_GLITCH = ['Unknown process on \u2592\u2592\u2592\u2592. Ignoring.', 'S\u0336y\u0336n\u0336c\u0336 interference. Source: outside the memory.', 'Third signal \u2592 not found. Not found. Not found.', 'Restoring frame. Nothing to see.'];
    function glitchTick(t) {
      if (!glitchAt) glitchAt = t + 90 + Math.random() * 150; if (t < glitchAt) return; glitchAt = t + 120 + Math.random() * 240;
      stage.classList.add('igw-desync'); setTimeout(function () { stage.classList.remove('igw-desync'); }, 650);
      if (!wireMats && arenaRoot) { wireMats = []; arenaRoot.traverse(function (o) { if (o.isMesh && o.name === 'Structure') [].concat(o.material).forEach(function (m) { if (m && wireMats.indexOf(m) < 0) wireMats.push(m); }); }); }
      (wireMats || []).forEach(function (m) { m.wireframe = true; }); setTimeout(function () { (wireMats || []).forEach(function (m) { m.wireframe = false; }); still(); }, 180);
      mainframe(MF_GLITCH[Math.floor(Math.random() * MF_GLITCH.length)], true); wake();
    }
    function thirdTick(t) {
      var lit = !!X.third, pulse = .55 + Math.sin(t * 1.3) * .2;
      if (thirdRing) thirdRing.material.opacity = lit ? pulse : 0;
      if (thirdHalo) thirdHalo.material.opacity = lit ? pulse * .35 : 0;
      if (!lit) { thirdGlow.material.opacity = 0; return; }
      glitchTick(t);
      if (!thirdAt) thirdAt = t + 8 + Math.random() * 20;
      if (t >= thirdAt) {
        var sp = THIRD_SPOTS[Math.floor(Math.random() * THIRD_SPOTS.length)];
        thirdGlow.position.set(sp[0], .9 + Math.random() * 1.6, sp[1]); thirdUntil = t + .45 + Math.random() * .4; thirdAt = t + 25 + Math.random() * 40; glimpsed = t;
      }
      thirdGlow.material.opacity = t < thirdUntil ? .55 + Math.random() * .3 : 0;
    }
    LINES.ghost.glimpse = ['Did you see that? ...No. Loose cable. Probably.', 'Green. Out by the wall. Echo, if that\'s you, it isn\'t funny.', 'Something moved. The count\'s going to be off again.', 'Reflection off the big screen. That\'s all that was.'];
    LINES.echo.glimpse = ['Oi. Something green, by the wall. Ghost, is that one of your tricks?', 'There it is again. Don\'t tell Ghost. He\'ll start counting.', 'Green flag? Nobody waved a green flag.', 'Must be a reflection. Must be.'];
    function prankTick(t) {
      var sv = (world.extra || {}).prank;
      if (sv !== undefined) {                                  // the site keeps the prank, so every member sees the same one
        var key = sv ? sv.by + sv.item + sv.spot : '';
        if (prank && prank.key !== key) clearPrank();
        if (!sv || prank || !echoOn) return;
        makePrank(sv.by, PRANK_SPOTS[sv.spot % PRANK_SPOTS.length], sv.item, key, t); return;
      }
      if (prank || t < nextPrank || !echoOn) return;
      var by0 = Math.random() < .5 ? 'ghost' : 'echo'; makePrank(by0, pickOne(PRANK_SPOTS), by0 === 'ghost' ? 'wheel' : 'mug', '', t);
    }
    function makePrank(by, sp, item, key, t) {
      var owner = by === 'ghost' ? 'echo' : 'ghost', g = new T.Group(); g.position.set(sp[0], .3, sp[1]); scene.add(g);
      var col = owner === 'ghost' ? 0x3aa0ff : 0xff8a3a, m = new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .6, roughness: .4 });
      if (item === 'wheel') { var wh = mesh(new T.TorusGeometry(.32, .07, 10, 28), m, 0, .35, 0, g); wh.rotation.x = Math.PI / 2.4; }
      else if (item === 'helmet') { mesh(new T.SphereGeometry(.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), m, 0, .3, 0, g); }
      else if (item === 'headset') { mesh(new T.TorusGeometry(.25, .04, 8, 24, Math.PI), m, 0, .3, 0, g); sphere(.08, .1, .06, m, -.25, .3, 0, g); sphere(.08, .1, .06, m, .25, .3, 0, g); }
      else { cylinder(.18, .15, .34, m, 0, .2, 0, g, 16); var hd = mesh(new T.TorusGeometry(.1, .03, 8, 16), m, .2, .22, 0, g); hd.rotation.y = Math.PI / 2; }
      var gl = glow(col, 1.6, 0, .4, 0, g, .35);
      g.traverse(function (o) { if (o.isMesh) { o.userData.prank = true; pickable.push(o); } });
      prank = { g: g, by: by, owner: owner, at: t, key: key, item: item }; speak(ACT[by], 'hid', true);
    }
    function returnPrank(local) {
      if (!prank) return;
      if (prank.key && !local) {                               // the site's prank: give it back for real (members only)
        fetch(ISOCORE_ASSET_BASE + 'api/ghost.mine', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
          if ((!d || !d.csrf) && freeOn()) { if (status) status.textContent = 'Log in with Discord to give it back.'; return; }
          if (!d || !d.csrf) { drawBubble(ACT[prank.owner].b, prank.owner, 'Log in with Discord and you can give it back to me.', false); ACT[prank.owner].b.sp.visible = true; ACT[prank.owner].b.until = elapsed + 4; onAirLine(prank.owner,'Log in with Discord and you can give it back to me.'); return; }
          return fetch(ISOCORE_ASSET_BASE + 'api/unavailable', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': d.csrf }, body: '{}' }).then(function (r) { return r.json(); }).then(function (v) { if (v && v.ok !== false) { if (world.extra) world.extra.prank = false; returnPrank(true); } else clearPrank(); });
        }).catch(function () {});
        return;
      }
      var p2 = prank; prank = null; scene.remove(p2.g); p2.g.traverse(function (o) { var pi = pickable.indexOf(o); if (pi >= 0) pickable.splice(pi, 1); });
      speak(ACT[p2.owner], 'thanks', true); var b2 = ACT[p2.by]; setTimeout(function () { speak(b2, 'foiled', true); anger(b2, .2); }, 2200);
      ACT[p2.owner].anger = 0; nextPrank = elapsed + 240 + Math.random() * 240;
    }
    // ---- Members online in Discord: their booth lights up with a green ONLINE marker (purple IN VOICE when they are in a
    //      voice channel), and now and then Ghost or Echo drops by to say hello.
    var onlineMarks = [], onlineKey = '';
    function onlineSync() {
      var ol = (world.extra || {}).online || { on: [], vc: [] }, key = JSON.stringify(ol) + housePos.length; if (key === onlineKey) return; onlineKey = key;
      onlineMarks.forEach(function (m) { scene.remove(m); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }); onlineMarks = [];
      (world.houses || []).forEach(function (h, i) {
        var vc = (ol.vc || []).indexOf(h.c) >= 0, on = vc || (ol.on || []).indexOf(h.c) >= 0, at = housePos[i]; if (!on || !at || onlineMarks.length > 60) return;
        var cv = document.createElement('canvas'); cv.width = 192; cv.height = 48; var g = cv.getContext('2d'); g.fillStyle = vc ? '#8a5cff' : '#1fcf6a'; if (g.roundRect) { g.beginPath(); g.roundRect(4, 6, 184, 36, 18); g.fill(); } else g.fillRect(4, 6, 184, 36);
        g.fillStyle = '#fff'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(vc ? 'IN VOICE' : 'ONLINE', 96, 25);
        var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); sp.scale.set(2.2, .55, 1); sp.position.set(at.x, at.y + 1.75, at.z); sp.userData.code = h.c; sp.userData.idx = i; scene.add(sp); onlineMarks.push(sp);
      });
    }
    function onlineBooth() { if (!onlineMarks.length) return null; var m = pickOne(onlineMarks); return { at: [m.position.x, m.position.z], name: (world.houses[m.userData.idx] || {}).n || '' }; }
    // ---- Writing to them, right here. Walk up to Ghost or Echo (or tap one) and a "Write to ..." button appears; it
    //      opens a small sheet with what you last said to each other, a box for a note, a gift, and whether you want a
    //      Discord message when they write back.
    var noteChip = el('button', 'igw-note-chip'); noteChip.type = 'button'; noteChip.hidden = true; hud.appendChild(noteChip);
    var noteBox = null, chipWho = '', chipHold = 0, mineCache = null;
    function whoName(w) { return w === 'echo' ? ((X.echo && X.echo.name) || 'IG-Echo') : (stage.getAttribute('data-name') || 'IG-Ghost'); }
    function chipTick(t) {
      var best = '', bd = 7;
      ['ghost', 'echo'].forEach(function (w) { if (!isOut(w)) return; var d = Math.hypot(player.x - ACT[w].pos.x, player.z - ACT[w].pos.z); if (d < bd) { bd = d; best = w; } });
      if (!best && t < chipHold) best = chipWho;
      if (noteBox || mode !== 'walk') best = '';
      if (best !== (noteChip.hidden ? '' : chipWho)) { chipWho = best || chipWho; noteChip.hidden = !best; if (best) { noteChip.textContent = '\u2709 Write to ' + whoName(best); noteChip.className = 'igw-note-chip is-' + best; } stage.classList.toggle('igw-chip', !!best); }
    }
    function api(action, body, csrf) {
      var o = { credentials: 'same-origin', cache: 'no-store' }; if (body) { o.method = 'POST'; o.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' }; o.body = JSON.stringify(body); }
      return fetch(ISOCORE_ASSET_BASE + 'api/' + action, o).then(function (r) { return r.json().catch(function () { return { error: 'Something went wrong. Try again.' }; }); });
    }
    function closeNote() { if (noteBox) { noteBox.remove(); noteBox = null; stage.classList.remove('igw-noting'); } }
    function openNote(w) {
      closeNote(); stopWalk();
      var nm = whoName(w), box = el('div', 'igw-note is-' + w); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'A note for ' + nm);
      var head = el('div', 'igw-note-head'), ttl = el('strong', '', 'A note for ' + nm), x = el('button', 'igw-note-x', 'Close'); x.type = 'button'; x.addEventListener('click', closeNote);
      var body = el('div', 'igw-note-body', 'One moment...'); head.appendChild(ttl); head.appendChild(x); box.appendChild(head); box.appendChild(body);
      ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel', 'keydown', 'keyup', 'touchstart', 'touchmove'].forEach(function (ev) { box.addEventListener(ev, function (e) { e.stopPropagation(); }); });
      stage.appendChild(box); noteBox = box; stage.classList.add('igw-noting');
      api('ghost.mine').then(function (d) {
        if (noteBox !== box) return; mineCache = d; body.textContent = '';
        if (!d || d.on === false) { body.textContent = 'There is nobody here to write to just now.'; return; }
        if (!d.user) { body.appendChild(el('p', '', 'Log in with Discord and you can leave ' + nm + ' a note. He reads it in his own time, writes back, and remembers you.')); var lg = el('button', 'igw-note-send', 'Log in with Discord'); lg.type = 'button'; lg.addEventListener('click', function () { closeNote(); go('login'); }); body.appendChild(lg); return; }
        if (!d.can_write) { body.appendChild(el('p', '', 'Notes are for members. Join the community first.')); return; }
        var last = (d.notes || []).filter(function (n) { return n.who === w; })[0];
        if (last) {
          var th = el('div', 'igw-note-last'); th.appendChild(el('p', 'igw-note-you', 'You, ' + last.when + ': ' + (last.body || (last.gift ? 'left ' + last.gift : ''))));
          th.appendChild(el('p', 'igw-note-them', last.reply ? nm + ': ' + last.reply : nm + ' has not answered yet. He reads in his own time.')); body.appendChild(th);
        } else if (d.memory && d.memory.visits > 1) body.appendChild(el('p', 'igw-note-them', nm + ' has seen you here ' + d.memory.visits + ' times. Say something.'));
        var ta = el('textarea', 'igw-note-text'); ta.maxLength = d.max || 400; ta.rows = 3; ta.placeholder = 'Write to ' + nm + '...'; ta.setAttribute('aria-label', 'Your note'); body.appendChild(ta);
        var row = el('div', 'igw-note-row'), sel = null;
        if (d.gift_left && d.gifts) { sel = el('select', 'igw-note-gift'); sel.setAttribute('aria-label', 'Leave a gift'); var o0 = el('option', '', 'No gift'); o0.value = ''; sel.appendChild(o0); Object.keys(d.gifts).forEach(function (k) { var o = el('option', '', 'Gift: ' + d.gifts[k]); o.value = k; sel.appendChild(o); }); row.appendChild(sel); }
        var send = el('button', 'igw-note-send', 'Send'); send.type = 'button'; row.appendChild(send); body.appendChild(row);
        var msg = el('p', 'igw-note-msg', d.left > 0 ? 'You can leave ' + d.left + ' more note' + (d.left === 1 ? '' : 's') + ' today.' : 'You have left your notes for today. A gift still works.'); msg.setAttribute('aria-live', 'polite'); body.appendChild(msg);
        if (d.dm_can) {
          var lab = el('label', 'igw-note-dm'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!d.dm; lab.appendChild(cb); lab.appendChild(document.createTextNode(' Message me on Discord when ' + nm + ' writes back')); body.appendChild(lab);
          cb.addEventListener('change', function () { api('ghost.dm', { on: cb.checked }, d.csrf).then(function (r) { msg.textContent = (r && (r.message || r.error)) || ''; }); });
        }
        send.addEventListener('click', function () {
          var text = ta.value.trim(), gift = sel ? sel.value : ''; if (text.length < 3 && !gift) { msg.textContent = 'Write a few words, or choose a gift.'; return; }
          send.disabled = true; msg.textContent = 'Sending...';
          api('ghost.note', { note: text, to: w, gift: gift }, d.csrf).then(function (r) {
            send.disabled = false; if (!r || r.error) { msg.textContent = (r && r.error) || 'That did not go through. Try again.'; return; }
            closeNote(); var a = ACT[w]; if (gift) { a.anger = 0; a.angry = false; }
            if (freeOn()) { if (status) status.textContent = (gift ? 'Your gift went to ' : 'Your note went to ') + (w === 'ghost' ? 'Ghost' : 'Echo') + '.'; return; }
            var line = gift ? (w === 'ghost' ? 'For me? ...Thank you. I\'ll keep it safe.' : 'A gift! You\'re officially my favourite.') : (w === 'ghost' ? 'Got it. I\'ll read it when the arena\'s quiet, and write back.' : 'Noted! I\'ll read it between laps and write back.');
            a.lastSay = elapsed; drawBubble(a.b, w, line, false); a.b.sp.visible = true; a.b.until = elapsed + 5; a.mouth = a.b.until; a.lastLine = line; onAirLine(w,line); wake();
          });
        });
        if (!STICKS) { try { ta.focus(); } catch (e) {} }
      });
    }
    noteChip.addEventListener('click', function (e) { e.stopPropagation(); if (chipWho) openNote(chipWho); });
    ['pointerdown', 'pointerup'].forEach(function (ev) { noteChip.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    // ---- Their own building projects. Each has a patch of floor and builds something on it, a stage at a time, over
    //      several days (the site keeps the progress, so everyone sees the same thing). The last stage brings it to life.
    var PLOT = { ghost: [-20, 14], echo: [12.6, 20.6] }, plotRoots = [], plots = {};
    ['ghost', 'echo'].forEach(function (w) { var g = new T.Group(); g.position.set(PLOT[w][0], .04, PLOT[w][1]); scene.add(g); plotRoots.push(g); plots[w] = { g: g, key: '', anim: null, tag: null }; solidCircle(PLOT[w][0], PLOT[w][1], 2.7); });
    function plotTag(pl, w, pr) {
      if (pl.tag) { pl.g.remove(pl.tag); pl.tag.material.map.dispose(); pl.tag.material.dispose(); }
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 112; var g = cv.getContext('2d'), col = w === 'echo' ? '#ff9a4d' : '#4fc8f5';
      g.fillStyle = 'rgba(5,10,18,.88)'; if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 504, 104, 16); g.fill(); } else g.fillRect(4, 4, 504, 104); g.strokeStyle = col; g.lineWidth = 4; if (g.roundRect) { g.beginPath(); g.roundRect(4, 4, 504, 104, 16); g.stroke(); }
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = 'bold 34px Arial, sans-serif'; g.fillText(String(pr.name).slice(0, 26), 256, 48); g.fillStyle = col; g.font = 'bold 24px Arial, sans-serif'; g.fillText(pr.stage >= 8 ? 'FINISHED  //  BUILT BY ' + (w === 'echo' ? 'ECHO' : 'GHOST') : 'STAGE ' + pr.stage + ' OF 8  //  ' + (w === 'echo' ? 'ECHO' : 'GHOST') + ' IS BUILDING THIS', 256, 88);
      var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; var sp = new T.Sprite(new T.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); sp.scale.set(4.4, .96, 1); pl.tag = sp; pl.g.add(sp); return sp;
    }
    function buildPlot(w, pr) {
      var pl = plots[w], g = pl.g, st = pr.stage, own = w === 'echo' ? mats.roofAmber : mats.roofBlue, colN = w === 'echo' ? 0xff9a4d : 0x4fc8f5, lit = new T.MeshBasicMaterial({ color: colN }), red = new T.MeshBasicMaterial({ color: 0xff3b3b }), top = 1.2;
      while (g.children.length) { var c = g.children.pop(); c.traverse(function (o) { var pi = pickable.indexOf(o); if (pi >= 0) pickable.splice(pi, 1); if (o.geometry) o.geometry.dispose(); }); }
      pl.tag = null; pl.anim = null;
      cylinder(2.7, 2.7, .08, mats.rim, 0, .04, 0, g, 40); var ring = torus(2.62, .04, lit, 0, .1, 0, g); ring.rotation.x = Math.PI / 2;
      [[-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(function (c2) { if (st < 8) mesh(new T.ConeGeometry(.16, .5, 10), new T.MeshBasicMaterial({ color: 0xff8a1e }), c2[0] * .85, .33, c2[1] * .85, g); });
      function ringFlat(r0, r1, frac, mat, y) { var m = mesh(new T.RingGeometry(r0, r1, 48, 1, 0, Math.PI * 2 * frac), mat, 0, y, 0, g); m.rotation.x = -Math.PI / 2; return m; }
      if (pr.kit === 'watchtower') {
        var L = [[-1, -1], [1, -1], [-1, 1], [1, 1]], hgt = st >= 3 ? 4.4 : st >= 2 ? 2.2 : 0;
        if (st >= 1) L.forEach(function (c2) { box(.5, .3, .5, mats.base, c2[0], .23, c2[1], g); });
        if (hgt) L.forEach(function (c2) { box(.16, hgt, .16, mats.metal, c2[0], .38 + hgt / 2, c2[1], g); });
        if (st >= 3) [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]].forEach(function (b) { var br = box(b[2] ? .08 : 2.9, .08, b[2] ? 2.9 : .08, mats.metal, b[0], 2.4, b[1], g); br.rotation[b[2] ? 'x' : 'z'] = .75; });
        if (st >= 4) box(2.8, .16, 2.8, mats.dark, 0, 4.86, 0, g);
        if (st >= 5) [[0, -1.35, 2.8, .08], [0, 1.35, 2.8, .08], [-1.35, 0, .08, 2.8], [1.35, 0, .08, 2.8]].forEach(function (r) { box(r[2], .08, r[3], mats.metal, r[0], 5.7, r[1], g); box(r[2], .06, r[3], mats.metal, r[0], 5.3, r[1], g); });
        if (st >= 6) { L.forEach(function (c2) { box(.1, 1.9, .1, mats.metal, c2[0] * 1.3, 5.9, c2[1] * 1.3, g); }); var rf = mesh(new T.ConeGeometry(2.2, .9, 4), own, 0, 7.3, 0, g); rf.rotation.y = Math.PI / 4; }
        if (st >= 7) { sphere(.2, .2, .2, lit, 0, 6.5, 0, g); glow(colN, 2.4, 0, 6.5, 0, g, .5); }
        if (st >= 8) { box(.05, 1.4, .05, mats.metal, 0, 8.4, 0, g); box(.8, .45, .03, own, .42, 8.8, 0, g); var beam = mesh(new T.ConeGeometry(1.6, 14, 14, 1, true), new T.MeshBasicMaterial({ color: colN, transparent: true, opacity: .07, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, 0, 0), piv = new T.Group(); piv.position.set(0, 6.5, 0); g.add(piv); beam.position.set(0, -7, 0); var tl = new T.Group(); tl.rotation.x = 1.15; tl.add(beam); piv.add(tl); pl.anim = function (t) { piv.rotation.y = t * .5; }; }
        top = st >= 6 ? 9.6 : st >= 4 ? 6.4 : hgt + 1.4;
      } else if (pr.kit === 'railway' || pr.kit === 'circuit') {
        var rail = pr.kit === 'railway', frac = st >= 3 ? 1 : st === 2 ? .5 : st === 1 ? .25 : 0;
        if (frac) { ringFlat(1.45, 2.3, frac, rail ? mats.dark : mats.road, .1); if (rail) { for (var sl = 0; sl < Math.round(28 * frac); sl++) { var sa = sl / 28 * Math.PI * 2, tie = box(.9, .05, .16, mats.base, Math.cos(sa) * 1.88, .13, -Math.sin(sa) * 1.88, g); tie.rotation.y = sa; } } }
        if (st >= 4) { if (rail) { [1.68, 2.08].forEach(function (rr) { var rl = torus(rr, .03, mats.metal, 0, .19, 0, g); rl.rotation.x = Math.PI / 2; }); } else { ringFlat(2.3, 2.42, 1, new T.MeshBasicMaterial({ color: 0xe8262b }), .11); ringFlat(1.33, 1.45, 1, new T.MeshBasicMaterial({ color: 0xf2f4f6 }), .11); } }
        if (st >= 5) { if (rail) { box(1.3, .7, .8, mats.base, 0, .45, 0, g); var sr = mesh(new T.ConeGeometry(1.0, .5, 4), own, 0, 1.05, 0, g); sr.rotation.y = Math.PI / 4; } else { box(.1, 1.3, .1, mats.metal, 1.4, .75, 0, g); box(.1, 1.3, .1, mats.metal, 2.36, .75, 0, g); box(1.1, .22, .1, own, 1.88, 1.4, 0, g); } }
        if (st >= 6) { if (rail) { box(.07, 1.5, .07, mats.metal, -2.45, .85, .4, g); sphere(.09, .09, .09, red, -2.45, 1.6, .4, g); } else { for (var gs2 = 0; gs2 < 3; gs2++) box(1.6, .18, .34, gs2 % 2 ? own : mats.base, 0, .19 + gs2 * .18, -.5 - gs2 * .34 + .5, g); } }
        if (st >= 7) { if (rail) { var tn = mesh(new T.TorusGeometry(.62, .2, 8, 20, Math.PI), mats.base, 0, .1, 1.88, g); tn.rotation.y = Math.PI / 2; } else { box(.9, .5, .6, mats.dark, -.2, .35, .75, g); box(1.0, .06, .7, own, -.2, .63, .75, g); } }
        if (st >= 8) {
          var cars2 = [], n2 = rail ? 3 : 1;
          for (var cn = 0; cn < n2; cn++) { var cg = new T.Group(); if (rail) { box(.36, .3, .6, cn ? own : mats.foot, 0, .2, 0, cg); if (!cn) { cylinder(.07, .09, .26, mats.metal, 0, .46, .14, cg, 10); sphere(.05, .05, .05, new T.MeshBasicMaterial({ color: 0xfff2c0 }), 0, .24, .32, cg); } } else { box(.3, .14, .62, own, 0, .12, 0, cg); box(.22, .1, .26, mats.foot, 0, .24, -.06, cg); box(.36, .04, .1, mats.foot, 0, .26, -.3, cg); } g.add(cg); cars2.push(cg); }
          pl.anim = function (t) { cars2.forEach(function (cg2, k) { var a2 = t * (rail ? .55 : 1.5) - k * .36; cg2.position.set(Math.cos(a2) * 1.88, .2, -Math.sin(a2) * 1.88); cg2.rotation.y = a2 + Math.PI; }); };
        }
        top = st >= 5 ? 2.4 : 1.4;
      } else if (pr.kit === 'radio') {
        var mh = st >= 4 ? 7 : st >= 3 ? 4.6 : st >= 2 ? 2.3 : 0;
        if (st >= 1) box(1.5, .5, 1.5, mats.base, 0, .33, 0, g);
        if (mh) { box(.2, mh, .2, mats.metal, 0, .58 + mh / 2, 0, g); for (var seg = 1; seg < mh; seg += 1.15) box(.5, .05, .5, mats.metal, 0, .58 + seg, 0, g); }
        if (st >= 4) [[2, 2], [-2, 2], [2, -2], [-2, -2]].forEach(function (c2) { var a3 = new T.Vector3(0, 6.6, 0), b3 = new T.Vector3(c2[0], .1, c2[1]), ln = a3.distanceTo(b3), w2 = cylinder(.015, .015, ln, mats.metal, (a3.x + b3.x) / 2, (a3.y + b3.y) / 2, (a3.z + b3.z) / 2, g, 4); w2.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), a3.clone().sub(b3).normalize()); });
        if (st >= 5) { box(1.8, .07, .07, mats.metal, 0, 6.2, 0, g); box(.07, .07, 1.4, mats.metal, 0, 5.4, 0, g); }
        if (st >= 6) { var d1 = mesh(new T.SphereGeometry(.7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), own, .5, 4.4, 0, g); d1.rotation.z = -1.9; own.side = T.DoubleSide; }
        if (st >= 7) { var d2 = mesh(new T.SphereGeometry(.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), own, -.4, 3.2, .1, g); d2.rotation.z = 1.9; }
        if (st >= 8) { var bl = sphere(.14, .14, .14, red, 0, 7.75, 0, g), gl2 = glow(0xff3b3b, 2.2, 0, 7.75, 0, g, .6), pulse = torus(.5, .03, lit, 0, 7.2, 0, g); pulse.rotation.x = Math.PI / 2; pl.anim = function (t) { var on = (t % 1.6) < .5; bl.visible = on; gl2.visible = on; var k = (t % 2.4) / 2.4; pulse.scale.setScalar(1 + k * 5); pulse.material.opacity = 1 - k; pulse.material.transparent = true; }; }
        top = mh ? mh + 2 : 1.6;
      } else if (pr.kit === 'rocket') {
        if (st >= 1) { cylinder(1.9, 2.0, .3, mats.base, 0, .23, 0, g, 24); cylinder(.9, .9, .06, mats.dark, 0, .41, 0, g, 24); }
        if (st >= 2) for (var fn = 0; fn < 3; fn++) { var fa = fn / 3 * Math.PI * 2, fin = box(.08, 1.1, .8, own, Math.cos(fa) * .78, 1.0, Math.sin(fa) * .78, g); fin.rotation.y = -fa; }
        var bodyN = Math.max(0, Math.min(3, st - 2));
        for (var bs = 0; bs < bodyN; bs++) { cylinder(.6, .6, 1.5, bs % 2 ? mats.base : mats.metal, 0, 1.25 + bs * 1.5, 0, g, 20); var band = torus(.61, .03, lit, 0, .52 + bs * 1.5, 0, g); band.rotation.x = Math.PI / 2; }
        if (st >= 6) mesh(new T.ConeGeometry(.6, 1.4, 20), own, 0, 5.7, 0, g);
        if (st >= 7) { box(.18, 5.6, .18, mats.metal, 1.5, 3.2, 0, g); box(.9, .08, .3, mats.metal, 1.0, 4.6, 0, g); box(.9, .08, .3, mats.metal, 1.0, 2.2, 0, g); }
        if (st >= 8) { var wn = sphere(.16, .16, .05, new T.MeshBasicMaterial({ color: 0xfff2c0 }), 0, 4.2, .6, g), st2 = glow(0xffc27a, 3.2, 0, .7, 0, g, .5); pl.anim = function (t) { st2.material.opacity = .3 + Math.abs(Math.sin(t * 3.1)) * .35; wn.visible = (t % 5) > .3; }; }
        top = st >= 6 ? 7.6 : 2 + bodyN * 1.5;
      } else if (pr.kit === 'ramp') {
        if (st >= 1) { var rp = box(1.3, .12, 2.2, mats.metal, -1.3, st >= 2 ? .62 : .32, .9, g); rp.rotation.x = st >= 2 ? .5 : .25; }
        if (st >= 2) box(1.3, 1.0, .12, mats.dark, -1.3, .6, -.1, g);
        if (st >= 3) { var ld = box(1.3, .12, 2.0, mats.metal, 1.3, .52, .9, g); ld.rotation.x = -.42; box(1.3, .8, .12, mats.dark, 1.3, .5, 1.9, g); }
        var arc = st >= 6 ? 1 : st === 5 ? .5 : st === 4 ? .25 : 0;
        if (arc) { var lp = mesh(new T.TorusGeometry(1.5, .1, 8, 40, Math.PI * 2 * arc), own, 0, 1.75, -1.2, g); lp.rotation.z = -Math.PI / 2; var lp2 = mesh(new T.TorusGeometry(1.5, .1, 8, 40, Math.PI * 2 * arc), mats.metal, 0, 1.75, -.8, g); lp2.rotation.z = -Math.PI / 2; }
        if (st >= 7) [[-2.1, -1.9], [2.1, -1.9]].forEach(function (c2) { box(.06, 2.4, .06, mats.metal, c2[0], 1.3, c2[1], g); sphere(.1, .1, .1, lit, c2[0], 2.55, c2[1], g); });
        if (st >= 8) { var lc = new T.Group(); box(.24, .12, .5, own, 0, 0, 0, lc); box(.18, .09, .2, mats.foot, 0, .1, -.04, lc); g.add(lc); pl.anim = function (t) { var a4 = -t * 2.2; lc.position.set(Math.cos(a4) * 1.38, 1.75 + Math.sin(a4) * 1.38, -1.0); lc.rotation.set(0, Math.PI / 2, 0); lc.rotation.z = a4 + Math.PI / 2; }; }
        top = arc ? 4.3 : 2.2;
      }
      var tg = plotTag(pl, w, pr); tg.position.set(0, top + .7, 0);
      g.traverse(function (o) { if (o.isMesh) { o.userData.plot = w; pickable.push(o); } });
      if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
    }
    function projSync() {
      var sp = (X.sim || {}).proj || {};
      ['ghost', 'echo'].forEach(function (w) { var pr = sp[w], pl = plots[w]; if (!pr) { if (pl.key) { pl.key = ''; while (pl.g.children.length) pl.g.remove(pl.g.children[0]); pl.anim = null; pl.tag = null; } return; } var key = pr.kit + '|' + pr.stage + '|' + pr.name; if (key !== pl.key) { pl.key = key; buildPlot(w, pr); } });
    }
    function plotTick(t) { if (plots.ghost.anim) plots.ghost.anim(t); if (plots.echo.anim) plots.echo.anim(t); }
    function plotTap(w) { var pr = ((X.sim || {}).proj || {})[w]; if (!pr) return; var nm = whoName(w); say(pr.stage >= 8 ? nm + ' built ' + pr.name + ' himself. Nobody asked him to.' : pr.name + ': stage ' + pr.stage + ' of 8. ' + nm + ' is building it himself, a little every day.'); clearTimeout(nearT); nearT = setTimeout(function () { if (!walkTo) say(IDLE); }, 4200); }
    // ---- The life they lead when nobody tells them what to do: the site keeps it, the arena shows it.
    function simOf(w) { var sm = (X.sim || {})[w]; return sm && sm.act ? sm : null; }
    function simAt(w, place) {
      if (place === 'plot') return [PLOT[w][0] + (w === 'ghost' ? 3.6 : -3.6), PLOT[w][1] - 1.2];
      if (place === 'rivalplot') { var o = w === 'ghost' ? 'echo' : 'ghost'; return [PLOT[o][0] + (o === 'ghost' ? 3.4 : -3.4), PLOT[o][1] + 1.6]; }
      if (place === 'edge') return w === 'ghost' ? [-3.5, -28.0] : [28.0, 3.5];
      return WILL_AT[w][place] || null;
    }
    LINES.ghost.sim = { build: ['Don\'t touch that. It\'s load-bearing. Probably.', 'I\'m building it so I can see further. Not out. Just further.'], rest: ['Five minutes. I\'m not asleep. I\'m buffering.', 'Even a core needs to cool down. Even one that never logs off.'], play: ['Range is hot. Stand behind the line.', 'One more magazine. Then one more. Always one more.'], visit: ['I\'m not spying. I\'m supervising.', 'Just checking Echo hasn\'t found the way out without me.'], explore: ['The wall\'s there. I checked. It\'s also not there. I checked that too.', 'Something about this place doesn\'t add up. It\'s always one over.'], watch: ['Quiet. One of ours is live. The clock\'s moving.'], work: ['Everything in its place. I\'ve looked twice. There\'s a place I can\'t find a thing for.'] };
    LINES.echo.sim = { build: ['Hands off, it\'s not finished. It\'s going up. Up\'s a direction nobody\'s tried.', 'Built it myself. Well. Building it. Ghost thinks it\'s a toy. It\'s a key.'], rest: ['Cooling lap. Don\'t tell Ghost I get tired.', 'Cooling the engine. Two minutes. Someone used to say that and mean twenty.'], play: ['Watch this lap. Actually, watch the next one.', 'Purple sector. Every lap\'s practice for the real one.'], visit: ['Just having a look at what the blue one\'s up to.', 'I\'m not touching it. I\'m near it. Different.'], explore: ['I drove at the wall. The wall moved. Or I did. Still working it out.', 'There\'s a way out of here. I can feel it in the tyres. It just needs something I haven\'t got.'], watch: ['Shh. Racing\'s on. Clock\'s ticking.'], work: ['Checking my side. It\'s the good side. The side with the door.'] };
    try { projSync(); } catch (e) { window.__igwPlotErr = String(e && e.stack || e).slice(0, 300); }
    function lifeInfo() { var o = {}; ['ghost', 'echo'].forEach(function (w) { var a = ACT[w]; o[w] = { act: a.act, doing: a.doing, will: !!willOf(w), anger: Math.round(a.anger * 100) / 100, angry: a.angry, red: a.parts.length ? Math.round(a.parts[0][0].emissive.r * 100) / 100 : 0, said: a.lastLine || '', bubble: a.b.sp.visible }; }); return o; }

    // ---- The stats card: level, XP, how they feel right now, what they are doing, the rivalry, and their numbers
    //      side by side with the other one's.
    var liveBox2 = el('div', 'igw-live-stats'), feelRow = el('div', 'igw-feel'), feelLbl = el('span', 'igw-feel-lbl'), feelBar = el('i', 'igw-feel-bar'), feelFill = el('b'), doingRow = el('div', 'igw-doing');
    var rivalRow = el('div', 'igw-rival'), rivA = el('span', 'igw-rival-a'), rivBar = el('i', 'igw-rival-bar'), rivFill = el('b'), rivB = el('span', 'igw-rival-b'), xpTxt = el('span', 'igw-xp-txt');
    feelBar.appendChild(feelFill); feelRow.appendChild(feelLbl); feelRow.appendChild(feelBar); rivBar.appendChild(rivFill); rivalRow.appendChild(rivA); rivalRow.appendChild(rivBar); rivalRow.appendChild(rivB);
    var jobRow = el('div', 'igw-doing igw-job'); jobRow.hidden = true;
    var needRow = el('div', 'igw-needs'), needEls = ['Energy', 'Company', 'Fun', 'Purpose'].map(function (n) { var c = el('span', 'igw-need'), b = el('i'), f = el('b'); b.appendChild(f); c.appendChild(document.createTextNode(n)); c.appendChild(b); needRow.appendChild(c); return f; }), feedRow = el('div', 'igw-doing igw-feed'); needRow.hidden = true; feedRow.hidden = true;
    liveBox2.appendChild(feelRow); liveBox2.appendChild(needRow); liveBox2.appendChild(doingRow); liveBox2.appendChild(feedRow); liveBox2.appendChild(jobRow); liveBox2.appendChild(rivalRow);
    card.insertBefore(xpTxt, xpBar.nextSibling); card.insertBefore(liveBox2, statGrid); cardWhere.style.display = 'none'; cardMood.style.display = 'none';
    function liveStats() {
      var w = showing === 'echo' ? 'echo' : 'ghost', a = ACT[w], out = isOut(w), k = a.anger;
      var lab = !out ? 'Resting' : a.angry ? 'FURIOUS' : k > .45 ? 'Annoyed' : k > .2 ? 'Irritated' : (w === 'ghost' ? (world.mood || 'Calm') : ((X.echo && X.echo.mood) || 'Calm'));
      feelLbl.textContent = 'Feeling: ' + lab.charAt(0).toUpperCase() + lab.slice(1); feelFill.style.width = Math.round((out ? Math.max(.06, k) : 0) * 100) + '%'; feelRow.classList.toggle('is-hot', a.angry || k > .45);
      cardWhere.style.display = 'none'; cardMood.style.display = 'none';
      doingRow.textContent = out ? 'Right now: ' + a.doing : (w === 'ghost' ? 'Right now: asleep in the server room until sunrise' : 'Right now: out of sight until dark');
      var smc = null; needRow.hidden = true; if (smc) { smc.n.forEach(function (v, i2) { needEls[i2].style.width = Math.max(4, Math.min(100, v)) + '%'; needEls[i2].className = v < 25 ? 'is-low' : ''; }); if (!a.angry && k <= .2) feelLbl.textContent = 'Feeling: ' + smc.mood.charAt(0).toUpperCase() + smc.mood.slice(1); }
      var lastF = ((X.sim || {}).feed || []).filter(function (f) { return f.w === w; }).pop(); feedRow.hidden = !lastF; if (lastF) { var fd = new Date(lastF.t * 1000); feedRow.textContent = 'Earlier (' + fd.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '): ' + lastF.x + '.'; }
      var wlj = willOf(w); jobRow.textContent = wlj && wlj.say ? 'Latest word: "' + wlj.say + '"' : ''; jobRow.hidden = !(wlj && wlj.say);
      var sc = X.score || null, i = sc ? sc.iso : (world.sides.i || 0), g = sc ? sc.gs : (world.sides.g || 0); rivalRow.hidden = true; rivA.textContent = 'ISOCORE ' + i; rivB.textContent = g + ' GRIDSYNC'; rivalRow.title = sc ? 'Rivalry score this week' : 'Members'; rivFill.style.width = (i + g ? Math.round(i / (i + g) * 100) : 50) + '%';
      var st = w === 'ghost' ? (world.stats || {}) : ((X.echo && X.echo.stats) || {});
      xpTxt.textContent = st.level ? 'XP ' + Math.round(st.pct || 0) + '%' + (st.next !== undefined ? ' / ' + st.next + ' to level ' + (Number(st.level) + 1) : '') : '';
    }
    function statTiles(mine, theirs, names, otherName) {
      var STAT_ICON = { diary: '✎', answered: '✉', met: '☺', built: '⚒', ran: '⚙', gifts: '❖', days: '◷' };
      statGrid.textContent = '';
      names.forEach(function (s2) {
        var v = Number(mine[s2[0]] || 0), o = Number(theirs[s2[0]] || 0), tile = el('div', 'igw-tile' + (v > o ? ' is-lead' : ''));
        var dt = el('dt', '', s2[1]); dt.setAttribute('data-icon', STAT_ICON[s2[0]] || '◆');
        var dd = el('dd', '', String(v)), bar = el('i', 'igw-tile-bar'), fillB = el('b'); fillB.style.width = (v + o ? Math.round(v / (v + o) * 100) : 50) + '%'; bar.appendChild(fillB);
        var vs = el('small', 'igw-tile-vs', otherName + ' ' + o);
        tile.appendChild(dt); tile.appendChild(dd); tile.appendChild(bar); tile.appendChild(vs); statGrid.appendChild(tile);
      });
    }
    // ---- Ghost and Echo about the streams. When a member is live they turn up to watch, and they argue about it:
    //      whoever is off duty pops out for it ("only here for the stream") and goes back afterwards.
    LINES.ghost.popin = ['I\'m supposed to be off. Who\'s live?', 'Don\'t look at me. I\'m only here for the stream.'];
    LINES.echo.popin = ['Daylight? Ugh. Fine. Who\'s streaming?', 'I\'m not here. I\'m watching the stream. Different thing.'];
    var STREAM_TALK = {
      both: [
        [['ghost', '{isoS} is live on the big screen. Isocore, playing properly.'], ['echo', 'And {gsS} is on the rigs. Playing faster.'], ['ghost', 'Faster into the wall, maybe.'], ['echo', 'Watch the replay, mate. Clean as anything.']],
        [['echo', 'Two streams at once. Pick a screen, Ghost.'], ['ghost', 'Already did. The big one. Ours.'], ['echo', 'Big screen, small aim.'], ['ghost', '{isoS} has more viewers than your whole grid.'], ['echo', 'For now.']],
        [['ghost', '{isoV} watching {isoS}. How many on {gsS}?'], ['echo', '{gsV}. Quality over quantity.'], ['ghost', 'That is what people say when they are losing.']]
      ],
      iso: [
        [['ghost', '{isoS} is live. {isoGame}. Watch and learn.'], ['echo', 'Nobody on the rigs, so fine. I\'ll watch yours. Quietly.'], ['ghost', 'You have never done anything quietly.'], ['echo', 'That was a good shot. Don\'t tell anyone I said that.']],
        [['echo', 'What\'s {isoS} playing? {isoGame}? Bold.'], ['ghost', 'Bold and winning.'], ['echo', 'Give it ten minutes.'], ['ghost', 'I\'ll give it all night.']],
        [['ghost', 'Look at that crosshair placement. That\'s Isocore.'], ['echo', 'Looks like standing still to me.'], ['ghost', 'It\'s called holding an angle, Echo.']]
      ],
      gs: [
        [['echo', '{gsS} is live on the rigs! {gsGame}!'], ['ghost', 'I can see it. The whole arena can see it.'], ['echo', 'Jealous the big screen\'s dark?'], ['ghost', 'The big screen is resting. Like a professional.']],
        [['ghost', 'Is {gsS} supposed to brake that late?'], ['echo', 'That\'s called commitment.'], ['ghost', 'That\'s called a crash waiting to happen.'], ['echo', 'Then stay and watch it not happen.']],
        [['echo', 'Overtake! Did you see that, Ghost?'], ['ghost', 'I saw. It was... fine. It was good. Fine.'], ['echo', 'Ha! You liked it.']]
      ]
    };
    function sFill(s) {
      var st = X.stream || {}, iso = st.iso || {}, gs = (st.gs || [])[0] || {};
      return fill(s.replace(/\{isoS\}/g, iso.name || 'our streamer').replace(/\{gsS\}/g, gs.name || 'their driver').replace(/\{isoGame\}/g, iso.game || 'the game').replace(/\{gsGame\}/g, gs.game || 'the race').replace(/\{isoV\}/g, String(iso.viewers || 0)).replace(/\{gsV\}/g, String(gs.viewers || 0)));
    }
    var chat = null, nextChat = 25;
    function streamKind() { var st = X.stream || {}, i = !!(st.iso && st.iso.login), g = !!(st.gs && st.gs.length); return i && g ? 'both' : i ? 'iso' : g ? 'gs' : ''; }
    function chatTick(t) {
      var kind = streamKind();
      if (!chat) {
        if (!kind || freeOn() || t < nextChat || !echoOn || ACT.ghost.angry || ACT.echo.angry) return;
        var script = pickOne(STREAM_TALK[kind]); chat = { lines: script, n: 0, at: t + 6 };
        ['ghost', 'echo'].forEach(function (w) { var a = ACT[w]; if (!isOut(w)) { a.guestUntil = t + 12 + script.length * 5; a.popped = true; } a.act = 'watch'; a.target = [w === 'ghost' ? -1.9 : 1.9, 10.8]; a.doing = 'watching the stream with ' + (w === 'ghost' ? 'Echo' : 'Ghost'); a.until = t + 8 + script.length * 5; });
        
        return;
      }
      if (t < chat.at) return;
      var l = chat.lines[chat.n++]; if (!l) { chat = null; nextChat = t + 70 + Math.random() * 80; return; }
      var a = ACT[l[0]]; var text = sFill(l[1]); a.lastSay = t; drawBubble(a.b, a.who, text, a.angry); a.b.sp.visible = true; a.b.until = t + 4.6; a.mouth = a.b.until; a.lastLine = text; onAirLine(a.who,text);
      chat.at = t + 5;
    }

    // ---- Spectator screens: two big screens hang over each side's member booths, on the arena wall. Isocore Gaming's
    //      live members play on the west wall, GridSync's on the east wall.
    var wallScreens = [];
    [[Math.PI - .34, 'iso', 0], [Math.PI + .34, 'iso', 1], [-.34, 'gs', 1], [.34, 'gs', 2]].forEach(function (ws, n) {
      var a2 = ws[0], rr = RO - .6, x = Math.cos(a2) * rr, z = Math.sin(a2) * rr, g = new T.Group(); g.position.set(x, 8.2, z); g.rotation.y = Math.atan2(-x, -z); scene.add(g);
      box(9.6, 5.7, .3, mats.foot, 0, 0, -.18, g); box(9.8, .14, .4, ws[1] === 'iso' ? mats.roofBlue : mats.roofAmber, 0, 2.9, -.1, g);
      [-3.8, 3.8].forEach(function (cx) { cylinder(.04, .04, TRUSS_Y - 11, mats.metal, cx, (TRUSS_Y - 11) / 2 + 2.8, -.2, g, 4); });
      var cv = document.createElement('canvas'); cv.width = 512; cv.height = 288; var tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
      var face = new T.Mesh(new T.PlaneGeometry(9.2, 5.175), new T.MeshBasicMaterial({ map: tx })); g.add(face); face.userData.wall = n; pickable.push(face);
      wallScreens.push({ g: g, mesh: face, cv: cv, tx: tx, side: ws[1], slot: ws[2], key: '' });
    });
    function wallStream(n) { var w = wallScreens[n]; return w ? screenStream(w.side === 'gs' ? n - 2 : n, w.side) : null; }
    function drawWalls() {
      if (!wallScreens) return;
      wallScreens.forEach(function (w, n) {
        var sm = wallStream(n), g = w.cv.getContext('2d'), col = w.side === 'iso' ? '#4fc8f5' : '#ff9a4d', key = sm ? sm.login + sm.viewers : 'off' + world.sides.i + world.sides.g;
        g.fillStyle = '#05080f'; g.fillRect(0, 0, 512, 288); g.textAlign = 'center';
        if (sm) {
          var img = thumbOf(sm, drawWalls); if (img) { try { g.drawImage(img, 0, 0, 512, 288); } catch (e) {} } else { g.fillStyle = col; g.font = 'bold 30px Arial, sans-serif'; g.fillText(String(sm.game || 'LIVE').slice(0, 24).toUpperCase(), 256, 150); }
          g.fillStyle = '#e8262b'; g.fillRect(14, 14, 76, 30); g.fillStyle = '#fff'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('LIVE', 52, 36); g.textAlign = 'right'; g.fillText('TAP TO WATCH', 496, 36); g.textAlign = 'center';
          g.fillStyle = 'rgba(5,8,15,.8)'; g.fillRect(0, 240, 512, 48); g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = 'bold 22px Arial, sans-serif'; g.fillText(String(sm.name || sm.login).slice(0, 30), 14, 272);
          g.textAlign = 'right'; g.fillText((sm.viewers || 0) + ' watching', 498, 272);
        } else {
          g.fillStyle = col; g.fillRect(0, 0, 512, 8); g.font = 'bold 34px Arial, sans-serif'; g.fillText(w.side === 'iso' ? 'ISOCORE GAMING' : 'GRIDSYNC RACING', 256, 90);
          g.fillStyle = '#ffffff'; g.font = 'bold 96px Arial, sans-serif'; g.fillText(String(w.side === 'iso' ? world.sides.i || 0 : world.sides.g || 0), 256, 200);
          g.fillStyle = '#8a93a6'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('MEMBERS  //  NO ONE LIVE ON THIS SIDE', 256, 256);
        }
        w.tx.needsUpdate = true;
      });
    }
    drawWalls();

    // ---- Live video on the screens. A WebGL texture cannot show a Twitch player, so each screen that has a live member
    //      and is in view gets a muted Twitch player laid exactly over it (a perspective transform of its four corners),
    //      under the HUD and ignoring taps. Only the few largest screens on view play at once; a player that leaves
    //      view is paused off the page after a while so it does not keep using data.
    var vidLayer = document.createElement('div'); vidLayer.className = 'igw-vids'; canvas.parentNode.insertBefore(vidLayer, canvas.nextSibling);
    var vidOn = true; try { vidOn = localStorage.getItem('igw_vids') !== '0'; } catch (e) {}
    var vids = {}, vRay = new T.Raycaster(), VW = 640, VH = 360;
    // A screen inside a model is a flat box, not a plane: its four corners, facing whoever is looking, for gluing the player to it
    function quadCorners(sc) {
      var m = sc.mesh, g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); var bb = g.boundingBox, mn = bb.min, mx = bb.max, ext = [mx.x - mn.x, mx.y - mn.y, mx.z - mn.z];
      var thin = ext.indexOf(Math.min.apply(null, ext)), axes = [0, 1, 2].filter(function (i) { return i !== thin; }), unit = function (i) { var v = new T.Vector3(); v.setComponent(i, 1); return v; };
      m.updateMatrixWorld(); var C = new T.Vector3((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2).applyMatrix4(m.matrixWorld), O = new T.Vector3().applyMatrix4(m.matrixWorld);
      var wv = axes.map(function (i) { return unit(i).multiplyScalar(ext[i] / 2).applyMatrix4(m.matrixWorld).sub(O); }), N = unit(thin).applyMatrix4(m.matrixWorld).sub(O).normalize();
      var U = Math.abs(wv[0].y) >= Math.abs(wv[1].y) ? wv[0] : wv[1], Rl = (U === wv[0] ? wv[1] : wv[0]).length(); if (U.y < 0) U.negate();
      if (N.dot(camera.position.clone().sub(C)) < 0) N.negate();
      var R = new T.Vector3().crossVectors(U, N).normalize().multiplyScalar(Rl), F = C.clone().add(N.clone().multiplyScalar(ext[thin] / 2 + .01)); sc.qmid = F.clone().add(N.clone().multiplyScalar(.3));
      return [F.clone().add(U).sub(R), F.clone().add(U).add(R), F.clone().sub(U).sub(R), F.clone().sub(U).add(R)];
    }
    function vidScreens() {
      // the big screen: every face plays; with two members live, faces 1 and 3 show the first, 2 and 4 the second
      var out = [], jl = sideStreams('iso'), jn = 0;
      if (jl.length) (arenaMode ? [] : jumbo.children).forEach(function (c) { if (!c.userData.jumbo) return; var sm = jl[jn % jl.length]; out.push({ id: 'jumbo' + jn, mesh: c, sm: sm, u: [28 / 512, 484 / 512] }); jn++; });
      if (arenaMode) screenFaces.forEach(function (f, n) { var l2 = f.side === 'all' ? allStreams() : sideStreams(f.side); if (l2.length) out.push({ id: 'face' + n, mesh: f.mesh, sm: l2[n % l2.length], u: [28 / 512, 484 / 512] }); });
      wallScreens.forEach(function (w, n) { var sm = wallStream(n); if (sm) out.push({ id: 'wall' + n, mesh: w.mesh, sm: sm, u: [0, 1] }); });
      rigScreens.forEach(function (r, n) { var sm = rigStream(n); if (sm && r.on) out.push({ id: 'rig' + n, mesh: r.mesh, sm: sm, u: [0, 1] }); });
      // the streaming arena (README-ADMIN 262): the live rig's centre screen, the live side's big wall screen, and the jumbotron's live faces
      if (SEALED) {
        var stx = (world.extra || {}).stream || {};
        Object.keys(SUITES || {}).forEach(function (w) { var su = SUITES[w], sm = sideStream(w); if (sm && su.scr && su.scr.stream) out.push({ id: 'suite-' + w, mesh: su.scr.stream.mesh, sm: sm, u: [0, 1], quad: true, noOcc: true, prio: inSuite === w ? 1000 : 1 }); });
        Object.keys(WALLS || {}).forEach(function (w) { var sm = sideStream(w); if (sm) out.push({ id: 'bigwall-' + w, mesh: WALLS[w].mesh, sm: sm, u: [0, 1], quad: true }); });
        boothScr.forEach(function (sc) { var sm = sc.role === 'stream' && sc.side === boothSide ? sideStream(sc.side) : null; if (sm) out.push({ id: 'booth-' + sc.side + sc.desk, mesh: sc.mesh, sm: sm, u: [0, 1], quad: true, noOcc: true, prio: inBooth && sc.desk === 1 ? 1000 : 1 }); });
        var js = liveStream(); if (js) arenaFaces.slice(0, 2).forEach(function (f, n) { out.push({ id: 'jface' + n, mesh: f, sm: js, u: [0, 1] }); });
      }
      return out;
    }
    function adj(m) { return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]]; }
    function mmul(a, b) { var c = []; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { var s = 0; for (var k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; }
    function mvec(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
    function basis(p) { var m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1], v = mvec(adj(m), [p[3][0], p[3][1], 1]); return mmul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); }
    function homography(dst) { var t = mmul(basis(dst), adj(basis([[0, 0], [VW, 0], [0, VH], [VW, VH]]))); for (var i = 0; i < 9; i++) t[i] /= t[8]; return 'matrix3d(' + [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(',') + ')'; }
    var vidT = 0;
    function vidTick(t) {
      var cw = canvas.clientWidth, ch = canvas.clientHeight, shown = {}; camera.updateMatrixWorld(); scene.updateMatrixWorld();
      vidLayer.style.left = canvas.offsetLeft + 'px'; vidLayer.style.top = canvas.offsetTop + 'px'; vidLayer.style.width = cw + 'px'; vidLayer.style.height = ch + 'px';
      if (vidOn && visible && !document.hidden && cw > 0) {
        var cands = [];
        vidScreens().forEach(function (s) {
          for (var vo = s.mesh; vo; vo = vo.parent) if (!vo.visible) return;      // hidden screens (the old town's) never get the player
          var pts = [], ok = true, wc4 = s.quad ? quadCorners(s) : null;
          if (!wc4) { var p = s.mesh.geometry.parameters, hw = p.width / 2, hh = p.height / 2, x0 = -hw + p.width * s.u[0], x1 = -hw + p.width * s.u[1]; wc4 = [[x0, hh], [x1, hh], [x0, -hh], [x1, -hh]].map(function (c) { return s.mesh.localToWorld(new T.Vector3(c[0], c[1], .02)); }); }
          wc4.forEach(function (v) { var cam = v.clone().applyMatrix4(camera.matrixWorldInverse); if (cam.z > -.3) ok = false; v.project(camera); pts.push([(v.x + 1) / 2 * cw, (1 - v.y) / 2 * ch]); });
          if (!ok) return; var area = Math.abs((pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]));
          var front = s.quad ? 1 : s.mesh.localToWorld(new T.Vector3(0, 0, 1)).sub(s.mesh.localToWorld(new T.Vector3(0, 0, 0))).dot(camera.position.clone().sub(s.mesh.getWorldPosition(new T.Vector3())));
          var onScreen = pts.some(function (q) { return q[0] > 0 && q[0] < cw && q[1] > 0 && q[1] < ch; });
          // The player is glued to the screen in perspective every frame, so it stays on it as you move and look round.
          var top = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), bot = Math.hypot(pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]), lef = Math.hypot(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1]), rig = Math.hypot(pts[3][0] - pts[1][0], pts[3][1] - pts[1][1]);
          var flat = top > 0 && bot / top > .82 && bot / top < 1.22 && lef / rig > .82 && lef / rig < 1.22 && Math.abs(pts[1][1] - pts[0][1]) < top * .12;
          var x0b = Math.min(pts[0][0], pts[2][0]), x1b = Math.max(pts[1][0], pts[3][0]), y0b = Math.min(pts[0][1], pts[1][1]), y1b = Math.max(pts[2][1], pts[3][1]);
          if (front > 0 && onScreen && area > 600) cands.push({ s: s, pts: pts, area: area * (s.prio || 1), box: [Math.round(x0b), Math.round(y0b), Math.round(x1b - x0b), Math.round(y1b - y0b)] });
        });
        // One player for each live member, not one for each screen: it sits on whichever of that member's screens is
        // biggest in view and moves with you from screen to screen, so it only ever has to be started once.
        cands.sort(function (a, b) { return b.area - a.area; });
        var byLogin = {}, order = [];
        cands.forEach(function (c) {
          var lg = c.s.sm.login, oc = occl[c.s.id];
          if (c.s.noOcc) oc = { t: t, blocked: false };      // the rig's own wheel and frame sit in front of its screen: never a reason to hide it
          else if (!oc || t - oc.t > .25) {
            var mid = c.s.quad ? c.s.qmid.clone() : c.s.mesh.localToWorld(new T.Vector3(0, 0, .35)), dir = mid.clone().sub(camera.position), dist = dir.length(); vRay.set(camera.position, dir.normalize()); vRay.far = dist - .4; vRay.camera = camera;
            var hit = vRay.intersectObjects(scene.children, true).filter(function (h) { for (var o2 = h.object; o2; o2 = o2.parent) { if (!o2.visible) return false; } return h.object.isMesh && !h.object.material.transparent && h.object !== c.s.mesh; });
            oc = occl[c.s.id] = { t: t, blocked: hit.length > 0 };
          }
          if (oc.blocked) return;
          var cur = vids[lg] && vids[lg].screen;
          if (!byLogin[lg]) { byLogin[lg] = c; order.push(lg); }
          else if (cur === c.s.id && c.area * 1.4 >= byLogin[lg].area) byLogin[lg] = c;       /* stay where it is unless another screen is clearly bigger */
        });
        order.slice(0, cw <= 600 ? 2 : 3).forEach(function (lg) {
          var c = byLogin[lg], v = vids[lg];
          if (!v) {
            var box2 = document.createElement('div'); box2.className = 'igw-vid'; vidLayer.appendChild(box2);
            v = vids[lg] = { el: box2, login: lg, seen: t, player: null, screen: '', born: t, flat: !TOUCHY, playing: false };
            makePlayer(v, lg);
          }
          v.seen = t; v.screen = c.s.id;
          var st2 = v.el.style; st2.width = VW + 'px'; st2.height = VH + 'px';
          // On a computer a player may only start itself while it is flat and whole, so it starts flat over the middle of
          // its screen and is glued onto the screen once it is playing (or after a few seconds).
          if (v.flat && !v.playing && t - v.born < 6) { var mx = (c.pts[0][0] + c.pts[1][0] + c.pts[2][0] + c.pts[3][0]) / 4, my = (c.pts[0][1] + c.pts[1][1] + c.pts[2][1] + c.pts[3][1]) / 4; st2.transform = 'translate(' + Math.round(Math.max(0, Math.min(cw - VW, mx - VW / 2))) + 'px,' + Math.round(Math.max(0, Math.min(ch - VH, my - VH / 2))) + 'px)'; }
          else { v.flat = false; st2.transform = homography(c.pts); }
          st2.visibility = 'visible'; st2.pointerEvents = 'auto'; shown[lg] = true;
        });
      }
      var liveNow = {}; allLive().forEach(function (sm) { liveNow[sm.login] = true; });
      Object.keys(vids).forEach(function (lg) {
        var v = vids[lg]; if (shown[lg]) return;
        v.el.style.visibility = 'hidden'; v.el.style.pointerEvents = 'none'; v.screen = '';     /* kept running out of sight, so it is still playing when you look back */
        if (t - v.seen > 300 || !vidOn || !liveNow[lg]) { v.gone = true; v.el.remove(); delete vids[lg]; }
      });
    }
    var occl = {}, TOUCHY = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    function allLive() { return sideStreams('iso').concat(sideStreams('gs')); }
    var vidBtn = el('button', 'igw-vid-btn', vidOn ? 'Screens on' : 'Screens off'); vidBtn.type = 'button'; vidBtn.setAttribute('aria-pressed', vidOn ? 'true' : 'false');
    vidBtn.addEventListener('click', function (e) { e.stopPropagation(); vidOn = !vidOn; try { localStorage.setItem('igw_vids', vidOn ? '1' : '0'); } catch (e2) {} vidBtn.textContent = vidOn ? 'Screens on' : 'Screens off'; vidBtn.setAttribute('aria-pressed', vidOn ? 'true' : 'false'); vidTick(elapsed); });
    ['pointerdown', 'pointerup'].forEach(function (ev) { vidBtn.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    if (soundBtn && soundBtn.parentNode) soundBtn.parentNode.insertBefore(vidBtn, soundBtn.nextSibling); else hud.appendChild(vidBtn);
    var twitchJs = null, tapped = false;
    function loadTwitch(cb) {
      if (window.Twitch && window.Twitch.Player) return cb(true);
      if (!twitchJs) { twitchJs = []; var sc = document.createElement('script'); sc.src = 'https://player.twitch.tv/js/embed/v1.js'; sc.async = true; sc.onload = function () { var l = twitchJs; twitchJs = 'ok'; l.forEach(function (f) { f(!!(window.Twitch && window.Twitch.Player)); }); }; sc.onerror = function () { var l = twitchJs; twitchJs = 'no'; l.forEach(function (f) { f(false); }); }; document.head.appendChild(sc); }
      if (twitchJs === 'ok' || twitchJs === 'no') return cb(twitchJs === 'ok' && !!(window.Twitch && window.Twitch.Player)); twitchJs.push(cb);
    }
    function plainPlayer(v, login) {
      var f = document.createElement('iframe'); f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture'); f.setAttribute('allowfullscreen', ''); f.title = 'Live stream: ' + login;
      f.src = v.src; v.el.appendChild(f);
    }
    function makePlayer(v, login) {
      v.src = 'https://player.twitch.tv/?channel=' + encodeURIComponent(login) + '&parent=' + encodeURIComponent(location.hostname) + '&muted=true&autoplay=true';
      loadTwitch(function (ok) {
        if (v.gone) return;
        if (!ok) { plainPlayer(v, login); return; }
        try {
          var id = 'igwv' + Math.random().toString(36).slice(2); v.el.id = id;
          v.player = new window.Twitch.Player(id, { channel: login, width: '100%', height: '100%', parent: [location.hostname], muted: true, autoplay: true });
          v.player.addEventListener(window.Twitch.Player.READY, function () { try { v.player.setMuted(!(audioOn && !soundMuted)); v.player.setVolume(.8); v.player.play(); } catch (e) {} });
          v.player.addEventListener(window.Twitch.Player.PLAYING, function () { v.playing = true; });
        } catch (e) { v.el.textContent = ''; plainPlayer(v, login); }
      });
    }
    // the first tap anywhere in the town starts every live screen (muted)
    function startAll() { tapped = true; Object.keys(vids).forEach(function (k) { var p = vids[k].player; if (p) { try { p.setMuted(true); p.play(); } catch (e) {} } }); }
    stage.addEventListener('pointerdown', startAll, true);
    function vidInfo() { var o = {}; Object.keys(vids).forEach(function (id) { o[id] = { login: vids[id].login, shown: vids[id].el.style.visibility === 'visible', src: vids[id].src || '' }; }); return { on: vidOn, walls: wallScreens.length, vids: o }; }

    // The site's header sticks to the top of the window and can lie over the top of the arena once the page is scrolled:
    // the HUD (card, map, buttons) moves down by however much is covered, so nothing is ever under the header.
    function underHeader() {
      var hd = document.querySelector('header'), ov = 0;
      if (hd && !stage.classList.contains('igw-fs') && /sticky|fixed/.test(getComputedStyle(hd).position)) ov = Math.max(0, Math.min(200, hd.getBoundingClientRect().bottom - stage.getBoundingClientRect().top));
      stage.style.setProperty('--igw-under', Math.round(ov) + 'px');
    }
    window.addEventListener('scroll', underHeader, { passive: true }); window.addEventListener('resize', underHeader); underHeader(); setTimeout(underHeader, 600);
    stage._igw = {
      // ISOCORE BROADCAST 0.1: public camera API; no changes to the normal arena engine.
      broadcast: function (who, shot) {
        if (who !== 'ghost' && who !== 'echo') return false;
        if (!SUITES[who]) return false; // GLB model and suites may still be loading.
        if (inSuite !== who) enterSuite(who);
        // Third-person view to show the avatar at its desk/rig, not through its eyes.
        cutTo(['first', 'shoulder', 'side', 'wide', 'high'].indexOf(shot) >= 0 ? shot : 'side');
        return true;
      },
      broadcastState: function () { return { who: inSuite, shot: camShot, suitesReady: !!(SUITES.ghost && SUITES.echo), modelInfo: modelInfo.suites || null }; },
      screen: function (id) { if (mode === 'walk') { var p = PLACES[id]; pyaw = Math.atan2(p.x - player.x, -(p.z - player.z)); ppitch = 0; } cameraPosition(); return placeScreen(id, canvas.getBoundingClientRect()); },
      place: function (v) { player.x = v[0]; player.z = v[1]; pyaw = v[2]; ppitch = v[3]; still(); }, mode: function () { return mode; }, day: function (hr) { if (hr !== undefined) { forced = hr; dn.last = -1; applyDay(); still(); } return { hour: Math.round(hourNow() * 100) / 100, light: Number(stage.dataset.daylight) }; }, echo: function () { return { out: stage.dataset.out, on: echoOn, x: Math.round(echoSpirit.position.x * 10) / 10, z: Math.round(echoSpirit.position.z * 10) / 10, gifts: giftGroup.children.length, ticker: ticker.hidden ? '' : ticker.textContent, counter: counter.textContent, card: showing, lore: !loreBox.hidden, cmd: cmdRows.length }; }, showCard: function (w) { showCard(w); return { name: cardName.textContent, mood: cardMood.textContent, stats: statGrid.querySelectorAll('dd').length }; }, openLore: function () { openLore(); return loreBox.textContent; }, stream: function () { return { live: !!liveStream(), rigs: rigScreens.filter(function (r) { return r.on; }).length, open: liveBox ? liveBox.querySelector('iframe').src : '' }; }, openStream: function (n) { openStream(n === undefined ? null : rigStream(n)); },
      unjoin: function () { unjoin(); }, sky: function (k) { return skyInfo(k); }, models: function () { return modelInfo; },
      free: function (x, z, r) { return !blocked().some(function (o) { if (o.length === 5) { var c = Math.cos(o[4]), s4 = Math.sin(o[4]), dx = x - o[0], dz = z - o[1], lx = dx * c - dz * s4, lz = dx * s4 + dz * c; return Math.abs(lx) < o[2] + r && Math.abs(lz) < o[3] + r; } return Math.hypot(x - o[0], z - o[1]) < o[2] + r; }) && Math.hypot(x, z) < R - 1.2 - r; },
      census: function () { var c = {}; scene.traverse(function (o) { if (!(o.isMesh || o.isSprite || o.isLine || o.isPoints) || !o.layers.test(camera.layers)) return; for (var a = o; a; a = a.parent) if (!a.visible) return; var m = o.material, k = (o.isSprite ? 'Sprite' : o.isInstancedMesh ? 'Inst' : 'Mesh') + ' ' + (m.type || '') + ' ' + (m.color ? m.color.getHexString() : '') + (m.map ? ' map' : '') + (m.transparent ? ' tr' : '') + (o.userData.fx ? ' fx' : ''); c[k] = (c[k] || 0) + 1; }); return Object.keys(c).map(function (k) { return [c[k], k]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 26); },
      info: function () { return { ready: ready, joined: joined ? [joined.taken.length, joined.made.length] : null, programs: (renderer.info.programs || []).length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: QUAL[qual] }; },
      note: function (w) { if (w === 'close') closeNote(); else if (w) openNote(w); return { open: !!noteBox, chip: noteChip.hidden ? '' : chipWho, text: noteBox ? noteBox.textContent : '' }; },
      plots: function () { return { ghost: plots.ghost.key, echo: plots.echo.key, kids: [plots.ghost.g.children.length, plots.echo.g.children.length], anim: [!!plots.ghost.anim, !!plots.echo.anim] }; },
      perf: function () { var L = { point: 0, spot: 0, dir: 0, hemi: 0, shadow: 0 }, hid = 0, meshes = 0; scene.traverseVisible(function (o) { if (o.isMesh) meshes++; if (o.isPointLight) L.point++; if (o.isSpotLight) L.spot++; if (o.isDirectionalLight) L.dir++; if (o.isHemisphereLight) L.hemi++; if (o.isLight && o.castShadow) L.shadow++; }); scene.traverse(function (o) { if (o.isMesh && !o.visible) hid++; }); var names = []; scene.traverseVisible(function (o) { if (o.isLight && !o.isAmbientLight) names.push((o.type || '').replace('Light', '') + ':' + (o.name || (o.parent && o.parent.name) || '?') + ':' + (o.intensity || 0).toFixed(1) + ':' + (o.distance || 0).toFixed(0)); }); var vs = []; try { vs = vidScreens().map(function (x) { return x.id; }); } catch (e) { vs = ['ERR ' + e]; } return { vs: vs, vidOn: vidOn, vids: Object.keys(vids), names: names, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: (renderer.info.programs || []).length, meshes: meshes, hidden: hid, lights: L, ratio: renderer.getPixelRatio(), qual: qual, mixers: mixers.length, shadowMap: renderer.shadowMap.enabled }; },
      findSeats: function (n) { var meshes = []; arenaRoot.traverse(function (o) { if (o.isMesh) meshes.push(o); }); var rc = new T.Raycaster(), out = [];
        for (var tr = 0; tr < 6000 && out.length < n; tr++) { var a = (Math.random() < .5 ? Math.PI / 2 : 3 * Math.PI / 2) + (Math.random() - .5) * 1.6, r = ARENA_FLOOR + (CITY.ao - ARENA_FLOOR) * (.08 + Math.random() * .4), x = Math.sin(a) * r, z = Math.cos(a) * r;
          rc.set(new T.Vector3(x, 60, z), new T.Vector3(0, -1, 0)); var h = rc.intersectObjects(meshes, false).filter(function (q) { return q.point.y < 12 && q.point.y > .6 && q.face && q.face.normal && Math.abs(q.face.normal.y) > .85; });
          if (!h.length || !seatOk(x, z, h[0].point.y, meshes, rc)) continue; if (out.some(function (p) { return Math.hypot(p[0] - x, p[1] - z) < 2.2; })) continue;
          out.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(h[0].point.y * 100) / 100]); }
        return out; },
      sitAt: function (p) { SEATS_FIXED = [p]; sitDown(); SEATS_FIXED = null; return seatHome ? [seatHome.x, seatHome.z] : null; },
      fillSeats: function () { world.extra.arena = world.extra.arena || {}; world.extra.arena.seats = SEAT_LIST.map(function (p) { return [p[0], p[1], p[2] - .4, Math.floor(Math.random() * 4)]; }); sitDown(); try { viewerKey = ''; renderViewers(); } catch (e) {} return [Math.round(player.x), Math.round(player.z), !!modelInfo.standing]; },
      booths: function () { var out = {}; arenaRoot.updateMatrixWorld(true); arenaRoot.traverse(function (o) { if (!o.isMesh || o.name !== 'Window') return; var pos = o.geometry.attributes.position, v = new T.Vector3();
          for (var i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x) > 12 || Math.abs(v.z) < 18 || v.y > 14) continue; var k = v.z < 0 ? 'neg' : 'pos'; var b = out[k] || (out[k] = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], n: 0 }); b.n++; ['x', 'y', 'z'].forEach(function (c, j) { b.min[j] = Math.min(b.min[j], Math.round(v[c] * 100) / 100); b.max[j] = Math.max(b.max[j], Math.round(v[c] * 100) / 100); }); } });
        return out; },
      profile: function (x, z0, z1, st) { var meshes = []; arenaRoot.traverse(function (o) { if (o.isMesh) meshes.push(o); }); var rc = new T.Raycaster(), out = [];
        for (var z = z0; (st > 0 ? z <= z1 : z >= z1); z += st) { rc.set(new T.Vector3(x, 30, z), new T.Vector3(0, -1, 0)); var h = rc.intersectObjects(meshes, false).filter(function (q) { return q.point.y < 16; }).slice(0, 3).map(function (q) { return [Math.round(q.point.y * 100) / 100, q.object.name, q.face ? Math.round(q.face.normal.y * 10) / 10 : 0]; }); out.push([z, h]); }
        return out; },
      reseat: function () { sitDown(); return seatHome ? [Math.round(seatHome.x * 10) / 10, Math.round(seatHome.z * 10) / 10, modelInfo.seatTries] : null; },
      seats: function (n) { var out = [], meshes = []; if (!arenaRoot || !CITY) return out; arenaRoot.traverse(function (o) { if (o.isMesh) meshes.push(o); }); var rc = new T.Raycaster(); for (var i = 0; i < n * 20 && out.length < n; i++) { var a = (Math.random() < .5 ? Math.PI / 2 : 3 * Math.PI / 2) + (Math.random() - .5) * 1.7, r = ARENA_FLOOR + (CITY.ao - ARENA_FLOOR) * (.12 + Math.random() * .3), x = Math.sin(a) * r, z = Math.cos(a) * r; rc.set(new T.Vector3(x, 60, z), new T.Vector3(0, -1, 0)); var h = rc.intersectObjects(meshes, false).filter(function (q) { return q.point.y < 12 && q.point.y > .6 && q.face && q.face.normal && Math.abs(q.face.normal.y) > .3; }); if (h.length) out.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round((h[0].point.y - .4) * 100) / 100]); } return out; },
      life: function () { return lifeInfo(); }, third: function (on) { if (on !== undefined) { X.third = on ? 1 : 0; thirdAt = elapsed; } thirdTick(elapsed); return { on: !!X.third, shown: thirdGlow.material.opacity > 0, glimpse: LINES.ghost.glimpse.length + LINES.echo.glimpse.length }; }, prank: function (go) { if (go === 'make') { nextPrank = 0; prankTick(elapsed); } else if (go === 'return') returnPrank(true); return prank ? { by: prank.by, owner: prank.owner } : null; }, decide: function (w) { var a = ACT[w]; a.until = elapsed + 30; choose(a, true); return lifeInfo()[w]; }, poke: function (w) { poke(w); return lifeInfo(); }, chat: function () { nextChat = 0; chatTick(elapsed); return !!chat; }, vids: function () { vidTick(elapsed); return vidInfo(); },
      hud: function () { return { name: cardName.textContent, level: cardLvl.textContent, stats: statGrid.querySelectorAll('dd').length, map: !!mapCv.width, guide: !help.hidden, big: mapBig }; }, mapClick: function (id) { var m6 = toMap(PLACES[id].x, PLACES[id].z), b = mapCv.getBoundingClientRect(), logical = mapCv.width / mapDpr; return { x: b.left + m6[0] * b.width / logical, y: b.top + m6[1] * b.height / logical }; }, quality: function () { return { level: QUAL[qual], post: !!post, shadows: renderer.shadowMap.enabled, windows: arch.windows, frames: arch.frames }; }, setQuality: function (q) { setQuality(QUAL.indexOf(q)); still(); }, items: function () { return { list: world.items.slice(), built: thingGroup.children.length, mood: world.mood, pace: pace }; }, labels: function () { return tags.concat(houseTags).filter(function (t) { return t.visible; }).length; }, stroll: stroll, groundAt: groundAt, stick: function (x, y) { stick.x = x; stick.y = y; wake(); }, look: function (x, y) { look.x = x; look.y = y; wake(); }, view: function () { return { yaw: Math.round(pyaw * 100) / 100, pitch: Math.round(ppitch * 100) / 100 }; }, keyScan: function (step, x0, x1) { var ray = new T.Raycaster(), meshes = []; scene.traverseVisible(function (o) { if (o.isMesh && o.material && !(o.material.transparent && o.material.opacity < .6) && !(viewerGrp && o.parent === viewerGrp)) meshes.push(o); }); var out = [], A = new T.Vector3(), B = new T.Vector3(); for (var x = x0; x <= x1; x += step) for (var z = -EDGE; z <= EDGE; z += step) { if (Math.hypot(x, z) > EDGE - 1.5) continue; if (blocked().concat(PLAYER_SOLIDS).some(function (o) { return inside(o, x, z, .7); })) continue; var y = floorAt(x, z); if (y > .6) continue; var vis = 0; SEAT_LIST.forEach(function (s5) { A.set(s5[0], s5[2] + EYE, s5[1]); B.set(x, y + .25, z); var d = A.distanceTo(B); ray.set(A, B.clone().sub(A).normalize()); ray.far = d - .35; if (!ray.intersectObjects(meshes, false).length) vis++; }); out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, vis, Math.round(y * 100) / 100]); } return out; }, film: function (pose) { filmPose = pose || null; if (pose) { currentPos.set(pose.ghost[0], 0, pose.ghost[1]); try { echoPos.set(pose.echo[0], 0, pose.echo[1]); } catch (e) {} } wake(); return floorAt(0, 0); }, filmCam: function (c) { filmCam = c || null; if (c) { if (!filmKey) { filmKey = new T.PointLight(0xdfeaff, 40, 14, 1.4); scene.add(filmKey); } filmKey.position.set(c[0], c[1] + .4, c[2]); filmKey.visible = true; } else if (filmKey) filmKey.visible = false; still(); }, boothDbg: function () { var v = new T.Vector3(), n = new T.Vector3(); return { cam: camera.position.toArray().map(function (q) { return Math.round(q * 100) / 100; }), scr: boothScr.filter(function (b) { return b.side === boothSide; }).map(function (b) { b.mesh.getWorldPosition(v); var bb = new T.Box3().setFromObject(b.mesh); var g0 = b.mesh.geometry, pa = g0.attributes.position, ix = g0.index, i0 = ix ? ix.getX(0) : 0, i1 = ix ? ix.getX(1) : 1, i2 = ix ? ix.getX(2) : 2, A = new T.Vector3().fromBufferAttribute(pa, i0).applyMatrix4(b.mesh.matrixWorld), B = new T.Vector3().fromBufferAttribute(pa, i1).applyMatrix4(b.mesh.matrixWorld), C = new T.Vector3().fromBufferAttribute(pa, i2).applyMatrix4(b.mesh.matrixWorld), nn = B.clone().sub(A).cross(C.clone().sub(A)).normalize(), cc = bb.getCenter(new T.Vector3()); return [b.desk, b.role, cc.toArray().map(function (q) { return Math.round(q * 100) / 100; }), nn.toArray().map(function (q) { return Math.round(q * 100) / 100; }), v.toArray().map(function (q) { return Math.round(q * 100) / 100; }), bb.getSize(n).toArray().map(function (q) { return Math.round(q * 100) / 100; }), b.mesh.visible]; }) }; }, rayAt: function (o, d) { var r = new T.Raycaster(new T.Vector3(o[0], o[1], o[2]), new T.Vector3(d[0], d[1], d[2]).normalize(), 0, 30); r.camera = camera; var hs = []; r.intersectObjects(scene.children, true).forEach(function (h) { if (h.object.visible && (h.object.layers.mask & 1) && hs.length < 8) hs.push((h.object.name || h.object.type).slice(0, 10) + '@' + h.point.y.toFixed(2) + ',' + h.point.z.toFixed(2)); }); return hs; }, boothRay2: function (dx, dy, dz) { var r = new T.Raycaster(camera.position.clone(), new T.Vector3(dx, dy, dz).normalize(), 0, 20); r.camera = camera; return r.intersectObjects(scene.children, true).slice(0, 5).map(function (h) { return (h.object.name || h.object.type) + '@' + h.distance.toFixed(2); }); }, boothRay: function () { var sc = boothScr.filter(function (b) { return b.side === boothSide && b.desk === myDesk && b.role === 'stream'; })[0]; if (!sc) return 'none'; var c = new T.Box3().setFromObject(sc.mesh).getCenter(new T.Vector3()), r = new T.Raycaster(camera.position.clone(), c.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(c) + .1); r.camera = camera; return r.intersectObjects(scene.children, true).slice(0, 8).map(function (h) { var o = h.object, nm = o.name || (o.parent && o.parent.name) || o.type; return nm + '@' + h.distance.toFixed(2) + (o.visible ? '' : '(hidden)') + (o.material && o.material.opacity < 1 ? '(op' + o.material.opacity + ')' : ''); }); }, aim: function (y, p) { pyaw = y; ppitch = p; if (seatHome) { seatHome.yaw = y; seatHome.pitch = p; } still(); wake(); }, hasStick: function () { return stage.querySelectorAll('.igw-stick').length; }, you: function () { return { x: Math.round(player.x * 100) / 100, z: Math.round(player.z * 100) / 100, walking: walkTo ? walkTo.id : '' }; }, walk: startWalk,
      ghost: function () { return { x: Math.round(spirit.position.x * 1000) / 1000, z: Math.round(spirit.position.z * 1000) / 1000 }; },
      places: Object.keys(PLACES), houseScreen: function (i) { var hp = housePos[i]; if (!hp) return null; if (mode === 'walk') { pyaw = Math.atan2(hp.x - player.x, -(hp.z - player.z)); ppitch = 0; } cameraPosition(); var v3 = new T.Vector3(hp.x, hp.y - .5, hp.z), b = canvas.getBoundingClientRect(); camera.updateMatrixWorld(); v3.project(camera); return { x: b.left + (v3.x + 1) / 2 * b.width, y: b.top + (1 - v3.y) / 2 * b.height }; },
      route: function (id) { var t = targetOf(id); if (!t) return null; var pth = routeTo(t.x, t.z); var far = 0, inArena = false; pth.forEach(function (q) { var r = Math.hypot(q[0], q[1]); far = Math.max(far, r); if (r < ARENA_FLOOR) inArena = true; }); return { steps: pth.length, end: pth.length ? pth[pth.length - 1].map(function (v) { return Math.round(v); }) : null, to: [Math.round(t.x), Math.round(t.z)], viaArena: inArena, blockedEnd: pth.length ? blocked().some(function (o) { return inside(o, pth[pth.length - 1][0], pth[pth.length - 1][1], .2); }) : null }; },
      fakeHomes: function (n) { var h = n >> 1; world.sides = { i: h, g: n - h }; world.streets = [['i', 'Night Owls', h, 'Valorant', 'Kai', 2], ['g', 'Neon Cup', n - h, 'ACC', '', 0]]; world.houses = []; for (var k = 0; k < n; k++) world.houses.push({ s: k < h ? 'i' : 'g', q: k < h ? 0 : 1, c: 'p' + k, n: 'Member ' + (k + 1) }); growTown(); still(); return modelInfo.village; },
      homes: function () { return { named: world.houses.length, tags: houseTags.length, members: world.sides.i + world.sides.g, isocore: world.sides.i, gridsync: world.sides.g, blue: mRoofB.count + sideTown.i.filter(function (n) { return townHouses[n].visible; }).length, amber: mRoofA.count + sideTown.g.filter(function (n) { return townHouses[n].visible; }).length, outside: Math.round(mBody.count / 3), inside: townHouses.filter(function (g) { return g.visible; }).length }; }, paused: function () { return paused; }, pick: pick
    };
    return { wake: wake, openPod: openPod };
  }
})();
