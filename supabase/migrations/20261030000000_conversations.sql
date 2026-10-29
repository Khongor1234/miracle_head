-- Conversation storage for the counseling backend (backend/supabase_store.py).
-- Run once in the Supabase SQL editor, or with `supabase db push`.
-- Only the server's secret key may touch this table: RLS is on with no policies,
-- and anon/authenticated have no grants.

create sequence if not exists public.dialogue_file_number_seq;

create table if not exists public.conversations (
  id text primary key,
  dialogue_file_number bigint unique,
  title text not null default 'New counseling session',
  status text not null default 'active',
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists conversations_updated_at_idx on public.conversations (updated_at desc);

alter table public.conversations enable row level security;

revoke all on table public.conversations from anon, authenticated;
grant select, insert, update, delete on table public.conversations to service_role;

revoke all on sequence public.dialogue_file_number_seq from anon, authenticated;
grant usage, select on sequence public.dialogue_file_number_seq to service_role;

-- Numbered like the old data/dialogues/<n>.json files; nextval never hands out a number twice.
create or replace function public.next_dialogue_file_number()
returns bigint
language sql
set search_path = ''
as $$
  select nextval('public.dialogue_file_number_seq');
$$;

revoke execute on function public.next_dialogue_file_number() from public, anon, authenticated;
grant execute on function public.next_dialogue_file_number() to service_role;
