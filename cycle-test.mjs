// v0.15 LAB — Node 22, local tests only; never contact external services.
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,sign,verify} from "node:crypto";
import {makeStore} from "./store.mjs";
import {assess,classifyError} from "./radar.mjs";
import {makeCapacityReport,testOCI} from "./oci.mjs";
import {runCycle} from "./cycle.mjs";
import {resolveIntent,testRecovery} from "./recovery.mjs";
const counts=[await testOCI(),await testRecovery()];
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const config={tenancy:"ocid1.tenancy.oc1..synthetic12345",user:"ocid1.user.oc1..synthetic12345",fingerprint:Array(16).fill("ad").join(":"),ad:"TEST:EU-MILAN-1-AD-1"};
const row=(ocpus,memoryInGBs,availabilityStatus,availableCount)=>({instanceShape:"VM.Standard.A1.Flex",instanceShapeConfig:{ocpus,memoryInGBs},availabilityStatus,availableCount,faultDomain:null});
function fixture({enabled=true,failAt=0,ambiguous=false,incomplete=false,stale=false}={}){
 let now=2000000,rev=0,writes=0,probes=0,sends=0;
 let state={schema:1,enabled,revision:0,nextAt:0,last:stale?"2/12":null,pending:stale?[{key:"2/12",observedAt:1}]:[]};
 const sha=()=>rev.toString(16).padStart(40,"0");
 const encode=s=>Buffer.from(s,"utf8").toString("base64"),decode=s=>Buffer.from(s,"base64").toString("utf8");
 const request=async(method,path,b)=>{
  if(method==="GET")return {status:200,body:{sha:sha(),type:"file",encoding:"base64",content:encode(JSON.stringify(state))}};
  if(b.sha!==sha())return {status:409};
  writes++;if(writes===failAt&&!ambiguous)throw Error("mock lost write");
  state=JSON.parse(decode(b.content));rev++;
  if(writes===failAt)throw Error("mock lost response");
  return {status:200,body:{content:{sha:sha()}}};
 };
 const probe=()=>makeCapacityReport({config,clock:()=>now,assess,classifyError,
 hash:s=>createHash("sha256").update(s).digest("base64"),sign:s=>sign("RSA-SHA256",Buffer.from(s),privateKey).toString("base64"),
 request:async r=>{probes++;const sig=r.headers.authorization.match(/signature="([^"]+)"/)[1];
 const names=r.headers.authorization.match(/headers="([^"]+)"/)[1].split(" ");
 const signed=names.map(k=>k+": "+(k==="(request-target)"?"post /20160918/computeCapacityReports":r.headers[k])).join("\n");
 assert.ok(verify("RSA-SHA256",Buffer.from(signed),publicKey,Buffer.from(sig,"base64")));
 assert.equal(r.headers["x-content-sha256"],createHash("sha256").update(r.body).digest("base64"));
 return {status:200,body:{compartmentId:config.tenancy,availabilityDomain:config.ad,shapeAvailabilities:incomplete?[row(2,12,"AVAILABLE",null)]:[row(2,12,"AVAILABLE",null),row(1,6,"OUT_OF_HOST_CAPACITY",0)]}};}});
 const store=makeStore({request,encode,decode,repository:"example/state"});
 return {env:{store,probe,clock:()=>now,deliver:async()=>{sends++;return "ACKNOWLEDGED"}},state:()=>state,probes:()=>probes,sends:()=>sends,advance:()=>{now+=1800000}};
}
let n=0;
const eq=(a,b)=>{assert.equal(a,b);n++};
let x=fixture({enabled:false});eq(await runCycle(x.env),"DISABLED");eq(x.probes(),0);eq(x.sends(),0);
x=fixture();eq(await runCycle(x.env),"DELIVERED");eq(x.probes(),1);eq(x.sends(),1);eq(x.state().revision,4);eq(x.state().pending.length,0);eq(await runCycle(x.env),"NOT_DUE");eq(x.probes(),1);
x=fixture({incomplete:true});eq(await runCycle(x.env),"INCOMPLETE_NO_SEND");eq(x.sends(),0);
x=fixture({stale:true});eq(await runCycle(x.env),"DELIVERED");eq(x.sends(),1);
x=fixture({failAt:1,ambiguous:true});eq(await runCycle(x.env),"RESERVATION_UNCERTAIN");eq(x.probes(),0);eq(x.sends(),0);
x=fixture({failAt:2,ambiguous:true});eq(await runCycle(x.env),"RESULT_UNCERTAIN");eq(x.sends(),0);x.advance();eq(await runCycle(x.env),"DELIVERED");
x=fixture({failAt:4});eq(await runCycle(x.env),"ACK_UNCERTAIN");eq(x.sends(),1);x.advance();eq(await runCycle(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.probes(),1);eq(x.sends(),1);
const item=await x.env.store.read();eq(await resolveIntent({store:x.env.store,clock:x.env.clock,expectedVersion:item.version,...item.state.delivery,decision:"UNKNOWN_SUPPRESS",exclusiveMaintenance:true}),"RESOLVED_NO_SEND");eq(await runCycle(x.env),"NOTHING_PENDING");eq(x.sends(),1);
x=fixture();x.env.deliver=async()=>{throw Error("mock lost delivery")};eq(await runCycle(x.env),"DELIVERY_REVIEW_REQUIRED");x.advance();eq(await runCycle(x.env),"DELIVERY_REVIEW_REQUIRED");eq(x.probes(),1);
console.log("NODE_LAB_OK recovery="+counts[1]+" adapter="+counts[0]+" cycle="+n);
