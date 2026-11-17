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
async function dbReady(env){return !!env.DB && !!await env.DB.prepare('SELECT id FROM camera WHERE id=1').first();}
async function getCamera(db){
  const c=(await db.prepare('SELECT who, shot, updated_at FROM camera WHERE id=1').first()) || {who:'ghost',shot:'first',updated_at:0};
  // The initial V0.6 deployment stored 'side' with updated_at=0.
  // Read that UNCHANGED bootstrap record as first person, without overriding
  // subsequent intentional owner camera changes (which set updated_at).
  if(c.shot==='side' && Number(c.updated_at)===0) return {...c,shot:'first'};
  return c;
}
async function getTug(db){return (await db.prepare('SELECT * FROM tug WHERE id=1').first()) || {v:0,at:time(),n:0};}
async function summary(db){const [camera,tug]=await Promise.all([getCamera(db),getTug(db)]);return {ok:true,camera:{who:camera.who,shot:camera.shot,updated_at:camera.updated_at},tug:stateOf(tug),chat:['igvain'],keyHuntMigrated:false};}
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
  const side=parseVote(ev.message?.text);
  if(!side)return answer({ok:true,vote:false});
  const id='evt:'+String(request.headers.get('twitch-eventsub-message-id')||'').replace(/[^\w:-]/g,'').slice(0,150);
  const who='tw:'+String(ev.chatter_user_id||'').replace(/[^\d]/g,'').slice(0,50);
  if(who.length<4)return fail('Missing Twitch user ID');
  const accepted=await tally(env.DB,side,id,who);
  return answer({ok:true,vote:accepted});
}
/* Public read-only live game category for Ghost's broadcast commentary.
 * Twitch Helix uses server-side application credentials. Neither OAuth tokens
 * nor the client secret are exposed to Xsolla or visitors.
 */
let twitchAppToken='',twitchAppExpiresAt=0;
let streamContextCache={at:0,data:null,channel:''};
async function twitchAppAccessToken(env){
  const now=time();
  if(twitchAppToken && now<twitchAppExpiresAt)return twitchAppToken;
  const form=new URLSearchParams({
    client_id:String(env.TWITCH_CLIENT_ID),
    client_secret:String(env.TWITCH_CLIENT_SECRET),
    grant_type:'client_credentials'
  });
  const res=await fetch('https://id.twitch.tv/oauth2/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:form.toString()
  });
  if(!res.ok)throw Error('Twitch authentication unavailable');
  const data=await res.json();
  if(!data.access_token)throw Error('Twitch returned no access token');
  twitchAppToken=String(data.access_token);
  twitchAppExpiresAt=now+Math.max(60,Number(data.expires_in||3600)-300);
  return twitchAppToken;
}
async function getStreamContext(env){
  const channel=String(env.TWITCH_CHANNEL_LOGIN||'igvain').trim().toLowerCase();
  if(!/^[a-z0-9_]{3,25}$/.test(channel))
    return {ok:false,configured:false,reason:'Invalid Twitch channel configuration'};
  if(!env.TWITCH_CLIENT_ID||!env.TWITCH_CLIENT_SECRET)
    return {ok:false,configured:false,channel,reason:'Twitch application credentials are not configured'};
  const now=time();
  if(streamContextCache.data && streamContextCache.channel===channel &&
     now-streamContextCache.at<60)return streamContextCache.data;
  try{
    let token=await twitchAppAccessToken(env);
    const url=new URL('https://api.twitch.tv/helix/streams');
    url.searchParams.set('user_login',channel);
    let res=await fetch(url.toString(),{
      headers:{'Client-Id':String(env.TWITCH_CLIENT_ID),'Authorization':'Bearer '+token}
    });
    if(res.status===401){
      twitchAppToken='';twitchAppExpiresAt=0;
      token=await twitchAppAccessToken(env);
      res=await fetch(url.toString(),{
        headers:{'Client-Id':String(env.TWITCH_CLIENT_ID),'Authorization':'Bearer '+token}
      });
    }
    if(!res.ok)throw Error('Twitch stream information unavailable');
    const data=await res.json();
    const live=data&&Array.isArray(data.data)?data.data[0]:null;
    const answerData={
      ok:true,configured:true,channel,live:!!live,
      game:live?String(live.game_name||'').slice(0,100):'',
      title:live?String(live.title||'').slice(0,160):'',
      updated_at:now,source:'twitch'
    };
    streamContextCache={at:now,data:answerData,channel};
    return answerData;
  }catch(e){
    // Do not leak upstream tokens, credentials, or sensitive error bodies.
    return {ok:false,configured:true,channel,reason:'Twitch stream category temporarily unavailable'};
  }
}
async function api(request,env,path){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:publicHeaders});
  if(path==='/api/stream-context' && request.method==='GET') {
    const context=await getStreamContext(env);
    return answer(context,context.ok?200:503);
  }
  if(!env.DB)return fail('D1 binding is missing',503);
  if(!await dbReady(env))return fail('D1 migrations have not been applied',503);
  const db=env.DB;
  if(request.method==='GET'){
    if(path==='/api/health')return answer({ok:true,service:'isocore-broadcast',database:'ready'});
    if(path==='/api/state')return answer(await summary(db));
    if(path==='/api/control'||path==='/api/camera')return answer({ok:true,...await getCamera(db)});
    if(path==='/api/tug.state')return answer({tug:stateOf(await getTug(db)),chat:['igvain']});
    if(path==='/api/ghost.keys')return answer({keys:null,migrated:false,reason:'Key-hunt data remains on the original PHP website.'});
    if(path==='/api/ghost.world')return answer({world:null,migrated:false});
    return fail('Unknown endpoint',404);
  }
  if(request.method!=='POST')return fail('Method not allowed',405);
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
