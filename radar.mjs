// v0.3 LAB — 2026-11-17 CET — offline only; no networking or credentials.
function assess(rows) {
  const targets=[[2,12],[1,6]];
  const results=targets.map(([cpu,ram])=>{
    const matches=Array.isArray(rows)?rows.filter(r=>r&&r["instance-shape"]==="VM.Standard.A1.Flex"&&r["instance-shape-config"]?.ocpus===cpu&&r["instance-shape-config"]?.["memory-in-gbs"]===ram):[];
    let status="UNKNOWN";
    if(matches.length===1 && matches[0]["fault-domain"]==null){
      const r=matches[0], n=r["available-count"], s=r["availability-status"];
      if(s==="AVAILABLE" && Number.isSafeInteger(n)&&n>0) status="AVAILABLE_COUNTED";
      else if(s==="AVAILABLE" && n===null) status="AVAILABLE_UNQUANTIFIED";
      else if(s==="OUT_OF_HOST_CAPACITY"&&(n===null||n===0)) status="OUT_OF_HOST_CAPACITY";
      else if(s==="HARDWARE_NOT_SUPPORTED"&&(n===null||n===0)) status="HARDWARE_NOT_SUPPORTED";
    }
    return {cpu,ram,status};
  });
  return {results,candidate:results.find(r=>r.status.startsWith("AVAILABLE_"))??null,quotaVerified:false,provisioningAllowed:false};
}
function classifyError(code,status){
  if(code==="LimitExceeded"||code==="QuotaExceeded")return "QUOTA";
  if(status===401||code==="NotAuthenticated")return "AUTH";
  if(status===403||code==="NotAuthorizedOrNotFound")return "ACCESS";
  if(status===429)return "RATE_LIMIT";
  if(status>=500&&status<=599)return "API";
  return "UNKNOWN";
}
function selfTest(){
  const row=(cpu,ram,s,n,extra={})=>({"instance-shape":"VM.Standard.A1.Flex","instance-shape-config":{ocpus:cpu,"memory-in-gbs":ram},"availability-status":s,"available-count":n,"fault-domain":null,...extra});
  const a=(rows,i=0)=>assess(rows).results[i].status;
  const base=row(2,12,"OUT_OF_HOST_CAPACITY",null), alt=row(1,6,"AVAILABLE",null);
  const tests=[
    [a([base]),"OUT_OF_HOST_CAPACITY"],[a([alt],1),"AVAILABLE_UNQUANTIFIED"],
    [a([row(2,12,"AVAILABLE",3)]),"AVAILABLE_COUNTED"],
    [a([row(2,12,"AVAILABLE",0)]),"UNKNOWN"],
    [a([row(2,12,"AVAILABLE",-1)]),"UNKNOWN"],
    [a([row(2,12,"AVAILABLE","3")]),"UNKNOWN"],
    [a([row(2,12,"AVAILABLE",undefined)]),"UNKNOWN"],
    [a([row(2,12,"HARDWARE_NOT_SUPPORTED",null)]),"HARDWARE_NOT_SUPPORTED"],
    [a([row(2,12,"OUT_OF_HOST_CAPACITY",3)]),"UNKNOWN"],
    [a([base,base]),"UNKNOWN"],[a(null),"UNKNOWN"],
    [a([row(2,12,"NEW_ENUM",null)]),"UNKNOWN"],
    [a([row(2,12,"AVAILABLE",1,{"fault-domain":"FD-1"})]),"UNKNOWN"],
    [assess([base,alt]).candidate.cpu,1],
    [assess([row(2,12,"AVAILABLE",null),alt]).candidate.cpu,2],
    [assess([base]).candidate,null],[assess([alt]).quotaVerified,false],
    [assess([alt]).provisioningAllowed,false],
    [classifyError("LimitExceeded",400),"QUOTA"],[classifyError("QuotaExceeded",400),"QUOTA"],
    [classifyError("",401),"AUTH"],[classifyError("",403),"ACCESS"],
    [classifyError("NotAuthorizedOrNotFound",404),"ACCESS"],
    [classifyError("",429),"RATE_LIMIT"],[classifyError("",503),"API"],
    [classifyError("",400),"UNKNOWN"]
  ];
  for(const [i,[got,want]] of tests.entries())if(got!==want)throw Error("test "+i+" failed");
  return tests.length;
}
export { assess, classifyError, selfTest };
console.log('Offline self-tests passed: '+selfTest());
