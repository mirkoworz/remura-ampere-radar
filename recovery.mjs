// v0.13 LAB — 2026-11-17 Europe/Rome — no live I/O.
function reconcileFresh(state,now,result){
 const known=["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED","OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"];
 if(state.delivery!=null||!Number.isSafeInteger(now)||now<0||result?.error||!Array.isArray(result?.results)||result.results.length!==2)return state;
 const rows=["2/12","1/6"].map(key=>result.results.filter(r=>r&&`${r.cpu}/${r.ram}`===key&&known.includes(r.status)));
 if(rows.some(r=>r.length!==1))return state;
 const best=rows.flat().find(r=>r.status.startsWith("AVAILABLE_"));
 const key=best?`${best.cpu}/${best.ram}`:null;
 if((result.candidate?`${result.candidate.cpu}/${result.candidate.ram}`:null)!==key)return state;
 return {...state,pending:state.pending.filter(p=>p.key===key).map(p=>({key:p.key,observedAt:now}))};
}
async function resolveIntent({store,clock,expectedVersion,key,observedAt,startedAt,decision,exclusiveMaintenance}){
 // Caller must hold the same global execution lock as the scheduler.
 if(exclusiveMaintenance!==true||!["CONFIRMED_DELIVERED","KNOWN_NOT_SENT","UNKNOWN_SUPPRESS"].includes(decision)||typeof expectedVersion!=="string"||!expectedVersion)return "REVIEW_REQUIRED";
 let item;try{item=await store.read()}catch{return "READ_UNCERTAIN"}
 const s=item?.state,d=s?.delivery,now=clock();
 if(!s?.enabled||item.version!==expectedVersion||!d||d.key!==key||d.observedAt!==observedAt||d.startedAt!==startedAt||!Number.isSafeInteger(now)||!Number.isSafeInteger(startedAt)||now-startedAt<1800000)return "REVIEW_REQUIRED";
 const next={...s,delivery:null,pending:s.pending.filter(p=>p.key!==key||p.observedAt!==observedAt),last:decision==="KNOWN_NOT_SENT"&&s.last===key?null:s.last};
 try{
  const v=await store.compareAndSwap(item.version,next);
  if(typeof v!=="string"||!v||v===item.version)return "RECOVERY_UNCERTAIN";
  const confirmed=await store.read();
  if(confirmed?.version!==v||confirmed.state?.delivery!==null||confirmed.state.pending.some(p=>p.key===key&&p.observedAt===observedAt))return "RECOVERY_UNCERTAIN";
 }catch{return "RECOVERY_UNCERTAIN"}
 return "RESOLVED_NO_SEND";
}
async function testRecovery(){
 let n=0;const eq=(a,b)=>{if(a!==b)throw Error("recovery assertion "+n);n++};
 const e={key:"2/12",observedAt:100},d={...e,startedAt:200},s={enabled:true,last:"2/12",pending:[e],delivery:null};
 const yes={cpu:2,ram:12,status:"AVAILABLE_UNQUANTIFIED"},no={cpu:1,ram:6,status:"OUT_OF_HOST_CAPACITY"},report={candidate:yes,results:[yes,no]};
 eq(reconcileFresh(s,2000000,report).pending[0].observedAt,2000000);
 eq(reconcileFresh(s,2000000,{candidate:null,results:[{...yes,status:no.status},no]}).pending.length,0);
 eq(reconcileFresh(s,2000000,{...report,results:[yes]}),s);
 eq(reconcileFresh(s,2000000,{...report,error:"API"}),s);
 const blocked={...s,delivery:d};eq(reconcileFresh(blocked,2000000,report),blocked);
 eq(reconcileFresh(s,2000000,{...report,candidate:null}),s);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const make=(mode="ok")=>{let state=clone(blocked),v=1,w=0;const store={read:async()=>({state:clone(state),version:String(v)}),compareAndSwap:async(expected,next)=>{if(expected!==String(v))return null;w++;if(mode==="fail")throw Error("lost");state=clone(next);v++;if(mode==="ambiguous")throw Error("lost");return String(v)}};
 return {args:{store,clock:()=>2000000,expectedVersion:"1",...d,decision:"UNKNOWN_SUPPRESS",exclusiveMaintenance:true},state:()=>state,writes:()=>w}};
 let x=make();eq(await resolveIntent({...x.args,exclusiveMaintenance:false}),"REVIEW_REQUIRED");eq(x.writes(),0);
 eq(await resolveIntent({...x.args,clock:()=>300}),"REVIEW_REQUIRED");eq(x.writes(),0);
 eq(await resolveIntent({...x.args,expectedVersion:"2"}),"REVIEW_REQUIRED");eq(x.writes(),0);
 eq(await resolveIntent(x.args),"RESOLVED_NO_SEND");eq(x.state().pending.length,0);eq(x.state().last,"2/12");eq(await resolveIntent(x.args),"REVIEW_REQUIRED");eq(x.writes(),1);
 x=make();eq(await resolveIntent({...x.args,decision:"KNOWN_NOT_SENT"}),"RESOLVED_NO_SEND");eq(x.state().last,null);
 x=make();eq(await resolveIntent({...x.args,decision:"CONFIRMED_DELIVERED"}),"RESOLVED_NO_SEND");eq(x.state().last,"2/12");
 x=make("fail");eq(await resolveIntent(x.args),"RECOVERY_UNCERTAIN");eq(x.state().delivery.key,"2/12");
 x=make("ambiguous");eq(await resolveIntent(x.args),"RECOVERY_UNCERTAIN");eq(x.state().delivery,null);eq(await resolveIntent(x.args),"REVIEW_REQUIRED");
 x=make();const both=await Promise.all([resolveIntent(x.args),resolveIntent(x.args)]);eq(both.filter(r=>r==="RESOLVED_NO_SEND").length,1);eq(x.writes(),1);
 return n;
}
export {reconcileFresh,resolveIntent,testRecovery};
