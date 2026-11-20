import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=readFileSync('public/xsolla-next/01-HTML.txt','utf8');
const css=readFileSync('public/xsolla-next/02-CSS.txt','utf8');
const js=readFileSync('public/xsolla-next/03-JAVASCRIPT.txt','utf8');
test('Xsolla preview has 4 selectable cameras',()=>{
 for(const text of ['FULL STAGE','GHOST','ECHO','JUMBOTRON'])assert.ok(html.includes(text));
 assert.match(html,/id="isocore-broadcast"/);
});
test('Xsolla preview isolated from live Vain overlay',()=>{
 assert.match(css,/isocore-review/);
 assert.match(js,/isocore-next-world/);
 assert.doesNotMatch(js,/CONTROL_TOKEN|TWITCH_CLIENT_SECRET/);
 assert.doesNotMatch(js,/api\/state|isocore-login-worker/);
});
test('Xsolla preview loads staged engine and no draft source fetch',()=>{
 assert.match(js,/ig-ghost-world-next\.js/);
 assert.match(js,/assets\/stage\.js/);
 assert.match(js,/cdn\.jsdelivr\.net/);
 assert.match(js,/models selected, fallback enabled/);
});
