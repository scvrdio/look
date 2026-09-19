-- Additive migration: existing subscriptions and notification cursors are untouched.
create table if not exists public.look_movies (
  chat_id bigint not null,
  movie_id bigint not null check (movie_id > 0),
  title text not null,
  year integer,
  poster_url text,
  watched boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (chat_id, movie_id)
);
alter table public.look_movies enable row level security;
revoke all on public.look_movies from anon, authenticated;
grant all on public.look_movies to service_role;
