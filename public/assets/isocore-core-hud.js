/* Isocore Core HUD — an original, dependency-free AI activity visual.
 * Copyright (c) 2026 Isocore Gaming. Written independently; no MIRA-HUD code.
 * A text event is RESPONDING, never falsely labelled as audible speech.
 */
(function (win) {
  'use strict';
  if (win.IsocoreCoreHUD) return;
  var STATES = {standby:1,listening:1,processing:1,responding:1,speaking:1,offline:1};
  var WHO = ['ghost','echo'];
  var LABEL = {standby:'STANDBY',listening:'LISTENING',processing:'PROCESSING',responding:'RESPONDING',speaking:'SPEAKING',offline:'OFFLINE'};
  var mountNode=null, pane={}, timer={}, state={ghost:'standby',echo:'standby'};
  var details={ghost:'READY FOR ACTIVITY',echo:'READY FOR ACTIVITY'};
  var levels={ghost:0,echo:0};
  function owner(who){return who === 'echo' ? 'echo' : who === 'ghost' ? 'ghost' : null;}
  function clamp(x){x=Number(x);return Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;}
  function make(tag,className,text){
    var n=document.createElement(tag);
    if(className)n.className=className;
    if(text!=null)n.textContent=text;
    return n;
  }
  function makeCard(who){
    var sec=make('section','ic-entity ic-'+who);
    sec.dataset.who=who;
    sec.dataset.state=state[who];
    sec.setAttribute('aria-label',who.toUpperCase()+' AI activity');
    var header=make('div','ic-heading');
    header.appendChild(make('span','ic-name',who.toUpperCase()));
    header.appendChild(make('span','ic-role',who==='ghost'?'BROADCAST OPERATOR':'SIM RACING SPECIALIST'));
    sec.appendChild(header);
    var core=make('div','ic-core');
    core.setAttribute('aria-hidden','true');
    core.appendChild(make('div','ic-orbit ic-orbit-outer'));
    core.appendChild(make('div','ic-orbit ic-orbit-inner'));
    core.appendChild(make('div','ic-heart'));
    core.appendChild(make('div','ic-scan'));
    sec.appendChild(core);
    var status=make('div','ic-status');
    var statusText=make('strong','ic-state',LABEL[state[who]]);
    status.appendChild(statusText);
    var desc=make('span','ic-detail',details[who]);
    status.appendChild(desc);
    sec.appendChild(status);
    var meter=make('div','ic-meter');
    for(var k=0;k<10;k++)meter.appendChild(make('i','ic-bar'));
    sec.appendChild(meter);
    sec.style.setProperty('--ic-energy',String(levels[who]));
    pane[who]={card:sec,flag:statusText,detail:desc};
    return sec;
  }
  function refresh(who){
    var p=pane[who];if(!p)return;
    p.card.dataset.state=state[who];
    p.card.style.setProperty('--ic-energy',String(levels[who]));
    p.flag.textContent=LABEL[state[who]];
    p.detail.textContent=details[who];
  }
  function cancelTimer(who){if(timer[who]){clearTimeout(timer[who]);timer[who]=null;}}
  function setState(who,next,meta){
    who=owner(who);if(!who||!STATES[next])return false;
    meta=meta||{};
    cancelTimer(who);
    state[who]=next;
    details[who]=String(meta.detail||({
      standby:'READY FOR ACTIVITY',listening:'INPUT DETECTED',processing:'WORKING ON RESPONSE',
      responding:'TEXT RESPONSE RECEIVED',speaking:'VOICE OUTPUT ACTIVE',offline:'NOT CONNECTED'
    })[next]).slice(0,60);
    if(meta.energy!=null)levels[who]=clamp(meta.energy);
    else levels[who]=next==='standby'||next==='offline'?0:next==='responding'?.45:.65;
    refresh(who);
    if(Number.isFinite(meta.duration)&&meta.duration>0){
      timer[who]=setTimeout(function(){setState(who,'standby');},Math.min(30000,meta.duration));
    }
    return true;
  }
  function setEnergy(who,energy){
    who=owner(who);if(!who)return false;
    levels[who]=clamp(energy);refresh(who);return true;
  }
  function mount(target){
    if(typeof target==='string')target=document.querySelector(target);
    if(!target)return false;
    if(mountNode&&mountNode.parentNode)mountNode.parentNode.removeChild(mountNode);
    mountNode=make('div','ic-hud');
    mountNode.setAttribute('aria-label','Isocore Ghost and Echo activity interface');
    pane={};
    WHO.forEach(function(who){mountNode.appendChild(makeCard(who));});
    target.appendChild(mountNode);
    return true;
  }
  function destroy(){
    WHO.forEach(cancelTimer);
    if(mountNode&&mountNode.parentNode)mountNode.parentNode.removeChild(mountNode);
    mountNode=null;pane={};
  }
  // Existing Isocore Broadcast emits these only for game commentary or a
  // successfully sent Twitch reply. Treat these as TEXT responses, not voice.
  win.addEventListener('isocore:dialogue',function(event){
    var d=event&&event.detail||{},who=owner(d.who);
    if(!who||!['game','chat'].includes(d.source)||!String(d.text||'').trim())return;
    setState(who,'responding',{
      detail:d.source==='chat'?'TWITCH CHAT RESPONSE':'GAME COMMENTARY',
      duration:Math.min(9500,Math.max(4000,String(d.text).length*55))
    });
  });
  // Real external activity can be fed from future AI/audio integrations.
  // Explicitly supplied source is required; we do NOT fabricate speech.
  win.addEventListener('isocore:ai-state',function(event){
    var d=event&&event.detail||{};
    if(!owner(d.who)||!STATES[d.state])return;
    setState(d.who,d.state,{detail:d.detail,duration:d.duration,energy:d.energy});
  });
  win.addEventListener('isocore:ai-energy',function(event){
    var d=event&&event.detail||{};
    if(owner(d.who))setEnergy(d.who,d.energy);
  });
  win.IsocoreCoreHUD={
    mount:mount,setState:setState,setEnergy:setEnergy,destroy:destroy,
    snapshot:function(){return {ghost:{state:state.ghost,energy:levels.ghost},echo:{state:state.echo,energy:levels.echo}};}
  };
})(window);
