// v0.7 LAB — simulated end-to-end only, no real networking.
import {assess} from './radar.mjs';
import {reserve,record,nextAllowed} from './state.mjs';
import {makeStore} from './store.mjs';
import {runOnce} from './coordinator.mjs';
import {makeGitHubTransport} from './transport.mjs';
async function testIntegration(){
 let n=0,requests=0,probes=0,revision=0;
 const equal=(a,b)=>{if(a!==b)throw Error("integration assertion "+n);n++;};
 let state={schema:1,enabled:false,revision:0,nextAt:0,last:null,pending:[]};
 let sha="a".repeat(40);
 const fake=async(url,options)=>{
  requests++;
  let status=200,payload;
  if(options.method==="GET")payload={sha,type:"file",encoding:"base64",content:JSON.stringify(state)};
  else {const b=JSON.parse(options.body);if(b.sha!==sha){status=409;payload={};}else{state=JSON.parse(b.content);revision++;sha=String(revision).padStart(40,"0");payload={content:{sha}};}}
  const bytes=Uint8Array.from(JSON.stringify(payload),c=>c.charCodeAt(0));let done=false;
  return {status,body:{cancel:async()=>{},getReader:()=>({read:async()=>{if(done)return {done:true};done=true;return {done:false,value:bytes};},cancel:async()=>{},releaseLock:()=>{}})}};
 };
 const request=makeGitHubTransport({token:"github_pat_SYNTHETIC_NOT_A_REAL_TOKEN",repository:"example/state",fetchImpl:fake,timeout:()=>null,decode:bytes=>Array.from(bytes,c=>String.fromCharCode(c)).join("")});
 const env={store:makeStore({request,encode:s=>s,decode:s=>s,repository:"example/state"}),probe:async()=>{probes++;return assess([{"instance-shape":"VM.Standard.A1.Flex","instance-shape-config":{ocpus:2,"memory-in-gbs":12},"availability-status":"AVAILABLE","available-count":null,"fault-domain":null},{"instance-shape":"VM.Standard.A1.Flex","instance-shape-config":{ocpus:1,"memory-in-gbs":6},"availability-status":"OUT_OF_HOST_CAPACITY","available-count":null,"fault-domain":null}]);},clock:()=>1000,reserve,record,nextAllowed};
 equal(await runOnce(env),"DISABLED");equal(probes,0);equal(requests,1);state.enabled=true;
 equal(await runOnce(env),"RECORDED");equal(probes,1);equal(state.revision,2);equal(state.nextAt,1801000);equal(state.pending[0].key,"2/12");equal(state.pending[0].observedAt,1000);
 equal(await runOnce({...env,store:makeStore({request,encode:s=>s,decode:s=>s,repository:"example/state"})}),"NOT_DUE");equal(probes,1);
 return n;
}
console.log('Integration checks passed: '+await testIntegration());
