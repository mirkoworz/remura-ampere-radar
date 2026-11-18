// v0.30 LAB — explicit maintenance CAS; no activation and no credentials on import.
import {planMaintenance} from "./maintenance.mjs";
import {validateState} from "./store.mjs";
import {isDeepStrictEqual} from "node:util";
const repository="mirkoworz/remura-radar-state";
const path="/repos/"+repository+"/contents/state.json";
const validSha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
function maintenanceGate(env){
 return env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_ACTOR==="mirkoworz"&&env.GITHUB_TRIGGERING_ACTOR==="mirkoworz"&&env.RADAR_MAINTENANCE_GATE==="STOP_OR_RESOLVE_ONLY";
}
async function executeMaintenance({env,request,operation,expectedVersion,expectedIntent,decision,clock=Date.now,exclusiveMaintenance}){
 if(!maintenanceGate(env)||exclusiveMaintenance!==true||!validSha(expectedVersion)||!["STOP","RESOLVE_STOPPED"].includes(operation))return "MAINTENANCE_GATE_REJECTED";
 const read=async()=>{
  const r=await request("GET",path+"?ref=main");
  const b=r?.body;
  if(r?.status!==200||b?.type!=="file"||b.encoding!=="base64"||!validSha(b.sha)||typeof b.content!=="string"||b.content.length>8192)throw Error("read");
  const state=JSON.parse(Buffer.from(b.content,"base64").toString("utf8"));
  if(!validateState(state))throw Error("state");
  return {version:b.sha,state};
 };
 let item;try{item=await read()}catch{return "MAINTENANCE_READ_UNCERTAIN"}
 const next=planMaintenance({item,expectedVersion,operation,expectedIntent,decision,now:clock(),exclusiveMaintenance});
 if(!next||!validateState(next)||next.enabled!==false)return "MAINTENANCE_REVIEW_REQUIRED";
 try{
  const r=await request("PUT",path,{branch:"main",sha:item.version,message:"Radar maintenance: "+operation,content:Buffer.from(JSON.stringify(next)+"\n").toString("base64")});
  const sha=r?.body?.content?.sha;
  if(r?.status!==200||!validSha(sha)||sha===item.version)return "MAINTENANCE_WRITE_UNCERTAIN";
  const confirmed=await read();
  if(confirmed.version!==sha||!isDeepStrictEqual(confirmed.state,next))return "MAINTENANCE_WRITE_UNCERTAIN";
 }catch{return "MAINTENANCE_WRITE_UNCERTAIN"}
 return operation==="STOP"?"MAINTENANCE_STOPPED":"MAINTENANCE_RESOLVED_STOPPED";
}
export {maintenanceGate,executeMaintenance};
