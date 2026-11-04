-- Prüfungsbank: Datenbank-Schema für Supabase
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- updated_at bei jeder Änderung automatisch setzen
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_questions_touch on public.questions;
create trigger trg_questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_exams_touch on public.exams;
create trigger trg_exams_touch before update on public.exams
  for each row execute function public.touch_updated_at();

-- Zugriff nur für angemeldete Nutzer (das ist der gemeinsame Lehrkräfte-Zugang)
alter table public.questions enable row level security;
alter table public.exams enable row level security;

drop policy if exists "Lehrkräfte: alles" on public.questions;
create policy "Lehrkräfte: alles" on public.questions
  for all to authenticated using (true) with check (true);

drop policy if exists "Lehrkräfte: alles" on public.exams;
create policy "Lehrkräfte: alles" on public.exams
  for all to authenticated using (true) with check (true);

-- Anonyme Besucher (ohne Login) haben keinerlei Rechte:
revoke all on public.questions from anon;
revoke all on public.exams from anon;
