-- Title of My Life — database schema for the shared wall.
-- Run this once in Supabase → SQL Editor. No sign-in providers needed.
--
-- How anonymity works: each visitor's browser makes a random ID (e.g. AMBER-FOX-7Q4K-9XPM).
-- Only its SHA-256 hash is stored. Tables are read-only to the public; every write goes through
-- the functions below, which hash the ID on the server, so nobody can post as someone else
-- without knowing their ID.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 20 and 4000),
  owner_hash text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
alter table public.scripts add column if not exists edited_at timestamptz; -- for walls created before editing existed

create table if not exists public.likes (
  script_id uuid not null references public.scripts(id) on delete cascade,
  owner_hash text not null,
  created_at timestamptz not null default now(),
  primary key (script_id, owner_hash)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 280),
  owner_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.scripts  enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- Everyone can read the wall. There are deliberately no insert/update/delete policies.
grant select on public.scripts, public.likes, public.comments to anon, authenticated;
create policy "read scripts"  on public.scripts  for select using (true);
create policy "read likes"    on public.likes    for select using (true);
create policy "read comments" on public.comments for select using (true);

-- Turns a visitor ID into its stored hash, rejecting anything that isn't a well-formed ID.
create or replace function public.id_hash(p_key text) returns text
language plpgsql immutable set search_path = public, extensions as $$
begin
  if p_key is null or p_key !~ '^[A-Z]+-[A-Z]+-[0-9A-Z]{4}-[0-9A-Z]{4}$' then
    raise exception 'invalid id';
  end if;
  return encode(extensions.digest(p_key, 'sha256'), 'hex');
end $$;

create or replace function public.post_script(p_key text, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  insert into scripts(title, body, owner_hash) values (trim(p_title), trim(p_body), id_hash(p_key))
  returning id into new_id;
  return new_id;
end $$;

-- Only the author (whoever holds the ID that posted it) can edit or delete a script.
create or replace function public.edit_script(p_key text, p_script uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update scripts set title = trim(p_title), body = trim(p_body), edited_at = now()
  where id = p_script and owner_hash = id_hash(p_key);
  if not found then raise exception 'not your script'; end if;
end $$;

create or replace function public.delete_script(p_key text, p_script uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from scripts where id = p_script and owner_hash = id_hash(p_key); -- likes and comments go with it (on delete cascade)
  if not found then raise exception 'not your script'; end if;
end $$;

create or replace function public.toggle_like(p_key text, p_script uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text := id_hash(p_key);
begin
  delete from likes where script_id = p_script and owner_hash = h;
  if found then return false; end if;
  insert into likes(script_id, owner_hash) values (p_script, h);
  return true;
end $$;

create or replace function public.add_comment(p_key text, p_script uuid, p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into comments(script_id, text, owner_hash) values (p_script, trim(p_text), id_hash(p_key));
end $$;

revoke all on function public.post_script(text,text,text), public.edit_script(text,uuid,text,text), public.delete_script(text,uuid),
  public.toggle_like(text,uuid), public.add_comment(text,uuid,text) from public;
grant execute on function public.post_script(text,text,text), public.edit_script(text,uuid,text,text), public.delete_script(text,uuid),
  public.toggle_like(text,uuid), public.add_comment(text,uuid,text) to anon, authenticated;

-- Live updates on the wall.
alter publication supabase_realtime add table public.scripts, public.likes, public.comments;
