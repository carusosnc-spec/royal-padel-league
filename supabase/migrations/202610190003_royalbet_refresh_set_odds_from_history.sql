-- Recalculate set-winner probabilities from official confirmed RPL history.
-- Pairings are taken from the latest prediction row for each future calendar set.
CREATE OR REPLACE FUNCTION public.rpl_refresh_set_prediction_odds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH valid_sets AS MATERIALIZED (
    SELECT s.pair_a_player_1, s.pair_a_player_2,
           s.pair_b_player_1, s.pair_b_player_2,
           s.games_a, s.games_b
    FROM public.sets s
    JOIN public.matches m ON m.id = s.match_id
    WHERE m.is_confirmed = true
      AND m.approval_status = 'confirmed'
      AND s.pair_a_player_1 IS NOT NULL
      AND s.pair_a_player_2 IS NOT NULL
      AND s.pair_b_player_1 IS NOT NULL
      AND s.pair_b_player_2 IS NOT NULL
      AND s.games_a IS NOT NULL
      AND s.games_b IS NOT NULL
      AND s.games_a <> s.games_b
      AND ((s.games_a = 6 AND s.games_b BETWEEN 0 AND 4)
        OR (s.games_b = 6 AND s.games_a BETWEEN 0 AND 4)
        OR (s.games_a = 7 AND s.games_b IN (5,6))
        OR (s.games_b = 7 AND s.games_a IN (5,6)))
      AND s.pair_a_player_1 <> s.pair_a_player_2
      AND s.pair_b_player_1 <> s.pair_b_player_2
      AND s.pair_a_player_1 <> s.pair_b_player_1
      AND s.pair_a_player_1 <> s.pair_b_player_2
      AND s.pair_a_player_2 <> s.pair_b_player_1
      AND s.pair_a_player_2 <> s.pair_b_player_2
  ),
  player_rows AS (
    SELECT pair_a_player_1 AS player_id, (games_a > games_b)::integer AS won, (games_a-games_b)::numeric AS game_diff FROM valid_sets
    UNION ALL SELECT pair_a_player_2, (games_a > games_b)::integer, (games_a-games_b)::numeric FROM valid_sets
    UNION ALL SELECT pair_b_player_1, (games_b > games_a)::integer, (games_b-games_a)::numeric FROM valid_sets
    UNION ALL SELECT pair_b_player_2, (games_b > games_a)::integer, (games_b-games_a)::numeric FROM valid_sets
  ),
  player_agg AS (
    SELECT player_id, count(*)::numeric AS played, sum(won)::numeric AS wins,
           sum(game_diff)::numeric AS game_diff
    FROM player_rows GROUP BY player_id
  ),
  player_strength AS (
    SELECT player_id,
      ln((((wins+2)/(played+4)) / (1-((wins+2)/(played+4))))) * 0.65
      + greatest(-5::numeric, least(5::numeric, game_diff / greatest(played,1))) * 0.055 AS strength
    FROM player_agg
  ),
  pair_rows AS (
    SELECT least(pair_a_player_1,pair_a_player_2) AS player_1,
           greatest(pair_a_player_1,pair_a_player_2) AS player_2,
           (games_a > games_b)::integer AS won, (games_a-games_b)::numeric AS game_diff
    FROM valid_sets
    UNION ALL
    SELECT least(pair_b_player_1,pair_b_player_2),
           greatest(pair_b_player_1,pair_b_player_2),
           (games_b > games_a)::integer, (games_b-games_a)::numeric
    FROM valid_sets
  ),
  pair_agg AS (
    SELECT player_1,player_2,count(*)::numeric AS played,
           sum(won)::numeric AS wins,sum(game_diff)::numeric AS game_diff
    FROM pair_rows GROUP BY player_1,player_2
  ),
  pair_strength AS (
    SELECT player_1,player_2,
      CASE WHEN played < 2 THEN 0::numeric ELSE
        (played/(played+8)) *
        (ln((((wins+2)/(played+4)) / (1-((wins+2)/(played+4))))) * 0.45
        + greatest(-5::numeric, least(5::numeric, game_diff / greatest(played,1))) * 0.04)
      END AS strength
    FROM pair_agg
  ),
  target AS (
    SELECT DISTINCT ON (p.calendar_match_id,p.set_number)
      p.id,p.calendar_match_id,p.set_number,
      p.pair_a_player_1,p.pair_a_player_2,p.pair_b_player_1,p.pair_b_player_2
    FROM public.rpl_bet_predictions p
    JOIN public.calendar_matches cm ON cm.id=p.calendar_match_id
    WHERE cm.scheduled_at > now()
      AND cm.result_match_id IS NULL
      AND p.actual_games_a IS NULL
      AND p.actual_games_b IS NULL
      AND p.settled_at IS NULL
      AND EXISTS (SELECT 1 FROM valid_sets)
    ORDER BY p.calendar_match_id,p.set_number,p.snapshot_date DESC,p.predicted_at DESC,p.id DESC
  ),
  scored AS (
    SELECT t.id,
      greatest(0.08::numeric,least(0.92::numeric,
        0.5::numeric + 0.36::numeric *
        ((1::numeric/(1::numeric+exp(-(
          coalesce(a1.strength,0)+coalesce(a2.strength,0)+coalesce(pa.strength,0)
          -coalesce(b1.strength,0)-coalesce(b2.strength,0)-coalesce(pb.strength,0)
        ))))-0.5::numeric)
      )) AS probability_a
    FROM target t
    LEFT JOIN player_strength a1 ON a1.player_id=t.pair_a_player_1
    LEFT JOIN player_strength a2 ON a2.player_id=t.pair_a_player_2
    LEFT JOIN player_strength b1 ON b1.player_id=t.pair_b_player_1
    LEFT JOIN player_strength b2 ON b2.player_id=t.pair_b_player_2
    LEFT JOIN pair_strength pa ON pa.player_1=least(t.pair_a_player_1,t.pair_a_player_2)
                              AND pa.player_2=greatest(t.pair_a_player_1,t.pair_a_player_2)
    LEFT JOIN pair_strength pb ON pb.player_1=least(t.pair_b_player_1,t.pair_b_player_2)
                              AND pb.player_2=greatest(t.pair_b_player_1,t.pair_b_player_2)
  )
  UPDATE public.rpl_bet_predictions p
  SET probability_a=round(s.probability_a,6),
      probability_b=round(1-s.probability_a,6),
      odds_a=round(1/s.probability_a,3),
      odds_b=round(1/(1-s.probability_a),3),
      model_version='historical-player-form-v3',
      predicted_at=now(),
      snapshot_date=current_date
  FROM scored s
  WHERE p.id=s.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpl_refresh_set_prediction_odds() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpl_refresh_set_prediction_odds_after_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_id bigint;
  v_confirmed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'matches' THEN
    v_match_id := NEW.id;
    v_confirmed := NEW.is_confirmed = true AND NEW.approval_status = 'confirmed'
      AND (OLD.is_confirmed IS DISTINCT FROM NEW.is_confirmed
        OR OLD.approval_status IS DISTINCT FROM NEW.approval_status);
  ELSE
    v_match_id := NEW.match_id;
    SELECT (m.is_confirmed = true AND m.approval_status = 'confirmed')
    INTO v_confirmed FROM public.matches m WHERE m.id=v_match_id;
  END IF;

  IF COALESCE(v_confirmed,false) THEN
    PERFORM public.rpl_refresh_set_prediction_odds();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rpl_refresh_set_odds_after_match_confirmation ON public.matches;
CREATE TRIGGER rpl_refresh_set_odds_after_match_confirmation
AFTER UPDATE OF is_confirmed, approval_status ON public.matches
FOR EACH ROW
WHEN (NEW.is_confirmed = true AND NEW.approval_status = 'confirmed')
EXECUTE FUNCTION public.rpl_refresh_set_prediction_odds_after_result();

DROP TRIGGER IF EXISTS rpl_refresh_set_odds_after_set_result ON public.sets;
CREATE TRIGGER rpl_refresh_set_odds_after_set_result
AFTER INSERT OR UPDATE OF games_a, games_b, pair_a_player_1, pair_a_player_2, pair_b_player_1, pair_b_player_2
ON public.sets
FOR EACH ROW
EXECUTE FUNCTION public.rpl_refresh_set_prediction_odds_after_result();

-- Bring current future set markets in line with the confirmed historical sample.
SELECT public.rpl_refresh_set_prediction_odds();
