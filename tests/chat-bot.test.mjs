import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDirectedQuestion,chatLatest,chatStatus,maybeAnswerChat,startChatOAuth,chatOwnerAction,confirmChatSubscription} from '../src/chat-bot.mjs';

test('explicit Ghost/Echo questions are recognised without confusing vote commands',()=>{
 assert.deepEqual(parseDirectedQuestion('!askghost Which GTA VI car should we try?'),{
   who:'ghost',question:'Which GTA VI car should we try?'
 });
 assert.deepEqual(parseDirectedQuestion('!askecho Best way to brake in GT7?'),{
   who:'echo',question:'Best way to brake in GT7?'
 });
 assert.equal(parseDirectedQuestion('@ghost Where should we drive?')?.who,'ghost');
 assert.equal(parseDirectedQuestion('Echo, Any driving advice?')?.who,'echo');
 for(const q of ['!ghost','!echo','!ghostly','hello chat',
   '!askghost https://spam.example','!askghost yo'])assert.equal(parseDirectedQuestion(q),null,q);
});

test('replies remain disabled with missing AI configuration, even on signed events',async()=>{
 const result=await maybeAnswerChat({
   broadcaster_user_id:'123',chatter_user_id:'444',
   message:{text:'!askghost Where should we go in Vice City?'}
 },'evt:example',{},null,null,async()=>({game:'Grand Theft Auto VI'}));
 assert.equal(result,false);
});

test('public Twitch output is read-only and caption data excludes OAuth tokens',()=>{
 const scene=readFileSync('public/assets/lightstream-dialogue.js','utf8');
 const worker=readFileSync('src/worker.mjs','utf8');
 const chat=readFileSync('src/chat-bot.mjs','utf8');
 assert.match(scene,/api\/chat\/latest/);
 assert.match(scene,/source:'chat'/);
 assert.doesNotMatch(scene,/(refresh_cipher|access_cipher|TWITCH_SESSION_KEY|user:write:chat)/);
 assert.match(worker,/verifyTwitch\(request,raw,env\.TWITCH_EVENTSUB_SECRET\)/);
 assert.match(chat,/is_sent!==true/);
 assert.match(chat,/status='sent'/);
 assert.match(chat,/chat_bot_state SET enabled=0/);
 assert.match(chat,/chat_bot_inbox WHERE status='sent'/);
 assert.match(chat,/ctx\?\.waitUntil/);
});

test('bot status has no secrets, and defaults off until configured',async()=>{
 const db={
   prepare(sql){
     return {
       bind(){return this},
       async run(){return {meta:{changes:1}}},
       async first(){
         if(sql.includes('FROM chat_bot_state'))return{
           enabled:0,broadcaster_id:'',login:'',subscribed:0
         };
         return null;
       }
     };
   }
 };
 const status=await chatStatus({},db);
 assert.equal(status.enabled,false);
 assert.equal(status.ready,false);
 assert.equal(status.connected,false);
 assert.equal(status.config.twitchApp,false);
 assert.equal(status.config.ai,false);
 assert.equal(JSON.stringify(status).includes('token'),false);
});

test('one signed chat question is sent to Twitch and mirrored once, no duplicate post',async()=>{
 const sessionKey='test-only-256-bit-password-replace-for-production';
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sessionKey));
 const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,
   new TextEncoder().encode('test-access-token')));
 const base64=bytes=>btoa(String.fromCharCode(...bytes));
 const tokenCipher=base64(nonce)+'.'+base64(cipher);
 const bot={enabled:1,broadcaster_id:'111',login:'igvain',access_cipher:tokenCipher,
   refresh_cipher:tokenCipher,expires_at:Math.floor(Date.now()/1000)+3600,subscribed:1};
 const inbox=new Map(),sent=[];
 const db={
   prepare(sql){
     let args=[];
     return {
       bind(...values){args=values;return this},
       async run(){
         if(sql.startsWith('INSERT OR IGNORE INTO chat_bot_inbox')){
           const [id,who,chatter_id,chatter_name,question,at]=args;
           if(inbox.has(id))return {meta:{changes:0}};
           inbox.set(id,{id,who,chatter_id,chatter_name,question,at,status:'pending',reply:''});
           return {meta:{changes:1}};
         }
         if(sql.includes("UPDATE chat_bot_inbox SET reply=")){
           const [reply,at,id]=args;
           Object.assign(inbox.get(id),{reply,at,status:'sent'});
           return {meta:{changes:1}};
         }
         return {meta:{changes:1}};
       },
       async first(){
         if(sql.includes('FROM chat_bot_state'))return bot;
         if(sql.includes("WHERE status='sent'"))return [...inbox.values()].find(x=>x.status==='sent')||null;
         return null;
       }
     };
   }
 };
 const env={
   DB:db,TWITCH_CLIENT_ID:'test-id',TWITCH_CLIENT_SECRET:'test-secret',
   TWITCH_SESSION_KEY:sessionKey,AI:{run:async()=>({response:'Try a fast car and plan the exit.'})}
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
   assert.match(String(url),/\/helix\/chat\/messages$/);
   const payload=JSON.parse(opts.body);sent.push(payload);
   assert.equal(payload.broadcaster_id,'111');
   assert.equal(payload.sender_id,'111');
   return {ok:true,json:async()=>({data:[{is_sent:true}]})};
 };
 try{
   const event={broadcaster_user_id:'111',chatter_user_id:'222',
     chatter_user_login:'viewer123',message_type:'text',
     message:{text:'!askghost Which GTA VI car should we try?'}};
   const work=[],ctx={waitUntil(p){work.push(p)}};
   const added=await maybeAnswerChat(event,'evt:one-event',env,db,ctx,
     async()=>({game:'Grand Theft Auto VI'}));
   assert.equal(added,true);
   await Promise.all(work);
   assert.equal(sent.length,1);
   assert.match(sent[0].message,/^GHOST \/\/ @viewer123/);
   const latest=await chatLatest(db);
   assert.equal(latest.reply.who,'ghost');
   assert.match(latest.reply.reply,/fast car/);
   assert.equal(await maybeAnswerChat(event,'evt:one-event',env,db,ctx,
     async()=>({game:'Grand Theft Auto VI'})),false);
   assert.equal(sent.length,1);
 }finally{globalThis.fetch=originalFetch}
});

test('one Twitch account grants all app-token EventSub permissions during re-authorization',async()=>{
 const env={
  TWITCH_CLIENT_ID:'client-example',TWITCH_CLIENT_SECRET:'client-secret',
  TWITCH_EVENTSUB_SECRET:'secret-example',TWITCH_SESSION_KEY:'an-example-key-with-more-than-thirty-two-characters'
 };
 const db={prepare(){return {bind(){return this},run:async()=>({meta:{changes:1}})}}};
 const r=await startChatOAuth(env,db);
 assert.equal(r.ok,true);
 const url=new URL(r.authorization_url);
 assert.equal(url.origin,'https://id.twitch.tv');
 assert.equal(url.searchParams.get('force_verify'),'true');
 const scopes=new Set((url.searchParams.get('scope')||'').split(' '));
 for(const p of ['user:read:chat','user:write:chat','user:bot','channel:bot'])
   assert.ok(scopes.has(p),'Required scope missing: '+p);
 assert.equal(url.searchParams.get('redirect_uri'),
  'https://isocore-broadcast.tgvain1.workers.dev/oauth/twitch/callback');
});

test('EventSub stays pending until signed webhook proves delivery to the same channel',async()=>{
 let bot={enabled:0,broadcaster_id:'111',login:'igvain',subscribed:0};
 const db={
  prepare(sql){
   let args=[];
   return {
    bind(...v){args=v;return this},
    async first(){return sql.includes('FROM chat_bot_state')?bot:null},
    async run(){
     if(sql.includes('SET subscribed=CASE'))bot.subscribed=bot.subscribed===1?1:2;
     if(sql.includes('SET subscribed=1')){
       if(args[0]!==bot.broadcaster_id)return {meta:{changes:0}};
       bot.subscribed=1;
     }
     return {meta:{changes:1}};
    }
   };
  }
 };
 const env={TWITCH_CLIENT_ID:'client',TWITCH_CLIENT_SECRET:'secret',
   TWITCH_EVENTSUB_SECRET:'safe-secret',TWITCH_SESSION_KEY:'a-unique-test-key-longer-than-32-characters',
   AI:{run:async()=>({response:'Yes!'})}};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.twitch.tv/helix/eventsub/subscriptions');
  const payload=JSON.parse(options.body);
  assert.deepEqual(payload.condition,{broadcaster_user_id:'111',user_id:'111'});
  return {status:202,ok:true};
 };
 try{
  const r=await chatOwnerAction('/api/chat/subscribe',{},env,db,async()=> 'app-token');
  assert.equal(r.ok,true);
  assert.equal(bot.subscribed,2,'Twitch 202 means pending; it is not live yet');
  const state=await chatStatus(env,db);
  assert.equal(state.subscribed,false);
  assert.equal(state.subscription_pending,true);
  assert.equal(state.ready,false);
  assert.equal(await confirmChatSubscription(db,{type:'channel.chat.message',
    condition:{broadcaster_user_id:'222',user_id:'222'}}),false);
  assert.equal(bot.subscribed,2,'An unrelated broadcaster challenge cannot enable replies');
  assert.equal(await confirmChatSubscription(db,{type:'channel.chat.message',
    condition:{broadcaster_user_id:'111',user_id:'111'}}),true);
  assert.equal(bot.subscribed,1);
  assert.equal((await chatStatus(env,db)).ready,true);
 }finally{globalThis.fetch=original}
});

test('Twitch 403 tells the owner to re-authorize missing bot scopes, without exposing credentials',async()=>{
 const db={prepare(){return {bind(){return this},
  async first(){return {enabled:0,broadcaster_id:'111',subscribed:0}},
  async run(){return {meta:{changes:1}}}}}};
 const env={TWITCH_CLIENT_ID:'cid',TWITCH_CLIENT_SECRET:'topsecret',
  TWITCH_EVENTSUB_SECRET:'secret',TWITCH_SESSION_KEY:'a-long-private-key-for-encryption-over-32-characters'};
 const orig=globalThis.fetch;
 globalThis.fetch=async()=>({status:403,ok:false});
 try{
  const v=await chatOwnerAction('/api/chat/subscribe',{},env,db,async()=> 'app-token');
  assert.equal(v.ok,false);
  assert.match(v.error,/Reconnect Twitch/);
  assert.match(v.error,/user:bot/);
  assert.doesNotMatch(v.error,/topsecret/);
 }finally{globalThis.fetch=orig}
});
