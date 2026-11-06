'use strict';
const $=id=>document.getElementById(id);
const state={overview:null,selected:'market-lane',hours:24};
const NS='http://www.w3.org/2000/svg';
function svg(tag,attributes={},text=''){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attributes))el.setAttribute(k,v);if(text)el.textContent=text;return el;}
function time(ms){return new Date(ms).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'})+' UTC';}
function text(id,value){$(id).textContent=String(value);}
function renderZones(){
 const box=$('zones');box.replaceChildren();
 for(const r of state.overview.regions){
  const zone=document.createElement('button');zone.type='button';
  zone.className='zone '+(state.selected===r.id?'active ':'')+(r.index===null?'missing':'');
  Object.assign(zone.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%',
   backgroundColor:r.index===null?'#354650c4':r.index>75?'#3b9b81bc':r.index>45?'#317a77bd':'#295867bd'});
  const name=document.createElement('strong');name.textContent=r.name;
  const value=document.createElement('small');value.textContent=r.index===null?'NO COVERAGE':'INDEX '+r.index;
  zone.append(name,value);zone.setAttribute('aria-label',r.name+' '+value.textContent);
  zone.addEventListener('click',()=>void select(r.id));box.append(zone);
 }
}
function detail(){
 const r=state.overview.regions.find(x=>x.id===state.selected);
 text('region-name',r.name);text('region-type','Fictional region');
 text('quality',r.quality.replaceAll('_',' '));
 $('quality').className='quality '+(r.quality==='experimental'?'':'warning');
 text('region-index',r.index??'—');
 text('change',r.index===null?'Insufficient independent contributors':
  r.changePct===null?'No comparable baseline':(r.changePct>=0?'+':'')+r.changePct+'% vs same hour yesterday');
 text('latest',r.latestAt===null?'No data':time(r.latestAt));
 text('sources',r.sources+' signing keys (not attested)');
 text('quality-label',r.quality.replaceAll('_',' '));
 text('history-context',r.name+' · synthetic hourly observations');
}
function draw(history){
 const chart=$('chart');chart.replaceChildren();
 const left=42,right=678,top=10,bottom=180;
 const all=[...history.points,...history.baseline];
 const max=Math.max(100,Math.ceil(Math.max(0,...all.map(p=>p.index))/20)*20);
 for(let i=0;i<=4;i++){
  const y=top+(bottom-top)*i/4;
  chart.append(svg('line',{x1:left,y1:y,x2:right,y2:y,stroke:'#2a414c','stroke-dasharray':'3 6'}));
  chart.append(svg('text',{x:35,y:y+4,'text-anchor':'end',fill:'#859ea8','font-size':'11'},String(Math.round(max*(4-i)/4))));
 }
 const end=Math.floor(Date.now()/3600000)*3600000;
 const first=history.points[0]?.timestamp??history.baseline[0]?.timestamp??end-state.hours*3600000;
 const start=first,span=state.hours*3600000;
 function trace(points,color,dash){
  let d='',prev=null;
  for(const p of points){
   const x=left+(p.timestamp-start)/span*(right-left),y=bottom-p.index/max*(bottom-top);
   if(x<left-1||x>right+1)continue;
   d+=(prev===null||p.timestamp-prev>3600000?'M':'L')+x.toFixed(1)+','+y.toFixed(1)+' ';
   prev=p.timestamp;
  }
  chart.append(svg('path',{d,fill:'none',stroke:color,'stroke-width':dash?2:3,
   'stroke-dasharray':dash?'6 6':'none','stroke-linecap':'round'}));
 }
 if(history.baseline.length)trace(history.baseline,'#607b89',true);
 trace(history.points,'#60dfbe',false);
 for(let i=0;i<=4;i++){
  const x=left+(right-left)*i/4,ts=start+span*i/4;
  chart.append(svg('text',{x,y:207,'text-anchor':i===0?'start':i===4?'end':'middle',fill:'#859ea8','font-size':'10'},
   new Date(ts).toLocaleString('en-US',{hour:'numeric',month:'short',day:'numeric',timeZone:'UTC'})));
 }
 $('baseline-legend').hidden=state.hours!==24;
}
async function select(id){
 state.selected=id;renderZones();detail();
 try{
  const res=await fetch('/api/history?region='+encodeURIComponent(id)+'&hours='+state.hours);
  if(!res.ok)throw Error('History unavailable');
  const history=await res.json();if(state.selected===id)draw(history);
 }catch{text('history-context','History unavailable');}
}
for(const button of document.querySelectorAll('[data-hours]')){
 button.addEventListener('click',()=>{
  state.hours=Number(button.dataset.hours);
  for(const b of document.querySelectorAll('[data-hours]')){
   const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  }
  if(state.overview)void select(state.selected);
 });
}
async function main(){
 try{
  const res=await fetch('/api/overview');if(!res.ok)throw Error('Overview unavailable');
  state.overview=await res.json();
  text('generated','Generated '+time(Date.parse(state.overview.generatedAt)));
  text('average',state.overview.summary.averageIndex??'—');
  text('reporting',state.overview.summary.reporting);
  await select(state.selected);
 }catch(e){text('generated','Dashboard unavailable');}
}
void main();
