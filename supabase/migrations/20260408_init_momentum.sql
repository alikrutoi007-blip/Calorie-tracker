create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_state_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  app_version text not null default 'momentum-web-v1',
  platform text not null default 'web',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.meal_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('photo', 'voice', 'manual')),
  transcript text,
  image_name text,
  provider text,
  total_calories integer,
  foods jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger app_state_snapshots_set_updated_at
before update on public.app_state_snapshots
for each row
execute function public.set_updated_at();

create trigger meal_captures_set_updated_at
before update on public.meal_captures
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.app_state_snapshots enable row level security;
alter table public.meal_captures enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "app_state_select_own"
on public.app_state_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create policy "app_state_insert_own"
on public.app_state_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "app_state_update_own"
on public.app_state_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "meal_captures_select_own"
on public.meal_captures
for select
to authenticated
using (auth.uid() = user_id);

create policy "meal_captures_insert_own"
on public.meal_captures
for insert
to authenticated
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('meal-captures', 'meal-captures', false)
on conflict (id) do nothing;

create policy "meal_capture_storage_read_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'meal-captures' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "meal_capture_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'meal-captures' and auth.uid()::text = (storage.foldername(name))[1]);
