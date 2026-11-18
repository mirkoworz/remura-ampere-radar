import {validHealth} from "./health.mjs";
// v0.12 LAB — 2026-11-17 CET — injected transport only; no credentials or live requests.
function validateState(s){
 return !!s&&validHealth(s.health)&&s.schema===1&&typeof s.enabled==="boolean"&&Number.isSafeInteger(s.revision)&&s.revision>=0&&s.revision<Number.MAX_SAFE_INTEGER&&Number.isSafeInteger(s.nextAt)&&s.nextAt>=0&&(s.last===null||["2/12","1/6"].includes(s.last))&&Array.isArray(s.pending)&&s.pending.length<=2&&s.pending.every(p=>p&&["2/12","1/6"].includes(p.key)&&Number.isSafeInteger(p.observedAt)&&p.observedAt>=0)&&new Set(s.pending.map(p=>p.key)).size===s.pending.length&&(s.delivery==null||(typeof s.delivery==='object'&&Number.isSafeInteger(s.delivery.startedAt)&&s.delivery.startedAt>=s.delivery.observedAt&&s.pending.some(p=>p.key===s.delivery.key&&p.observedAt===s.delivery.observedAt)));
}
function makeStore({request,encode,decode,repository}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||repository.split("/").some(x=>x==="."||x===".."))throw Error("invalid repo");
 const path="/repos/"+repository+"/contents/state.json";
 const sha=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
 let previous=null;
 return {
 async read(){
   const r=await request("GET",path+"?ref=main");
   if(r.status!==200||!sha(r.body?.sha)||r.body?.type!=="file"||r.body?.encoding!=="base64"||typeof r.body.content!=="string"||r.body.content.length>8192)throw Error("state read failed");
   const state=JSON.parse(decode(r.body.content));
   if(!validateState(state))throw Error("state invalid");
   previous={version:r.body.sha,state};
   return {version:previous.version,state:JSON.parse(JSON.stringify(state))};
 },
 async compareAndSwap(expected,next){
   if(!previous||!sha(expected)||expected!==previous.version||!validateState(next)||next.revision!==previous.state.revision||next.enabled!==previous.state.enabled||!next.enabled)throw Error("write blocked");
   const updated={schema:1,enabled:next.enabled,revision:next.revision+1,nextAt:next.nextAt,last:next.last,pending:next.pending.map(p=>({key:p.key,observedAt:p.observedAt}))};
   if(next.health!==undefined)updated.health=next.health===null?null:{lastProbeAt:next.health.lastProbeAt,lastGoodAt:next.health.lastGoodAt,failures:next.health.failures,error:next.health.error};
   if(next.delivery!==undefined)updated.delivery=next.delivery===null?null:{key:next.delivery.key,observedAt:next.delivery.observedAt,startedAt:next.delivery.startedAt};
   if(!validateState(updated))throw Error("revision invalid");
   // Consume the cached version before attempting the write, even on uncertainty.
   previous=null;
   const r=await request("PUT",path,{message:"Update radar state",branch:"main",sha:expected,content:encode(JSON.stringify(updated)+"\n")});
   if(r.status!==200||!sha(r.body?.content?.sha)||r.body.content.sha===expected)throw Error("state update uncertain");
   previous={version:r.body.content.sha,state:updated};
   return previous.version;
 }
 };
}
async function testStore(){
 let count=0;const eq=(a,b)=>{if(a!==b)throw Error("assert "+count);count++;};
 const fails=async fn=>{let failed=false;try{await fn()}catch{failed=true}eq(failed,true)};
 const init={schema:1,enabled:true,revision:0,nextAt:0,last:null,pending:[]};
 const a="a".repeat(40), b="b".repeat(40);
 let state={...init}, status=200, puts=0, body, rev=a;
 const request=async(method,path,input)=>{if(method==="GET")return {status:200,body:{sha:rev,type:"file",encoding:"base64",content:JSON.stringify(state)}};puts++;body=input;if(status===200){state=JSON.parse(input.content);rev=b;}return {status,body:{content:{sha:b}}};};
 const store=makeStore({request,encode:s=>s,decode:s=>s,repository:"example/state"});
 const item=await store.read();eq(item.version,a);eq(validateState(item.state),true);
 eq(await store.compareAndSwap(a,{...item.state,nextAt:1800000}),b);eq(state.revision,1);eq(body.sha,a);eq(body.branch,"main");eq(state.nextAt,1800000);
 await fails(()=>store.compareAndSwap(a,item.state));eq(puts,1);
 state={...init,enabled:false};const disabled=await store.read();await fails(()=>store.compareAndSwap(disabled.version,disabled.state));eq(puts,1);
 state={...init};rev=a;status=409;const conflict=await store.read();await fails(()=>store.compareAndSwap(conflict.version,conflict.state));await fails(()=>store.compareAndSwap(conflict.version,conflict.state));eq(puts,2);
 state={...init,revision:-1};await fails(()=>store.read());
 eq(validateState({...init,pending:[{key:"2/12",observedAt:1},{key:"2/12",observedAt:2}]}),false);
 eq(validateState({...init,nextAt:-1}),false);
 await fails(()=>makeStore({request,encode:s=>s,decode:s=>s,repository:"example/../state"}));
 const event={key:'2/12',observedAt:100};
 eq(validateState({...init,pending:[event],delivery:{...event,startedAt:101}}),true);
 eq(validateState({...init,pending:[],delivery:{...event,startedAt:101}}),false);
 eq(validateState({...init,pending:[event],delivery:{...event,startedAt:99}}),false);
 state={...init,pending:[event]};rev=a;status=200;const d=await store.read();await store.compareAndSwap(d.version,{...d.state,delivery:{...event,startedAt:101}});eq(state.delivery.startedAt,101);
 return count;
}
export {validateState,makeStore,testStore};
console.log('Store checks passed: '+await testStore());
