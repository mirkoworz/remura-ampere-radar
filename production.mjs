// v0.30 LAB — future release entrypoint; no installed production workflow.
import {buildRuntime} from "./runtime.mjs";
import {releaseOutcome} from "./release.mjs";
function productionGate(env){
 const base=env.GITHUB_REPOSITORY==="mirkoworz/remura-ampere-radar"&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_RUN_ATTEMPT==="1"&&env.RADAR_RUNTIME_GATE==="LIVE_CAPACITY_ONLY"&&env.RADAR_OPERATOR_ENABLE==="ENABLED";
 if(!base)return false;
 return env.GITHUB_EVENT_NAME==="schedule"||(env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_ACTOR==="mirkoworz"&&env.GITHUB_TRIGGERING_ACTOR==="mirkoworz");
}
async function runProduction({env,makeRuntime=buildRuntime}){
 if(!productionGate(env))return {code:"PRODUCTION_GATE_REJECTED",exit:1};
 try{return releaseOutcome(await makeRuntime({env}).run())}catch{return {code:"RUNTIME_REVIEW_REQUIRED",exit:1};}
}
export {productionGate,runProduction};
