import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('public/xsolla-latest/01-HTML.txt','utf8');
const css=readFileSync('public/xsolla-latest/02-CSS.txt','utf8');
const js=readFileSync('public/xsolla-latest/03-JAVASCRIPT.txt','utf8');
test('Latest model preview is pinned to merged 21 November model commit',()=>{
 assert.ok(js.includes('408870b9b902c25ba9f216f55d67877050c9b42b'));
 assert.match(js,/ig-ghost-world-xsolla\.js/);
 assert.doesNotMatch(js,/ig-ghost-world-next|2cb66cc88aeca1f2f7f810ae166a7b719f901f02/);
});
test('Full-screen review exposes close-up and stage cameras without changing live overlay',()=>{
 for(const name of ['STAGE FRONT','STAGE BACK','GHOST','ECHO','JUMBOTRON'])assert.ok(html.includes(name));
 assert.match(css,/#iso-review #iso-camera/);
 assert.match(css,/width:100%!important;height:100%!important/);
 assert.match(js,/filmCam/);
 assert.doesNotMatch(js,/api\/state|CONTROL_TOKEN|TWITCH_SESSION_KEY/);
});
