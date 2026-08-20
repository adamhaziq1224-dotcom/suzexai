alter table public.tasks
  add column if not exists cost_of_sales numeric(12,2) not null default 0 check (cost_of_sales >= 0),
  add column if not exists sales_revenue numeric(12,2) not null default 0 check (sales_revenue >= 0);

