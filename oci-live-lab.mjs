// v0.17 LAB — explicit single live capacity diagnostic; no state writes or Telegram.
import {createOCIProbe} from "./oci.mjs";
async function main(){
 if(process.env.RADAR_LIVE_GATE!=="CAPACITY_ONLY_ONCE"||process.env.GITHUB_REPOSITORY!=="mirkoworz/remura-ampere-radar"||process.env.GITHUB_REF!=="refs/heads/main")throw Error("gate");
 const config={tenancy:process.env.RADAR_OCI_TENANCY,user:process.env.RADAR_OCI_USER,fingerprint:process.env.RADAR_OCI_FINGERPRINT,ad:process.env.RADAR_OCI_AD};
 const privateKey=process.env.RADAR_OCI_PRIVATE_KEY;
 if(!privateKey||privateKey.length>16384||Object.values(config).some(v=>!v))throw Error("configuration");
 const probe=createOCIProbe({config,privateKey});
 const result=await probe();
 if(result?.error){const allowed=["AUTH","ACCESS","QUOTA","RATE_LIMIT","API","UNKNOWN"];console.log("OCI_LAB_"+(allowed.includes(result.error)?result.error:"UNKNOWN"));process.exitCode=1;return;}
 const allowed=["AVAILABLE_COUNTED","AVAILABLE_UNQUANTIFIED","OUT_OF_HOST_CAPACITY","HARDWARE_NOT_SUPPORTED"];
 if(result?.results?.length!==2||![[2,12],[1,6]].every(([cpu,ram])=>result.results.filter(r=>r.cpu===cpu&&r.ram===ram&&allowed.includes(r.status)).length===1)||result.quotaVerified!==false||result.provisioningAllowed!==false)throw Error("schema");
 // No account-specific metadata, capacity status, request content, signatures or keys in public logs.
 console.log("OCI_LAB_COMPLETE_TWO_TARGETS_NO_PROVISION");
}
try{await main()}catch{console.log("OCI_LAB_STOP_REVIEW_REQUIRED");process.exitCode=1;}
