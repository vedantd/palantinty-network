import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../web/',import.meta.url));
const staticFiles=new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],
 ['/styles.css',['styles.css','text/css']]]);
const headers={'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
export function createDashboardServer(model){
 const json=(res,status,body)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 return createServer((req,res)=>{
  try{
   const u=new URL(req.url,'http://127.0.0.1');
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'method_not_allowed'});
   if(u.pathname==='/api/overview'){
    if(u.search)return json(res,400,{error:'unsupported_query'});
    return json(res,200,model.overview());
   }
   if(u.pathname==='/api/history'){
    if([...u.searchParams.keys()].some(k=>!['region','hours'].includes(k))||
      u.searchParams.getAll('region').length!==1||u.searchParams.getAll('hours').length>1)
     return json(res,400,{error:'invalid_query'});
    const id=u.searchParams.get('region'),h=u.searchParams.get('hours')??'24';
    if(!['24','48'].includes(h))return json(res,400,{error:'invalid_range'});
    try{return json(res,200,model.history(id,Number(h)));}
    catch{return json(res,404,{error:'unknown_region'});}
   }
   const file=staticFiles.get(u.pathname);
   if(!file)return json(res,404,{error:'not_found'});
   const bytes=readFileSync(path.join(ROOT,file[0]));
   res.writeHead(200,{...headers,'Content-Type':file[1]+'; charset=utf-8'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{return json(res,500,{error:'internal_error'});}
 });
}
