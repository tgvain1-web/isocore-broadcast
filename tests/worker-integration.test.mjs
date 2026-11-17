import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_init.sql','utf8'));
  sqlite.exec(readFileSync('migrations/0002_ai_followers_chat_telemetry.sql','utf8'));
  const db={prepare(sql){
    const stmt=sqlite.prepare(sql);let params=[];
    return {
      bind(...args){params=args;return this},
      async first(){return stmt.get(...params)||null},
      async all(){return {results:stmt.all(...params)}},
      async run(){const r=stmt.run(...params);return {meta:{changes:r.changes}}}
    };
  }};
  const env={DB:db, TWITCH_EVENTSUB_SECRET:'safe-test-secret-1234',TWITCH_BROADCASTER_ID:'42',TELEMETRY_TOKEN:'a'.repeat(40),ASSETS:{fetch:async()=>new Response('static')}};
  const get=async(path)=>{const res=await worker.fetch(new Request('https://broadcast.test'+path),env);return {status:res.status,data:await res.json()}};
  return {sqlite,env,get};
}
async function signed(env,id,who,text,extra={}){
  const event={
    subscription:{type:'channel.chat.message'},
    event:{broadcaster_user_id:'42',chatter_user_id:who,
      chatter_user_name:'User'+who,message:{text},message_id:'abcdef00-aaaa-4444-bbbb-'+id.padStart(12,'0')}
  };
  const raw=JSON.stringify(event);
  const stamp=new Date().toISOString();
  const input=id+stamp+raw;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.TWITCH_EVENTSUB_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const hash=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(input)));
  const signature='sha256='+Array.from(hash,n=>n.toString(16).padStart(2,'0')).join('');
  const req=new Request('https://broadcast.test/webhooks/twitch',{method:'POST',body:raw,
    headers:{'Twitch-Eventsub-Message-Id':id,'Twitch-Eventsub-Message-Timestamp':stamp,
      'Twitch-Eventsub-Message-Signature':signature,'Twitch-Eventsub-Message-Type':'notification'}});
  const res=await worker.fetch(req,{...env,...extra});return {status:res.status,data:await res.json()};
}
test('real migrated D1 schema works with the signed Twitch follower flow',async()=>{
  const f=fixture();
  assert.equal((await f.get('/api/health')).status,200);
  const first=await signed(f.env,'test-event-00001','101','!ghost');
  assert.equal(first.status,200);assert.equal(first.data.follow,'ghost');
  assert.deepEqual((await f.get('/api/social')).data.followers,{ghost:1,echo:0});
  const again=await signed(f.env,'test-event-00002','101','!ghost');
  assert.equal(again.status,200);
  assert.deepEqual((await f.get('/api/social')).data.followers,{ghost:1,echo:0});
  const switched=await signed(f.env,'test-event-00003','101','!echo');
  assert.equal(switched.status,200);
  const state=await f.get('/api/state');assert.equal(state.status,200);
  assert.deepEqual(state.data.social.followers,{ghost:0,echo:1});
  const record=f.sqlite.prepare('SELECT side FROM ai_followers WHERE user_id=?').get('tw:101');
  assert.equal(record.side,'echo');
  assert.equal((await signed(f.env,'test-event-00003','101','!echo')).data.duplicate,true);
  f.sqlite.close();
});
test('signed messages create on-camera chat lines; bad signatures cannot change followers',async()=>{
  const f=fixture();
  const reply=await signed(f.env,'test-event-00011','102','Hello Ghost');
  assert.equal(reply.status,200);assert.equal(reply.data.dialogue,true);
  const s=await f.get('/api/social');
  assert.equal(s.data.dialogue.some(x=>x.who==='ghost'&&x.kind==='chat'),true);
  let request=new Request('https://broadcast.test/webhooks/twitch',{method:'POST',body:'{}',
    headers:{'Twitch-Eventsub-Message-Id':'forged','Twitch-Eventsub-Message-Timestamp':new Date().toISOString(),
      'Twitch-Eventsub-Message-Signature':'sha256='+('0'.repeat(64))}});
  const forged=await worker.fetch(request,f.env);
  assert.equal(forged.status,401);
  assert.deepEqual((await f.get('/api/social')).data.followers,{ghost:0,echo:0});
  f.sqlite.close();
});
test('telemetry refuses unauthenticated writes and accepts bounded live readings',async()=>{
  const f=fixture(),url='https://broadcast.test/api/telemetry';
  const payload=JSON.stringify({live:true,speedKmh:180,lap:3,gear:'4',fuelPercent:50});
  const denied=await worker.fetch(new Request(url,{method:'POST',body:payload}),f.env);
  assert.equal(denied.status,403);
  const ok=await worker.fetch(new Request(url,{method:'POST',body:payload,headers:{'Authorization':'Bearer '+f.env.TELEMETRY_TOKEN}}),f.env);
  assert.equal(ok.status,200);
  const state=await f.get('/api/telemetry');
  assert.equal(state.data.live,true);assert.equal(state.data.speedKmh,180);
  const lines=(await f.get('/api/social')).data.dialogue;
  assert.ok(lines.some(x=>x.who==='echo'&&x.kind==='telemetry'&&x.text.includes('lap 3')));
  f.sqlite.close();
});
