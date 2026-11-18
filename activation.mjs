// v0.31 LAB — initial activation only, exact SHA, separate owner authorization.
import {validateState} from "./store.mjs";
import {isDeepStrictEqual} from "node:util";
const path="/repos/mirkoworz/remura-radar-state/contents/state.json";
const sha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
export function activationGate(env){
 return env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_ACTOR==="mirkoworz"&&env.GITHUB_TRIGGERING_ACTOR==="mirkoworz"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.RADAR_ACTIVATION_GATE==="ACTIVATE_INITIAL_STATE"&&env.RADAR_OPERATOR_ENABLE==="ENABLED";
}
export async function activateInitial({env,request,expectedVersion,clock=Date.now}){
 if(!activationGate(env)||!sha(expectedVersion))return "ACTIVATION_GATE_REJECTED";
 async function read(){
  const r=await request("GET",path+"?ref=main"),b=r?.body;
  if(r?.status!==200||b?.type!=="file"||b.encoding!=="base64"||!sha(b.sha)||typeof b.content!=="string"||b.content.length>8192)throw Error("read");
  const state=JSON.parse(Buffer.from(b.content,"base64").toString("utf8"));
  if(!validateState(state))throw Error("state");
  return {state,version:b.sha};
 }
 let item;try{item=await read()}catch{return "ACTIVATION_READ_UNCERTAIN"}
 const s=item.state,now=clock();
 if(item.version!==expectedVersion||s.enabled!==false||s.revision!==0||s.nextAt!==Number.MAX_SAFE_INTEGER||s.last!==null||s.pending.length||s.delivery!=null||s.health!=null||!Number.isSafeInteger(now)||now<0||now>8640000000000000)return "ACTIVATION_REVIEW_REQUIRED";
 const next={...s,enabled:true,revision:1,nextAt:now};
 try{
  const r=await request("PUT",path,{branch:"main",sha:item.version,message:"Owner-authorized initial Radar activation",content:Buffer.from(JSON.stringify(next)+"\n").toString("base64")});
  const v=r?.body?.content?.sha;
  if(r?.status!==200||!sha(v)||v===item.version)return "ACTIVATION_WRITE_UNCERTAIN";
  const check=await read();
  if(check.version!==v||!isDeepStrictEqual(check.state,next))return "ACTIVATION_WRITE_UNCERTAIN";
 }catch{return "ACTIVATION_WRITE_UNCERTAIN"}
 return "ACTIVATION_CONFIRMED";
}
