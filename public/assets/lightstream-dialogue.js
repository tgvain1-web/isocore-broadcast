/* Isocore Live Camera subtitles; no personal data or authorization tokens. */
(function(){
  'use strict';
  if(window.__isocoreDialogueLoaded)return;
  window.__isocoreDialogueLoaded=true;
  var root=document.getElementById('isocore-broadcast');
  if(!root)return;
  var queue=[],current='',time=0,timer=0,element=null;
  function mount(){
    var camera=document.getElementById('iso-camera');
    if(!camera)return null;
    // Caption belongs to the BROADCAST CANVAS, immediately underneath the
    // 500x281 camera, not inside the image where it covers the streamer.
    var parent=document.getElementById('isocore-broadcast');
    if(!parent)return null;
    if(element && element.parentNode===parent)return element;
    element=document.getElementById('iso-stream-subtitle');
    if(!element){
      element=document.createElement('div');
      element.id='iso-stream-subtitle';
      element.hidden=true;
      element.setAttribute('role','status');
      element.setAttribute('aria-live','polite');
      var who=document.createElement('strong');who.className='who';
      var line=document.createElement('span');line.className='line';
      element.appendChild(who);element.appendChild(line);
    }
    if(element.parentNode!==parent)parent.appendChild(element);
    // Existing Xsolla copies may retain the old 'inside camera' CSS. These
    // explicit layout values take precedence without any Xsolla repaste.
    var preview=document.body.classList.contains('isocore-preview');
    var rules=preview?{
      position:'absolute',top:'calc(81% + 6px)',bottom:'auto',
      left:'13%',right:'auto',width:'74%',maxWidth:'none'
    }:{
      position:'absolute',top:'calc(12% + 26.018519% + 8px)',bottom:'auto',
      left:'auto',right:'2.8%',width:'26.041667%',maxWidth:'none'
    };
    Object.keys(rules).forEach(function(key){
      element.style.setProperty(key.replace(/[A-Z]/g,function(c){return '-'+c.toLowerCase();}),rules[key],'important');
    });
    // Size text to the *broadcast canvas*, not the phone's full viewport.
    // Xsolla editor scales 1920x1080 into a small canvas: the old vw-based
    // font stayed huge while the camera shrank, causing five-line captions.
    var size=parent.getBoundingClientRect();
    var scale=Math.max(.15,Math.min(1.5,(size.width||1920)/1920,(size.height||1080)/1080));
    element.style.setProperty('font','600 '+(10.5*scale)+'px/1.25 Arial, sans-serif','important');
    element.style.setProperty('padding',(4*scale)+'px '+(6*scale)+'px','important');
    element.style.setProperty('gap',(5*scale)+'px','important');
    element.style.setProperty('max-height',(40*scale)+'px','important');
    var lineEl=element.children[1];
    if(lineEl&&lineEl.style){
      lineEl.style.setProperty('display','-webkit-box','important');
      lineEl.style.setProperty('-webkit-line-clamp','2','important');
      lineEl.style.setProperty('-webkit-box-orient','vertical','important');
      lineEl.style.setProperty('overflow','hidden','important');
    }
    return element;
  }
  function renderNext(){
    if(timer)clearTimeout(timer);
    timer=0;
    var el=mount(),item=queue.shift();
    if(!el||!item){if(el)el.hidden=true;return;}
    el.dataset.who=item.who;
    el.children[0].textContent=item.who.toUpperCase()+' //';
    el.children[1].textContent=item.text;
    el.hidden=false;
    timer=setTimeout(renderNext,Math.max(3700,Math.min(8500,1700+item.text.length*60)));
  }
  window.addEventListener('isocore:dialogue',function(e){
    var d=e.detail||{},who=d.who,text=String(d.text||'').trim().slice(0,220);
    // Only explicitly game-sourced lines are allowed on a public stream.
    // Reject all legacy arena/lore/taunts, including stale WebGL events.
    if((who!=='ghost'&&who!=='echo')||!text||!['game','chat'].includes(d.source))return;
    var key=who+'|'+text,now=Date.now();
    if(key===current&&now-time<8000)return;
    current=key;time=now;
    if(!queue.some(function(x){return x.who===who&&x.text===text})){
      queue.push({who:who,text:text});
      if(queue.length>6)queue.shift();
      if(!timer)renderNext();
    }
  });
  mount();

  // Launch-night Ghost commentary: uses Twitch's actual stream game category
  // (or the owner's explicit game override), NOT unseen gameplay events.
  // This is game-aware scripted commentary, not video analysis or AI inference.
  var gameContext=null,commentIndex=0,lastComment=0,lastGame='';
  // Short subtitles deliberately fit a 500px camera-width text strip.
  // These are game-specific prompts, not claims that we have seen gameplay.
  var gameTemplates={
    gta:[
      'Vice City tonight. Story missions or free roaming?',
      'A police chase calls for an escape plan, not just speed.',
      'Chat, which GTA VI vehicle do you want to see first?',
      'The open world can wait. Or can it?',
      'Grand Theft Auto VI. What should we explore first?'
    ],
    gt7:[
      'Gran Turismo 7 rewards clean and consistent laps.',
      'Tyre strategy matters as much as raw pace.',
      'Chat, would you push now or save the tyres?',
      'A clean overtake is worth more than a risky lunge.'
    ],
    cod:[
      'Call of Duty tonight. Positioning wins fights.',
      'Objectives matter as much as eliminations.',
      'Chat, do you push hard or hold your angles?',
      'A smart rotation can change the whole round.'
    ],
    nms:[
      'No Man’s Sky tonight. Where should we explore first?',
      'Keep some fuel for the return journey.',
      'New planet or derelict freighter, chat?',
      'A little preparation makes space exploration easier.'
    ],
    generic:[
      'We are playing {game}. What should we focus on?',
      'Chat, what is your favourite part of {game}?',
      'Any tips for getting started in {game}?',
      'What is the best challenge in {game}?'
    ]
  };
  var echoTemplates={
    gta:[
      'I want to see how the GTA VI cars handle.',
      'A good corner exit is useful even in Vice City.',
      'Which vehicle should we take for a drive?'
    ],
    gt7:[
      'Smooth steering makes a fast lap.',
      'Watch the braking points and tyre wear.',
      'Fuel saved now can pay off in the final laps.'
    ],
    cod:[
      'Movement and timing. That is the difference.',
      'Plan the exit before taking a risky route.',
      'I would focus on a clean objective push.'
    ],
    nms:[
      'Ship handling matters when trouble starts.',
      'Never run low on launch fuel.',
      'I would take the scenic route through space.'
    ],
    generic:[
      'What is the trickiest part of {game}?',
      'I want to see what makes {game} interesting.',
      'Chat, what should we try in {game}?'
    ]
  };
  function gameLines(name){
    var n=name.toLowerCase();
    if(/grand theft auto|\bgta\s*(?:vi|6)\b|vice city/.test(n))return gameTemplates.gta;
    if(/gran turismo|\bgt\s*7\b/.test(n))return gameTemplates.gt7;
    if(/call of duty|\bwarzone\b|\bmodern warfare\b|\bblack ops\b/.test(n))return gameTemplates.cod;
    if(/no man.s sky/.test(n))return gameTemplates.nms;
    return gameTemplates.generic;
  }
  function commentary(){
    if(!gameContext||!gameContext.game)return;
    if(gameContext.source==='twitch' && gameContext.live!==true)return;
    if(document.hidden)return;
    var now=Date.now();
    if(now-lastComment<85000)return;
    var name=gameContext.game;
    if(name!==lastGame){commentIndex=0;lastGame=name;}
    var mainLines=gameLines(name);
    var key=Object.keys(gameTemplates).filter(function(k){return gameTemplates[k]===mainLines})[0]||'generic';
    // Ghost leads the stream; Echo occasionally joins in with his own take.
    var turn=commentIndex++;
    var echoTurn=(turn%3===2);
    var who=echoTurn?'echo':'ghost';
    var options=echoTurn?echoTemplates[key]:mainLines;
    var index=echoTurn?Math.floor(turn/3):turn-Math.floor(turn/3);
    var line=options[index%options.length].replace(/\{game\}/g,name);
    lastComment=now;
    window.dispatchEvent(new CustomEvent('isocore:dialogue',{
      detail:{who:who,text:line,source:'game'}
    }));
  }
  function getGame(){
    var url='https://isocore-broadcast.tgvain1.workers.dev/api/stream-context';
    fetch(url,{cache:'no-store',credentials:'omit'})
      .then(function(res){return res.ok?res.json():null;})
      .then(function(info){
        if(!info||!info.ok||!info.game){gameContext=null;return;}
        var was=gameContext && gameContext.game;
        gameContext=info;
        if(info.game!==was)lastComment=0;
        commentary();
      })
      .catch(function(){ /* Missing credentials/network: no fictitious game lines. */ });
  }
  // Mirrored Twitch chat replies: only server-confirmed, sent responses.
  // No secrets or Twitch posting permissions ever reach Xsolla.
  var lastChatReplyId='';
  function pollTwitchReplies(){
    fetch('https://isocore-broadcast.tgvain1.workers.dev/api/chat/latest',
      {cache:'no-store',credentials:'omit'})
      .then(function(r){return r.ok?r.json():null})
      .then(function(data){
        var item=data&&data.reply;
        if(!item||!item.id||item.id===lastChatReplyId)return;
        lastChatReplyId=item.id;
        if(!item.reply||!['ghost','echo'].includes(item.who))return;
        var viewer=String(item.chatter_name||'viewer').slice(0,25);
        window.dispatchEvent(new CustomEvent('isocore:dialogue',{
          detail:{who:item.who,source:'chat',
            text:'@'+viewer+' '+String(item.reply).slice(0,120)}
        }));
      }).catch(function(){ /* Bot is optional until Twitch is connected. */ });
  }
  if(document.body.classList.contains('isocore-lightstream')||
     document.body.classList.contains('isocore-preview')){
    // Defer initial lookup until the 3D engine can mount the camera.
    setTimeout(getGame,9000);
    setInterval(getGame,60000);
    setInterval(commentary,15000);
    setTimeout(pollTwitchReplies,5000);
    setInterval(pollTwitchReplies,6000);
  }
})();
