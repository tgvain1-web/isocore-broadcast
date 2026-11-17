/* Isocore Broadcast bridge: the real 3D engine and the original overlay UI. */
(function(){
  'use strict';
  const ROOT = document.getElementById('isocore-broadcast');
  if(!ROOT)return;
  if(ROOT.dataset.loaded==='1')return;
  ROOT.dataset.loaded='1';
  // Keep the 3D feed concealed until the selected real camera is ready.
  // Loading/logo/welcome graphics must never appear in the broadcast output.
  ROOT.classList.add('isocore-camera-booting');
  const HOST = new URL('../',document.currentScript && document.currentScript.src || location.href).href;
  const $ = id => document.getElementById(id);
  let who='ghost',shot='first',ready=false,apiOK=false,booted=false;
  ROOT.innerHTML = '<div id="iso-camera" class="ghost"><div id="igwHomeSlot"></div><div id="iso-camera-label">GHOST // STREAMER CAM</div></div><div id="iso-overlay-shell"></div><div id="iso-diag">ISOCORE // HTML ACTIVE · CONNECTING</div>';
  const diag=$('iso-diag');
  function scaleOverlay(){
    const el=$('iso-overlay-shell');if(!el)return;
    const r=ROOT.getBoundingClientRect();
    const k=Math.min(r.width/1920,r.height/1080);
    el.style.width='1920px';el.style.height='1080px';
    el.style.transform='scale('+k+')';el.style.transformOrigin='0 0';
    el.style.left=Math.max(0,(r.width-1920*k)/2)+'px';
    el.style.top=Math.max(0,(r.height-1080*k)/2)+'px';
  }
  window.addEventListener('resize',scaleOverlay);
  if(window.ResizeObserver)new ResizeObserver(scaleOverlay).observe(ROOT);
  scaleOverlay();
  function status(message,error){diag.textContent=message;diag.classList.toggle('error',!!error);diag.hidden=false;}
  function script(path){return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=HOST+path+'?v=13';s.crossOrigin='anonymous';
    s.onload=resolve;s.onerror=()=>reject(Error('External script blocked: '+path));document.head.appendChild(s);
  });}
  function css(path){const l=document.createElement('link');l.rel='stylesheet';l.href=HOST+path+'?v=13';document.head.appendChild(l);}
  async function getState(){
    try{
      const resp=await fetch(HOST+'api/state',{cache:'no-store',credentials:'omit'});
      if(!resp.ok)throw Error('API '+resp.status);
      const value=await resp.json();apiOK=true;
      const c=value.camera||{};who=c.who==='echo'?'echo':'ghost';shot=['first','shoulder','side','wide','high'].includes(c.shot)?c.shot:'first';
      $('iso-camera').className=who;
      $('iso-camera-label').textContent=who.toUpperCase()+' // '+(shot==='first'?'STREAMER CAM':shot==='high'?'JUMBOTRON CAMERA':shot.toUpperCase()+' CAMERA');
      const st=$('ig-ghost-world');const engine=st&&st._igw;
      if(engine&&typeof engine.broadcast==='function'){
        if(engine.broadcast(who,shot)){
          ready=true;
          ROOT.classList.remove('isocore-camera-booting');
          diag.hidden=true;
        } else if(booted && !ready){status('ISOCORE // 3D MODELS STILL LOADING',false);}
      }
    } catch(e){status('ISOCORE API ERROR // '+e.message,true);}
  }
  async function init(){
    try{
      if(!window.ISOCORE_BROADCAST_STAGE)await script('assets/stage.js');
      if(!window.ISOCORE_OVERLAY_HTML)await script('assets/overlay-stage.js');
      // The CSS on the original streaming page and the in-world Three.js CSS are retained.
      css('assets/ig-ghost-world.css');css('assets/broadcast.css');
      $('igwHomeSlot').innerHTML=window.ISOCORE_BROADCAST_STAGE;
      $('iso-overlay-shell').innerHTML=window.ISOCORE_OVERLAY_HTML;scaleOverlay();
      if(!$('ig-ghost-world'))throw Error('Original arena stage was not created');
      await script('assets/ig-ghost-world-xsolla.js');booted=true;
      await script('assets/overlay-original.js');
      status('ISOCORE // 3D ENGINE LOADED · WAITING FOR MODELS',false);
      await getState();setInterval(getState,5000);
      setTimeout(()=>{if(!ready)status('ISOCORE // CAMERA NOT READY · WEBGL/MODELS/CSP. Check console.',true)},45000);
    }catch(e){status('ISOCORE // '+e.message,true);}
  }
  // Display a meaningful diagnostic even if Xsolla bars the engine or the network.
  window.addEventListener('error',e=>{if(e.message && /import|webgl|module|cors|script/i.test(e.message))status('ISOCORE // '+e.message,true)});
  init();
})();
