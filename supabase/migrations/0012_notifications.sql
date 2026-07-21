-- =============================================================================
-- 0012_notifications.sql
-- Notifikasi in-app per pengguna (mis. pengingat mencatat ongkos kirim ke
-- pengeluaran shift). RLS: setiap user hanya melihat & mengubah miliknya.
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;

create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert with check (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
