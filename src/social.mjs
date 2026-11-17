/* Isocore Broadcast social rules. The public browser never gets Twitch tokens.
 * !ghost / !echo are exclusive Isocore character follows, NOT Twitch channel follows.
 */
export const SIDE = Object.freeze(['ghost','echo']);
export function followCommand(input){
  const m = /^\s*!(ghost|echo)(?=\s|$)/i.exec(String(input||''));
  return m ? m[1].toLowerCase() : null;
}
export function safeNick(input){
  return String(input||'viewer').replace(/[^a-zA-Z0-9_]/g,'').slice(0,25)||'viewer';
}
export function publicCounts(rows){
  const counts={ghost:0,echo:0};
  for(const row of rows||[]){ if(row.side in counts)counts[row.side]=Number(row.total)||0; }
  return counts;
}
export function supporterBanter(side,previous,counts,nick){
  if(!SIDE.includes(side))return [];
  const other=side==='ghost'?'echo':'ghost', lead=counts[side]-counts[other], who=side.toUpperCase(), rival=other.toUpperCase();
  const guest=safeNick(nick);
  if(previous===side)return [];
  const welcome = previous===other
    ? 'Welcome across, '+guest+'. '+rival+' will notice that one.'
    : 'Welcome aboard, '+guest+'. Team '+who+' has '+counts[side]+' supporters.';
  const reaction=previous===other
    ? 'You switched teams? Fine. I will win you back on the track.'
    : lead>0 ? 'Enjoy your lead, '+who+'. The next follower could change everything.'
      : lead<0 ? 'Still ahead of you, '+who+'. But keep recruiting.'
      : 'Dead level, '+who+'. Chat, pick a side.';
  return [{who:side,text:welcome,kind:'follow'},{who:other,text:reaction,kind:'banter'}];
}
export function chatReply(message, nick, counts, telemetry, seed=0){
  const text=String(message||'').trim().slice(0,300);
  if(!text||followCommand(text)||text.startsWith('!'))return null;
  const namedGhost=/\bghost\b/i.test(text),namedEcho=/\becho\b/i.test(text);
  const who=namedEcho&&!namedGhost?'echo':namedGhost&&!namedEcho?'ghost':seed%2?'echo':'ghost';
  const name=safeNick(nick), reply={who,kind:'chat',text:''};
  const live=telemetry&&telemetry.live===true;
  if(who==='echo'&&live&&/\b(speed|fast|kmh|telemetry|lap|rpm|gear|fuel)\b/i.test(text)){
    const bits=[];
    if(Number.isFinite(telemetry.speedKmh))bits.push(Math.round(telemetry.speedKmh)+' km/h');
    if(Number.isFinite(telemetry.lap))bits.push('lap '+Math.round(telemetry.lap));
    if(Number.isFinite(telemetry.fuelPercent))bits.push(Math.round(telemetry.fuelPercent)+'% fuel');
    reply.text='@'+name+' live telemetry: '+(bits.length?bits.join(', '):'connected, waiting for race data')+'.';
  } else if(/\b(hello|hey|hi|morning|evening)\b/i.test(text)){
    reply.text=who==='ghost'?'Welcome to the arena, @'+name+'. Mind the cables.':'Oi @'+name+'! You here to race or cheer?';
  } else if(/\b(who.*winning|score|followers|supporters|leading)\b/i.test(text)){
    reply.text='@'+name+' Ghost has '+counts.ghost+' followers, Echo has '+counts.echo+'. Type !ghost or !echo to choose.';
  } else if(/\b(race|racing|simhub|car|tyres|tires)\b/i.test(text)){
    reply.who='echo'; reply.text='@'+name+' the rig is ready. '+(live?'I have live telemetry coming through.':'Telemetry is not connected yet, so I will not guess lap data.');
  } else {
    reply.text=who==='ghost'?'I see you, @'+name+'. The arena is listening.':'Cheers @'+name+'! Ghost is watching the scoreboard again.';
  }
  return reply;
}
export function cleanTelemetry(input){
  const num=(key,min,max)=>{const n=Number(input?.[key]);return input?.[key]===null||input?.[key]===undefined||input?.[key]===''||!Number.isFinite(n)?null:Math.max(min,Math.min(max,n));};
  return {
    live: input?.live === true,
    game:String(input?.game||'').slice(0,48).replace(/[<>]/g,''),
    speedKmh:num('speedKmh',0,700),rpm:num('rpm',0,20000),gear:String(input?.gear??'').slice(0,3).replace(/[^0-9NR-]/gi,''),
    lap:num('lap',0,10000),position:num('position',0,200),fuelPercent:num('fuelPercent',0,100),
    throttle:num('throttle',0,100),brake:num('brake',0,100),lastLapSeconds:num('lastLapSeconds',0,36000)
  };
}
