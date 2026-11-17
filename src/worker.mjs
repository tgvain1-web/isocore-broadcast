import {followCommand, safeNick, publicCounts, supporterBanter, chatReply, cleanTelemetry} from './social.mjs';
/** Isocore Broadcast — independent Cloudflare Worker. No changes to isocore-auth.
 * Public reads are cross-origin. All privileged writes require a bearer secret or a
 * Twitch-signed EventSub message. No stream keys, Discord credentials or OAuth secrets in source.
 */
const SHOTS = new Set(['first', 'shoulder', 'side', 'wide', 'high']);
const WHO = new Set(['ghost','echo']);
const publicHeaders = {
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET, POST, OPTIONS',
  'access-control-allow-headers':'Content-Type, Authorization, Twitch-Eventsub-Message-Id, Twitch-Eventsub-Message-Timestamp, Twitch-Eventsub-Message-Signature, Twitch-Eventsub-Message-Type',
  'access-control-max-age':'86400',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-robots-tag':'noindex, nofollow'
};
function answer(data, status=200) { return new Response(JSON.stringify(data), {status,headers:{...publicHeaders,'content-type':'application/json; charset=utf-8'}}); }
function fail(message,status=400) {return answer({ok:false,error:message},status);}
function time(){return Math.floor(Date.now()/1000);}
export function stateOf(t,now=time()) {
  const v=Math.max(-100,Math.min(100,Number(t?.v||0)*Math.pow(.5,Math.max(0,now-Number(t?.at||now))/600)));
  const a=Math.abs(v);
  return {v:Math.round(v),lean:a>=25?(v<0?'ghost':'echo'):'',level:a>=60?2:a>=25?1:0,
    votes:Number(t?.n||0), reset:Number(t?.reset_at||0),
    alert:t?.alert_at && Number(t.alert_at)>now-120 ? {text:String(t.alert_text||'').slice(0,160),at:Number(t.alert_at)}:null};
}
export function parseVote(message){const match=/^!(ghost|echo)(?:\s|$)/i.exec(String(message||''));return match?match[1].toLowerCase():null;}
export function validCamera(v){return v && WHO.has(v.who) && SHOTS.has(v.shot);}
function authorized(request,secret){const given=request.headers.get('authorization')||''; return !!secret && given.startsWith('Bearer ') && given.slice(7)===secret;}
async function bodyJSON(request,max=2048){const text=await request.text();if(text.length>max)throw Error('Payload too large');return JSON.parse(text);}
async function dbReady(env){if(!env.DB)return false;try{const [camera,social]=await Promise.all([env.DB.prepare('SELECT id FROM camera WHERE id=1').first(),env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_followers'").first()]);return !!camera&&!!social;}catch{return false;}}
async function getCamera(db){
  const c=(await db.prepare('SELECT who, shot, updated_at FROM camera WHERE id=1').first()) || {who:'ghost',shot:'first',updated_at:0};
  // The initial V0.6 deployment stored 'side' with updated_at=0.
  // Read that UNCHANGED bootstrap record as first person, without overriding
  // subsequent intentional owner camera changes (which set updated_at).
  if(c.shot==='side' && Number(c.updated_at)===0) return {...c,shot:'first'};
  return c;
}
async function getTug(db){return (await db.prepare('SELECT * FROM tug WHERE id=1').first()) || {v:0,at:time(),n:0};}

/* Social state is public; identities, secrets and raw Twitch messages are not. */
async function getSocial(db){
  const [rows,lines]=await Promise.all([
    db.prepare('SELECT side, COUNT(*) AS total FROM ai_followers GROUP BY side').all(),
    db.prepare('SELECT id,who,text,kind,at FROM ai_dialogue WHERE kind<>'bot' ORDER BY id DESC LIMIT 8').all()
  ]);
  return {followers:publicCounts(rows.results),dialogue:(lines.results||[]).reverse()};
}
async function getTelemetry(db){
  const row=await db.prepare('SELECT updated_at,payload FROM ai_telemetry WHERE id=1').first();
  const data=row?JSON.parse(row.payload||'{}'):{};
  return { ...data, live:!!data.live && time()-Number(row?.updated_at||0)<12, updated_at:Number(row?.updated_at||0) };
}
async function utter(db,who,message,kind,eventId,chatterId=''){
  if(!['ghost','echo'].includes(who))return;
  const msg=String(message||'').trim().slice(0,240);
  if(!msg)return;
  await db.prepare('INSERT OR IGNORE INTO ai_dialogue(who,text,kind,at,event_id,chatter_id) VALUES(?,?,?,?,?,?)')
    .bind(who,msg,kind,time(),eventId,chatterId).run();
}
async function assignFollower(db,side,userId,displayName){
  const old=await db.prepare('SELECT side FROM ai_followers WHERE user_id=?').bind(userId).first();
  const previous=old?.side||null;
  if(previous!==side){
    const now=time();
    await db.prepare('INSERT INTO ai_followers(user_id,display_name,side,joined_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET side=excluded.side, display_name=excluded.display_name, updated_at=excluded.updated_at WHERE ai_followers.side<>excluded.side')
      .bind(userId,safeNick(displayName),side,now,now).run();
  }
  const rows=await db.prepare('SELECT side,COUNT(*) AS total FROM ai_followers GROUP BY side').all();
  return {previous,counts:publicCounts(rows.results),changed:previous!==side};
}
async function lastDialogue(db,kind){
  return db.prepare('SELECT at FROM ai_dialogue WHERE kind=? ORDER BY at DESC LIMIT 1').bind(kind).first();
}
async function sendTwitchBotReply(env,text,replyTo){
  // Optional opt-in only. The secret is never sent to the browser.
  if(env.CHAT_REPLIES_ENABLED!=='1'||!env.TWITCH_BOT_ACCESS_TOKEN||!env.TWITCH_CLIENT_ID||!env.TWITCH_BOT_USER_ID||!env.TWITCH_BROADCASTER_ID)return false;
  const data={broadcaster_id:String(env.TWITCH_BROADCASTER_ID),sender_id:String(env.TWITCH_BOT_USER_ID),message:String(text).slice(0,350)};
  if(/^[a-f\d-]{12,64}$/i.test(String(replyTo||'')))data.reply_parent_message_id=replyTo;
  const res=await fetch('https://api.twitch.tv/helix/chat/messages',{
    method:'POST',headers:{'Authorization':'Bearer '+env.TWITCH_BOT_ACCESS_TOKEN,'Client-Id':String(env.TWITCH_CLIENT_ID),'Content-Type':'application/json'},
    body:JSON.stringify(data)
  });
  return res.ok;
}

async function summary(db){const [camera,tug,social,telemetry]=await Promise.all([getCamera(db),getTug(db),getSocial(db),getTelemetry(db)]);return {ok:true,camera:{who:camera.who,shot:camera.shot,updated_at:camera.updated_at},tug:stateOf(tug),social,telemetry,chat:['igvain'],keyHuntMigrated:false};}
async function tally(db,side,msgId,who){
  if(!WHO.has(side) || !/^[\w:-]{6,200}$/.test(msgId) || !/^[\w:-]{1,90}$/.test(who))return false;
  const now=time();
  // One SQL statement enforces both message ID uniqueness and 20-second user cooldown.
  const saved=await db.prepare(`INSERT OR IGNORE INTO tug_votes(id,who,side,at)
    SELECT ?,?,?,? WHERE NOT EXISTS
    (SELECT 1 FROM tug_votes WHERE who=? AND at>?)`).bind(msgId,who,side,now,who,now-20).run();
  if(!saved.meta || saved.meta.changes!==1)return false;
  // Compare-and-swap prevents two different concurrent chat votes overwriting each other.
  for(let attempt=0;attempt<8;attempt++){
    const t=await getTug(db);
    const decay=Number(t.v)*Math.pow(.5,Math.max(0,now-Number(t.at))/600);
    const v=Math.max(-100,Math.min(100,decay+(side==='ghost'?-5:5)));
    const updated=await db.prepare('UPDATE tug SET v=?,at=?,n=n+1,revision=revision+1 WHERE id=1 AND revision=?').bind(v,now,t.revision).run();
    if(updated.meta?.changes===1)return true;
  }
  throw new Error('Vote tally contention; retry required');
}
function hex(bytes){return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
function safeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export async function verifyTwitch(req,raw,secret){
  const id=req.headers.get('twitch-eventsub-message-id')||'';
  const stamp=req.headers.get('twitch-eventsub-message-timestamp')||'';
  const signature=req.headers.get('twitch-eventsub-message-signature')||'';
  if(!secret||!id||!stamp||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const seconds=Date.parse(stamp)/1000;
  if(!Number.isFinite(seconds)||Math.abs(time()-seconds)>600)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+stamp+raw));
  return safeEqual(signature,'sha256='+hex(signed));
}
async function twitchHook(request,env){
  if(request.method!=='POST')return fail('Method not allowed',405);
  if(!env.TWITCH_EVENTSUB_SECRET)return fail('Twitch webhook not configured',503);
  const raw=await request.text();if(raw.length>131072)return fail('Payload too large',413);
  if(!await verifyTwitch(request,raw,env.TWITCH_EVENTSUB_SECRET))return fail('Invalid Twitch signature',401);
  let data;try{data=JSON.parse(raw);}catch{return fail('Invalid JSON');}
  const typ=request.headers.get('twitch-eventsub-message-type')||'';
  if(typ==='webhook_callback_verification')return new Response(String(data.challenge||''),{headers:{'content-type':'text/plain;charset=utf-8',...publicHeaders}});
  if(typ==='revocation')return answer({ok:true,revoked:true});
  if(typ!=='notification'||data.subscription?.type!=='channel.chat.message')return answer({ok:true,ignored:true});
  const ev=data.event||{};
  if(env.TWITCH_BROADCASTER_ID && String(ev.broadcaster_user_id)!==String(env.TWITCH_BROADCASTER_ID))return fail('Wrong broadcaster',403);
  const messageId=String(request.headers.get('twitch-eventsub-message-id')||'').replace(/[^\w:-]/g,'').slice(0,150);
  const id='evt:'+messageId;
  const saved=await env.DB.prepare('INSERT OR IGNORE INTO ai_chat_events(event_id,at) VALUES(?,?)').bind(id,time()).run();
  if(saved.meta?.changes!==1)return answer({ok:true,duplicate:true});
  // Never count the bot's own posts as follows, or react to them.
  if(env.TWITCH_BOT_USER_ID&&String(ev.chatter_user_id)===String(env.TWITCH_BOT_USER_ID))return answer({ok:true,ownBot:true});
  const chatter='tw:'+String(ev.chatter_user_id||'').replace(/[^\d]/g,'').slice(0,50);
  if(chatter.length<4)return fail('Missing Twitch user ID');
  const nick=safeNick(ev.chatter_user_name||ev.chatter_user_login||'viewer');
  const message=String(ev.message?.text||'').slice(0,400);
  const side=followCommand(message);
  let counts, text='', written=false;
  if(side){
    const result=await assignFollower(env.DB,side,chatter,nick);
    counts=result.counts;
    // Keep existing temporary tug-of-war votes; a follow is persistent even when vote cool-down blocks it.
    try{await tally(env.DB,side,id,chatter);}catch(e){}
    if(result.changed){
      const latest=await lastDialogue(env.DB,'follow');
      if(!latest||time()-Number(latest.at)>9){
        const lines=supporterBanter(side,result.previous,counts,nick);
        for(let i=0;i<lines.length;i++)await utter(env.DB,lines[i].who,lines[i].text,lines[i].kind,id+':'+i,chatter);
        written=true;
      }
    }
    text='@'+nick+' '+(result.changed?'now follows':'already follows')+' '+side.toUpperCase()+' in Isocore. Ghost '+counts.ghost+' | Echo '+counts.echo+'.';
  }else{
    const recent=await env.DB.prepare('SELECT who,at FROM ai_dialogue WHERE kind=? ORDER BY at DESC LIMIT 1').bind('chat').first();
    const same=await env.DB.prepare('SELECT at FROM ai_dialogue WHERE kind=? AND chatter_id=? ORDER BY at DESC LIMIT 1').bind('chat',chatter).first();
    if((!recent||time()-Number(recent.at)>=25)&&(!same||time()-Number(same.at)>=75)){
      const [social,telemetry]=await Promise.all([getSocial(env.DB),getTelemetry(env.DB)]);
      const reply=chatReply(message,nick,social.followers,telemetry,recent?.who==='ghost'?1:0);
      if(reply){
        await utter(env.DB,reply.who,reply.text,'chat',id+':chat',chatter);
        text=reply.who.toUpperCase()+': '+reply.text;
        written=true;
      }
    }
  }
  // Twitch chat sending is disabled unless explicitly configured with OAuth and CHAT_REPLIES_ENABLED=1.
  // Restrict the bot itself to 1 message every 25 seconds even if on-screen captions update more often.
  if(text&&env.CHAT_REPLIES_ENABLED==='1'){
    const last=await env.DB.prepare('SELECT at FROM ai_dialogue WHERE kind=? ORDER BY at DESC LIMIT 1').bind('bot').first();
    if(!last||time()-Number(last.at)>25){
      let ok=false;try{ok=await sendTwitchBotReply(env,text,ev.message_id);}catch(e){}
      if(ok)await utter(env.DB,side||'ghost','Bot posted to Twitch chat','bot',id+':bot',chatter);
    }
  }
  return answer({ok:true,follow:side||null,dialogue:written});
}
async function api(request,env,path){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:publicHeaders});
  if(!env.DB)return fail('D1 binding is missing',503);
  if(!await dbReady(env))return fail('D1 migrations 0001 and 0002 must both be applied',503);
  const db=env.DB;
  if(request.method==='GET'){
    if(path==='/api/health')return answer({ok:true,service:'isocore-broadcast',database:'ready'});
    if(path==='/api/state')return answer(await summary(db));
    if(path==='/api/social')return answer({ok:true,...await getSocial(db)});
    if(path==='/api/telemetry')return answer({ok:true,...await getTelemetry(db)});
    if(path==='/api/control'||path==='/api/camera')return answer({ok:true,...await getCamera(db)});
    if(path==='/api/tug.state')return answer({tug:stateOf(await getTug(db)),chat:['igvain']});
    if(path==='/api/ghost.keys')return answer({keys:null,migrated:false,reason:'Key-hunt data remains on the original PHP website.'});
    if(path==='/api/ghost.world')return answer({world:null,migrated:false});
    return fail('Unknown endpoint',404);
  }
  if(request.method!=='POST')return fail('Method not allowed',405);
  if(path==='/api/telemetry'){
    if(!authorized(request,env.TELEMETRY_TOKEN))return fail('Telemetry authorization required',403);
    let data;try{data=cleanTelemetry(await bodyJSON(request,2048));}catch{return fail('Invalid telemetry payload');}
    const previous=await getTelemetry(db);
    const now=time();
    await db.prepare('UPDATE ai_telemetry SET updated_at=?,payload=? WHERE id=1').bind(now,JSON.stringify(data)).run();
    if(data.live&&data.lap!==null&&data.lap!==previous.lap){
      await utter(db,'echo','New lap '+Math.round(data.lap)+'. '+(data.speedKmh!==null?'Speed '+Math.round(data.speedKmh)+' km/h.':'Eyes on the apex.'),'telemetry','lap:'+now+':'+data.lap);
    }
    return answer({ok:true,live:data.live,updated_at:now});
  }
  if(!authorized(request,env.CONTROL_TOKEN))return fail('Owner authorization required',403);
  let data;try{data=await bodyJSON(request);}catch{return fail('Invalid JSON or oversized payload');}
  if(path==='/api/control'){
    if(!validCamera(data))return fail('Invalid camera selection');
    const now=time();
    await db.prepare('UPDATE camera SET who=?, shot=?, updated_at=? WHERE id=1').bind(data.who,data.shot,now).run();
    return answer({ok:true,who:data.who,shot:data.shot});
  }
  if(path==='/api/alert'){
    const message=String(data.text||'').trim().slice(0,160);
    if(!message)return fail('Alert text is required');
    await db.prepare('UPDATE tug SET alert_text=?,alert_at=? WHERE id=1').bind(message,time()).run();
    return answer({ok:true,tug:stateOf(await getTug(db))});
  }
  if(path==='/api/reset'){
    const now=time();await db.prepare('UPDATE tug SET v=0,at=?,n=0,revision=revision+1,reset_at=? WHERE id=1').bind(now,now).run();
    return answer({ok:true,tug:stateOf(await getTug(db))});
  }
  if(path==='/api/test-vote'){
    const side=String(data.side||'');if(!WHO.has(side))return fail('Invalid team');
    const ok=await tally(db,side,'test:'+crypto.randomUUID(),'owner-preview:'+crypto.randomUUID());
    return answer({ok:true,accepted:ok,tug:stateOf(await getTug(db))});
  }
  return fail('Unknown endpoint',404);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);const path=url.pathname;
    if(!path.startsWith('/api/') && !path.startsWith('/webhooks/')) return env.ASSETS.fetch(request);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:publicHeaders});
    try {
      if(path==='/webhooks/twitch')return await twitchHook(request,env);
      if(path==='/api/health' && !env.DB)return fail('D1 binding is missing',503);
      return await api(request,env,path);
    }catch(e){return fail('Broadcast service temporarily unavailable',503);}
  }
};
