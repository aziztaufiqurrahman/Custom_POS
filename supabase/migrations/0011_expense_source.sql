-- =============================================================================
-- 0011_expense_source.sql
-- Kolom `source` pada cash_expenses: dari kanal mana uang keluar
-- (cash / BNI / BCA / BSI). Pengeluaran TUNAI mengurangi kas laci saat
-- rekonsiliasi; pengeluaran bank mengurangi saldo bank (transparansi
-- masuk vs keluar per kanal).
-- =============================================================================

alter table public.cash_expenses
  add column if not exists source text not null default 'cash';

alter table public.cash_expenses
  drop constraint if exists cash_expenses_source_check;

alter table public.cash_expenses
  add constraint cash_expenses_source_check
  check (source in ('cash', 'BNI', 'BCA', 'BSI'));
