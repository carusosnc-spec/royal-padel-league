import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rpl-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: corsHeaders }); }
function getAdminClient() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) throw new Error("SUPABASE_SECRET_KEYS non disponibile");
  const key = JSON.parse(raw)["default"];
  if (!key) throw new Error("Secret key Supabase 'default' non disponibile");
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth:{persistSession:false,autoRefreshToken:false} });
}
function getUserClient(req: Request) {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) throw new Error("SUPABASE_PUBLISHABLE_KEYS non disponibile");
  const key = JSON.parse(raw)["default"];
  if (!key) throw new Error("Publishable key Supabase 'default' non disponibile");
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { global:{headers:{Authorization:req.headers.get("Authorization")??""}}, auth:{persistSession:false,autoRefreshToken:false} });
}
async function getUser(req: Request) { const c=getUserClient(req); const {data,error}=await c.auth.getUser(); if(error||!data.user)throw new Error("Utente non autenticato"); return data.user; }
async function requireOperator(req: Request) {
  const user=await getUser(req),admin=getAdminClient();
  const {data,error}=await admin.from("operators").select("user_id").eq("user_id",user.id).maybeSingle();
  if(error)throw new Error("Errore durante la verifica dell'operatore");
  if(!data)throw new Error("Non sei autorizzato a inviare notifiche");
  return {user,admin};
}
function requireVapid(){
  const publicKey=Deno.env.get("VAPID_PUBLIC_KEY"),privateKey=Deno.env.get("VAPID_PRIVATE_KEY"),subject=Deno.env.get("VAPID_SUBJECT");
  if(!publicKey||!privateKey||!subject)throw new Error("Mancano VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT");
  webpush.setVapidDetails(subject,publicKey,privateKey);
}
async function sendPush(admin:any,playerIds:number[],title:string,body:string,url:string,tag="rpl-notification"){
  const siteBase="https://carusosnc-spec.github.io/royal-padel-league/";
  const targetUrl=/^https?:\/\//i.test(String(url||""))?String(url):new URL(String(url||"./index.html#player"),siteBase).href;
  const ids=[...new Set(playerIds.map(Number).filter(Number.isFinite))];
  if(!ids.length)return {sent:0,failed:0,missing:0};
  requireVapid();
  const {data:subs,error}=await admin.from("rpl_push_subscriptions").select("id,player_id,subscription").in("player_id",ids);
  if(error)throw new Error("Errore lettura sottoscrizioni Push: "+error.message);
  const list=subs??[];
  let sent=0,failed=0;
  const deliveredPlayerIds:number[]=[];
  const failedPlayerIds:number[]=[];
  for(const row of list){
    try{
      await webpush.sendNotification(row.subscription,JSON.stringify({title,body,url:targetUrl,tag}),{TTL:86400});
      sent++;deliveredPlayerIds.push(Number(row.player_id));
    }
    catch(error){
      failed++;failedPlayerIds.push(Number(row.player_id));
      const statusCode=typeof error==="object"&&error!==null&&"statusCode"in error?Number((error as any).statusCode):0;
      if(statusCode===404||statusCode===410)await admin.from("rpl_push_subscriptions").delete().eq("id",row.id);
    }
  }
  const delivered=[...new Set(deliveredPlayerIds)].filter(Number.isFinite);
  const failedIds=[...new Set(failedPlayerIds)].filter(Number.isFinite).filter((pid:number)=>!delivered.includes(pid));
  return {sent,failed,missing:Math.max(0,ids.length-new Set(list.map((x:any)=>Number(x.player_id))).size),deliveredPlayerIds:delivered,failedPlayerIds:failedIds};
}
async function alreadySent(admin:any,eventKey:string,playerId:number){
  const {data,error}=await admin.from("rpl_notification_log").select("id").eq("event_key",eventKey).eq("player_id",playerId).maybeSingle();
  if(error)throw error;return !!data;
}
async function markSent(admin:any,eventKey:string,playerIds:number[]){
  const rows=[...new Set(playerIds.map(Number).filter(Number.isFinite))].map(player_id=>({event_key:eventKey,player_id}));
  if(rows.length)await admin.from("rpl_notification_log").upsert(rows,{onConflict:"event_key,player_id",ignoreDuplicates:true});
}
async function birthdayTest(admin:any){
  const active=await admin.from("players").select("id,name,nickname,active,is_guest").eq("active",true).eq("is_guest",false);
  if(active.error)throw active.error;
  const players=active.data??[];
  const person=players.find((p:any)=>String(p.name||"").toLowerCase().includes("maurizio")&&String(p.name||"").toLowerCase().includes("sciuto"))
    ||players.find((p:any)=>String(p.nickname||"").toLowerCase().includes("vet"));
  if(!person)return {ok:false,error:"Maurizio Sciuto non trovato tra i giocatori attivi non ospiti."};
  const pid=Number(person.id),display=person.nickname||person.name||"Maurizio Sciuto";
  const others=players.map((p:any)=>Number(p.id)).filter((id:number)=>Number.isFinite(id)&&id!==pid);
  const group=await sendPush(admin,others,"🎂 Compleanno RPL!",`Oggi festeggia ${display}! 🥳🎾 Non dimenticarti di fargli gli auguri!`,"#player");
  const self=await sendPush(admin,[pid],"👑 Tanti auguri dalla RPL!",`🎂 Tanti auguri ${display}! La Royal Padel League ti augura uno splendido compleanno! 🎾🥳`,"#player");
  return {ok:true,test:true,player_id:pid,player:person.name,nickname:person.nickname||"",groupSent:group.sent,groupMissing:group.missing,groupFailed:group.failed,selfSent:self.sent,selfMissing:self.missing,selfFailed:self.failed};
}

async function scheduled(admin:any){
  const now=new Date();
  const in110=new Date(now.getTime()+110*60000).toISOString();
  const in130=new Date(now.getTime()+130*60000).toISOString();
  const result:any={ok:true,matchImminent:0,pollOpened:0,pollTwoHours:0,pollLastSlot:0,bonusStart:0,birthdayGroup:0,birthdaySelf:0,birthdayFound:0,birthdayMissingDevices:0};

  // Royal Bet: invia automaticamente una Push quando una puntata risulta vincente.
  const betWins = await admin.from("rpl_bet_win_notifications")
    .select("id,wager_id,player_id,market_id,payout_credits,attempts")
    .in("status",["pending","processing"]).lte("next_attempt_at",now.toISOString())
    .order("created_at",{ascending:true}).limit(20);
  if (betWins.error) throw betWins.error;
  result.betWinQueueFound = (betWins.data ?? []).length;
  result.betWinPushSent = 0;
  result.betWinPushFailed = 0;
  for (const q of betWins.data ?? []) {
    const claimed = await admin.from("rpl_bet_win_notifications")
      .update({status:"processing",attempts:Number(q.attempts||0)+1,next_attempt_at:new Date(Date.now()+10*60000).toISOString()})
      .eq("id",q.id).in("status",["pending","processing"]).lte("next_attempt_at",now.toISOString()).select("id").maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    const attempt = Number(q.attempts||0)+1;
    try {
      const pid = Number(q.player_id);
      const eventKey = "royalbet_won_" + String(q.wager_id);
      if (await alreadySent(admin,eventKey,pid)) {
        await admin.from("rpl_bet_win_notifications").update({
          status:"sent",sent_at:new Date().toISOString(),last_error:null
        }).eq("id",q.id);
        continue;
      }
      const {data:w,error:we} = await admin.from("rpl_bet_wagers")
        .select("id,status,settled_payout,player_id").eq("id",q.wager_id).maybeSingle();
      if (we) throw we;
      if (!w || w.status !== "won" || Number(w.player_id) !== pid) {
        await admin.from("rpl_bet_win_notifications").update({
          status:"skipped",last_error:"Puntata non più nello stato vincente"
        }).eq("id",q.id);
        continue;
      }
      const {data:m,error:me} = await admin.from("rpl_bet_markets")
        .select("market_type,selection_label,set_number,calendar_match_id,market_scope")
        .eq("id",q.market_id).maybeSingle();
      if (me) throw me;
      const payout = Number(w.settled_payout || q.payout_credits || 0);
      const outcome = m?.selection_label ? " Esito: " + String(m.selection_label) + "." : "";
      const context = m?.set_number ? " (Set " + Number(m.set_number) + ")" : "";
      const body = ("Hai vinto! Ti sono stati accreditati " +
        payout.toLocaleString("it-IT") + " crediti Royal Bet." + context + outcome).slice(0,180);
      const delivery = await sendPush(admin,[pid],"🎉 Royal Bet: scommessa vinta!",body,"?rpl=bet#player","royalbet-win-"+String(q.wager_id));
      if ((delivery.deliveredPlayerIds||[]).map(Number).includes(pid)) {
        await markSent(admin,eventKey,[pid]);
        const {error:upd} = await admin.from("rpl_bet_win_notifications").update({
          status:"sent",sent_at:new Date().toISOString(),last_error:null
        }).eq("id",q.id);
        if (upd) throw upd;
        result.betWinPushSent++;
      } else if (Number(delivery.missing||0)>0) {
        await admin.from("rpl_bet_win_notifications").update({
          status:"skipped",last_error:"Nessun dispositivo Push registrato"
        }).eq("id",q.id);
        result.betWinPushFailed++;
      } else {
        const exhausted = attempt >= 5;
        await admin.from("rpl_bet_win_notifications").update({
          status:exhausted?"skipped":"pending",
          next_attempt_at:new Date(Date.now()+5*60000).toISOString(),
          last_error:exhausted?"Invio Push non riuscito dopo 5 tentativi":"Invio Push non riuscito; nuovo tentativo pianificato"
        }).eq("id",q.id);
        result.betWinPushFailed++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("rpl_bet_win_notifications").update({
        status:attempt >= 5 ? "skipped" : "pending",
        next_attempt_at:new Date(Date.now()+5*60000).toISOString(),
        last_error:message.slice(0,500)
      }).eq("id",q.id);
      result.betWinPushFailed++;
    }
  }

  // Priorità alle notifiche chat: processa la coda prima delle altre attività pianificate.
  // Elabora la coda delle notifiche chat. La coda viene creata dal trigger SQL
  // quando arriva un messaggio; senza questo consumer le righe restano pending.
  const queued = await admin.from("rpl_message_notification_queue")
    .select("id,message_id,recipient_player_id,attempts")
    .eq("status","pending").lte("next_attempt_at",now.toISOString())
    .order("created_at",{ascending:true}).limit(50);
  if (queued.error) throw queued.error;
  result.chatQueueFound = (queued.data ?? []).length;
  result.chatPushSent = 0;
  result.chatPushFailed = 0;
  for (const q of queued.data ?? []) {
    const claimed = await admin.from("rpl_message_notification_queue")
      .update({status:"processing",attempts:Number(q.attempts||0)+1})
      .eq("id",q.id).eq("status","pending").select("id").maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;
    try {
      const {data:m,error:me} = await admin.from("rpl_messages")
        .select("id,conversation_id,sender_player_id,body,created_at,deleted_at")
        .eq("id",q.message_id).maybeSingle();
      if (me) throw me;
      if (!m || m.deleted_at) {
        await admin.from("rpl_message_notification_queue").update({status:"skipped",last_error:"Messaggio eliminato o non trovato"}).eq("id",q.id);
        continue;
      }
      const [convRes, memberRes, senderRes, recipientRes] = await Promise.all([
        admin.from("rpl_conversations").select("id,conversation_type,title,closed_at").eq("id",m.conversation_id).maybeSingle(),
        admin.from("rpl_conversation_members").select("player_id,muted_at,removed_at").eq("conversation_id",m.conversation_id).eq("player_id",q.recipient_player_id).maybeSingle(),
        admin.from("players").select("id,name,nickname").eq("id",m.sender_player_id).maybeSingle(),
        admin.from("players").select("id,name,nickname,active,is_guest").eq("id",q.recipient_player_id).maybeSingle()
      ]);
      if (convRes.error) throw convRes.error;
      if (memberRes.error) throw memberRes.error;
      if (senderRes.error) throw senderRes.error;
      if (recipientRes.error) throw recipientRes.error;
      const member=memberRes.data, recipient=recipientRes.data, conv=convRes.data;
      if (!conv || !member || member.removed_at || member.muted_at || !recipient || recipient.active===false || recipient.is_guest===true) {
        await admin.from("rpl_message_notification_queue").update({status:"skipped",last_error:"Destinatario non attivo, non membro o chat silenziata"}).eq("id",q.id);
        continue;
      }
      const sender=senderRes.data;
      const senderName=sender?.nickname || sender?.name || "Un giocatore";
      const title=conv.conversation_type==="general" ? "💬 Chat generale RPL" :
        conv.conversation_type==="match" ? "🎾 Chat partita RPL" : "💬 Nuovo messaggio";
      const rawBody=String(m.body||"").replace(/\s+/g," ").trim();
      const body=(senderName + ": " + rawBody).slice(0,180);
      const url="?rpl=messages#player";
      const delivery=await sendPush(admin,[Number(q.recipient_player_id)],title,body,url);
      if ((delivery.deliveredPlayerIds||[]).map(Number).includes(Number(q.recipient_player_id))) {
        const {error:upd}=await admin.from("rpl_message_notification_queue").update({status:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",q.id);
        if(upd) throw upd;
        result.chatPushSent++;
      } else {
        const why=delivery.missing ? "Nessun dispositivo push registrato" : "Invio push non accettato dal servizio";
        await admin.from("rpl_message_notification_queue").update({
          status:"pending",next_attempt_at:new Date(Date.now()+1*60000).toISOString(),last_error:why
        }).eq("id",q.id);
        result.chatPushFailed++;
      }
    } catch (e) {
      const msg=e instanceof Error?e.message:String(e);
      await admin.from("rpl_message_notification_queue").update({
        status:"pending",next_attempt_at:new Date(Date.now()+1*60000).toISOString(),last_error:msg.slice(0,500)
      }).eq("id",q.id);
      result.chatPushFailed++;
    }
  }


  // Notifiche automatiche per le modifiche a orario/campo delle serate già votate.
  // La funzione SQL conserva i voti e inserisce una riga per ogni votante da avvisare.
  const changes = await admin.from("rpl_poll_change_notifications")
    .select("id,poll_week_id,option_id,player_id,old_play_date,new_play_date,old_start_time,new_start_time,old_label,new_label,old_court,new_court,attempts")
    .is("sent_at", null).order("created_at", {ascending:true}).limit(100);
  if (changes.error) throw changes.error;
  for (const c of changes.data ?? []) {
    const dateText = (value:any) => value
      ? new Date(String(value) + "T12:00:00Z").toLocaleDateString("it-IT", {timeZone:"Europe/Rome", weekday:"long", day:"2-digit", month:"long"})
      : "data da definire";
    const whenText = (date:any, time:any, label:any) =>
      `${dateText(date)}${time ? " alle " + String(time).slice(0,5) : (label ? " (" + String(label) + ")" : "")}`;
    const oldWhen = whenText(c.old_play_date, c.old_start_time, c.old_label);
    const newWhen = whenText(c.new_play_date, c.new_start_time, c.new_label);
    const oldCourt = c.old_court && c.old_court !== "__TBD__" ? String(c.old_court) : "campo da definire";
    const newCourt = c.new_court && c.new_court !== "__TBD__" ? String(c.new_court) : "campo da definire";
    const parts:string[] = [];
    if (oldWhen !== newWhen) parts.push(`orario/data: ${oldWhen} → ${newWhen}`);
    if (oldCourt !== newCourt) parts.push(`campo: ${oldCourt} → ${newCourt}`);
    const detail = parts.length ? parts.join("; ") : `nuovi dettagli: ${newWhen} · ${newCourt}`;
    const delivery = await sendPush(
      admin, [Number(c.player_id)], "📢 Modifica alla serata che hai votato",
      `La serata per cui avevi votato è stata aggiornata (${detail}). Il tuo voto è stato mantenuto.`,
      "?rpl=vote#player"
    );
    const delivered = (delivery.deliveredPlayerIds ?? []).map(Number).includes(Number(c.player_id));
    const updatePayload:any = delivered
      ? {sent_at:new Date().toISOString(), attempts:Number(c.attempts||0)+1, last_attempt_at:new Date().toISOString(), last_error:null}
      : {attempts:Number(c.attempts||0)+1, last_attempt_at:new Date().toISOString(), last_error:delivery.missing ? "Nessun dispositivo registrato" : "Invio push non riuscito"};
    const {error:updateError} = await admin.from("rpl_poll_change_notifications").update(updatePayload).eq("id",c.id);
    if (updateError) throw updateError;
    if (delivered) result.pollChangeNotifications = (result.pollChangeNotifications||0)+1;
    else result.pollChangeNotificationFailures = (result.pollChangeNotificationFailures||0)+1;
  }

  // Partita imminente: finestra 1h50m–2h10m, deduplicata.
  const cm=await admin.from("calendar_matches").select("id,scheduled_at,court,player_1,player_2,player_3,player_4").gte("scheduled_at",in110).lt("scheduled_at",in130);
  if(cm.error)throw cm.error;
  for(const m of cm.data??[]){
    const ids=[m.player_1,m.player_2,m.player_3,m.player_4].map(Number).filter(Number.isFinite);
    const todo:number[]=[];
    for(const pid of ids)if(!(await alreadySent(admin,`match_imminent_${m.id}`,pid)))todo.push(pid);
    if(todo.length){
      const d=new Date(m.scheduled_at);const when=d.toLocaleString("it-IT",{weekday:"long",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
      await sendPush(admin,todo,"🎾 Partita tra 2 ore",`Hai una partita ${when} · ${m.court||"campo da definire"}. Preparati!`,"?rpl=calendar#player");
      await markSent(admin,`match_imminent_${m.id}`,todo);result.matchImminent++;
    }
  }

  // Sincronizza automaticamente lo stato della votazione con gli orari.
  // Prima la funzione notificava solo settimane già in stato "open", lasciando
  // le settimane create in "draft" anche dopo l'orario di apertura.
  const openedWeeks=await admin.from("rpl_poll_weeks")
    .update({status:"open",updated_at:now.toISOString()})
    .eq("status","draft").eq("is_archived",false)
    .lte("opens_at",now.toISOString()).gt("closes_at",now.toISOString())
    .select("id");
  if(openedWeeks.error)throw openedWeeks.error;
  const closedWeeks=await admin.from("rpl_poll_weeks")
    .update({status:"closed",updated_at:now.toISOString()})
    .in("status",["draft","open"]).lte("closes_at",now.toISOString())
    .select("id");
  if(closedWeeks.error)throw closedWeeks.error;

  // Apertura votazione: invia la notifica solo quando opens_at è arrivato.
  // La chiave per ogni giocatore impedisce invii duplicati nei successivi giri del cron.
  const po=await admin.from("rpl_poll_weeks").select("id,opens_at,closes_at").eq("status","open").lte("opens_at",now.toISOString()).gt("closes_at",now.toISOString());
  if(po.error)throw po.error;
  for(const w of po.data??[]){
    const active=await admin.from("players").select("id").eq("active",true).eq("is_guest",false);
    if(active.error)throw active.error;
    const ids=(active.data??[]).map((x:any)=>Number(x.id)).filter((x:number)=>Number.isFinite(x));
    const fresh:number[]=[];
    for(const pid of ids)if(!(await alreadySent(admin,`poll_open_${w.id}`,pid)))fresh.push(pid);
    if(fresh.length){
      const opened=new Date(w.opens_at).toLocaleString("it-IT",{weekday:"long",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
      const delivery=await sendPush(admin,fresh,"🗳️ La votazione RPL è aperta!",`La votazione è iniziata ${opened}. Entra nell’Area Giocatore e scegli le tue serate.`,"?rpl=vote#player");
      // Deduplica solo i giocatori per cui almeno una push è stata accettata.
      // Chi non ha un dispositivo o ha avuto un errore potrà essere ritentato al giro successivo.
      await markSent(admin,`poll_open_${w.id}`,delivery.deliveredPlayerIds||[]);
      result.pollOpened=(result.pollOpened||0)+((delivery.deliveredPlayerIds||[]).length);
      result.pollOpenFailed=(result.pollOpenFailed||0)+((delivery.failedPlayerIds||[]).length);
      result.pollOpenMissing=(result.pollOpenMissing||0)+(delivery.missing||0);
    }
  }

  // Votazione: promemoria circa 2 ore prima della chiusura, solo ai non votanti.
  const pw=await admin.from("rpl_poll_weeks").select("id,closes_at").eq("status","open").gte("closes_at",in110).lt("closes_at",in130);
  if(pw.error)throw pw.error;
  for(const w of pw.data??[]){
    const [pr,vr]=await Promise.all([
      admin.from("rpl_poll_participants").select("player_id,wants_two_nights").eq("poll_week_id",w.id),
      admin.from("rpl_poll_votes").select("player_id").eq("poll_week_id",w.id)
    ]);
    if(pr.error)throw pr.error;if(vr.error)throw vr.error;
    const voted=new Set((vr.data??[]).map((x:any)=>Number(x.player_id)));
    const todo=(pr.data??[]).map((x:any)=>Number(x.player_id)).filter((id:number)=>Number.isFinite(id)&&!voted.has(id));
    const fresh:number[]=[];for(const pid of todo)if(!(await alreadySent(admin,`poll_2h_${w.id}`,pid)))fresh.push(pid);
    if(fresh.length){await sendPush(admin,fresh,"⏰ Mancano 2 ore alla votazione",`Hai ancora tempo per votare il calendario RPL. La votazione chiude alle ${new Date(w.closes_at).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}.`,"?rpl=vote#player");await markSent(admin,`poll_2h_${w.id}`,fresh);result.pollTwoHours++;}
  }

  // Ultimo posto disponibile: esattamente 3/4 voti. Solo chi può ancora votare e non ha scelto quell'opzione.
  const open=await admin.from("rpl_poll_weeks").select("id").eq("status","open");if(open.error)throw open.error;
  for(const w of open.data??[]){
    const [opts,votes,parts,activePlayers]=await Promise.all([
      admin.from("rpl_poll_options").select("id,play_date,start_time,label,court,max_players").eq("poll_week_id",w.id),
      admin.from("rpl_poll_votes").select("option_id,player_id").eq("poll_week_id",w.id),
      admin.from("rpl_poll_participants").select("player_id,wants_two_nights").eq("poll_week_id",w.id),
      admin.from("players").select("id").eq("active",true).eq("is_guest",false)
    ]);
    if(opts.error)throw opts.error;if(votes.error)throw votes.error;if(parts.error)throw parts.error;if(activePlayers.error)throw activePlayers.error;
    const vs=votes.data??[];
    const participantPrefs=new Map<number,boolean>((parts.data??[]).map((p:any)=>[Number(p.player_id),!!p.wants_two_nights]));
    for(const o of opts.data??[]){
      const ov=vs.filter((v:any)=>Number(v.option_id)===Number(o.id));
      if(ov.length!==Number(o.max_players||4)-1)continue;
      const selected=new Set(ov.map((v:any)=>Number(v.player_id)));
      const byPlayer=new Map<number,number>();for(const v of vs){const pid=Number(v.player_id);byPlayer.set(pid,(byPlayer.get(pid)||0)+1);}
      // Includi tutti i giocatori attivi non ospiti, anche se non sono ancora nella tabella partecipanti.
      // Chi non ha espresso alcun voto può ricevere l'avviso; le preferenze per due serate
      // vengono rispettate quando sono già state registrate.
      const todo=(activePlayers.data??[]).map((p:any)=>({id:Number(p.id),two:participantPrefs.get(Number(p.id))||false})).filter((p:any)=>Number.isFinite(p.id)&&!selected.has(p.id)&&((byPlayer.get(p.id)||0)<(p.two?2:1))).map((p:any)=>p.id);
      const fresh:number[]=[];for(const pid of todo)if(!(await alreadySent(admin,`poll_last_slot_${o.id}`,pid)))fresh.push(pid);
      if(fresh.length){
        const when=new Date(`${o.play_date}T${o.start_time||"12:00:00"}`).toLocaleString("it-IT",{weekday:"long",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
        const delivery=await sendPush(admin,fresh,"🚨 Ultimo posto disponibile!",`C'è ancora un posto per ${when}. Se vuoi giocare quella sera, vota subito!`,"?rpl=vote#player");
        // Segna come già inviata solo una notifica accettata dal servizio push.
        // Chi non ha una sottoscrizione valida o ha un errore sarà ritentato al prossimo cron.
        await markSent(admin,`poll_last_slot_${o.id}`,delivery.deliveredPlayerIds||[]);
        result.pollLastSlot+=(delivery.deliveredPlayerIds||[]).length;
      }
    }
  }

  // Compleanni: alle 09:00 ora italiana. Il controllo 09:00–09:04 evita dipendenze dal fuso UTC del cron.
  const romeParts=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const rome:any={};for(const p of romeParts)if(p.type!=="literal")rome[p.type]=p.value;
  if(Number(rome.hour)===9&&Number(rome.minute)<15){
    const active=await admin.from("players").select("id,name,nickname,active,is_guest").eq("active",true).eq("is_guest",false);
    if(active.error)throw active.error;
    const players=active.data??[];const ids=players.map((x:any)=>Number(x.id)).filter((x:number)=>Number.isFinite(x));
    if(ids.length){
      const profiles=await admin.from("player_profiles").select("player_id,birth_date").in("player_id",ids);
      if(profiles.error)throw profiles.error;
      const today=`${rome.month}-${rome.day}`;
      const byId=new Map<number,any>(players.map((p:any)=>[Number(p.id),p]));
      for(const prof of profiles.data??[]){
        const pid=Number(prof.player_id),birth=String(prof.birth_date||"");
        if(!Number.isFinite(pid)||birth.length<10||birth.slice(5,10)!==today)continue;
        const person=byId.get(pid);if(!person)continue;
        const display=person.nickname||person.name||"un nostro giocatore";

        // Notifica a tutti gli altri giocatori attivi.
        const groupKey=`birthday_group_${rome.year}-${rome.month}-${rome.day}_${pid}`;
        const groupFresh:number[]=[];
        for(const p of players){const rid=Number(p.id);if(rid!==pid&&!(await alreadySent(admin,groupKey,rid)))groupFresh.push(rid);}
        result.birthdayFound++;

        // Notifica a tutti gli altri giocatori attivi.
        if(groupFresh.length){
          const groupResult=await sendPush(admin,groupFresh,"🎂 Compleanno RPL!",`Oggi festeggia ${display}! 🥳🎾 Non dimenticarti di fargli gli auguri!`,"#player");
          await markSent(admin,groupKey,groupFresh);result.birthdayGroup++;
          if(Number(groupResult.missing||0)>0)result.birthdayMissingDevices+=Number(groupResult.missing||0);
        }

        // Notifica personale al giocatore che compie gli anni.
        const selfKey=`birthday_self_${rome.year}-${rome.month}-${rome.day}_${pid}`;
        if(!(await alreadySent(admin,selfKey,pid))){
          const selfResult=await sendPush(admin,[pid],"👑 Tanti auguri dalla RPL!",`🎂 Tanti auguri ${display}! La Royal Padel League ti augura uno splendido compleanno! 🎾🥳`,"#player");
          await markSent(admin,selfKey,[pid]);result.birthdaySelf++;
          if(Number(selfResult.missing||0)>0)result.birthdayMissingDevices+=Number(selfResult.missing||0);
        }
      }
    }
  }

  // Bonus: una sola volta il primo giorno del mese, per il mese precedente.
  if(now.getDate()<=2){
    const y=now.getFullYear(),m=now.getMonth();const prev=new Date(y,m-1,1);const key=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}`;
    const active=await admin.from("players").select("id").eq("active",true).eq("is_guest",false);if(active.error)throw active.error;
    const ids=(active.data??[]).map((x:any)=>Number(x.id));const fresh:number[]=[];for(const pid of ids)if(!(await alreadySent(admin,`bonus_month_${key}`,pid)))fresh.push(pid);
    if(fresh.length){await sendPush(admin,fresh,"🏅 Classifica Bonus consolidata",`Sono stati consolidati i punti Bonus del mese ${String(prev.toLocaleDateString("it-IT",{month:"long"}))}. Scopri la nuova classifica Bonus RPL.`,"#bonus");await markSent(admin,`bonus_month_${key}`,fresh);result.bonusStart=1;}
  }
  return result;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Metodo non consentito"},405);
  try{
    const payload=await req.json();const action=payload?.action||"send";
    if(action==="subscribe"){
      const user=await getUser(req),admin=getAdminClient(),playerId=Number(payload?.player_id),subscription=payload?.subscription,userAgent=typeof payload?.user_agent==="string"?payload.user_agent:null;
      if(!Number.isFinite(playerId)||playerId<=0)return json({ok:false,error:"player_id non valido"},400);
      if(!subscription?.endpoint)return json({ok:false,error:"Push subscription non valida"},400);
      const {data:account,error:accountError}=await admin.from("player_accounts").select("player_id").eq("user_id",user.id).eq("player_id",playerId).maybeSingle();if(accountError)throw accountError;if(!account)return json({ok:false,error:"Account giocatore non autorizzato"},403);
      const {data,error}=await admin.from("rpl_push_subscriptions").upsert({player_id:playerId,endpoint:subscription.endpoint,subscription,user_agent:userAgent,updated_at:new Date().toISOString()},{onConflict:"endpoint"}).select("id,player_id,endpoint").single();if(error)return json({ok:false,error:"Impossibile salvare il dispositivo: "+error.message},500);return json({ok:true,subscription:data});
    }
    const cronSecret=Deno.env.get("RPL_CRON_SECRET");
    if(action==="scheduled"){
      if(!cronSecret||req.headers.get("x-rpl-cron-secret")!==cronSecret)return json({ok:false,error:"Cron non autorizzato"},403);
      const admin=getAdminClient();return json(await scheduled(admin));
    }

    // Notifica risultato partita: autenticazione specifica del Responsabile Partita.
    // Non usa requireOperator(), perché il responsabile può essere un normale giocatore.
    if(action==="result_submitted"){
      const user=await getUser(req),admin=getAdminClient();
      const calendarMatchId=Number(payload?.calendar_match_id);
      if(!Number.isFinite(calendarMatchId)||calendarMatchId<=0)return json({ok:false,error:"ID partita di calendario non valido"},400);
      const {data:cm,error:cmError}=await admin.from("calendar_matches")
        .select("id,responsible_player_id,result_submitted_by,result_submitted_at,player_1,player_2,player_3,player_4")
        .eq("id",calendarMatchId).maybeSingle();
      if(cmError)throw cmError;
      if(!cm)return json({ok:false,error:"Partita di calendario non trovata"},404);
      if(!cm.responsible_player_id)return json({ok:false,error:"Nessun Responsabile Partita assegnato"},403);
      const {data:account,error:accountError}=await admin.from("player_accounts")
        .select("player_id").eq("user_id",user.id).eq("player_id",cm.responsible_player_id).maybeSingle();
      if(accountError)throw accountError;
      if(!account)return json({ok:false,error:"Solo il Responsabile Partita assegnato può inviare questa notifica"},403);
      if(!cm.result_submitted_at||cm.result_submitted_by!==user.id)
        return json({ok:false,error:"Il risultato non risulta appena registrato da questo responsabile"},409);
      const {data:match,error:matchError}=await admin.from("matches")
        .select("id").eq("calendar_match_id",calendarMatchId).maybeSingle();
      if(matchError)throw matchError;
      if(!match)return json({ok:false,error:"Risultato non trovato nel registro partite"},409);
      const matchId=Number(match.id);
      const [{data:matchPlayers,error:mpError},{data:awards,error:awardsError}] = await Promise.all([
        admin.from("match_players").select("player_id").eq("match_id",matchId),
        admin.from("match_awards").select("player_id,award_type").eq("match_id",matchId)
      ]);
      if(mpError)throw mpError;if(awardsError)throw awardsError;
      const playerIds=[...new Set((matchPlayers??[]).map((x:any)=>Number(x.player_id)).filter(Number.isFinite))];
      const officialNames=["Gianni Caruso","Salvatore Bertuccio","Salvatore Balsamo","Filippo Di Dio"];
      const {data:officials,error:officialError}=await admin.from("players").select("id").in("name",officialNames);
      if(officialError)throw officialError;
      const operatorIds=(officials??[]).map((x:any)=>Number(x.id)).filter(Number.isFinite);
      const recipients=[...new Set([...playerIds,...operatorIds])];
      const main=await sendPush(admin,recipients,"🎾 Risultato partita inserito","È stato inserito un nuovo risultato di partita. È in attesa di conferma.","?rpl=confirm#player");
      let awardSent=0,awardFailed=0,awardMissing=0;
      const awardPlayers=[...new Set((awards??[]).map((x:any)=>Number(x.player_id)).filter(Number.isFinite))];
      for(const pid of awardPlayers){
        const types=(awards??[]).filter((x:any)=>Number(x.player_id)===pid).map((x:any)=>String(x.award_type||""));
        const isMvp=types.includes("MVP"),isImb=types.includes("IMBATTUTO");
        const title=isMvp&&isImb?"👑🛡️ MVP e Imbattuto":isMvp?"👑 MVP della serata":"🛡️ Imbattuto";
        const body=isMvp&&isImb?"Complimenti! Sei stato MVP e hai chiuso la partita senza perdere un set.":isMvp?"Complimenti! Sei stato nominato MVP della tua partita.":"Complimenti! Hai chiuso la partita senza perdere un set.";
        const ar=await sendPush(admin,[pid],title,body,"#player");
        awardSent+=ar.sent;awardFailed+=ar.failed;awardMissing+=ar.missing;
      }
      return json({ok:true,calendar_match_id:calendarMatchId,match_id:matchId,mainNotification:main,awardNotifications:{sent:awardSent,failed:awardFailed,missing:awardMissing},requestedPlayers:recipients.length});
    }
    const {admin}=await requireOperator(req);
    if(action==="birthday_test")return json(await birthdayTest(admin));
    if(action==="status"){
      const {count:devicesFound,error:countError}=await admin.from("rpl_push_subscriptions").select("id",{count:"exact",head:true});if(countError)throw countError;
      const {data:rows,error:playersError}=await admin.from("rpl_push_subscriptions").select("id,player_id,endpoint,user_agent,created_at,updated_at").order("updated_at",{ascending:false});if(playersError)throw playersError;
      const ids=[...new Set((rows??[]).map((r:any)=>Number(r.player_id)))].filter(Number.isFinite);let map=new Map<number,any>();if(ids.length){const {data:ps,error}=await admin.from("players").select("id,name,nickname").in("id",ids);if(error)throw error;map=new Map((ps??[]).map((p:any)=>[Number(p.id),p]));}
      const devices=(rows??[]).map((r:any)=>({id:r.id,player_id:r.player_id,player_name:map.get(Number(r.player_id))?.name||"Giocatore",player_nickname:map.get(Number(r.player_id))?.nickname||"",user_agent:r.user_agent||"",created_at:r.created_at,updated_at:r.updated_at}));
      return json({ok:true,devicesFound:devicesFound??0,playersWithNotifications:ids.length,devices});
    }
    const playerIds=Array.isArray(payload?.player_ids)?payload.player_ids.map((v:unknown)=>Number(v)).filter((v:number)=>Number.isFinite(v)):[];
    const title=typeof payload?.title==="string"&&payload.title.trim()?payload.title.trim():"Royal Padel League";
    const body=typeof payload?.body==="string"&&payload.body.trim()?payload.body.trim():"Hai una nuova comunicazione RPL.";
    const url=typeof payload?.url==="string"&&payload.url.trim()?payload.url.trim():"/";
    if(action!=="send")return json({ok:false,error:"Azione non riconosciuta"},400);if(!playerIds.length)return json({ok:false,error:"Nessun giocatore destinatario"},400);
    const r=await sendPush(admin,playerIds,title,body,url);return json({ok:true,requestedPlayers:playerIds.length,...r});
  }catch(error){console.error("Errore Edge Function:",error);const message=error instanceof Error?error.message:String(error);const status=message==="Utente non autenticato"?401:message.includes("Non sei autorizzato")?403:500;return json({ok:false,error:message},status);}
});
