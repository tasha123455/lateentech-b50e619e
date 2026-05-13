
-- Roles enum
create type public.app_role as enum ('marketer', 'business');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create policy "Users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- Security definer role check
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

-- Helper to read current user's role
create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid() limit 1;
$$;

-- Auto-create profile + role from sign-up metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.app_role;
begin
  v_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'marketer');

  insert into public.profiles (id, full_name, phone, business_name)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name'
  );

  insert into public.user_roles (user_id, role) values (new.id, v_role);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
