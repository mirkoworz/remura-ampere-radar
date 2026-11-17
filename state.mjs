// v0.4 LAB — 2026-11-17 CET — pure offline state helpers, no I/O.
function nextAllowed(state,now){
  return Number.isSafeInteger(now)&&now>=0&&now<=Number.MAX_SAFE_INTEGER-86400000&&!!state&&Number.isSafeInteger(state.nextAt)&&state.nextAt>=0&&now>=state.nextAt;
}
function reserve(state,now){
  if(!nextAllowed(state,now))throw Error("not due");
  return {...state,nextAt:now+1800000};
}
function record(state,now,result){
  if(!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-86400000||!Number.isSafeInteger(state.nextAt)||state.nextAt<0||!result||typeof result!=="object")throw Error("invalid input");
  const queue=state.pending??[];
  if(!Array.isArray(queue)||queue.length>2||queue.some(p=>!p||!["2/12","1/6"].includes(p.key)||!Number.isSafeInteger(p.observedAt)||p.observedAt<0)||new Set(queue.map(p=>p.key)).size!==queue.length)throw Error("invalid queue");
  const pending=queue.slice();
  const known=["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED","OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"];
  const rows=Array.isArray(result.results)?result.results:[];
  const complete=rows.length===2&&[[2,12],[1,6]].every(([c,r])=>rows.filter(x=>x&&x.cpu===c&&x.ram===r&&known.includes(x.status)).length===1);
  const candidate=result.candidate;
  const valid=candidate&&["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED"].includes(candidate.status)&&[[2,12],[1,6]].some(([c,r])=>candidate.cpu===c&&candidate.ram===r)&&rows.some(x=>x&&x.cpu===candidate.cpu&&x.ram===candidate.ram&&x.status===candidate.status);
  const delays={AUTH:86400000,ACCESS:86400000,QUOTA:86400000,RATE_LIMIT:3600000,API:3600000,UNKNOWN:3600000};
  const delay=result.error?(Object.hasOwn(delays,result.error)?delays[result.error]:3600000):(!complete||(candidate&&!valid)||(!candidate&&rows.some(x=>x&&String(x.status).startsWith("AVAILABLE_")))?3600000:1800000);
  let last=state.last??null;
  if(!result.error&&valid){
    const key=String(candidate.cpu)+"/"+String(candidate.ram);
    if(key!==last&&!pending.some(p=>p.key===key))pending.push({key,observedAt:now});
    last=key;
  }else if(!result.error&&complete&&rows.every(x=>["OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"].includes(x.status))){
    last=null;
  }
  return {...state,nextAt:Math.max(state.nextAt,now+delay),last,pending};
}
function acknowledge(state,key,observedAt){
  if(!Array.isArray(state.pending)||!state.pending.some(p=>p.key===key&&p.observedAt===observedAt))throw Error("invalid acknowledgement");
  return {...state,pending:state.pending.filter(p=>p.key!==key||p.observedAt!==observedAt)};
}
function testState(){
  const s={nextAt:0,last:null,pending:[]},t=1000;
  const row=(cpu,ram,status)=>({cpu,ram,status});
  const no2=row(2,12,"OUT_OF_HOST_CAPACITY"),no1=row(1,6,"OUT_OF_HOST_CAPACITY"),yes2=row(2,12,"AVAILABLE_UNQUANTIFIED"),yes1=row(1,6,"AVAILABLE_COUNTED");
  const no={candidate:null,results:[no2,no1]},main={candidate:yes2,results:[yes2,no1]},alt={candidate:yes1,results:[no2,yes1]};
  const r=reserve(s,t), a=record(r,t,alt), b=record(a,t+1,main), c=acknowledge(b,"1/6",t);
  const done=acknowledge(c,"2/12",t+1);
  const cases=[
   [nextAllowed(s,t),true],[nextAllowed(r,t),false],[nextAllowed(r,t+1800000),true],[nextAllowed({},t),false],[nextAllowed(s,-1),false],
   [a.pending[0].key,"1/6"],[b.pending.length,2],[b.pending[1].key,"2/12"],[c.pending.length,1],[done.pending.length,0],
   [record(done,t+2,main).pending.length,0],[record(done,t+2,no).last,null],[record(record(done,t+2,no),t+3,main).pending.length,1],
   [record(r,t,{error:"AUTH"}).nextAt,t+86400000],[record(r,t,{error:"QUOTA"}).nextAt,t+86400000],[record(r,t,{error:"API"}).nextAt,t+3600000],
   [record(r,t,{error:"NEW_ERROR"}).nextAt,t+3600000],[record(r,t,{candidate:null,results:[no2]}).nextAt,t+3600000],[record(r,t,{candidate:null,results:[no2,row(1,6,"UNKNOWN")]}).nextAt,t+3600000],
   [record(done,t,{error:"UNKNOWN"}).last,"2/12"],[record(b,t,{error:"API"}).pending.length,2],[record(b,t+3,alt).pending.length,2],
   [record(r,t,{candidate:yes2,results:[]}).pending.length,0],[record(r,t,{candidate:null,results:[yes2,no1]}).nextAt,t+3600000],
   [record(r,t,{candidate:yes1,results:[row(2,12,"UNKNOWN"),yes1]}).pending.length,1]
  ];
  for(const [i,[got,want]] of cases.entries())if(got!==want)throw Error("state test "+i);
  const throws=[()=>reserve(r,t),()=>acknowledge(b,"1/6",t+1),()=>acknowledge(b,"wrong",t),()=>record({...s,pending:{}},t,no),()=>record({...s,pending:[{key:"fake",observedAt:t}]},t,no)];
  for(const fn of throws){let threw=false;try{fn()}catch{threw=true}if(!threw)throw Error("expected throw");}
  return cases.length+throws.length;
}
export {nextAllowed,reserve,record,acknowledge,testState};
console.log('State self-tests passed: '+testState());
