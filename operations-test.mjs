// v0.30 LAB — isolated simulations only.
import assert from "node:assert/strict";
import {executeMaintenance} from "./maintenance-executor.mjs";
import {heartbeat} from "./heartbeat.mjs";
import {runProduction} from "./production.mjs";
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const env={GITHUB_REPOSITORY:"mirkoworz/remura-ampere-radar",GITHUB_REF:"refs/heads/main",GITHUB_RUN_ATTEMPT:"1",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_ACTOR:"mirkoworz",GITHUB_TRIGGERING_ACTOR:"mirkoworz",RADAR_MAINTENANCE_GATE:"STOP_OR_RESOLVE_ONLY",RADAR_RUNTIME_GATE:"LIVE_CAPACITY_ONLY",RADAR_OPERATOR_ENABLE:"ENABLED"};
const now=1800000000000,sha="a".repeat(40),intent={key:"2/12",observedAt:now-3600000,startedAt:now-3600000};
const base={schema:1,enabled:true,revision:0,nextAt:now,last:"2/12",pending:[{key:intent.key,observedAt:intent.observedAt}],delivery:intent,health:{lastProbeAt:now-3600000,lastGoodAt:now-3600000,failures:0,error:null}};
function fixture(mode="ok"){
 let state=structuredClone(base),version=sha,writes=0,reads=0;
 const request=async(method,path,body)=>{
  if(method==="GET"){reads++;if(mode==="badread"||mode==="reread"&&reads>1)throw Error("mock");return {status:200,body:{type:"file",encoding:"base64",sha:version,content:Buffer.from(JSON.stringify(state)).toString("base64")}}}
  if(method!=="PUT"||path!=="/repos/mirkoworz/remura-radar-state/contents/state.json"||body.sha!==version||body.branch!=="main")throw Error("blocked");
  writes++;if(mode==="conflict")return {status:409};state=JSON.parse(Buffer.from(body.content,"base64"));version="b".repeat(40);if(mode==="ambiguous")throw Error("lost");if(mode==="wrongread")state.last=null;
  return {status:200,body:{content:{sha:version}}};
 };
 return {args:{env,request,operation:"STOP",expectedVersion:sha,clock:()=>now,exclusiveMaintenance:true},state:()=>state,writes:()=>writes};
}
let x=fixture();eq(await executeMaintenance(x.args),"MAINTENANCE_STOPPED");eq(x.state().enabled,false);eq(x.state().delivery,intent);eq(x.state().health,base.health);eq(x.state().revision,1);
for(const patch of [{operation:"ACTIVATE"},{exclusiveMaintenance:false},{env:{...env,GITHUB_ACTOR:"other"}},{expectedVersion:"wrong"}]){x=fixture();eq(await executeMaintenance({...x.args,...patch}),"MAINTENANCE_GATE_REJECTED");eq(x.writes(),0)}
x=fixture();eq(await executeMaintenance({...x.args,expectedVersion:"c".repeat(40)}),"MAINTENANCE_REVIEW_REQUIRED");eq(x.writes(),0);
for(const mode of ["conflict","ambiguous","reread","wrongread"]){x=fixture(mode);eq(await executeMaintenance(x.args),"MAINTENANCE_WRITE_UNCERTAIN");eq(x.writes(),1)}
x=fixture("badread");eq(await executeMaintenance(x.args),"MAINTENANCE_READ_UNCERTAIN");eq(x.writes(),0);
const healthy={...base,delivery:null,pending:[],last:null};
eq(heartbeat({...healthy,enabled:false},now),"WATCHDOG_DISABLED");eq(heartbeat(base,now),"WATCHDOG_DELIVERY_REVIEW");eq(heartbeat(healthy,now),"WATCHDOG_OK");eq(heartbeat(healthy,now+5400001),"WATCHDOG_OVERDUE");
eq(heartbeat({...healthy,health:undefined,nextAt:now+1000},now),"WATCHDOG_AWAIT_FIRST");eq(heartbeat({...healthy,health:{...healthy.health,lastProbeAt:now+1}},now),"WATCHDOG_CLOCK_REVIEW");
eq(heartbeat({...healthy,health:{...healthy.health,error:"AUTH",failures:1}},now),"WATCHDOG_CRITICAL");eq(heartbeat({...healthy,health:{...healthy.health,error:"API",failures:2}},now),"WATCHDOG_PERSISTENT");eq(heartbeat({},now),"WATCHDOG_REVIEW");
let calls=0;const makeRuntime=()=>({run:async()=>{calls++;return "DELIVERED"}});
for(const patch of [{RADAR_OPERATOR_ENABLE:"OFF"},{GITHUB_REF:"refs/heads/other"},{GITHUB_RUN_ATTEMPT:"2"},{GITHUB_ACTOR:"other"},{GITHUB_EVENT_NAME:"push"}])eq(await runProduction({env:{...env,...patch},makeRuntime}),{code:"PRODUCTION_GATE_REJECTED",exit:1});
eq(calls,0);eq(await runProduction({env,makeRuntime}),{code:"DELIVERED",exit:0});eq(calls,1);
eq(await runProduction({env:{...env,GITHUB_EVENT_NAME:"schedule"},makeRuntime}),{code:"DELIVERED",exit:0});
eq(await runProduction({env,makeRuntime:()=>{throw Error("mock secret")}}),{code:"RUNTIME_REVIEW_REQUIRED",exit:1});
console.log("OPERATIONS_LAB_OK checks="+n);
