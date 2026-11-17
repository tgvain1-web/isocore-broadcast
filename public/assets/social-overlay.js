/* Broadcast captions and character follower scoreboard. No tokens or write endpoints. */
(function(){
  'use strict';
  var root=document.getElementById('isocore-broadcast'),cam=document.getElementById('iso-camera');
  if(!root||!cam||cam.dataset.social==='1')return;
  cam.dataset.social='1';
  var caption=document.createElement('div');caption.id='iso-character-caption';caption.hidden=true;
  var speaker=document.createElement('strong');speaker.className='iso-speaker';
  var words=document.createElement('span');words.className='iso-words';
  caption.appendChild(speaker);caption.appendChild(words);cam.appendChild(caption);
  var telemetry=document.createElement('div');telemetry.id='iso-telemetry';telemetry.hidden=true;cam.appendChild(telemetry);
  function followTag(side){
    var parent=root.querySelector(side==='ghost'?'.ov-g':'.ov-e');if(!parent)return null;
    var tag=document.createElement('span');tag.className='ov-follow-count';tag.textContent='— FOLLOWERS';
    parent.appendChild(tag);return tag;
  }
  var counters={ghost:followTag('ghost'),echo:followTag('echo')};
  var q=[],timer=0,remoteId=0,initialized=false,lastText='',lastAt=0;
  function enqueue(who,text){
    if(who!=='ghost'&&who!=='echo')return;
    text=String(text||'').trim().slice(0,240);if(!text)return;
    var k=who+'|'+text,now=Date.now();
    if(k===lastText&&now-lastAt<12000)return;
    if(q.some(function(entry){return entry.who===who&&entry.text===text}))return;
    lastText=k;lastAt=now;
    q.push({who:who,text:text});if(q.length>9)q.shift();if(!timer)next();
  }
  function next(){
    clearTimeout(timer);
    var line=q.shift();
    if(!line){caption.hidden=true;timer=0;return;}
    caption.dataset.who=line.who;speaker.textContent=line.who.toUpperCase()+' //';words.textContent=line.text;
    caption.hidden=false;timer=setTimeout(next,Math.max(4500,Math.min(10000,1500+line.text.length*64)));
  }
  window.addEventListener('isocore:dialogue',function(ev){
    var line=ev&&ev.detail||{};enqueue(line.who,line.text);
  });
  window.addEventListener('isocore:broadcast-state',function(ev){
    var d=ev&&ev.detail||{},social=d.social||{},ct=social.followers||{};
    ['ghost','echo'].forEach(function(side){if(counters[side])counters[side].textContent=(Number(ct[side])||0).toLocaleString('en-GB')+' FOLLOWERS';});
    var lines=social.dialogue||[];
    if(!initialized){
      initialized=true;
      remoteId=lines.length?Number(lines[lines.length-1].id)||0:0;
      // A freshly issued line is relevant when the overlay first opens.
      var last=lines[lines.length-1];if(last&&Date.now()/1000-Number(last.at)<18)enqueue(last.who,last.text);
    }else{
      lines.forEach(function(line){
        if(Number(line.id)>remoteId){enqueue(line.who,line.text);remoteId=Math.max(remoteId,Number(line.id));}
      });
    }
    var t=d.telemetry||{};
    if(t.live&&t.updated_at&&Date.now()/1000-Number(t.updated_at)<12){
      var bits=['ECHO // LIVE TELEMETRY'];
      if(t.speedKmh!=null)bits.push(Math.round(t.speedKmh)+' KM/H');
      if(t.gear)bits.push('GEAR '+t.gear);
      if(t.lap!=null)bits.push('LAP '+Math.round(t.lap));
      telemetry.textContent=bits.join('  ·  ');telemetry.hidden=false;
    }else telemetry.hidden=true;
  });
})();
