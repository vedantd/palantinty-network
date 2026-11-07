#!/usr/bin/env node
import {createSyntheticDashboard} from '../src/dashboard.mjs';
import {createDashboardServer} from '../src/dashboard-server.mjs';
const port=Number(process.env.PORT??4177);
if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
const model=createSyntheticDashboard();
const server=createDashboardServer(model);
server.listen(port,'127.0.0.1',()=>{
 console.log('Palantiny-Network synthetic dashboard: http://127.0.0.1:'+server.address().port);
 console.log('Synthetic only. No real sensor data, Internet listener, or telemetry.');
});
let closing=false;
function stop(){if(closing)return;closing=true;server.close(()=>model.close());}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
