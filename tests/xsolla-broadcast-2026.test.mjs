import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const base="public/xsolla-broadcast-2026/";
const html=readFileSync(base+"01-HTML.txt","utf8");
const css=readFileSync(base+"02-CSS.txt","utf8");
const js=readFileSync(base+"03-JAVASCRIPT.txt","utf8");
test("Xsolla source uses latest merged models with a live read-only Worker camera",()=>{
 assert.doesNotThrow(()=>new Script(js));
 assert.match(js,/408870b9b902c25ba9f216f55d67877050c9b42b/);
 assert.match(js,/ig-ghost-world-xsolla\.js/);
 assert.match(js,/api\/state/);
 assert.match(js,/api\/stream-context/);
 assert.match(js,/lightstream-dialogue\.js/);
 assert.doesNotMatch(js,/(CONTROL_TOKEN|TWITCH_BOT_ACCESS_TOKEN|TWITCH_CLIENT_SECRET|api\/control)/);
});
test("1920x1080 transparent gameplay with right side Ghost/Echo camera",()=>{
 assert.match(html,/id="isocore-broadcast"/);
 assert.match(html,/id="igwHomeSlot"/);
 assert.match(html,/id="iso-tug"/);
 assert.match(css,/background:transparent!important/);
 assert.match(css,/26\.041667%/);
 assert.match(css,/26\.018519%/);
 assert.match(css,/top:12%/);
 assert.match(css,/right:2\.8%/);
 assert.match(css,/#iso-stream-subtitle\[hidden\]/);
 assert.match(css,/igw-hud/);
 assert.doesNotMatch(html,/GTA VI|SAMPLE CHAT|4,000/);
});
test("Live badges are only displayed from the real Worker status",()=>{
 assert.match(html,/id="iso-live" hidden/);
 assert.match(js,/ctx\.live!==true/);
 assert.match(html,/id="iso-event" role="status" hidden/);
 assert.match(js,/Date\.now\(\)\/1000-lastAlert<15/);
});
