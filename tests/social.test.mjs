import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followCommand,safeNick,publicCounts,supporterBanter,chatReply,cleanTelemetry} from '../src/social.mjs';

test('Twitch commands follow exactly one AI character',()=>{
  assert.equal(followCommand('!ghost'),'ghost');
  assert.equal(followCommand(' !ECHO '),'echo');
  assert.equal(followCommand('!ghostly'),null);
  assert.equal(followCommand('I prefer ghost'),null);
});
test('follower counts and rival banter use validated data',()=>{
  assert.deepEqual(publicCounts([{side:'ghost',total:2},{side:'echo',total:1}]),{ghost:2,echo:1});
  assert.equal(supporterBanter('ghost','ghost',{ghost:2,echo:1},'A').length,0);
  const b=supporterBanter('echo','ghost',{ghost:1,echo:2},'<streamer>');
  assert.equal(b.length,2);
  assert.equal(b[0].who,'echo');assert.equal(b[1].who,'ghost');
  assert.ok(!b[0].text.includes('<'));
  assert.equal(safeNick('ab<script>'),'abscript');
});
test('chat replies alternate and only mention real live telemetry',()=>{
  const followers={ghost:4,echo:3};
  assert.equal(chatReply('hello','viewer',followers,null,0).who,'ghost');
  assert.equal(chatReply('hello','viewer',followers,null,1).who,'echo');
  assert.equal(chatReply('Echo how fast?', 'viewer',followers,{live:true,speedKmh:140,lap:3},0).text.includes('140 km/h'),true);
  assert.equal(chatReply('Echo how fast?', 'viewer',followers,{live:false},0).text.includes('140 km/h'),false);
  assert.equal(chatReply('!ghost', 'viewer', followers,null,0),null);
  assert.equal(chatReply('!badcommand', 'viewer',followers,null,0),null);
});
test('SimHub fields are clamped, missing values stay null',()=>{
  const d=cleanTelemetry({live:true,speedKmh:9999,rpm:7000,gear:'3',lap:2,fuelPercent:110});
  assert.equal(d.live,true);assert.equal(d.speedKmh,700);assert.equal(d.fuelPercent,100);
  assert.equal(d.rpm,7000);assert.equal(d.gear,'3');
  assert.equal(cleanTelemetry({live:false}).speedKmh,null);
  assert.equal(cleanTelemetry({live:'true'}).live,false);
});
