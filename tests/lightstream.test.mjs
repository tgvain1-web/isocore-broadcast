import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const html=read('public/lightstream.html');
const css=read('public/assets/lightstream.css');
const captions=read('public/assets/lightstream-dialogue.js');
const engine=read('public/assets/ig-ghost-world-xsolla.js');

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
  assert.match(engine,/var liveOverlay = \/\\/lightstream\\\.html\$\//);
  assert.match(engine,/required = \{arena:1/);
  assert.match(engine,/onAirLine\(a\.who,text\)/);
});

test('Ghost and Echo spoken lines appear within the camera and are plain text',()=>{
  let caption=null,handlers={};
  const createElement=tag=>({
    tagName:tag,id:'',className:'',hidden:false,dataset:{},children:[],textContent:'',
    appendChild(child){this.children.push(child)}
  });
  const cam={appendChild(el){caption=el}};
  const root={};
  const doc={createElement,getElementById(id){
    return id==='isocore-broadcast'?root:id==='iso-camera'?cam:null;
  }};
  const win={addEventListener(name,fn){handlers[name]=fn}};
  vm.runInNewContext(captions,{window:win,document:doc,Date,setTimeout:()=>1,clearTimeout:()=>{}});
  assert.ok(caption);
  assert.equal(caption.hidden,true);
  handlers['isocore:dialogue']({detail:{who:'ghost',text:'Hello from Ghost!'}});
  assert.equal(caption.hidden,false);
  assert.equal(caption.dataset.who,'ghost');
  assert.equal(caption.children[0].textContent,'GHOST //');
  assert.equal(caption.children[1].textContent,'Hello from Ghost!');
});

test('No private control credential or external writable API in on-air assets',()=>{
  assert.doesNotMatch(html+css+captions,/(CONTROL_TOKEN|TELEMETRY_TOKEN|TWITCH_BOT_ACCESS_TOKEN|api\/control)/);
});
