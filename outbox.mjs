// v0.12 LAB — 2026-11-17 CET — injected store and delivery; no live I/O.
async function dispatchPending({store,deliver,clock}){
 const read=await store.read();
 if(!read?.state||read.state.enabled!==true)return "DISABLED";
 const s=read.state;
 if(s.delivery!=null)return "DELIVERY_REVIEW_REQUIRED";
 if(!Array.isArray(s.pending)||!s.pending.length)return "NOTHING_PENDING";
 const event=s.pending.find(p=>p.key==="2/12")??s.pending[0];
 const now=clock();
 if(!["2/12","1/6"].includes(event.key)||!Number.isSafeInteger(event.observedAt)||!Number.isSafeInteger(now)||event.observedAt>now)return "INVALID_EVENT";
 // Do not tell the operator that a stale candidate is fresh.
 if(now-event.observedAt>900000)return "STALE_REVIEW_REQUIRED";
 const delivery={key:event.key,observedAt:event.observedAt,startedAt:now};
 let version,confirmed;
 try{
  version=await store.compareAndSwap(read.version,{...s,delivery});
  if(typeof version!=="string"||!version||version===read.version)return "CLAIM_UNCERTAIN";
  confirmed=await store.read();
  if(confirmed?.version!==version||confirmed.state?.enabled!==true||confirmed.state?.delivery?.key!==event.key||confirmed.state.delivery.observedAt!==event.observedAt||confirmed.state.delivery.startedAt!==now)return "CLAIM_UNCERTAIN";
 }catch{return "CLAIM_UNCERTAIN";}
 let result;
 try{result=await deliver(event);}catch{return "DELIVERY_REVIEW_REQUIRED";}
 // Telegram does not offer idempotent sendMessage: never auto-retry after intent.
 if(result!=="ACKNOWLEDGED")return "DELIVERY_REVIEW_REQUIRED";
 const next={...confirmed.state,delivery:null,pending:confirmed.state.pending.filter(p=>p.key!==event.key||p.observedAt!==event.observedAt)};
 try{const v=await store.compareAndSwap(version,next);if(typeof v!=="string"||!v||v===version)return "ACK_UNCERTAIN";}
 catch{return "ACK_UNCERTAIN";}
 return "DELIVERED";
}
async function testDispatch(){
 let n=0;const eq=(a,b)=>{if(a!==b)throw Error("dispatch assertion "+n);n++};
 const make=({failAt=0,ambiguous=false,result="ACKNOWLEDGED",enabled=true,now=1000,empty=false,throws=false}={})=>{
  let v=1,writes=0,sends=0;
  let state={enabled,pending:empty?[]:[{key:"1/6",observedAt:500},{key:"2/12",observedAt:600}],delivery:null};
  const store={read:async()=>({version:String(v),state:JSON.parse(JSON.stringify(state))}),compareAndSwap:async(expected,next)=>{
   if(expected!==String(v))return null;
   writes++;
   if(writes===failAt){if(ambiguous){state=next;v++;}throw Error("write failure");}
   state=next;return String(++v);
  }};
  const env={store,clock:()=>now,deliver:async e=>{sends++;eq(e.key,sends===1&&state.pending.some(p=>p.key==="2/12")?"2/12":"1/6");if(throws)throw Error("timeout");return result}};
  return {env,state:()=>state,sends:()=>sends,writes:()=>writes};
 };
 let x=make();eq(await dispatchPending(x.env),"DELIVERED");eq(x.sends(),1);eq(x.state().pending.length,1);eq(x.state().delivery,null);eq(await dispatchPending(x.env),"DELIVERED");eq(x.sends(),2);eq(await dispatchPending(x.env),"NOTHING_PENDING");
 x=make({enabled:false});eq(await dispatchPending(x.env),"DISABLED");eq(x.sends(),0);
 x=make({empty:true});eq(await dispatchPending(x.env),"NOTHING_PENDING");eq(x.writes(),0);
 x=make({now:1000000});eq(await dispatchPending(x.env),"STALE_REVIEW_REQUIRED");eq(x.sends(),0);
 x=make({failAt:1});eq(await dispatchPending(x.env),"CLAIM_UNCERTAIN");eq(x.sends(),0);
 x=make({failAt:1,ambiguous:true});eq(await dispatchPending(x.env),"CLAIM_UNCERTAIN");eq(await dispatchPending(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.sends(),0);
 x=make({throws:true});eq(await dispatchPending(x.env),"DELIVERY_REVIEW_REQUIRED");eq(await dispatchPending(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.sends(),1);
 x=make({result:"RATE_LIMIT"});eq(await dispatchPending(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.sends(),1);eq(x.state().pending.length,2);
 x=make({failAt:2});eq(await dispatchPending(x.env),"ACK_UNCERTAIN");eq(await dispatchPending(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.sends(),1);
 x=make();const results=await Promise.all([dispatchPending(x.env),dispatchPending(x.env)]);eq(results.filter(y=>y==="DELIVERED").length,1);eq(x.sends(),1);
 return n;
}
export {dispatchPending,testDispatch};
console.log('Dispatch checks passed: '+await testDispatch());
