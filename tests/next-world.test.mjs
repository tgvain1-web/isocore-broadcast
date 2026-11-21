import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import test from 'node:test';

const modelRoot = new URL('../public/assets/models/next/', import.meta.url);
function glb(name, compressed=false) {
  const bytes=readFileSync(new URL(name,modelRoot));
  const b=compressed ? gunzipSync(bytes) : bytes;
  assert.equal(b.toString('ascii',0,4),'glTF',name+' is not a GLB');
  assert.equal(b.readUInt32LE(4),2,name+' is not GLB v2');
  assert.equal(b.readUInt32LE(8),b.length,name+' has inconsistent GLB length');
  assert.equal(b.toString('ascii',16,20),'JSON',name+' missing GLTF metadata');
  const len=b.readUInt32LE(12);
  return {raw:b,json:JSON.parse(b.subarray(20,20+len).toString('utf8'))};
}
test('Ghost and Echo: real animated rigged GLBs',()=>{
  for(const name of ['ghost-low.glb','echo-low.glb']){
    const {json}=glb(name);
    assert.ok((json.animations||[]).length>=3,name+' missing motions');
    assert.ok((json.skins||[]).length>=1,name+' missing skin');
    assert.ok((json.nodes||[]).length>=40,name+' unexpectedly simplified');
  }
});
test('Stage: correct standalone GLB geometry',()=>{
  const {json}=glb('stage-main-low.glb');
  assert.ok(json.meshes?.length>=8);
  assert.ok(json.scenes?.length>=1);
});
test('Jumbotron: compressed arena decodes into a valid model with named screen',()=>{
  const {raw,json}=glb('arena-low.glb.gz',true);
  const sha=createHash('sha256').update(raw).digest('hex');
  assert.equal(sha,'6f92022d3689622c43b7d59f9f0ff2d3ec4f39efcc35a49ea5831ccd3df84013');
  assert.ok(json.nodes.some(node=>/jumbotron.*display/i.test(node.name||'')));
});
test('Model review remains opt-in and leaves original world isolated',()=>{
  const world=readFileSync(new URL('../public/assets/ig-ghost-world-next.js',import.meta.url),'utf8');
  const bridge=readFileSync(new URL('../public/assets/bridge-next.js',import.meta.url),'utf8');
  const preview=readFileSync(new URL('../public/preview-next.html',import.meta.url),'utf8');
  assert.match(world,/reviewWorld/);
  assert.match(world,/DecompressionStream\('gzip'\)/);
  assert.match(world,/assets\/models\/next\//);
  assert.match(bridge,/ig-ghost-world-next\.js/);
  assert.match(preview,/isocore-next-world/);
  assert.doesNotMatch(preview,/CONTROL_TOKEN|TWITCH_SESSION_KEY/);
});
