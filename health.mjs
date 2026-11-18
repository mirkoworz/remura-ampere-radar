// v0.28 LAB — durable health counters; no notification side effects.
const ERRORS=["AUTH","ACCESS","QUOTA","RATE_LIMIT","API","UNKNOWN"];
const severe=e=>["AUTH","ACCESS","QUOTA"].includes(e);
const time=t=>Number.isSafeInteger(t)&&t>=0&&t<=8640000000000000;
function validHealth(h){
 if(h==null)return true;
 return typeof h==="object"&&!Array.isArray(h)&&time(h.lastProbeAt)&&(h.lastGoodAt===null||time(h.lastGoodAt)&&h.lastGoodAt<=h.lastProbeAt)&&Number.isSafeInteger(h.failures)&&h.failures>=0&&h.failures<=100&&(h.failures===0?h.error===null&&h.lastGoodAt===h.lastProbeAt:ERRORS.includes(h.error));
}
function recordHealth(state,t,result,complete){
 if(!time(t)||!validHealth(state.health))throw Error("health invalid");
 const prior=state.health;
 if(prior&&t<prior.lastProbeAt)throw Error("clock rollback");
 const error=complete?null:ERRORS.includes(result?.error)?result.error:"UNKNOWN";
 const failures=complete?0:Math.min(100,(prior?.failures??0)+1);
 return {...state,health:{lastProbeAt:t,lastGoodAt:complete?t:prior?.lastGoodAt??null,failures,error}};
}
function healthOutcome(before,after,outcome){
 if(outcome!=="INCOMPLETE_NO_SEND")return outcome;
 if(!validHealth(after)||!after||after.failures===0)return "HEALTH_REVIEW_REQUIRED";
 if(severe(after.error))return "HEALTH_CRITICAL";
 if(after.failures===2||before?.failures>=2&&before.error!==after.error)return "HEALTH_PERSISTENT";
 return after.failures>=2?"HEALTH_BACKOFF":"HEALTH_TRANSIENT";
}
export {validHealth,recordHealth,healthOutcome};
