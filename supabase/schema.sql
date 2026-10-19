-- Title of My Life — database schema for the shared wall.
-- Run this once in Supabase → SQL Editor. Then enable Authentication → Sign In / Providers → "Allow anonymous sign-ins".

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 20 and 4000),
  owner uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  script_id uuid not null references public.scripts(id) on delete cascade,
  uid uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (script_id, uid)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 280),
  uid uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.scripts  enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- Everyone can read the wall.
create policy "read scripts"  on public.scripts  for select using (true);
create policy "read likes"    on public.likes    for select using (true);
create policy "read comments" on public.comments for select using (true);

-- Visitors (anonymous sessions) can only write rows as themselves.
create policy "write own script"  on public.scripts  for insert to authenticated with check (owner = auth.uid());
create policy "write own like"    on public.likes    for insert to authenticated with check (uid = auth.uid());
create policy "remove own like"   on public.likes    for delete to authenticated using (uid = auth.uid());
create policy "write own comment" on public.comments for insert to authenticated with check (uid = auth.uid());

-- Live updates on the wall.
alter publication supabase_realtime add table public.scripts, public.likes, public.comments;
