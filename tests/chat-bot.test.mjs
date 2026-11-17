import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDirectedQuestion,chatLatest,chatStatus,maybeAnswerChat} from '../src/chat-bot.mjs';

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
