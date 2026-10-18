// Royal Bet — server-side quote refresh for Regular Season winner markets.
// Deploy only after review. Uses existing Supabase project; no new service/project.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function quote(points: number[], nowMs: number, openMs: number, closeMs: number) {
  if (nowMs >= closeMs) return points.map(() => ({ probability: 0, odds: 0, open: false, expired: true }));
  if (nowMs < openMs) return points.map(() => ({ probability: 0, odds: 0, open: false, expired: false }));
  const leader = Math.max(...points);
  const spread = Math.max(1, ...points.map(p => Math.abs(leader - p)));
  const remaining = Math.max(0, Math.min(1, (closeMs - nowMs) / Math.max(1, closeMs - openMs)));
  const temperature = Math.max(0.75, spread * (0.12 + 0.9 * Math.sqrt(remaining)));
  const weights = points.map(p => Math.exp(Math.max(-60, Math.min(0, (p - leader) / temperature))));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => {
    const probability = w / total;
    return { probability: Math.round(probability * 10000) / 10000, odds: Math.round((1 / Math.max(probability, 0.0001) / 1.08) * 100) / 100, open: true, expired: false };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization");
  if (!url || !anon || !service || !auth) return json({ error: "Configurazione o sessione mancante" }, 401);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Accesso richiesto" }, 401);
  const db = createClient(url, service, { auth: { persistSession: false } });

  // Only official active players or operators may request a refresh.
  const { data: operator } = await db.from("operators").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  const { data: account } = await db.from("player_accounts").select("player_id").eq("user_id", userData.user.id).maybeSingle();
  let officialPlayer = false;
  if (account?.player_id) {
    const { data: p } = await db.from("players").select("id,active,is_guest").eq("id", account.player_id).maybeSingle();
    officialPlayer = !!p && p.active === true && p.is_guest === false;
  }
  if (!operator && !officialPlayer) return json({ error: "Solo giocatori ufficiali attivi o operatori" }, 403);

  const now = new Date();
  const seasonKey = now.getMonth() >= 8 ? `${now.getFullYear()}-${now.getFullYear()+1}` : `${now.getFullYear()-1}-${now.getFullYear()}`;
  const startYear = Number(seasonKey.slice(0,4));
  const opensAt = new Date(`${startYear}-09-15T00:00:00+02:00`);
  const closesAt = new Date(`${startYear+1}-03-31T23:59:59.999+02:00`);
  const { data: markets, error: marketError } = await db.from("rpl_bet_markets")
    .select("id,selection_key,selection_label,market_type,market_scope,season_key,opens_at,closes_at,status")
    .eq("market_type","regular_season_champion").eq("market_scope","season").eq("season_key",seasonKey).eq("status","open");
  if (marketError) return json({ error: "Lettura mercati non riuscita" }, 500);
  if (!markets?.length) return json({ refreshed: 0, message: "Nessun mercato stagione aperto per " + seasonKey });

  const { data: players, error: playersError } = await db.from("players")
    .select("id,name,nickname,active,is_guest").eq("active",true).eq("is_guest",false);
  if (playersError || !players?.length) return json({ error: "Lettura giocatori non riuscita" }, 500);
  const { data: matches, error: matchesError } = await db.from("matches")
    .select("id,played_at,is_confirmed,approval_status").gte("played_at", `${startYear}-09-15T00:00:00+02:00`)
    .lte("played_at", `${startYear+1}-03-31T23:59:59.999+02:00`).limit(5000);
  if (matchesError) return json({ error: "Lettura partite non riuscita" }, 500);
  const validMatches = (matches || []).filter(m => m.is_confirmed === true || m.approval_status === "approved");
  const matchIds = validMatches.map(m => m.id);
  const scores = new Map(players.map(p => [String(p.id), { id: p.id, name: p.name, points: 0, sets: 0, games: 0, setPoints: 0, mvp: 0, unbeaten: 0 }]));
  if (matchIds.length) {
    const [setsR, snapshotsR, awardsR] = await Promise.all([
      db.from("sets").select("match_id,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b").in("match_id",matchIds).limit(20000),
      db.from("match_players").select("match_id,player_id,fascia_value").in("match_id",matchIds).limit(20000),
      db.from("match_awards").select("match_id,player_id,award_type").in("match_id",matchIds).limit(10000),
    ]);
    if (setsR.error || snapshotsR.error || awardsR.error) return json({ error: "Lettura risultati ufficiali incompleta: quote non aggiornate" }, 500);
    const snap = new Map((snapshotsR.data || []).map(x => [`${x.match_id}:${x.player_id}`, Number(x.fascia_value) || 0]));
    for (const row of setsR.data || []) {
      const a = [row.pair_a_player_1,row.pair_a_player_2], b = [row.pair_b_player_1,row.pair_b_player_2];
      const ga = Number(row.games_a), gb = Number(row.games_b);
      if (!Number.isFinite(ga) || !Number.isFinite(gb) || ga === gb) continue;
      const winners = ga > gb ? a : b, losers = ga > gb ? b : a;
      const winGames = Math.max(ga,gb), loseGames = Math.min(ga,gb);
      for (const id of winners) {
        const p = scores.get(String(id)); if (!p) continue;
        p.sets++; p.games += winGames;
        p.setPoints += (snap.get(`${row.match_id}:${losers[0]}`) || 0) + (snap.get(`${row.match_id}:${losers[1]}`) || 0);
      }
      for (const id of losers) { const p = scores.get(String(id)); if (p) { p.sets++; p.games += loseGames; } }
    }
    for (const award of awardsR.data || []) {
      const p = scores.get(String(award.player_id)); if (!p) continue;
      if (award.award_type === "MVP") p.mvp += 1;
      if (award.award_type === "IMBATTUTO") p.unbeaten += 1;
    }
  }
  const rows = [...scores.values()].map(p => ({
    ...p,
    points: (p.sets ? ((p.setPoints + p.games * 0.30 + p.sets * 0.10) / p.sets) * 10 : 0) + p.mvp * 1.5 + p.unbeaten,
  })).sort((a,b) => b.points-a.points);
  if (rows.length < 2) return json({ error: "Servono almeno due giocatori ufficiali" }, 409);
  const byId = new Map(rows.map(p => [String(p.id), p]));
  const marketOpenMs = Math.max(opensAt.getTime(), ...markets.map(m => m.opens_at ? new Date(m.opens_at).getTime() : opensAt.getTime()));
  const marketCloseMs = Math.min(closesAt.getTime(), ...markets.map(m => m.closes_at ? new Date(m.closes_at).getTime() : closesAt.getTime()));
  const quotes = quote(rows.map(p => p.points), now.getTime(), marketOpenMs, marketCloseMs);
  let updated = 0;
  for (const market of markets) {
    const key = String(market.selection_key).replace(/^player[_:]?/, "");
    const row = byId.get(key) || rows.find(p => p.name?.toLowerCase() === String(market.selection_label).toLowerCase());
    if (!row) continue;
    const index = rows.findIndex(p => String(p.id) === String(row.id));
    const q = quotes[index];
    const patch: Record<string, unknown> = { updated_at: now.toISOString(), theoretical_probability: q.probability, odds: q.odds };
    if (q.expired) patch.status = "closed";
    if (!q.open && !q.expired) continue;
    const { error } = await db.from("rpl_bet_markets").update(patch).eq("id",market.id).eq("status","open");
    if (error) return json({ error: "Aggiornamento quote interrotto; mercato non attivato", updated }, 500);
    updated++;
  }
  return json({ refreshed: updated, season_key: seasonKey, calculated_at: now.toISOString(), markets: rows.map((p,i)=>({player_id:p.id,name:p.name,points:Math.round(p.points*100)/100,odds:quotes[i].odds,probability:quotes[i].probability})) });
});
