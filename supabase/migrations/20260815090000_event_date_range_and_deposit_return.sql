alter table public.events
  add column if not exists ends_on date;

alter table public.vendors
  add column if not exists deposit_returned boolean not null default false;

update public.vendors
set deposit_returned = (deposit_return_status = 'returned')
where deposit_returned = false
  and deposit_return_status = 'returned';

