/** GitHub-readable visual snapshot generated only from the release trackers. */
export const SLICE_STATES = Object.freeze(['done','partial','planned','blocked-external']);
const colors = Object.freeze({
 done:'#34d399', partial:'#fbbf24', planned:'#72809c', 'blocked-external':'#fb7185'
});
function escapeXml(value) {
 return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}
export function getProgressSnapshot(tracker,gates) {
 if(!tracker || !Array.isArray(tracker.slices) || tracker.slices.length===0)
  throw new Error('Expected nonempty release execution tracker');
 const counts=Object.fromEntries(SLICE_STATES.map(s=>[s,0]));
 for(const slice of tracker.slices){
  if(!Object.hasOwn(counts,slice.status))throw new Error('Unknown roadmap status: '+slice.status);
  counts[slice.status]++;
 }
 const profiles={};
 for(const name of ['open-synthetic-testnet','public-real-sensing']){
  const list=gates?.profiles?.[name]?.gates;
  if(!Array.isArray(list)||!list.length)throw new Error('Missing release gate profile: '+name);
  const invalid=list.find(g=>!['blocked','verified'].includes(g.status));
  if(invalid)throw new Error('Unknown release gate status: '+invalid.status);
  profiles[name]={total:list.length,verified:list.filter(g=>g.status==='verified').length};
 }
 return {count:tracker.slices.length,counts,profiles,states:tracker.slices.map(s=>s.status),updatedOn:tracker.updatedOn};
}
export function renderProgressSvg(tracker,gates){
 const data=getProgressSnapshot(tracker,gates);
 const metrics=[
  ['VERIFIED SLICES',data.counts.done,colors.done],
  ['IN PROGRESS',data.counts.partial,colors.partial],
  ['NOT STARTED',data.counts.planned,colors.planned],
  ['EXTERNAL BLOCKERS',data.counts['blocked-external'],colors['blocked-external']]
 ];
 const metricCards=metrics.map(([label,value,color],i)=>{
  const x=42+i*220;
  return `<rect x="${x}" y="109" width="207" height="111" rx="14" fill="#15253c" stroke="#273e5f"/>
<text x="${x+18}" y="143" font-size="12" font-weight="650" fill="#b4c1d7" letter-spacing=".8">${label}</text>
<text x="${x+18}" y="193" font-size="47" font-weight="750" fill="${color}">${value}</text>`;
 }).join('\n');
 const gap=5,width=(876-(data.count-1)*gap)/data.count;
 const tiles=data.states.map((state,i)=>`<rect x="${(42+i*(width+gap)).toFixed(2)}" y="266" width="${width.toFixed(2)}" height="28" rx="5" fill="${colors[state]}"><title>${escapeXml(tracker.slices[i].id)}: ${escapeXml(state)}</title></rect>`).join('\n');
 const gateLabels=[['OPEN SYNTHETIC TESTNET',data.profiles['open-synthetic-testnet'],330],['PUBLIC REAL SENSING',data.profiles['public-real-sensing'],387]];
 const gateRows=gateLabels.map(([label,g,y])=>{
  const filled=776*g.verified/g.total;
  return `<text x="42" y="${y}" font-size="14" font-weight="650" fill="#e3ecfa">${label}</text>
<text x="918" y="${y}" text-anchor="end" font-size="14" font-weight="700" fill="#e3ecfa">${g.verified} / ${g.total} verified</text>
<rect x="42" y="${y+11}" width="876" height="12" rx="6" fill="#293a56"/>
${filled>0?`<rect x="42" y="${y+11}" width="${filled.toFixed(2)}" height="12" rx="6" fill="#34d399"/>`:''}`;
 }).join('\n');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="454" viewBox="0 0 960 454" role="img" aria-labelledby="title desc">
<title id="title">Palantiny-Network public-release roadmap progress</title>
<desc id="desc">${data.count} tracked slices: ${data.counts.done} done, ${data.counts.partial} partial, ${data.counts.planned} planned, ${data.counts['blocked-external']} externally blocked. Synthetic gates ${data.profiles['open-synthetic-testnet'].verified} of ${data.profiles['open-synthetic-testnet'].total} verified; real-sensor gates ${data.profiles['public-real-sensing'].verified} of ${data.profiles['public-real-sensing'].total} verified. Slice statuses are not completion percentages.</desc>
<rect width="960" height="454" rx="20" fill="#0c172a"/>
<rect x="1" y="1" width="958" height="452" rx="19" fill="none" stroke="#2b4262"/>
<text x="42" y="53" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif" font-size="25" font-weight="750" fill="#f1f6ff">Engineering progress</text>
<text x="42" y="81" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif" font-size="14" fill="#aebed6">Evidence-gated roadmap · ${data.count} tracked slices · ${escapeXml(data.updatedOn)}</text>
<g font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif">${metricCards}
<text x="42" y="250" font-size="14" font-weight="650" fill="#d3e1f5">Slice-by-slice status</text>
${tiles}
${gateRows}
<text x="42" y="437" font-size="12" fill="#98abc8">A green CI run does not clear public-release gates. This is a status snapshot, not an ETA.</text></g>
</svg>
`;
}
