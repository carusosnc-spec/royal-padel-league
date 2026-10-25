/* RPL vote operator alerts — injected by service worker */
(function(){
  if(window.__rplVoteAlertPatched) return;
  let attempts=0;
  const timer=window.setInterval(()=>{
    attempts++;
    try{
      if(typeof sb==="undefined" || !sb || typeof sb.rpc!=="function"){
        if(attempts>60)window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      if(window.__rplVoteAlertPatched)return;
      window.__rplVoteAlertPatched=true;
      const originalRpc=sb.rpc.bind(sb);
      sb.rpc=async function(fn,args){
        const result=await originalRpc(fn,args);
        if(fn==="rpl_cast_poll_vote" && !result?.error){
          try{
            const notice=await sb.functions.invoke("rpl-notifications",{
              body:{action:"vote_submitted",poll_week_id:Number(args?.p_poll_week_id),option_id:Number(args?.p_option_id)}
            });
            if(notice.error || !notice.data?.ok) console.warn("[RPL] Voto registrato ma avviso operatori non confermato",notice.error||notice.data);
            else console.info("[RPL] Avviso voto inviato agli operatori",notice.data);
          }catch(e){console.warn("[RPL] Avviso voto agli operatori non inviato",e);}
        }
        return result;
      };
      console.info("[RPL] Notifiche voto agli operatori attive.");
    }catch(e){if(attempts>60)window.clearInterval(timer);console.warn("[RPL] Impossibile attivare avviso voto",e);}
  },250);
})();
