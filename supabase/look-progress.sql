-- Run once in the same Supabase project as the bot. Existing subscriptions
-- and last_episode_id (the notification cursor) are not modified.
create table if not exists public.look_episode_progress (
  chat_id bigint not null,
  show_id bigint not null,
  episode_id text not null,
  primary key (chat_id, episode_id)
);
create table if not exists public.look_series_state (
  chat_id bigint not null,
  show_id bigint not null,
  paused boolean not null default false,
  primary key (chat_id, show_id)
);
alter table public.look_episode_progress enable row level security;
alter table public.look_series_state enable row level security;
revoke all on public.look_episode_progress, public.look_series_state from anon, authenticated;
grant all on public.look_episode_progress, public.look_series_state to service_role;
