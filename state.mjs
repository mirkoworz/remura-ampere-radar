// v0.3 LAB — offline scheduling/outbox decision helpers only.
function nextAllowed(state,now){
  if(!Number.isSafeInteger(now)||now<0||!state||!Number.isSafeInteger(state.nextAt)||state.nextAt<0)return false;
  return now>=state.nextAt;
}
function reserve(state,now){
  if(!nextAllowed(state,now))throw Error("not due");
  return {...state,nextAt:now+1800000};
}
function record(state,now,result){
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(state.nextAt)||now<0)throw Error("invalid state");
  const delays={AUTH:86400000,ACCESS:86400000,QUOTA:86400000,RATE_LIMIT:3600000,API:3600000,UNKNOWN:3600000};
  const delay=delays[result.error]??1800000;
  const candidate=result.candidate;
  let last=state.last??null, pending=state.pending??null;
  if(!result.error&&candidate&&["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED"].includes(candidate.status)&&[[2,12],[1,6]].some(([c,r])=>candidate.cpu===c&&candidate.ram===r)){
    const key=String(candidate.cpu)+"/"+String(candidate.ram);
    if(key!==last&&!pending){pending={key,observedAt:now};last=key;}
  }else if(!result.error&&Array.isArray(result.results)&&result.results.length===2&&result.results.every(x=>["OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"].includes(x.status))){last=null;}
  return {...state,nextAt:Math.max(state.nextAt,now+delay),last,pending};
}
function acknowledge(state,key){
  if(!state.pending||state.pending.key!==key)throw Error("invalid acknowledgement");
  return {...state,pending:null};
}
function testState(){
  const s={nextAt:0,last:null,pending:null}, t=1000;
  const r=reserve(s,t), ok={candidate:{cpu:2,ram:12,status:"AVAILABLE_UNQUANTIFIED"}}, no={candidate:null,results:[{status:"OUT_OF_HOST_CAPACITY"},{status:"OUT_OF_HOST_CAPACITY"}]};
  const a=record(r,t,ok), b=acknowledge(a,"2/12");
  const cases=[
    [nextAllowed(s,t),true],[nextAllowed(r,t),false],[nextAllowed(r,t+1800000),true],
    [nextAllowed({},t),false],[nextAllowed(s,-1),false],
    [a.pending.key,"2/12"],[b.pending,null],[record(b,t,ok).pending,null],
    [record(b,t,no).last,null],[record(record(b,t,no),t,ok).pending.key,"2/12"],
    [record(r,t,{error:"AUTH"}).nextAt,t+86400000],
    [record(r,t,{error:"QUOTA"}).nextAt,t+86400000],
    [record(r,t,{error:"API"}).nextAt,t+3600000],
    [record(b,t,{error:"UNKNOWN"}).last,"2/12"],
    [record(a,t,{error:"API"}).pending.key,"2/12"]
  ];
  for(const [i,[got,want]] of cases.entries())if(got!==want)throw Error("state test "+i);
  for(const fn of [()=>reserve(r,t),()=>acknowledge(a,"wrong")]){let threw=false;try{fn()}catch{threw=true}if(!threw)throw Error("expected throw");}
  return cases.length+2;
}
export {nextAllowed,reserve,record,acknowledge,testState};
console.log('State self-tests passed: '+testState());
