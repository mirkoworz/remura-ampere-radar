// v0.29 LAB — disabled-state preflight; GitHub read only; no Oracle or Telegram credentials.
import {makeGitHubTransport} from "./transport.mjs";
import {makeStore} from "./store.mjs";
import {verifyDisabled,releaseGate} from "./release.mjs";
const env=process.env;
let result={code:"RELEASE_GATE_REJECTED",exit:1};
if(releaseGate(env)){
 try{
  const repository="mirkoworz/remura-radar-state";
  const transport=makeGitHubTransport({token:env.RADAR_STATE_TOKEN,repository,fetchImpl:async(url,opts)=>{
   if(url!=="https://api.github.com/repos/"+repository+"/contents/state.json?ref=main"||opts?.method!=="GET")throw Error("read only");
   return fetch(url,opts);
  }});
  const store=makeStore({request:transport,repository,encode:s=>Buffer.from(s).toString("base64"),decode:s=>Buffer.from(s,"base64").toString()});
  result=await verifyDisabled({env,readState:()=>store.read()});
 }catch{result={code:"RELEASE_READ_UNCERTAIN",exit:1};}
}
console.log(result.code);
process.exitCode=result.exit;
