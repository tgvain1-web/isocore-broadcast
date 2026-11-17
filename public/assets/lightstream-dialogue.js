/* Isocore Live Camera subtitles; no personal data or authorization tokens. */
(function(){
  'use strict';
  var root=document.getElementById('isocore-broadcast');
  if(!root)return;
  var queue=[],current='',time=0,timer=0,element=null;
  function mount(){
    if(element)return element;
    var cam=document.getElementById('iso-camera');
    if(!cam)return null;
    element=document.createElement('div');element.id='iso-stream-subtitle';element.hidden=true;
    var who=document.createElement('strong');who.className='who';
    var line=document.createElement('span');line.className='line';
    element.appendChild(who);element.appendChild(line);
    cam.appendChild(element);return element;
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
