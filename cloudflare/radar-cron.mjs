// REMURA Ampere Radar v0.34 LAB — 17 November 2026, Europe/Rome.
// Dedicated scheduled dispatcher; no public HTTP trigger, no Oracle/Telegram credentials.
export const CRON="16,46 * * * *";
const URL="https://api.github.com/repos/mirkoworz/remura-ampere-radar/actions/workflows/421668967/dispatches";
export async function dispatchRadar({controller,env,fetchImpl=fetch,now=Date.now()}){
 if(env.RADAR_CRON_ENABLE!=="ENABLED")return "CRON_DISABLED";
 const t=controller?.scheduledTime;
 if(controller?.cron!==CRON||!Number.isSafeInteger(t)||t<0||t%60000!==0||![16,46].includes(new Date(t).getUTCMinutes())||!Number.isSafeInteger(now)||now<t||now-t>600000)return "CRON_SLOT_REJECTED";
 const token=env.RADAR_DISPATCH_TOKEN;
 if(typeof token!=="string"||!/^github_pat_[A-Za-z0-9_]{20,500}$/.test(token))return "CRON_CONFIG_REVIEW";
 try{
  const response=await fetchImpl(URL,{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2026-03-10","User-Agent":"REMURA-Ampere-Radar"},body:JSON.stringify({ref:"main",inputs:{mode:"RUN",confirm:"LIVE_CAPACITY_ONLY"}})});
  const status=response.status;try{await response.body?.cancel()}catch{}
  if(status===200||status===204)return "CRON_DISPATCH_ACCEPTED";
  if(status===401||status===403)return "CRON_AUTH_REVIEW";
  if(status===429)return "CRON_RATE_LIMIT";
  return "CRON_DISPATCH_REVIEW";
 }catch{return "CRON_DISPATCH_UNCERTAIN";}
}
export default {
 fetch(){return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});},
 async scheduled(controller,env){
  // Never retry an ambiguous dispatch; durable Radar state enforces probe spacing.
  controller.noRetry();
  const code=await dispatchRadar({controller,env});
  console.log(code);
  if(code!=="CRON_DISPATCH_ACCEPTED"&&code!=="CRON_DISABLED")throw Error(code);
 }
};
