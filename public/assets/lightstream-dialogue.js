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
    if((who!=='ghost'&&who!=='echo')||!text)return;
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
  var gameTemplates={
    gta:[
      'Vice City has plenty of ways to make a bad decision look tempting. What is the plan tonight?',
      'If a police chase starts, having an escape route is usually smarter than hoping for a miracle.',
      'Driving fast is easy. Getting away clean is the challenge.',
      'Chat, are we going for the main story or getting distracted by the open world?',
      'Grand Theft Auto VI tonight. I want to see how much trouble this city can throw at us.',
      'Vehicles, missions, and a city full of distractions. I have a feeling this could get chaotic.'
    ],
    gt7:[
      'Gran Turismo 7 rewards consistency. A clean lap often beats an overambitious one.',
      'Tyre life and fuel strategy matter just as much as raw speed.',
      'Echo will be watching the racing line. I will be watching for risky decisions.',
      'Chat, would you push now or save the tyres for later?'
    ],
    cod:[
      'Call of Duty tonight. Positioning and awareness are as important as aiming.',
      'One good rotation can change an entire round. Keep the objectives in mind.',
      'Chat, do you play aggressively or hold angles and let opponents make the mistake?',
      'The scoreboard matters, but the teamwork behind it matters more.'
    ],
    nms:[
      'No Man’s Sky is all about discovering what is beyond the next jump.',
      'Resource planning makes the difference between a smooth expedition and a long walk home.',
      'Chat, what would you explore first: a new planet or a derelict freighter?',
      'Exploration is better when you still have enough fuel to make it back.'
    ],
    generic:[
      'We are playing {game}. Chat, what should we focus on first?',
      '{game} is on the schedule tonight. Give me your best strategy tips in chat.',
      'I want to hear what you enjoy most about {game}.',
      'What is the most satisfying thing to pull off in {game}?'
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
    var lines=gameLines(name);
    var line=lines[commentIndex++ % lines.length].replace(/\{game\}/g,name);
    lastComment=now;
    window.dispatchEvent(new CustomEvent('isocore:dialogue',{
      detail:{who:'ghost',text:line}
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
  if(document.body.classList.contains('isocore-lightstream')||
     document.body.classList.contains('isocore-preview')){
    // Defer initial lookup until the 3D engine can mount the camera.
    setTimeout(getGame,9000);
    setInterval(getGame,60000);
    setInterval(commentary,15000);
  }
})();
