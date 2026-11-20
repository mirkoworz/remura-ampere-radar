// v0.36 LAB — draft entrypoint; no scheduler, activation, or I/O on import.
import {makeStore} from "./store.mjs";
import {makeGitHubTransport} from "./transport.mjs";
import {createOCIProbe} from "./oci.mjs";
import {runCycle} from "./cycle.mjs";
import {healthOutcome} from "./health.mjs";
import {deliverAlert} from "./alerts.mjs";
import {awaitWake} from "./wake-boundary-lab.mjs";

function formatCapacityAlert(event){
 if(!event||!["2/12","1/6"].includes(event.key)||!Number.isSafeInteger(event.observedAt)||event.observedAt<0||event.observedAt>8640000000000000)throw Error("event");
 const [cpu,ram]=event.key.split("/");
 const date=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",dateStyle:"short",timeStyle:"medium"}).format(new Date(event.observedAt));
 return "REMURA Ampere Radar v0.36 LAB — disponibilità segnalata\n"+date+" (ora italiana)\nOracle Milano: "+cpu+" OCPU / "+ram+" GB RAM\n"+(event.key==="2/12"?"Configurazione preferita.":"Configurazione alternativa.")+"\nÈ una segnalazione di capacità, non una garanzia di quota o creazione. Verifica la console Oracle. Nessuna VPS prenotata o creata.";
}

function buildRuntime({env,fetchImpl=globalThis.fetch,clock=Date.now,probeFactory=createOCIProbe,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(env.RADAR_RUNTIME_GATE!=="LIVE_CAPACITY_ONLY"||env.GITHUB_REPOSITORY!=="mirkoworz/remura-ampere-radar"||env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_RUN_ATTEMPT!=="1")throw Error("runtime gate");
 const repository="mirkoworz/remura-radar-state";
 const request=makeGitHubTransport({repository,token:env.RADAR_STATE_TOKEN,fetchImpl});
 const store=makeStore({repository,request,encode:s=>Buffer.from(s,"utf8").toString("base64"),decode:s=>Buffer.from(s,"base64").toString("utf8")});
 const token=env.RADAR_TELEGRAM_TOKEN,chatId=env.RADAR_TELEGRAM_CHAT_ID;
 const run=async()=>{
   let initial=await store.read();
   if(initial.state.enabled!==true)return "DISABLED";
   if(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token??"")||!/^[1-9]\d{0,15}$/.test(chatId??""))return "CONFIG_REVIEW_REQUIRED";
   if(initial.state.delivery!=null)return "DELIVERY_REVIEW_REQUIRED";
   let first=true,readFailed=false;
   const wake=await awaitWake({clock,sleep,read:async()=>{
     if(first){first=false;return initial.state;}
     try{initial=await store.read();return initial.state;}
     catch(e){readFailed=true;throw e;}
   }});
   if(readFailed)return "STATE_READ_UNCERTAIN";
   if(wake.decision==="INVALID")return "STATE_INVALID";
   if(wake.decision==="REVIEW_REQUIRED")return "RUNTIME_REVIEW_REQUIRED";
   if(initial.state.enabled!==true)return "DISABLED";
   if(initial.state.delivery!=null)return "DELIVERY_REVIEW_REQUIRED";
   if(wake.decision!=="DEFER_TO_EXISTING_GATE")return "NOT_DUE";
   // Existing cycle still independently reads, validates, and reserves via CAS.
   const config={tenancy:env.RADAR_OCI_TENANCY,user:env.RADAR_OCI_USER,fingerprint:env.RADAR_OCI_FINGERPRINT,ad:env.RADAR_OCI_AD};
   const probe=probeFactory({config,privateKey:env.RADAR_OCI_PRIVATE_KEY,clock});
   const deliver=event=>deliverAlert({token,chatId,event,timeout:()=>AbortSignal.timeout(15000),fetchImpl:async(url,opts)=>{
     if(url!=="https://api.telegram.org/bot"+token+"/sendMessage"||opts?.method!=="POST"||opts.redirect!=="error")throw Error("delivery gate");
     const body=JSON.parse(opts.body);
     if(body.chat_id!==chatId||body.allow_paid_broadcast!==false)throw Error("delivery gate");
     body.text=formatCapacityAlert(event);
     const r=await fetchImpl(url,{...opts,body:JSON.stringify(body)});
     if(r.status!==200){try{await r.body?.cancel()}catch{}return {status:r.status};}
     const reader=r.body?.getReader();if(!reader)throw Error("body");
     const chunks=[];let size=0;
     try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error("limit");chunks.push(Buffer.from(value));}}
     catch{try{await reader.cancel()}catch{}throw Error("response");}
     finally{reader.releaseLock();}
     const data=JSON.parse(Buffer.concat(chunks).toString("utf8"));
     return {status:200,json:async()=>data};
   }});
   const outcome=await runCycle({store,probe,deliver,clock,onReservationBlock:reason=>{
     if(["WRITE_UNCERTAIN","ACK_INVALID","READBACK_UNCERTAIN","READBACK_MISSING","READBACK_VERSION","READBACK_DISABLED","READBACK_NEXT_AT"].includes(reason))
       console.log("REMURA_RADAR_RESERVATION_BLOCK="+reason);
   }});
   if(outcome!=="INCOMPLETE_NO_SEND")return outcome;
   const end=await store.read();
   return healthOutcome(initial.state.health,end.state.health,outcome);
 };
 return {run};
}
export {formatCapacityAlert,buildRuntime};
