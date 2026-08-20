-- suzexAi initial schema
-- Keep all user data in the exposed public schema protected by RLS.
create extension if not exists pgcrypto;
create schema if not exists private;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 140),
  starts_on date,
  venue text check (char_length(venue) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  company_name text not null check (char_length(company_name) between 1 and 180),
  contact_name text check (char_length(contact_name) <= 140),
  email text check (char_length(email) <= 320),
  fee_amount numeric(12,2) not null default 0 check (fee_amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 1 and 140),
  email text check (char_length(email) <= 320),
  role_name text check (char_length(role_name) <= 140),
  shift_label text check (char_length(shift_label) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 240),
  scope text check (char_length(scope) <= 2000),
  assignee_name text check (char_length(assignee_name) <= 140),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index every foreign key and common workspace filter. These are also used by RLS helpers.
create index events_owner_id_idx on public.events(owner_id);
create index event_members_event_id_idx on public.event_members(event_id);
create index event_members_user_id_idx on public.event_members(user_id);
create index vendors_event_id_idx on public.vendors(event_id);
create index volunteers_event_id_idx on public.volunteers(event_id);
create index tasks_event_due_date_idx on public.tasks(event_id, due_date);
create index tasks_event_open_idx on public.tasks(event_id) where status <> 'done';

-- Security-definer helpers keep RLS checks fast and avoid policy recursion.
-- They live in a non-exposed schema, check the caller identity explicitly,
-- use an empty search path, and cannot be called directly by API roles.
create or replace function private.can_access_event(check_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.events where id = check_event_id and owner_id = (select auth.uid()))
    or exists (select 1 from public.event_members where event_id = check_event_id and user_id = (select auth.uid()))
  );
$$;

create or replace function private.can_manage_event(check_event_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.events where id = check_event_id and owner_id = (select auth.uid())
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at before update on public.events for each row execute function private.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors for each row execute function private.set_updated_at();
create trigger volunteers_set_updated_at before update on public.volunteers for each row execute function private.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function private.set_updated_at();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.events, public.event_members, public.vendors, public.volunteers, public.tasks to authenticated;
grant usage on schema private to authenticated;
revoke all on function private.can_access_event(uuid) from public, anon, service_role;
revoke all on function private.can_manage_event(uuid) from public, anon, service_role;
grant execute on function private.can_access_event(uuid), private.can_manage_event(uuid) to authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.vendors enable row level security;
alter table public.volunteers enable row level security;
alter table public.tasks enable row level security;

create policy "Event participants can view their events" on public.events for select to authenticated using ((select private.can_access_event(id)));
create policy "Users can create owned events" on public.events for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners can update events" on public.events for update to authenticated using ((select private.can_manage_event(id))) with check (owner_id = (select auth.uid()));
create policy "Owners can delete events" on public.events for delete to authenticated using ((select private.can_manage_event(id)));

create policy "Participants can view event members" on public.event_members for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can add event members" on public.event_members for insert to authenticated with check ((select private.can_manage_event(event_id)));
create policy "Owners can update event members" on public.event_members for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));
create policy "Owners can delete event members" on public.event_members for delete to authenticated using ((select private.can_manage_event(event_id)));

create policy "Participants can view vendors" on public.vendors for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can add vendors" on public.vendors for insert to authenticated with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can update vendors" on public.vendors for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can delete vendors" on public.vendors for delete to authenticated using ((select private.can_manage_event(event_id)));

create policy "Participants can view volunteers" on public.volunteers for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can add volunteers" on public.volunteers for insert to authenticated with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can update volunteers" on public.volunteers for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can delete volunteers" on public.volunteers for delete to authenticated using ((select private.can_manage_event(event_id)));

create policy "Participants can view tasks" on public.tasks for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can add tasks" on public.tasks for insert to authenticated with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can update tasks" on public.tasks for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)) and created_by = (select auth.uid()));
create policy "Owners can delete tasks" on public.tasks for delete to authenticated using ((select private.can_manage_event(event_id)));

