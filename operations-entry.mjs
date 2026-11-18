// v0.31 LAB — entrypoint for owner-authorized activation, production, maintenance and heartbeat.
import {makeGitHubTransport} from "./transport.mjs";
import {makeStore} from "./store.mjs";
import {activateInitial,activationGate} from "./activation.mjs";
import {runProduction} from "./production.mjs";
import {executeMaintenance,maintenanceGate} from "./maintenance-executor.mjs";
import {heartbeat} from "./heartbeat.mjs";
const env=process.env,mode=env.RADAR_MODE;
const repository="mirkoworz/remura-radar-state";
const result=async()=>{
 if(mode==="RUN")return runProduction({env});
 const owner=env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_ACTOR==="mirkoworz"&&env.GITHUB_TRIGGERING_ACTOR==="mirkoworz";
 if(mode==="HEARTBEAT"){
  if(!owner&&!(env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.GITHUB_EVENT_NAME==="schedule"))return {code:"WATCHDOG_GATE_REJECTED",exit:1};
  const request=makeGitHubTransport({repository,token:env.RADAR_STATE_TOKEN,fetchImpl:(url,opts)=>{
   if(opts.method!=="GET"||url!=="https://api.github.com/repos/"+repository+"/contents/state.json?ref=main")throw Error("read only");return fetch(url,opts);
  }});
  const store=makeStore({repository,request,encode:s=>Buffer.from(s).toString("base64"),decode:s=>Buffer.from(s,"base64").toString()});
  const code=heartbeat((await store.read()).state,Date.now());
  return {code,exit:["WATCHDOG_DISABLED","WATCHDOG_AWAIT_FIRST","WATCHDOG_OK"].includes(code)?0:1};
 }
 if(!owner)return {code:"OWNER_GATE_REJECTED",exit:1};
 if(mode==="ACTIVATE"&&!activationGate(env)||mode==="MAINTAIN"&&!maintenanceGate(env)||!["ACTIVATE","MAINTAIN"].includes(mode))return {code:"MUTATION_GATE_REJECTED",exit:1};
 const request=makeGitHubTransport({repository,token:env.RADAR_STATE_TOKEN});
 if(mode==="ACTIVATE"){
  const code=await activateInitial({env,request,expectedVersion:env.RADAR_EXPECTED_SHA});
  return {code,exit:code==="ACTIVATION_CONFIRMED"?0:1};
 }
 let expectedIntent;
 if(env.RADAR_OPERATION==="RESOLVE_STOPPED"){
  if(!/^\d{1,16}$/.test(env.RADAR_INTENT_OBSERVED??"")||!/^\d{1,16}$/.test(env.RADAR_INTENT_STARTED??""))return {code:"MAINTENANCE_GATE_REJECTED",exit:1};
  expectedIntent={key:env.RADAR_INTENT_KEY,observedAt:Number(env.RADAR_INTENT_OBSERVED),startedAt:Number(env.RADAR_INTENT_STARTED)};
 }
 const code=await executeMaintenance({env,request,operation:env.RADAR_OPERATION,expectedVersion:env.RADAR_EXPECTED_SHA,expectedIntent,decision:env.RADAR_DECISION,exclusiveMaintenance:true});
 return {code,exit:["MAINTENANCE_STOPPED","MAINTENANCE_RESOLVED_STOPPED"].includes(code)?0:1};
};
let outcome;
try{outcome=await result()}catch{outcome={code:"OPERATIONS_REVIEW_REQUIRED",exit:1}}
console.log(outcome.code);
process.exitCode=outcome.exit;
