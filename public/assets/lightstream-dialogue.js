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
})();
