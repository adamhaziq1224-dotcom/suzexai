alter table public.vendors
  add column if not exists business_type text check (char_length(business_type) <= 140),
  add column if not exists tent_rental boolean not null default false,
  add column if not exists deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  add column if not exists deposit_status text not null default 'not_required' check (deposit_status in ('not_required', 'pending', 'paid')),
  add column if not exists deposit_return_status text not null default 'not_required' check (deposit_return_status in ('not_required', 'pending', 'returned', 'forfeited')),
  add column if not exists vendor_status text not null default 'active' check (vendor_status in ('active', 'pending', 'cancelled'));

alter table public.tasks
  add column if not exists volunteer_role text check (char_length(volunteer_role) <= 140),
  add column if not exists volunteer_name text check (char_length(volunteer_name) <= 140);

create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  target_month date not null,
  vendor_fee_target numeric(12,2) not null default 0 check (vendor_fee_target >= 0),
  volunteer_target integer not null default 0 check (volunteer_target >= 0),
  task_target integer not null default 0 check (task_target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, target_month),
  check (target_month = date_trunc('month', target_month)::date)
);

create index if not exists monthly_targets_event_month_idx on public.monthly_targets(event_id, target_month);
alter table public.monthly_targets enable row level security;
grant select, insert, update, delete on public.monthly_targets to authenticated;

create policy "Participants can view monthly targets" on public.monthly_targets for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can create monthly targets" on public.monthly_targets for insert to authenticated with check ((select private.can_manage_event(event_id)));
create policy "Owners can update monthly targets" on public.monthly_targets for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));
create policy "Owners can delete monthly targets" on public.monthly_targets for delete to authenticated using ((select private.can_manage_event(event_id)));

create trigger monthly_targets_set_updated_at before update on public.monthly_targets for each row execute function private.set_updated_at();

