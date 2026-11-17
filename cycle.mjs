// v0.15 LAB — 2026-11-17 Europe/Rome. Dependency-injected cycle, no scheduler.
import {runOnce} from "./coordinator.mjs";
import {reserve,record,nextAllowed} from "./state.mjs";
import {dispatchPending} from "./outbox.mjs";
import {reconcileFresh} from "./recovery.mjs";

function completeReport(result){
 if(result?.error||!Array.isArray(result?.results)||result.results.length!==2)return false;
 const allowed=["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED","OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"];
 const rows=["2/12","1/6"].map(k=>result.results.filter(r=>r&&`${r.cpu}/${r.ram}`===k&&allowed.includes(r.status)));
 if(rows.some(r=>r.length!==1))return false;
 const best=rows.flat().find(r=>r.status.startsWith("AVAILABLE_"));
 return best?result.candidate?.cpu===best.cpu&&result.candidate?.ram===best.ram&&result.candidate?.status===best.status:result.candidate===null;
}
async function runCycle({store,probe,deliver,clock}){
 // Requires a single global scheduler/maintenance lock, not only local CAS.
 let first;try{first=await store.read()}catch{return "STATE_READ_UNCERTAIN"}
 if(first?.state?.enabled!==true)return "DISABLED";
 if(first.state.delivery!=null)return "DELIVERY_REVIEW_REQUIRED";
 let fresh=false;
 const status=await runOnce({store,clock,reserve,nextAllowed,probe:async()=>{const r=await probe();fresh=completeReport(r);return r;},
 record:(s,t,r)=>{const next=record(s,t,r);return fresh?reconcileFresh(next,t,r):next;}});
 if(status!=="RECORDED")return status;
 if(!fresh)return "INCOMPLETE_NO_SEND";
 return dispatchPending({store,clock,deliver});
}
export {completeReport,runCycle};
