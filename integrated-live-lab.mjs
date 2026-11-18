// v0.26 LAB — one-use isolated actual integration; never writes operational state.
import {makeStore} from "./store.mjs";
import {makeGitHubTransport} from "./transport.mjs";
import {createOCIProbe} from "./oci.mjs";
import {runCycle,completeReport} from "./cycle.mjs";
import {dispatchPending} from "./outbox.mjs";
import {deliverAlert} from "./alerts.mjs";

async function main(){
 const env=process.env;
 if(env.RADAR_LAB_GATE!=="INTEGRATED_LAB_ONCE"||env.GITHUB_REPOSITORY!=="mirkoworz/remura-ampere-radar"||env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_RUN_ATTEMPT!=="1")throw Error("gate");
 const repository="mirkoworz/remura-radar-state";
 const logical="https://api.github.com/repos/"+repository+"/contents/state.json";
 const actual="https://api.github.com/repos/"+repository+"/contents/integrated-lab.json";
 const transport=makeGitHubTransport({repository,token:env.RADAR_STATE_TOKEN,fetchImpl:(url,opts)=>{
   if(opts?.method==="GET"&&url===logical+"?ref=main")return fetch(actual+"?ref=main",opts);
   if(opts?.method==="PUT"&&url===logical)return fetch(actual,opts);
   throw Error("isolated path blocked");
 }});
 const encode=s=>Buffer.from(s,"utf8").toString("base64");
 const decode=s=>Buffer.from(s,"base64").toString("utf8");
 const store=makeStore({repository,request:transport,encode,decode});
 const initial=await store.read();
 if(initial.state.enabled!==true||initial.state.revision!==0||initial.state.nextAt!==0||initial.state.last!==null||initial.state.pending.length||initial.state.delivery!=null)throw Error("fixture consumed");
 const config={tenancy:env.RADAR_OCI_TENANCY,user:env.RADAR_OCI_USER,fingerprint:env.RADAR_OCI_FINGERPRINT,ad:env.RADAR_OCI_AD};
 const capacity=createOCIProbe({config,privateKey:env.RADAR_OCI_PRIVATE_KEY});
 const token=env.RADAR_TELEGRAM_TOKEN,chatId=env.RADAR_TELEGRAM_CHAT_ID;
 if(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token??"")||!/^[1-9]\d{0,15}$/.test(chatId??""))throw Error("telegram config");
 let report=null,probes=0,sends=0;
 const probe=async()=>{if(++probes!==1)throw Error("duplicate probe");report=await capacity();return report;};
 const label={AVAILABLE_COUNTED:"Disponibile (quantificata)",AVAILABLE_UNQUANTIFIED:"Disponibilità non quantificata",OUT_OF_HOST_CAPACITY:"Capacità esaurita",HARDWARE_NOT_SUPPORTED:"Hardware non supportato"};
 const deliver=async event=>deliverAlert({token,chatId,event,timeout:()=>AbortSignal.timeout(15000),fetchImpl:async(url,opts)=>{
   if(!completeReport(report)||++sends!==1||url!=="https://api.telegram.org/bot"+token+"/sendMessage"||opts.method!=="POST"||opts.redirect!=="error")throw Error("delivery blocked");
   const body=JSON.parse(opts.body);
   if(body.chat_id!==chatId||body.allow_paid_broadcast!==false)throw Error("delivery gate");
   const time=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",dateStyle:"short",timeStyle:"medium"}).format(new Date(event.observedAt));
   body.text="REMURA Ampere Radar v0.26 LAB — "+time+" (ora italiana)\nCOLLAUDO INTEGRATO — esito reale Oracle Milano\n"+report.results.map(r=>r.cpu+" OCPU / "+r.ram+" GB: "+label[r.status]).join("\n")+"\nMonitoraggio automatico NON attivo. Nessuna prenotazione o creazione VPS. Verifica manualmente quota e capacità.";
   const r=await fetch(url,{...opts,body:JSON.stringify(body)});
   if(r.status!==200){try{await r.body?.cancel()}catch{}return {status:r.status};}
   const reader=r.body?.getReader();if(!reader)throw Error("missing telegram body");
   let size=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error("response limit");chunks.push(Buffer.from(value));}}
   catch{try{await reader.cancel()}catch{}throw Error("telegram body");}
   finally{reader.releaseLock();}
   const data=JSON.parse(Buffer.concat(chunks).toString("utf8"));
   return {status:200,json:async()=>data};
 }});
 const outcome=await runCycle({store,probe,deliver,clock:Date.now});
 if(probes!==1||!completeReport(report)){
   const e=report?.error;
   if(["AUTH","ACCESS","QUOTA","RATE_LIMIT","API","UNKNOWN"].includes(e))console.log("INTEGRATED_LAB_OCI_"+e);
   throw Error("incomplete probe");
 }
 console.log("INTEGRATED_LAB_OCI_COMPLETE");
 if(outcome==="NOTHING_PENDING"&&!report.candidate){
   // Deliberately synthetic outbox event, confined to fixture. Message always states actual report.
   const before=await store.read();
   if(before.state.revision!==2||before.state.pending.length||before.state.delivery!=null)throw Error("unexpected state");
   const v=await store.compareAndSwap(before.version,{...before.state,pending:[{key:"2/12",observedAt:Date.now()}]});
   if(typeof v!=="string"||!v||v===before.version)throw Error("fixture event uncertain");
   if(await dispatchPending({store,deliver,clock:Date.now})!=="DELIVERED")throw Error("test message uncertain");
 }else if(outcome!=="DELIVERED"||!report.candidate){throw Error("cycle "+outcome);}
 if(sends!==1)throw Error("send count");
 const done=await store.read();
 if(done.state.pending.length||done.state.delivery!==null||done.state.revision!==(report.candidate?4:5))throw Error("ack missing");
 console.log("INTEGRATED_LAB_CAS_ACK_OK");
 // Disable only this consumed isolated fixture, by exact SHA. Never change operational state.
 const next={...done.state,enabled:false,revision:done.state.revision+1,nextAt:Number.MAX_SAFE_INTEGER};
 const base="/repos/"+repository+"/contents/state.json";
 const closed=await transport("PUT",base,{branch:"main",sha:done.version,content:encode(JSON.stringify(next)+"\n"),message:"Close one-use integration LAB fixture"});
 if(closed.status!==200||typeof closed.body?.content?.sha!=="string")throw Error("close uncertain");
 const verify=await store.read();
 if(verify.version!==closed.body.content.sha||verify.state.enabled!==false||verify.state.revision!==next.revision||verify.state.pending.length||verify.state.delivery!==null)throw Error("close reread uncertain");
 console.log("INTEGRATED_LAB_OK_FIXTURE_CLOSED");
}
try{await main()}catch{console.log("INTEGRATED_LAB_STOP_REVIEW_REQUIRED");process.exitCode=1;}
