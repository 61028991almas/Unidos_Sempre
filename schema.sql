-- UNIDOS SEMPRE — Banco Supabase (PostgreSQL)
-- Execute este script no SQL Editor do SEU projeto Supabase.
-- CONTAS: crie os usuários em Authentication > Users após executar o script.
-- ADMIN: após criar sua conta, promova-a pelo comando ao final deste arquivo.

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  tag text not null default '',
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  kind text not null check (kind in ('conjunta','individual')),
  status text not null default 'aberta' check (status in ('aberta','andamento','finalizada','cancelada')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete restrict,
  item text not null check (item in ('Celeiro','Silo','Terreno')),
  duration integer not null check (duration in (5,10,20,30)),
  quantity integer not null default 1 check (quantity between 1 and 1000),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid boolean not null default false,
  delivery_status text not null default 'pendente' check (delivery_status in ('pendente','solicitado','coletado')),
  supplier_sent_at timestamptz,
  collected_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'usuario' check (role in ('admin','usuario')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Perfil inicial sem privilégios administrativos ao criar conta.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id,display_name,role)
  values (new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)),'usuario')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_unidos on auth.users;
create trigger on_auth_user_created_unidos
  after insert on auth.users for each row
  execute function public.handle_new_auth_user();

-- Reexecutar o script também prepara perfis para usuários preexistentes.
insert into public.profiles (id,display_name,role)
select u.id, split_part(coalesce(u.email,''),'@',1), 'usuario'
from auth.users u
on conflict (id) do nothing;

-- Helper SECURITY DEFINER, evita recursão nas regras RLS de profiles.
create or replace function public.is_unidos_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin');
$$;

create or replace function public.unidos_client_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.client_id from public.profiles p where p.id=auth.uid();
$$;

revoke all on function public.is_unidos_admin() from public;
revoke all on function public.unidos_client_id() from public;
grant execute on function public.is_unidos_admin() to authenticated;
grant execute on function public.unidos_client_id() to authenticated;

create index if not exists idx_unidos_orders_client on public.orders(client_id);
create index if not exists idx_unidos_orders_purchase on public.orders(purchase_id);
create index if not exists idx_unidos_orders_sent on public.orders(supplier_sent_at);
create index if not exists idx_unidos_profiles_client on public.profiles(client_id);

alter table public.clients enable row level security;
alter table public.purchases enable row level security;
alter table public.orders enable row level security;
alter table public.profiles enable row level security;

-- Não exponha dados para visitantes sem autenticação.
revoke all on public.clients,public.purchases,public.orders,public.profiles from anon;
grant select,insert,update,delete on public.clients,public.purchases,public.orders to authenticated;
grant select,update on public.profiles to authenticated;

drop policy if exists "unidos_clients_read" on public.clients;
create policy "unidos_clients_read" on public.clients for select to authenticated
using ((select public.is_unidos_admin()) or id=(select public.unidos_client_id()));
drop policy if exists "unidos_clients_admin_insert" on public.clients;
create policy "unidos_clients_admin_insert" on public.clients for insert to authenticated
with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_clients_admin_update" on public.clients;
create policy "unidos_clients_admin_update" on public.clients for update to authenticated
using ((select public.is_unidos_admin())) with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_clients_admin_delete" on public.clients;
create policy "unidos_clients_admin_delete" on public.clients for delete to authenticated
using ((select public.is_unidos_admin()));

drop policy if exists "unidos_orders_read" on public.orders;
create policy "unidos_orders_read" on public.orders for select to authenticated
using ((select public.is_unidos_admin()) or client_id=(select public.unidos_client_id()));
drop policy if exists "unidos_orders_admin_insert" on public.orders;
create policy "unidos_orders_admin_insert" on public.orders for insert to authenticated
with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_orders_admin_update" on public.orders;
create policy "unidos_orders_admin_update" on public.orders for update to authenticated
using ((select public.is_unidos_admin())) with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_orders_admin_delete" on public.orders;
create policy "unidos_orders_admin_delete" on public.orders for delete to authenticated
using ((select public.is_unidos_admin()));

drop policy if exists "unidos_purchases_read" on public.purchases;
create policy "unidos_purchases_read" on public.purchases for select to authenticated
using (
  (select public.is_unidos_admin())
  or exists (
    select 1 from public.orders o
    where o.purchase_id=public.purchases.id
      and o.client_id=(select public.unidos_client_id())
  )
);
drop policy if exists "unidos_purchases_admin_insert" on public.purchases;
create policy "unidos_purchases_admin_insert" on public.purchases for insert to authenticated
with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_purchases_admin_update" on public.purchases;
create policy "unidos_purchases_admin_update" on public.purchases for update to authenticated
using ((select public.is_unidos_admin())) with check ((select public.is_unidos_admin()));
drop policy if exists "unidos_purchases_admin_delete" on public.purchases;
create policy "unidos_purchases_admin_delete" on public.purchases for delete to authenticated
using ((select public.is_unidos_admin()));

drop policy if exists "unidos_profiles_read" on public.profiles;
create policy "unidos_profiles_read" on public.profiles for select to authenticated
using (id=(select auth.uid()) or (select public.is_unidos_admin()));
drop policy if exists "unidos_profiles_admin_update" on public.profiles;
create policy "unidos_profiles_admin_update" on public.profiles for update to authenticated
using ((select public.is_unidos_admin())) with check ((select public.is_unidos_admin()));

-- =========================================================
-- ETAPA MANUAL APÓS criar a conta do ADMIN em Authentication:
-- Troque o e-mail abaixo pelo e-mail cadastrado; execute
-- APENAS este UPDATE no SQL Editor do Supabase.
--
-- update public.profiles
-- set role='admin'
-- where id=(select id from auth.users where email='SEU_EMAIL_AQUI');
--
-- PARA VINCULAR UM CLIENTE AO LOGIN do próprio cliente:
-- update public.profiles
-- set client_id=(select id from public.clients where tag='#TAG_DO_CLIENTE' limit 1)
-- where id=(select id from auth.users where email='EMAIL_DO_CLIENTE');
-- =========================================================
