// v0.5 LAB — 2026-11-17 CET — dependency-injected orchestration, no live I/O.
async function runOnce({store,probe,clock,reserve,record,nextAllowed}){
  const item=await store.read();
  if(!item||typeof item.version!=="string"||!item.version||!item.state||!Array.isArray(item.state.pending))return "STATE_INVALID";
  const now=clock();
  if(!nextAllowed(item.state,now))return "NOT_DUE";
  const reserved=reserve(item.state,now);
  // A failed or ambiguous write must never lead to a probe.
  let version;
  try{version=await store.compareAndSwap(item.version,reserved);}catch{return "RESERVATION_UNCERTAIN";}
  if(typeof version!=="string"||!version||version===item.version)return "RESERVATION_UNCERTAIN";
  let result;
  try{result=await probe();}catch{result={error:"UNKNOWN"};}
  const finished=record(reserved,Math.max(now,clock()),result);
  try{
    const saved=await store.compareAndSwap(version,finished);
    if(typeof saved!=="string"||!saved||saved===version)return "RESULT_UNCERTAIN";
  }catch{return "RESULT_UNCERTAIN";}
  return "RECORDED";
}
async function testCoordinator(){
  let count=0;
  const eq=(a,b)=>{if(a!==b)throw Error("coordinator assertion "+count);count++;};
  const make=({failAt=0,ambiguous=false,invalid=false}={})=>{
    let v=1, calls=0, writes=0, state={nextAt:0,pending:[]};
    const env={
      store:{read:async()=>invalid?null:{version:String(v),state:{...state}},compareAndSwap:async(expected,next)=>{
        writes++;if(expected!==String(v))return null;
        if(writes===failAt){if(ambiguous){state=next;v++;}throw Error("simulated write error");}
        state=next;v++;return String(v);
      }},
      probe:async()=>{calls++;return {error:"API"};},clock:()=>1000,
      reserve:(s,t)=>({...s,nextAt:t+1800000}),
      record:(s,t,r)=>({...s,nextAt:t+3600000,error:r.error}),
      nextAllowed:(s,t)=>t>=s.nextAt
    };return {env,calls:()=>calls,state:()=>state,writes:()=>writes};
  };
  let x=make();eq(await runOnce(x.env),"RECORDED");eq(x.calls(),1);eq(x.state().nextAt,3601000);eq(await runOnce(x.env),"NOT_DUE");eq(x.calls(),1);
  x=make({failAt:1});eq(await runOnce(x.env),"RESERVATION_UNCERTAIN");eq(x.calls(),0);
  x=make({failAt:1,ambiguous:true});eq(await runOnce(x.env),"RESERVATION_UNCERTAIN");eq(x.calls(),0);eq(await runOnce(x.env),"NOT_DUE");
  x=make({failAt:2});eq(await runOnce(x.env),"RESULT_UNCERTAIN");eq(x.calls(),1);eq(await runOnce(x.env),"NOT_DUE");
  x=make({invalid:true});eq(await runOnce(x.env),"STATE_INVALID");eq(x.calls(),0);
  x=make();const both=await Promise.all([runOnce(x.env),runOnce(x.env)]);eq(x.calls(),1);eq(both.filter(y=>y==="RECORDED").length,1);
  x=make();x.env.probe=async()=>{throw Error("simulated timeout");};eq(await runOnce(x.env),"RECORDED");eq(x.state().error,"UNKNOWN");
  return count;
}
export {runOnce,testCoordinator};
console.log('Coordinator checks passed: '+await testCoordinator());
