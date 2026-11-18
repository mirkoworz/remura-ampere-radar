// v0.29 LAB — state maintenance decisions only. No live I/O, no activation workflow.
import {validateState} from "./store.mjs";
const MAX=Number.MAX_SAFE_INTEGER;
function planMaintenance({item,expectedVersion,operation,decision,expectedIntent,now,exclusiveMaintenance}){
 if(exclusiveMaintenance!==true||!item||!/^[a-f0-9]{40}$/.test(expectedVersion??"")||item.version!==expectedVersion||!validateState(item.state)||!Number.isSafeInteger(now)||now<0||now>8640000000000000)return null;
 const s=item.state;
 if(s.revision>=MAX-1)return null;
 if(operation==="STOP"){
  if(!s.enabled)return null;
  return {...s,enabled:false,nextAt:MAX,revision:s.revision+1};
 }
 if(operation==="RESOLVE_STOPPED"){
  const d=s.delivery;
  if(s.enabled||!d||!expectedIntent||!["CONFIRMED_DELIVERED","KNOWN_NOT_SENT","UNKNOWN_SUPPRESS"].includes(decision)||d.key!==expectedIntent.key||d.observedAt!==expectedIntent.observedAt||d.startedAt!==expectedIntent.startedAt||now-d.startedAt<1800000)return null;
  return {...s,revision:s.revision+1,delivery:null,pending:s.pending.filter(p=>p.key!==d.key||p.observedAt!==d.observedAt),last:decision==="KNOWN_NOT_SENT"&&s.last===d.key?null:s.last};
 }
 // Activation requires separate explicit approval and reviewed implementation.
 return null;
}
export {planMaintenance};
