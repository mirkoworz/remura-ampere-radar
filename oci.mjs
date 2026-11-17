// v0.14 LAB — 2026-11-17 Europe/Rome. No I/O on import.
import {createHash,createPrivateKey,sign as rsaSign} from "node:crypto";
import {assess,classifyError} from "./radar.mjs";
function normalizeReport(body,{tenancy,ad},assess){
 if(body?.compartmentId!==tenancy||body?.availabilityDomain!==ad||!Array.isArray(body.shapeAvailabilities)||body.shapeAvailabilities.length!==2)return {error:"UNKNOWN"};
 return assess(body.shapeAvailabilities.map(r=>({"instance-shape":r?.instanceShape,"instance-shape-config":{ocpus:r?.instanceShapeConfig?.ocpus,"memory-in-gbs":r?.instanceShapeConfig?.memoryInGBs},"availability-status":r?.availabilityStatus,"available-count":r?.availableCount,"fault-domain":r?.faultDomain})));
}
function buildRequest({tenancy,user,fingerprint,ad,now,hash,sign}){
 if(!/^ocid1\.tenancy\.oc1\.\.[a-z0-9]{10,100}$/.test(tenancy??"")||!/^ocid1\.user\.oc1\.\.[a-z0-9]{10,100}$/.test(user??"")||!/^([a-f0-9]{2}:){15}[a-f0-9]{2}$/i.test(fingerprint??"")||!/^[A-Za-z0-9]{4}:EU-MILAN-1-AD-1$/.test(ad??"")||!Number.isSafeInteger(now)||now<0||now>8640000000000000)throw Error("invalid OCI configuration");
 const host="iaas.eu-milan-1.oraclecloud.com",path="/20160918/computeCapacityReports";
 const body=JSON.stringify({compartmentId:tenancy,availabilityDomain:ad,shapeAvailabilities:[[2,12],[1,6]].map(([ocpus,memoryInGBs])=>({instanceShape:"VM.Standard.A1.Flex",instanceShapeConfig:{ocpus,memoryInGBs}}))});
 const headers={host,"x-date":new Date(now).toUTCString(),"x-content-sha256":hash(body),"content-type":"application/json","content-length":String(body.length)};
 const names=["(request-target)",...Object.keys(headers)];
 const signing=names.map(k=>k+": "+(k==="(request-target)"?"post "+path:headers[k])).join("\n");
 headers.authorization='Signature version="1",keyId="'+tenancy+"/"+user+"/"+fingerprint+'",algorithm="rsa-sha256",headers="'+names.join(" ")+'",signature="'+sign(signing)+'"';
 return {url:"https://"+host+path,method:"POST",headers,body};
}
async function makeCapacityReport({config,clock,hash,sign,request,assess,classifyError}){
 let built;
 try{built=buildRequest({...config,now:clock(),hash,sign});}catch{return {error:"AUTH"}}
 try{
 const {status,body}=await request(built);
 if(status!==200&&status!==201)return {error:classifyError(typeof body?.code==="string"?body.code:"",status)};
 return normalizeReport(body,config,assess);
 }catch{return {error:"API"}}
}
async function testOCI(){
 let n=0;const eq=(a,b)=>{if(a!==b)throw Error("OCI assertion "+n);n++};
 const config={tenancy:"ocid1.tenancy.oc1..synthetic12345",user:"ocid1.user.oc1..synthetic12345",fingerprint:Array(16).fill("ad").join(":"),ad:"TEST:EU-MILAN-1-AD-1"};
 const clock=()=>1800000000000,hash=()=>"HASH",sign=s=>{eq(s.includes("(request-target): post /20160918/computeCapacityReports"),true);eq(s.includes("x-content-sha256: HASH"),true);return "SIGNATURE"};
 const row=(ocpus,memoryInGBs,availabilityStatus,availableCount)=>({instanceShape:"VM.Standard.A1.Flex",instanceShapeConfig:{ocpus,memoryInGBs},availabilityStatus,availableCount,faultDomain:null});
 const body={compartmentId:config.tenancy,availabilityDomain:config.ad,shapeAvailabilities:[row(2,12,"AVAILABLE",null),row(1,6,"OUT_OF_HOST_CAPACITY",0)]};
 let calls=0;const input={config,clock,hash,sign,request:async r=>{calls++;eq(r.url,"https://iaas.eu-milan-1.oraclecloud.com/20160918/computeCapacityReports");eq(r.method,"POST");eq(r.headers["content-length"],String(r.body.length));eq(JSON.parse(r.body).shapeAvailabilities.length,2);return {status:200,body}},assess:r=>({rows:r}),classifyError:(code,status)=>status===429?"RATE_LIMIT":"UNKNOWN"};
 const result=await makeCapacityReport(input);eq(result.rows[0]["available-count"],null);eq(result.rows[0]["instance-shape-config"]["memory-in-gbs"],12);eq(result.rows[1]["availability-status"],"OUT_OF_HOST_CAPACITY");eq(calls,1);
 eq((await makeCapacityReport({...input,config:{...config,ad:"WRONG"}})).error,"AUTH");eq(calls,1);
 eq((await makeCapacityReport({...input,request:async()=>({status:201,body})})).rows[0]["available-count"],null);
 eq((await makeCapacityReport({...input,request:async()=>({status:429,body:{}})})).error,"RATE_LIMIT");
 eq((await makeCapacityReport({...input,request:async()=>{throw Error("SECRET")}})).error,"API");
 eq((await makeCapacityReport({...input,request:async()=>({status:200,body:{...body,compartmentId:"wrong"}})})).error,"UNKNOWN");
 eq((await makeCapacityReport({...input,request:async()=>({status:200,body:{...body,shapeAvailabilities:[]}})})).error,"UNKNOWN");
 return n;
}
// No redirects, retries, or arbitrary destination. Abort includes response consumption.
async function httpsReport(r){
 if(r.url!=="https://iaas.eu-milan-1.oraclecloud.com/20160918/computeCapacityReports"||r.method!=="POST")throw Error("endpoint blocked");
 const signal=AbortSignal.timeout(20000);
 const response=await fetch(r.url,{method:r.method,headers:r.headers,body:r.body,redirect:"error",signal});
 if(!response.body)throw Error("empty response");
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw Error("response limit");}chunks.push(Buffer.from(value));}}
 finally{reader.releaseLock();}
 let body=null;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{}
 return {status:response.status,body};
}
function createOCIProbe({config,privateKey,clock=Date.now}){
 let key;try{key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=="rsa"||key.asymmetricKeyDetails.modulusLength<2048)throw Error("key");}catch{throw Error("invalid OCI private key");}
 const hash=body=>createHash("sha256").update(body,"utf8").digest("base64");
 const sign=value=>rsaSign("RSA-SHA256",Buffer.from(value,"utf8"),key).toString("base64");
 return ()=>makeCapacityReport({config,clock,hash,sign,request:httpsReport,assess,classifyError});
}
export {normalizeReport,buildRequest,makeCapacityReport,testOCI,createOCIProbe};
