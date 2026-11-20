// REMURA Ampere Radar v0.36 LAB — 20/11/2026 CET; no provider.
import assert from "node:assert/strict";
import {runOnce} from "./coordinator.mjs";
const base={enabled:true,nextAt:0,pending:[]};
let passed=0;
for(const [kind,want] of [["write","WRITE_UNCERTAIN"],["ack","ACK_INVALID"],["read","READBACK_UNCERTAIN"],["missing","READBACK_MISSING"],["version","READBACK_VERSION"],["disabled","READBACK_DISABLED"],["next","READBACK_NEXT_AT"],["callback","READBACK_VERSION"],["ok",null]]){
 let reads=0,writes=0,probes=0,labels=[];
 const reserved={...base,nextAt:1801000};
 const store={read:async()=>{
  if(++reads===1)return {version:"old",state:base};
  if(kind==="read")throw Error("synthetic raw message never logged");
  if(kind==="missing")return null;
  return {version:["version","callback"].includes(kind)?"old":"new",state:{...reserved,enabled:kind!=="disabled",nextAt:kind==="next"?0:reserved.nextAt}};
 },compareAndSwap:async()=>{writes++;if(kind==="write")throw Error("synthetic hidden message");return kind==="ack"?"old":writes===1?"new":"finished";}};
 const out=await runOnce({store,clock:()=>1000,reserve:()=>reserved,nextAllowed:()=>true,probe:async()=>{probes++;return {};},record:s=>s,onReservationBlock:label=>{labels.push(label);if(kind==="callback")throw Error("diagnostic unavailable");}});
 assert.equal(out,want?"RESERVATION_UNCERTAIN":"RECORDED");
 assert.deepEqual(labels,want?[want]:[]);
 assert.equal(probes,want?0:1);
 assert.equal(writes,want?1:2);
 assert.equal(reads,["write","ack"].includes(kind)?1:2);
 passed++;
}
console.log("Reservation diagnostic cases: "+passed+" PASS");
