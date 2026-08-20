create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  item_name text not null check (char_length(item_name) between 1 and 180),
  expense_date date,
  category text not null check (category in ('Logistics', 'F&B', 'Equipment', 'Marketing', 'Others')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'pending_claim')),
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_event_date_idx on public.expenses(event_id, expense_date desc);
alter table public.expenses enable row level security;
grant select, insert, update, delete on public.expenses to authenticated;

create policy "Participants can view expenses" on public.expenses for select to authenticated using ((select private.can_access_event(event_id)));
create policy "Owners can create expenses" on public.expenses for insert to authenticated with check ((select private.can_manage_event(event_id)));
create policy "Owners can update expenses" on public.expenses for update to authenticated using ((select private.can_manage_event(event_id))) with check ((select private.can_manage_event(event_id)));
create policy "Owners can delete expenses" on public.expenses for delete to authenticated using ((select private.can_manage_event(event_id)));
create trigger expenses_set_updated_at before update on public.expenses for each row execute function private.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "Event participants can view expense receipts" on storage.objects for select to authenticated using (bucket_id = 'expense-receipts');
create policy "Authenticated users can upload expense receipts" on storage.objects for insert to authenticated with check (bucket_id = 'expense-receipts' and auth.role() = 'authenticated');
create policy "Authenticated users can delete expense receipts" on storage.objects for delete to authenticated using (bucket_id = 'expense-receipts' and auth.role() = 'authenticated');

