import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {canonicalGameName} from '../src/worker.mjs';

const read=p=>readFileSync(p,'utf8');
const html=read('public/lightstream.html');
const css=read('public/assets/lightstream.css');
const captions=read('public/assets/lightstream-dialogue.js');
const engine=read('public/assets/ig-ghost-world-xsolla.js');
const xsolla=read('public/xsolla/03-JAVASCRIPT.txt');
const xsollaCSS=read('public/xsolla/02-CSS.txt');
const xsollaHTML=read('public/xsolla/01-HTML.txt');

test('The live overlay is a separate transparent page with no preview chrome',()=>{
  assert.match(html,/<main id="isocore-broadcast"/);
  assert.match(html,/class="isocore-lightstream"/);
  assert.doesNotMatch(html,/(preview-tools|NOT LIVE ON TWITCH|isocore-preview)/);
  assert.match(css,/background:transparent!important/);
  assert.match(css,/#iso-camera/);
  assert.match(css,/right:2\.6%!important/);
  assert.match(css,/isocore-lightstream-large/);
  assert.match(css,/iso-diag/);
});

test('The caption handler is loaded before bridge, and code parses',()=>{
  assert.ok(html.indexOf('lightstream-dialogue.js')<html.indexOf('bridge.js'));
  assert.doesNotThrow(()=>new Function(captions));
  assert.doesNotThrow(()=>new Function(engine));
  assert.ok(engine.includes('var liveOverlay ='));
  assert.match(engine,/required = \{arena:1/);
  assert.match(engine,/onAirLine\(a\.who,text\)/);
});

test('Xsolla Free path receives the same on-air layout and camera captions',()=>{
  assert.ok(xsolla.includes("classList.add('isocore-lightstream')"));
  assert.match(xsollaCSS,/background\s*:\s*transparent\s*!important/);
  assert.match(xsollaCSS,/iso-stream-subtitle/);
  assert.match(xsollaHTML,/id="isocore-broadcast"/);
  assert.ok(xsolla.indexOf("load('lightstream-dialogue.js')") < xsolla.indexOf("load('bridge.js')"));
  assert.ok(engine.includes("document.body.classList.contains('isocore-lightstream')"));
  assert.doesNotThrow(()=>new Function(xsolla));
  assert.ok(!xsolla.includes('REPLACE_WITH_YOUR_DEPLOYED_ISOCORE_BROADCAST_HOST'));
  assert.ok(!xsolla.includes('iso-debug-panel'));
  assert.ok(xsolla.includes("var VERSION = '18'"));
  assert.doesNotMatch(xsolla,/(CONTROL_TOKEN|TWITCH_BOT_ACCESS_TOKEN|TELEMETRY_TOKEN)/);
});

test('Ghost and Echo dialogue appears directly below camera, as plain text',()=>{
  let caption=null,handlers={};
  const createElement=tag=>({
    tagName:tag,id:'',className:'',hidden:false,dataset:{},children:[],textContent:'',
    style:{rules:{},setProperty(key,value,priority){this.rules[key]=[value,priority]}},
    setAttribute(key,value){this[key]=value},
    appendChild(child){this.children.push(child);child.parentNode=this}
  });
  const cam=createElement('div');
  const root=createElement('main');
  root.getBoundingClientRect=()=>({width:1920,height:1080});
  root.appendChild=function(el){caption=el;this.children.push(el);el.parentNode=this};
  const doc={
    body:{classList:{contains:()=>false}},
    createElement,
    getElementById(id){
      return id==='isocore-broadcast'?root:id==='iso-camera'?cam:null;
    }
  };
  const win={addEventListener(name,fn){handlers[name]=fn}};
  vm.runInNewContext(captions,{
    window:win,document:doc,Date,setTimeout:()=>1,clearTimeout:()=>{},
    setInterval:()=>1
  });
  assert.ok(caption);
  assert.equal(cam.children.length,0,'caption must not overlay the camera image');
  assert.equal(caption.parentNode,root);
  assert.equal(caption.hidden,true);
  assert.match(caption.style.rules.top[0],/26\.018519%/);
  // Arena storylines must never appear under the live camera.
  handlers['isocore:dialogue']({detail:{who:'ghost',text:'You walked through me!',source:'arena'}});
  assert.equal(caption.hidden,true);
  handlers['isocore:dialogue']({detail:{who:'echo',text:'Tyres and braking points matter.',source:'game'}});
  assert.equal(caption.hidden,false);
  assert.equal(caption.dataset.who,'echo');
  assert.equal(caption.children[0].textContent,'ECHO //');
  assert.equal(caption.children[1].textContent,'Tyres and braking points matter.');
  assert.match(captions,/source!=='game'/);
  assert.match(xsollaCSS,/-webkit-line-clamp:2/);
  assert.match(captions,/10\.5\*scale/);
});

test('Game name normalisation preserves GTA VI and other titles',()=>{
  assert.equal(canonicalGameName('Grand Theft Auto VI'),'Grand Theft Auto VI');
  assert.equal(canonicalGameName('GTA VI'),'Grand Theft Auto VI');
  assert.equal(canonicalGameName('G a d Thef Au o VI'),'Grand Theft Auto VI');
  assert.equal(canonicalGameName('Gran Turismo 7'),'Gran Turismo 7');
  assert.equal(canonicalGameName('Call of Duty'),'Call of Duty');
  assert.equal(canonicalGameName('Grand Theft Auto V'),'Grand Theft Auto V');
  assert.equal(canonicalGameName('No Man’s Sky'),'No Man’s Sky');
});

test('Broadcast scene does not send arena storylines into dialogue captions',()=>{
  assert.match(engine,/function onAirLine\(who,text\) \{[\s\S]{0,240}if \(SEALED\) return;/);
  assert.match(captions,/source:'game'/);
  assert.match(captions,/echoTemplates/);
});

test('No private control credential or external writable API in on-air assets',()=>{
  assert.doesNotMatch(html+css+captions,/(CONTROL_TOKEN|TELEMETRY_TOKEN|TWITCH_BOT_ACCESS_TOKEN|api\/control)/);
});
