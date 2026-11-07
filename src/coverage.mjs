const HOUR=3600000;
/**
 * Aggregate coverage is presence of released regional buckets, not sensor uptime.
 * Missing buckets must never be interpreted as zero BLE activity.
 */
export function summarizeHourlyCoverage(points,{start,end}={}){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
    end<=start||start%HOUR!==0||end%HOUR!==0||
    (end-start)/HOUR>500)throw new RangeError('Invalid hourly coverage interval');
 const byHour=new Map();
 for(const point of points){
  if(!Number.isSafeInteger(point?.timestamp)||point.timestamp%HOUR!==0||
     point.timestamp<start||point.timestamp>=end)continue;
  if(!Number.isFinite(point.index)||point.index<0||
     !Number.isSafeInteger(point.sources)||point.sources<2)continue;
  byHour.set(point.timestamp,point);
 }
 const expected=(end-start)/HOUR;
 const observed=byHour.size;
 return Object.freeze({
  expectedBuckets:expected,observedBuckets:observed,
  missingBuckets:expected-observed,
  coveragePct:Math.round(observed/expected*100),
  status:observed===expected?'complete':'incomplete',
  // A sparse series is not evidence of low or zero physical activity.
  semantics:'released_aggregate_presence_not_sensor_uptime'
 });
}
export function hourlyCoverageSeries(points,{start,end}={}){
 const coverage=summarizeHourlyCoverage(points,{start,end});
 const byHour=new Map(points.filter(p=>Number.isSafeInteger(p?.timestamp)&&
  Number.isFinite(p.index)&&p.index>=0&&
  Number.isSafeInteger(p.sources)&&p.sources>=2).map(p=>[p.timestamp,p]));
 const buckets=[];
 for(let t=start;t<end;t+=HOUR){
  const point=byHour.get(t);
  buckets.push({timestamp:t,index:point?.index??null,
   sources:point?.sources??0,status:point?'observed':'missing'});
 }
 return {coverage,buckets};
}
