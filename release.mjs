// v0.29 LAB — pure release decisions. No external I/O.
const OK=["DISABLED","NOT_DUE","NOTHING_PENDING","DELIVERED","HEALTH_TRANSIENT","HEALTH_BACKOFF"];
const STOP=["CONFIG_REVIEW_REQUIRED","HEALTH_CRITICAL","HEALTH_PERSISTENT","HEALTH_REVIEW_REQUIRED","STATE_READ_UNCERTAIN","STATE_INVALID","RESERVATION_UNCERTAIN","RESULT_UNCERTAIN","DELIVERY_REVIEW_REQUIRED","CLAIM_UNCERTAIN","ACK_UNCERTAIN","STALE_REVIEW_REQUIRED","INVALID_EVENT"];
function releaseOutcome(value){
 if(OK.includes(value))return {code:value,exit:0};
 if(STOP.includes(value))return {code:value,exit:1};
 return {code:"RUNTIME_REVIEW_REQUIRED",exit:1};
}
function releaseGate(env){
 return env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_ACTOR==="mirkoworz"&&env.GITHUB_TRIGGERING_ACTOR==="mirkoworz"&&env.RADAR_RELEASE_GATE==="VERIFY_DISABLED_ONLY";
}
async function verifyDisabled({env,readState}){
 if(!releaseGate(env))return {code:"RELEASE_GATE_REJECTED",exit:1};
 try{
  const item=await readState();
  if(item?.state?.enabled!==false)return {code:"RELEASE_STOP_NOT_DISABLED",exit:1};
  if(item.state.delivery!=null||item.state.pending?.length!==0)return {code:"RELEASE_STOP_REVIEW_INTENT",exit:1};
  return {code:"RELEASE_DISABLED_VERIFIED",exit:0};
 }catch{return {code:"RELEASE_READ_UNCERTAIN",exit:1};}
}
export {releaseOutcome,releaseGate,verifyDisabled};
