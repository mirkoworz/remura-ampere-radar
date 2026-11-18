// v0.7 LAB — 2026-11-17 CET — HTTPS adapter; tests use synthetic credentials and injected fetch only.
function makeGitHubTransport({token,repository,fetchImpl=globalThis.fetch,timeout=()=>AbortSignal.timeout(15000),decode=bytes=>new TextDecoder("utf-8",{fatal:true}).decode(bytes)}){
  if(typeof token!=="string"||!/^github_pat_[A-Za-z0-9_]+$/.test(token)||token.length>512)throw Error("invalid scoped credential");
  if(typeof repository!=="string"||!repository.split("/").every(x=>/^[A-Za-z0-9_.-]+$/.test(x)&&x!=="."&&x!=="..")||repository.split("/").length!==2)throw Error("invalid repository");
  const path="/repos/"+repository+"/contents/state.json";
  return async function request(method,target,body){
    if(!((method==="GET"&&target===path+"?ref=main"&&body===undefined)||(method==="PUT"&&target===path&&body&&body.branch==="main"&&/^[a-f0-9]{40}$/.test(body.sha)&&typeof body.content==="string"&&body.content.length<=8192)))throw Error("request blocked");
    let reader;
    try{
      const response=await fetchImpl("https://api.github.com"+target,{
        method,redirect:"error",cache:"no-store",signal:timeout(),
        headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
        ...(method==="PUT"?{body:JSON.stringify(body)}:{})
      });
      if(response.status!==200){try{await response.body?.cancel();}catch{}return {status:response.status,body:null};}
      reader=response.body?.getReader();if(!reader)throw Error("missing body");
      let size=0;const chunks=[];
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw Error("response too large");chunks.push(part.value);}
      const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.byteLength;}
      return {status:200,body:JSON.parse(decode(data))};
    }catch{try{await reader?.cancel();}catch{}throw Error("state transport failed");}
    finally{try{reader?.releaseLock();}catch{}}
  };
}
async function testTransport(){
  let count=0,calls=0,last,status=200,payload='{"ok":true}',fail=false;
  const eq=(a,b)=>{if(a!==b)throw Error("transport assertion "+count);count++;};
  const rejects=async fn=>{let caught=false;try{await fn()}catch{caught=true}eq(caught,true)};
  const fake=async(url,options)=>{calls++;last={url,options};if(fail)throw Error("sensitive mock error");let done=false;return {status,body:{cancel:async()=>{},getReader:()=>({read:async()=>{if(done)return {done:true};done=true;return {done:false,value:Uint8Array.from(payload,c=>c.charCodeAt(0))};},cancel:async()=>{},releaseLock:()=>{}})}};};
  const token="github_pat_SYNTHETIC_NOT_A_REAL_TOKEN",p="/repos/example/state/contents/state.json";
  const req=makeGitHubTransport({token,repository:"example/state",fetchImpl:fake,timeout:()=>null,decode:bytes=>Array.from(bytes,c=>String.fromCharCode(c)).join("")});
  eq((await req("GET",p+"?ref=main")).body.ok,true);eq(last.url,"https://api.github.com"+p+"?ref=main");eq(last.options.redirect,"error");eq(last.options.headers.Authorization,"Bearer "+token);
  const body={branch:"main",sha:"a".repeat(40),content:"YWJj",message:"test"};
  eq((await req("PUT",p,body)).status,200);eq(JSON.parse(last.options.body).sha,body.sha);
  await rejects(()=>req("DELETE",p));await rejects(()=>req("GET","/user"));await rejects(()=>req("PUT",p,{...body,branch:"other"}));await rejects(()=>req("PUT",p,{...body,sha:"invalid"}));eq(calls,2);
  status=409;eq((await req("PUT",p,body)).status,409);eq(calls,3);
  status=200;payload="x".repeat(65537);await rejects(()=>req("GET",p+"?ref=main"));
  payload="not json";await rejects(()=>req("GET",p+"?ref=main"));
  fail=true;try{await req("GET",p+"?ref=main");throw Error("expected failure");}catch(e){eq(e.message,"state transport failed");}eq(calls,6);
  await rejects(()=>makeGitHubTransport({token:"bad",repository:"example/state",fetchImpl:fake}));
  await rejects(()=>makeGitHubTransport({token,repository:"example/..",fetchImpl:fake}));
  return count;
}
export {makeGitHubTransport,testTransport};
console.log('Transport checks passed: '+await testTransport());
