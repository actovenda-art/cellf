-- Cellf: persistência centralizada e documentos empresariais privados.
-- Execute este script no SQL Editor do projeto Supabase da Cellf.

create table if not exists public.cellf_app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint cellf_app_state_state_is_object check (jsonb_typeof(state) = 'object')
);

alter table public.cellf_app_state enable row level security;

-- Nenhum visitante ou usuário autenticado pelo cliente pode consultar estes dados.
-- A API do servidor utiliza exclusivamente a chave secreta/service_role.
revoke all on table public.cellf_app_state from public;
revoke all on table public.cellf_app_state from anon;
revoke all on table public.cellf_app_state from authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.cellf_app_state to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cellf-documents',
  'cellf-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Necessário para instalações nas quais o cache de esquema do PostgREST está ativo.
notify pgrst, 'reload schema';
