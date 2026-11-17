// v0.12 LAB — simulated persistence and delivery integration.
import {makeStore} from './store.mjs';
import {dispatchPending} from './outbox.mjs';
async function checkOutboxStore(){
 let s={schema:1,enabled:true,revision:0,nextAt:0,last:"2/12",pending:[{key:"2/12",observedAt:1000}]},v=0,sends=0;
 const sha=()=>String(v).padStart(40,"a");
 const request=async(method,path,b)=>{if(method==="GET")return {status:200,body:{sha:sha(),type:"file",encoding:"base64",content:JSON.stringify(s)}};if(b.sha!==sha())return {status:409};s=JSON.parse(b.content);v++;return {status:200,body:{content:{sha:sha()}}};};
 const env={store:makeStore({repository:"example/state",request,encode:x=>x,decode:x=>x}),clock:()=>1100,deliver:async()=>{sends++;return "ACKNOWLEDGED";}};
 const checks=[await dispatchPending(env)==="DELIVERED",sends===1,s.revision===2,s.delivery===null,s.pending.length===0,await dispatchPending(env)==="NOTHING_PENDING",sends===1];
 if(checks.some(x=>!x))throw Error("store integration");
 return checks.length;
}
console.log('Outbox integration checks passed: '+await checkOutboxStore());
