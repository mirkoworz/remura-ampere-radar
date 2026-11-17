// v0.34 LAB — synthetic tests; never contacts GitHub or Cloudflare.
import assert from "node:assert/strict";
import worker,{dispatchRadar,CRON} from "./radar-cron.mjs";
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const t=Date.UTC(2026,10,17,22,16),controller={cron:CRON,scheduledTime:t},env={RADAR_CRON_ENABLE:"ENABLED",RADAR_DISPATCH_TOKEN:"github_pat_SYNTHETIC_NOT_REAL_123456789"};
let calls=0,last;
const run=async(patch={},status=204)=>dispatchRadar({controller,env,now:t+1000,fetchImpl:async(url,options)=>{calls++;last={url,options};return {status};},...patch});
eq(await run(),"CRON_DISPATCH_ACCEPTED");eq(calls,1);
eq(last.url,"https://api.github.com/repos/mirkoworz/remura-ampere-radar/actions/workflows/421668967/dispatches");eq(last.options.method,"POST");eq(last.options.redirect,"error");eq(JSON.parse(last.options.body),{ref:"main",inputs:{mode:"RUN",confirm:"LIVE_CAPACITY_ONLY"}});eq(last.options.headers.Authorization,"Bearer "+env.RADAR_DISPATCH_TOKEN);
for(const [status,code] of [[200,"CRON_DISPATCH_ACCEPTED"],[401,"CRON_AUTH_REVIEW"],[403,"CRON_AUTH_REVIEW"],[429,"CRON_RATE_LIMIT"],[404,"CRON_DISPATCH_REVIEW"],[500,"CRON_DISPATCH_REVIEW"],[302,"CRON_DISPATCH_REVIEW"]])eq(await run({},status),code);
const before=calls;
for(const [patch,code] of [[{env:{}},"CRON_DISABLED"],[{env:{...env,RADAR_DISPATCH_TOKEN:"bad"}},"CRON_CONFIG_REVIEW"],[{controller:{...controller,cron:"* * * * *"}},"CRON_SLOT_REJECTED"],[{controller:{...controller,scheduledTime:t+60000}},"CRON_SLOT_REJECTED"],[{now:t-1},"CRON_SLOT_REJECTED"],[{now:t+600001},"CRON_SLOT_REJECTED"],[{controller:{...controller,scheduledTime:t+1}},"CRON_SLOT_REJECTED"]])eq(await run(patch),code);
eq(calls,before);eq(await run({fetchImpl:async()=>{throw Error("synthetic secret");}}),"CRON_DISPATCH_UNCERTAIN");eq(worker.fetch().status,404);let noRetry=0;await worker.scheduled({...controller,noRetry:()=>noRetry++},{RADAR_CRON_ENABLE:"OFF"});eq(noRetry,1);
console.log("CLOUDFLARE_CRON_LAB_OK checks="+n);
