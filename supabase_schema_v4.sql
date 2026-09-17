-- ROYAL PADEL LEAGUE - V4
-- Run this AFTER the original schema and player insert, or run the complete file
-- if the tables already exist. This adds real operator write protection.

alter table public.operators enable row level security;

-- Operators: an authenticated user can read only their own operator row.
drop policy if exists "Operators can read own record" on public.operators;
create policy "Operators can read own record"
on public.operators for select to authenticated
using (auth.uid() = user_id);

-- Match writes: only authorized operators.
drop policy if exists "Operators insert matches" on public.matches;
create policy "Operators insert matches"
on public.matches for insert to authenticated
with check (
  exists (select 1 from public.operators o where o.user_id = auth.uid())
);

drop policy if exists "Operators update matches" on public.matches;
create policy "Operators update matches"
on public.matches for update to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()))
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators delete matches" on public.matches;
create policy "Operators delete matches"
on public.matches for delete to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()));

-- Match player snapshots.
drop policy if exists "Operators insert match_players" on public.match_players;
create policy "Operators insert match_players"
on public.match_players for insert to authenticated
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators update match_players" on public.match_players;
create policy "Operators update match_players"
on public.match_players for update to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()))
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators delete match_players" on public.match_players;
create policy "Operators delete match_players"
on public.match_players for delete to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()));

-- Sets.
drop policy if exists "Operators insert sets" on public.sets;
create policy "Operators insert sets"
on public.sets for insert to authenticated
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators update sets" on public.sets;
create policy "Operators update sets"
on public.sets for update to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()))
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators delete sets" on public.sets;
create policy "Operators delete sets"
on public.sets for delete to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()));

-- Awards.
drop policy if exists "Operators insert awards" on public.match_awards;
create policy "Operators insert awards"
on public.match_awards for insert to authenticated
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators update awards" on public.match_awards;
create policy "Operators update awards"
on public.match_awards for update to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()))
with check (exists (select 1 from public.operators o where o.user_id = auth.uid()));

drop policy if exists "Operators delete awards" on public.match_awards;
create policy "Operators delete awards"
on public.match_awards for delete to authenticated
using (exists (select 1 from public.operators o where o.user_id = auth.uid()));

-- No public writes are granted.
