// v0.31 LAB — initial activation simulation, no network.
import assert from "node:assert/strict";
import {activateInitial} from "./activation.mjs";
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const env={GITHUB_REPOSITORY:"mirkoworz/remura-ampere-radar",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_ACTOR:"mirkoworz",GITHUB_TRIGGERING_ACTOR:"mirkoworz",GITHUB_RUN_ATTEMPT:"1",RADAR_ACTIVATION_GATE:"ACTIVATE_INITIAL_STATE",RADAR_OPERATOR_ENABLE:"ENABLED"};
const sha="a".repeat(40),now=1800000000000,base={schema:1,enabled:false,revision:0,nextAt:Number.MAX_SAFE_INTEGER,last:null,pending:[]};
function fixture({patch={},mode="ok"}={}){
 let state={...structuredClone(base),...patch},version=sha,reads=0,writes=0;
 const request=async(method,path,body)=>{
  if(method==="GET"){reads++;if(mode==="badread"||mode==="lostread"&&reads>1)throw Error("mock");return {status:200,body:{type:"file",encoding:"base64",sha:version,content:Buffer.from(JSON.stringify(state)).toString("base64")}};}
  assert.equal(method,"PUT");assert.equal(path,"/repos/mirkoworz/remura-radar-state/contents/state.json");assert.equal(body.sha,version);assert.equal(body.branch,"main");writes++;
  if(mode==="conflict")return {status:409};
  state=JSON.parse(Buffer.from(body.content,"base64"));version="b".repeat(40);
  if(mode==="lostwrite")throw Error("mock");
  if(mode==="mismatch")state.nextAt++;
  return {status:200,body:{content:{sha:version}}};
 };
 return {args:{env,request,expectedVersion:sha,clock:()=>now},state:()=>state,writes:()=>writes,reads:()=>reads};
}
let x=fixture();eq(await activateInitial(x.args),"ACTIVATION_CONFIRMED");eq(x.state(),{...base,enabled:true,revision:1,nextAt:now});eq(x.writes(),1);eq(await activateInitial(x.args),"ACTIVATION_REVIEW_REQUIRED");eq(x.writes(),1);
for(const key of Object.keys(env)){x=fixture();eq(await activateInitial({...x.args,env:{...env,[key]:"wrong"}}),"ACTIVATION_GATE_REJECTED");eq(x.reads(),0);}
for(const patch of [{enabled:true},{revision:1},{nextAt:0},{last:"2/12"},{pending:[{key:"2/12",observedAt:1}]},{health:{lastProbeAt:1,lastGoodAt:1,failures:0,error:null}}]){x=fixture({patch});eq(await activateInitial(x.args),"ACTIVATION_REVIEW_REQUIRED");eq(x.writes(),0);}
x=fixture();eq(await activateInitial({...x.args,expectedVersion:"c".repeat(40)}),"ACTIVATION_REVIEW_REQUIRED");eq(x.writes(),0);
x=fixture();eq(await activateInitial({...x.args,clock:()=>-1}),"ACTIVATION_REVIEW_REQUIRED");eq(x.writes(),0);
for(const mode of ["conflict","lostread","lostwrite","mismatch"]){x=fixture({mode});eq(await activateInitial(x.args),"ACTIVATION_WRITE_UNCERTAIN");eq(x.writes(),1);}
x=fixture({mode:"badread"});eq(await activateInitial(x.args),"ACTIVATION_READ_UNCERTAIN");eq(x.writes(),0);
console.log("ACTIVATION_LAB_OK checks="+n);
