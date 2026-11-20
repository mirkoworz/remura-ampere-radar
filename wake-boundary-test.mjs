// REMURA Ampere Radar v0.34 LAB — synthetic clocks, no network.
import {awaitWake} from './wake-boundary-lab.mjs';
async function testWake(fn){
 let n=0;
 const s=(nextAt,enabled=true)=>({enabled,nextAt});
 for(const [name,states,times,want,waits,reads] of [
 ["observed early",[s(1795169784747),s(1795169784747)],[1795169777583,1795169784747],"DEFER_TO_EXISTING_GATE",[7164],2],
 ["exact due",[s(1000)],[1000],"DEFER_TO_EXISTING_GATE",[],1],
 ["late",[s(1000)],[1001],"DEFER_TO_EXISTING_GATE",[],1],
 ["far early",[s(61001)],[1000],"NOT_DUE",[],1],
 ["max wait",[s(61000),s(61000)],[1000,61000],"DEFER_TO_EXISTING_GATE",[60000],2],
 ["disabled",[s(1000,false)],[1000],"DISABLED",[],1],
 ["disabled during wait",[s(1001),s(1001,false)],[1000,1001],"DISABLED",[1],2],
 ["another reservation",[s(1001),s(1801001)],[1000,1001],"NOT_DUE",[1],2],
 ["second early",[s(1001),s(1001)],[1000,1000],"NOT_DUE",[1],2],
 ["clock rollback",[s(1001),s(1001)],[1000,999],"INVALID",[1],2],
 ["bad first",[s(-1)],[1000],"INVALID",[],1],
 ["bad second",[s(1001),null],[1000,1001],"INVALID",[1],2]
 ]){
  let i=0,j=0;const actual=[];const result=await fn({read:async()=>states[i++],clock:()=>times[j++],sleep:async ms=>{actual.push(ms)}});
  if(result.decision!==want||JSON.stringify(actual)!==JSON.stringify(waits)||i!==reads||result.waited!==!!waits.length)throw Error(name);n++;
 }
 const e=await fn({read:async()=>{throw Error("mock");},clock:()=>0,sleep:async()=>{throw Error("unexpected");}});
 if(e.decision!=="REVIEW_REQUIRED"||e.waited!==false)throw Error("read failure");n++;
 const f=await fn({read:async()=>s(1001),clock:()=>1000,sleep:async()=>{throw Error("mock");}});
 if(f.decision!=="REVIEW_REQUIRED"||f.waited!==true)throw Error("sleep failure");n++;
 return n;
}
console.log('Wake boundary tests: '+await testWake(awaitWake)+' PASS');
