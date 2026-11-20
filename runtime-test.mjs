// v0.28 LAB — network-free runtime wrapper regression.
import assert from "node:assert/strict";
import {buildRuntime,formatCapacityAlert} from "./runtime.mjs";
import {validHealth,recordHealth,healthOutcome} from "./health.mjs";
let n=0;const eq=(a,b)=>{assert.equal(a,b);n++};
const env={RADAR_RUNTIME_GATE:"LIVE_CAPACITY_ONLY",GITHUB_REPOSITORY:"mirkoworz/remura-ampere-radar",GITHUB_REF:"refs/heads/main",GITHUB_RUN_ATTEMPT:"1",RADAR_STATE_TOKEN:"github_pat_SYNTHETIC_NOT_REAL",RADAR_TELEGRAM_TOKEN:"123456789:MOCK_NOT_A_REAL_TOKEN_12345",RADAR_TELEGRAM_CHAT_ID:"12345"};
const row=(cpu,ram,status)=>({cpu,ram,status});
const no={candidate:null,results:[row(2,12,"OUT_OF_HOST_CAPACITY"),row(1,6,"OUT_OF_HOST_CAPACITY")]};
const yes={candidate:row(2,12,"AVAILABLE_UNQUANTIFIED"),results:[row(2,12,"AVAILABLE_UNQUANTIFIED"),row(1,6,"OUT_OF_HOST_CAPACITY")]};
function fixture({enabled=true,result=no,failSend=false,dueIn=0,onSleep=null}={}){
 let state={schema:1,enabled,revision:0,nextAt:1800000000000+dueIn,last:null,pending:[]},rev=1,now=1800000000000,probes=0,sends=0,writes=0,lastText="",waits=[],reads=0;
 const sha=()=>rev.toString(16).padStart(40,"0");
 const res=(body,status=200)=>new Response(JSON.stringify(body),{status});
 const path="https://api.github.com/repos/mirkoworz/remura-radar-state/contents/state.json";
 const fetchImpl=async(url,opts)=>{
   if(url===path+"?ref=main"&&opts.method==="GET"){reads++;return res({sha:sha(),type:"file",encoding:"base64",content:Buffer.from(JSON.stringify(state)).toString("base64")});}
   if(url===path&&opts.method==="PUT"){const body=JSON.parse(opts.body);if(body.sha!==sha())return res({},409);state=JSON.parse(Buffer.from(body.content,"base64").toString());rev++;writes++;return res({content:{sha:sha()}})}
   if(url==="https://api.telegram.org/bot"+env.RADAR_TELEGRAM_TOKEN+"/sendMessage"&&opts.method==="POST"){sends++;const body=JSON.parse(opts.body);assert.equal(body.allow_paid_broadcast,false);assert.equal(body.chat_id,"12345");lastText=body.text;if(failSend)throw Error("mock uncertain");return res({ok:true,result:{message_id:123,chat:{id:12345}}});}
   throw Error("network forbidden");
 };
 const runtime=buildRuntime({env,fetchImpl,clock:()=>now,probeFactory:()=>async()=>{probes++;return result;},sleep:async ms=>{waits.push(ms);now+=ms;if(onSleep)await onSleep({state,advance:n=>{now+=n}});}});
 return {run:runtime.run,state:()=>state,probes:()=>probes,sends:()=>sends,writes:()=>writes,text:()=>lastText,advance:ms=>{now+=ms},setResult:r=>{result=r},waits:()=>waits,reads:()=>reads};
}
let x=fixture({enabled:false});eq(await x.run(),"DISABLED");eq(x.probes(),0);eq(x.writes(),0);eq(x.sends(),0);
x=fixture();eq(await x.run(),"NOTHING_PENDING");eq(x.probes(),1);eq(x.state().health.failures,0);eq(x.state().health.lastGoodAt,1800000000000);eq(await x.run(),"NOT_DUE");eq(x.probes(),1);
x=fixture({result:yes});eq(await x.run(),"DELIVERED");eq(x.sends(),1);eq(x.state().pending.length,0);eq(x.state().delivery,null);eq(x.text().includes("Nessuna VPS prenotata o creata"),true);x.advance(1800000);eq(await x.run(),"NOTHING_PENDING");eq(x.sends(),1);
x=fixture({result:yes,failSend:true});eq(await x.run(),"DELIVERY_REVIEW_REQUIRED");x.advance(3600000);eq(await x.run(),"DELIVERY_REVIEW_REQUIRED");eq(x.sends(),1);eq(x.probes(),1);
x=fixture({result:{error:"API"}});eq(await x.run(),"HEALTH_TRANSIENT");eq(x.state().health.failures,1);eq(await x.run(),"NOT_DUE");x.advance(3600000);eq(await x.run(),"HEALTH_PERSISTENT");eq(x.state().health.failures,2);x.advance(3600000);eq(await x.run(),"HEALTH_BACKOFF");eq(x.state().health.failures,3);eq(x.sends(),0);
x.setResult(no);x.advance(3600000);eq(await x.run(),"NOTHING_PENDING");eq(x.state().health.failures,0);eq(x.state().health.error,null);eq(x.state().health.lastGoodAt,x.state().health.lastProbeAt);
x=fixture({result:{error:"AUTH"}});eq(await x.run(),"HEALTH_CRITICAL");eq(x.state().nextAt,1800000000000+86400000);x.advance(3600000);eq(await x.run(),"NOT_DUE");eq(x.probes(),1);
eq(validHealth(null),true);eq(validHealth({lastProbeAt:1,lastGoodAt:2,failures:1,error:"API"}),false);eq(validHealth({lastProbeAt:1,lastGoodAt:1,failures:0,error:"API"}),false);eq(validHealth({lastProbeAt:1,lastGoodAt:null,failures:101,error:"API"}),false);
const h={lastProbeAt:1,lastGoodAt:null,failures:100,error:"API"};eq(recordHealth({health:h},2,{error:"API"},false).health.failures,100);eq(healthOutcome(h,{...h,lastProbeAt:2,error:"UNKNOWN"},"INCOMPLETE_NO_SEND"),"HEALTH_PERSISTENT");
assert.throws(()=>recordHealth({health:h},0,no,true));n++;
assert.throws(()=>buildRuntime({env:{...env,RADAR_RUNTIME_GATE:"WRONG"}}));n++;
eq(formatCapacityAlert({key:"2/12",observedAt:Date.UTC(2026,10,17,16,30,13)}).includes("17:30:13"),true);
eq(formatCapacityAlert({key:"1/6",observedAt:Date.UTC(2026,6,17,16,30,13)}).includes("18:30:13"),true);
// New v0.35 integration cases, synthetic clocks and mocked transport only.
x=fixture({dueIn:7164});eq(await x.run(),"NOTHING_PENDING");eq(x.waits().length,1);eq(x.waits()[0],7164);eq(x.probes(),1);eq(x.state().health.lastGoodAt,1800000007164);eq(x.state().nextAt,1800001807164);eq(x.sends(),0);
x=fixture({dueIn:60001});eq(await x.run(),"NOT_DUE");eq(x.waits().length,0);eq(x.probes(),0);eq(x.writes(),0);
x=fixture({dueIn:60000});eq(await x.run(),"NOTHING_PENDING");eq(x.waits()[0],60000);eq(x.probes(),1);
x=fixture({dueIn:100,onSleep:({state})=>{state.enabled=false;}});eq(await x.run(),"DISABLED");eq(x.probes(),0);eq(x.writes(),0);
x=fixture({dueIn:100,onSleep:({state})=>{state.nextAt+=1800000;}});eq(await x.run(),"NOT_DUE");eq(x.probes(),0);eq(x.writes(),0);
x=fixture({dueIn:100,onSleep:({state})=>{state.pending=[{key:"2/12",observedAt:1}];state.delivery={key:"2/12",observedAt:1,startedAt:2};}});eq(await x.run(),"DELIVERY_REVIEW_REQUIRED");eq(x.probes(),0);eq(x.sends(),0);eq(x.writes(),0);
x=fixture({dueIn:100,onSleep:()=>{throw Error("mock sleep failure");}});eq(await x.run(),"RUNTIME_REVIEW_REQUIRED");eq(x.probes(),0);eq(x.writes(),0);
x=fixture({dueIn:100,onSleep:({advance})=>advance(-101)});eq(await x.run(),"STATE_INVALID");eq(x.probes(),0);eq(x.writes(),0);
console.log("RUNTIME_LAB_OK checks="+n);
