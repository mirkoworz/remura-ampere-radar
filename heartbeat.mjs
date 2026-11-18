// v0.30 LAB — read-only heartbeat classification, no schedule or notifications.
import {validateState} from "./store.mjs";
function heartbeat(state,now){
 if(!validateState(state)||!Number.isSafeInteger(now)||now<0||now>8640000000000000)return "WATCHDOG_REVIEW";
 if(!state.enabled)return "WATCHDOG_DISABLED";
 if(state.delivery!=null)return "WATCHDOG_DELIVERY_REVIEW";
 const h=state.health;
 if(h&&h.lastProbeAt>now)return "WATCHDOG_CLOCK_REVIEW";
 if(h?.failures&&["AUTH","ACCESS","QUOTA"].includes(h.error))return "WATCHDOG_CRITICAL";
 if(!h&&now<state.nextAt)return "WATCHDOG_AWAIT_FIRST";
 if(now>state.nextAt+5400000)return "WATCHDOG_OVERDUE";
 if(!h&&now>=state.nextAt)return "WATCHDOG_AWAIT_FIRST";
 if(h?.failures>=2)return "WATCHDOG_PERSISTENT";
 return "WATCHDOG_OK";
}
export {heartbeat};
