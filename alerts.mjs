// v0.9 LAB — 2026-11-17 — injected transport; no live delivery or scheduler.
function buildAlert(event){
 if(!event||!["2/12","1/6"].includes(event.key)||!Number.isSafeInteger(event.observedAt)||event.observedAt<0||event.observedAt>8640000000000000)throw Error("invalid alert");
 const [cpu,ram]=event.key.split("/");
 return "REMURA Ampere Radar — disponibilità segnalata\n"+cpu+" OCPU / "+ram+" GB RAM\nRilevazione UTC: "+new Date(event.observedAt).toISOString()+"\nVerifica manualmente quota e capacità nella console Oracle. Nessuna VPS creata o prenotata.";
}
async function deliverAlert({token,chatId,event,fetchImpl,timeout}){
 if(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token??"")||!/^[1-9]\d{0,15}$/.test(chatId??""))return "INVALID_CONFIGURATION";
 let message;try{message=buildAlert(event)}catch{return "INVALID_EVENT";}
 let response;
 try{
 response=await fetchImpl("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",redirect:"error",signal:timeout(),headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text:message,allow_paid_broadcast:false,link_preview_options:{is_disabled:true}})});
 if(response.status===429)return "RATE_LIMIT";
 if(response.status===401||response.status===403)return "ACCESS_DENIED";
 if(response.status!==200)return "DELIVERY_UNCERTAIN";
 const body=await response.json();
 if(body?.ok===false)return "REJECTED";
 if(body?.ok!==true||!Number.isSafeInteger(body.result?.message_id)||String(body.result?.chat?.id)!==chatId)return "DELIVERY_UNCERTAIN";
 return "ACKNOWLEDGED";
 }catch{return "DELIVERY_UNCERTAIN";}
}
async function testAlerts(){
 const ev={key:"2/12",observedAt:1000};let calls=0,last;
 const token="123456789:MOCK_NOT_A_REAL_TOKEN_12345",chatId="12345";
 const fake=(status=200,body={ok:true,result:{message_id:1,chat:{id:12345}}})=>async(url,opts)=>{calls++;last=opts;return {status,json:async()=>body}};
 const args={token,chatId,event:ev,timeout:()=>null,fetchImpl:fake()};let n=0;
 const eq=(a,b)=>{if(a!==b)throw Error("alert assertion "+n);n++};
 eq(await deliverAlert(args),"ACKNOWLEDGED");eq(JSON.parse(last.body).allow_paid_broadcast,false);eq(last.redirect,"error");eq(last.method,"POST");
 eq(await deliverAlert({...args,event:{key:"wrong",observedAt:1}}),"INVALID_EVENT");
 eq(await deliverAlert({...args,token:"wrong"}),"INVALID_CONFIGURATION");eq(await deliverAlert({...args,chatId:"-1234"}),"INVALID_CONFIGURATION");eq(calls,1);
 eq(await deliverAlert({...args,fetchImpl:fake(429)}),"RATE_LIMIT");
 eq(await deliverAlert({...args,fetchImpl:fake(403)}),"ACCESS_DENIED");
 eq(await deliverAlert({...args,fetchImpl:fake(500)}),"DELIVERY_UNCERTAIN");
 eq(await deliverAlert({...args,fetchImpl:fake(200,{ok:false})}),"REJECTED");
 eq(await deliverAlert({...args,fetchImpl:fake(200,{ok:true,result:{message_id:1,chat:{id:12346}}})}),"DELIVERY_UNCERTAIN");
 eq(await deliverAlert({...args,fetchImpl:async()=>{throw Error("mock secret")}}),"DELIVERY_UNCERTAIN");
 eq(buildAlert(ev).includes("Nessuna VPS creata"),true);
 return n;
}
export {buildAlert,deliverAlert,testAlerts};
console.log('Alert checks passed: '+await testAlerts());
