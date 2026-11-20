// REMURA Ampere Radar v0.34 LAB — 20/11/2026 CET
// Inert preflight only: never reserves, probes Oracle, sends alerts or writes state.
async function awaitWake({read,clock,sleep}){
 const valid=(s,t)=>s&&typeof s.enabled==="boolean"&&Number.isSafeInteger(s.nextAt)&&s.nextAt>=0&&Number.isSafeInteger(t)&&t>=0&&t<=Number.MAX_SAFE_INTEGER-86400000;
 const classify=(s,now)=>!valid(s,now)?"INVALID":s.enabled!==true?"DISABLED":now>=s.nextAt?"DEFER_TO_EXISTING_GATE":s.nextAt-now<=60000?"WAIT":"NOT_DUE";
 let waited=false;
 try{
  const first=await read(),now=clock();
  let decision=classify(first,now);
  if(decision!=="WAIT")return {decision,waited};
  const delay=first.nextAt-now;
  waited=true;
  await sleep(delay);
  const second=await read(),after=clock();
  decision=classify(second,after);
  if(after<now)decision="INVALID";
  return {decision:decision==="WAIT"?"NOT_DUE":decision,waited};
 }catch{return {decision:"REVIEW_REQUIRED",waited};}
}
export {awaitWake};
