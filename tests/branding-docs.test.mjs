import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('canonical name and attribution appear in repository entry points',()=>{
 const readme=read('README.md');
 const guide=read('docs/JOIN_THE_NETWORK.md');
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.name,'palantiny-network');
 assert.match(readme,/^# Palantiny-Network/m);
 assert.match(readme,/narasim-teja\/palantiny/);
 assert.match(readme,/There is no live mesh of Palantiny installations to join yet/);
 assert.match(guide,/cannot join a public Palantiny network yet/);
 assert.match(guide,/npm run network:durable/);
 assert.match(read('web/index.html'),/Palantiny-Network/);
 assert.doesNotMatch(read('web/index.html'),/PulseMesh|PULSE<span>MESH/);
});
for (const kind of ['overview','participation']){
 test(kind+' architecture renders SVG and has an editable Excalidraw source',()=>{
  const scene=JSON.parse(read('assets/palantiny-network-'+kind+'.excalidraw'));
  const svg=read('assets/palantiny-network-'+kind+'.svg');
  assert.equal(scene.type,'excalidraw');
  assert.equal(scene.version,2);
  assert.ok(scene.elements.some(e=>e.type==='arrow'));
  assert.ok(scene.elements.some(e=>e.type==='text'));
  assert.match(svg,/<svg /);
  assert.match(svg,/Palantiny-Network/);
  assert.match(svg,/SYNTHETIC \/ NOT LIVE/);
 });
}
