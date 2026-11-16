// The stream overlay (overlay.php, README-ADMIN 284). Polls the tug-of-war and the key hunt, reads the stream's Twitch chat (read only)
// and sends !ghost / !echo on (each chat message counts once, however many pages send it).
(function () {
  'use strict';
  var ISOCORE_API_BASE = new URL('../', document.currentScript && document.currentScript.src || location.href).href;

  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search), chan = (q.get('ch') || 'igvain').toLowerCase().replace(/[^a-z0-9_]/g, '');
  var st = { v: 0, lean: '', level: 0, alertAt: 0, resetAt: 0, seen: false }, firsts = null, queue = [], busy = false;
  var SAY = {
    ghost: ['Team Ghost. Hold the line.', 'Quiet, steady, ahead. Good.', 'Chat picked a side. Smart side.'],
    echo: ['Full throttle, Team Echo!', 'Telemetry says we\'re winning.', 'Green flag, orange arena!']
  };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function core(t) { queue.push(t); if (!busy) next(); }
  function next() {
    var t = queue.shift(); if (!t) { busy = false; $('ovCore').hidden = true; return; }
    busy = true; $('ovCoreT').textContent = t; var c = $('ovCore'); c.hidden = true; void c.offsetWidth; c.hidden = false;
    setTimeout(next, 8000);
  }
  function say(who, t) { var e = $(who === 'ghost' ? 'ovSayG' : 'ovSayE'); e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(function () { e.hidden = true; }, 7000); }
  function alertShow(t) { var a = $('ovAlert'); a.textContent = t; a.hidden = false; clearTimeout(a._t); a._t = setTimeout(function () { a.hidden = true; }, 10000); }
  function draw() {
    var v = Math.max(-100, Math.min(100, st.v)), pos = 50 + v / 2, f = $('ovFill');
    $('ovMark').style.left = pos + '%';
    f.style.left = (v < 0 ? pos : 50) + '%'; f.style.width = Math.abs(v) / 2 + '%';
    f.style.background = v < 0 ? 'linear-gradient(90deg,#00d4ff,#6ee7ff)' : 'linear-gradient(90deg,#ffb35c,#ff9a2e)';
    $('ovMark').style.boxShadow = '0 0 22px ' + (v < -24 ? '#00d4ff' : v > 24 ? '#ff9a2e' : '#ffffff');
  }
  function apply(t) {
    if (!t) return; var was = st.lean, wasL = st.level;
    st.v = t.v | 0; st.lean = t.lean || ''; st.level = t.level | 0; draw();
    if (st.seen) {
      if (st.lean && (st.lean !== was || st.level > wasL)) { core((st.lean === 'ghost' ? 'Team Ghost' : 'Team Echo') + (st.level > 1 ? ' owns the arena.' : ' takes the lead.')); say(st.lean, pick(SAY[st.lean])); }
      else if (!st.lean && was) core('Tug-of-war: dead level again.');
      if (t.alert && t.alert.at > st.alertAt) alertShow(t.alert.text);
      if (t.reset > st.resetAt) core('Tug-of-war reset. Pick a side: !ghost or !echo.');
    }
    if (t.alert) st.alertAt = Math.max(st.alertAt, t.alert.at); st.resetAt = Math.max(st.resetAt, t.reset | 0); st.seen = true;
  }
  function get(url, cb) { fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (v) cb(v); }).catch(function () {}); }
  function poll() {
    get(ISOCORE_API_BASE + 'api/tug.state', function (v) { apply(v.tug); if (!chan && v.chat && v.chat[0]) { chan = v.chat[0]; chat(); } });
  }
  function keys() {
    get(ISOCORE_API_BASE + 'api/ghost.keys', function (v) {
      var k = v.keys; if (!k || !k.keys) return; var hid = ['ghost', 'echo'].filter(function (x) { return k.keys[x] && !k.keys[x].first; }).length;
      $('ovKeys').textContent = 'KEY HUNT // ' + (hid ? hid + ' KEY' + (hid > 1 ? 'S' : '') + ' STILL HIDDEN IN THE ARENA' : 'BOTH KEYS FOUND THIS WEEK');
      var now = Date.now() / 1000;
      if (!firsts) { firsts = {}; Object.keys(k.keys).forEach(function (x) { firsts[x] = k.keys[x].first ? k.keys[x].first.at : 0; }); return; }
      Object.keys(k.keys).forEach(function (x) { var f = k.keys[x].first; if (f && f.at > (firsts[x] || 0)) { firsts[x] = f.at; if (now - f.at < 900) core((f.name || 'A fan') + ' found ' + (x === 'ghost' ? 'Ghost\'s key' : x === 'echo' ? 'Echo\'s key' : 'something nobody can name') + ' first.'); } });
    });
  }
  function vote(side, id, who) {
    return; /* Vote writes require signed Twitch EventSub notifications, never anonymous browser submits. */
    fetch(ISOCORE_API_BASE + 'api/tug.vote', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ side: side, id: id, who: who }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (v && v.tug) apply(v.tug); }).catch(function () {});
  }
  var ws = null;
  function chat() {
    if (!chan || ws) return;
    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      ws.onopen = function () { ws.send('CAP REQ :twitch.tv/tags'); ws.send('PASS SCHMOOPIIE'); ws.send('NICK justinfan' + (10000 + Math.floor(Math.random() * 80000))); ws.send('JOIN #' + chan); };
      ws.onmessage = function (ev) {
        String(ev.data || '').split('\r\n').forEach(function (ln) {
          if (/^PING/.test(ln)) { try { ws.send('PONG :tmi.twitch.tv'); } catch (e) {} return; }
          var m = /^(?:@([^ ]*) )?:([^!]+)![^ ]* PRIVMSG #[^ ]+ :(.*)$/.exec(ln); if (!m) return;
          var tags = {}; (m[1] || '').split(';').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) tags[kv.slice(0, i)] = kv.slice(i + 1); });
          var tv = /^!(ghost|echo)\b/i.exec(m[3]); if (tv && tags.id) vote(tv[1].toLowerCase(), tags.id, tags['user-id'] || m[2]);
        });
      };
      ws.onclose = function () { ws = null; setTimeout(chat, 10000); };
    } catch (e) { ws = null; }
  }
  draw(); poll(); keys(); chat();
  setInterval(poll, 3000); setInterval(keys, 30000);
})();
