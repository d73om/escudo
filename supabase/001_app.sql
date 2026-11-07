-- App escudo: dados de cada utilizador, privados por linha (RLS)

-- Quem pode usar a leitura por IA nesta fase de testes
create table public.testadores (
  email text primary key check (email = lower(email)),
  nota text,
  criado_em timestamptz not null default now()
);
alter table public.testadores enable row level security;
revoke all on public.testadores from anon, authenticated;
insert into public.testadores (email, nota) values ('dom@diogoom.pt', 'Diogo');

-- Perfil de cada utilizador
create table public.perfis (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  perfil text not null check (perfil in ('particular', 'independente_simplificado', 'eni_contabilidade_organizada', 'sociedade')),
  email_contabilista text check (email_contabilista is null or (char_length(email_contabilista) <= 254 and email_contabilista ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  criado_em timestamptz not null default now()
);

-- Cada talão ou fatura lida
create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loja text check (char_length(loja) <= 200),
  nif_loja text check (char_length(nif_loja) <= 20),
  data date,
  tipo_documento text check (char_length(tipo_documento) <= 60),
  tem_nif_cliente boolean not null default false,
  total numeric(10, 2) not null,
  iva_total numeric(10, 2),
  iva jsonb not null default '[]'::jsonb,
  ambito text not null default 'pessoal' check (ambito in ('pessoal', 'atividade')),
  imagem_path text check (char_length(imagem_path) <= 300),
  soma_confere boolean,
  criado_em timestamptz not null default now()
);
create index faturas_user_data on public.faturas (user_id, data desc);

-- As linhas (artigos) de cada fatura
create table public.linhas (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references public.faturas (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ordem int not null default 0,
  descricao text not null check (char_length(descricao) <= 300),
  quantidade numeric(10, 3),
  valor numeric(10, 2) not null,
  taxa_iva numeric(5, 2),
  categoria text not null check (categoria in (
    'alimentacao', 'bebidas_alcoolicas', 'limpeza', 'higiene', 'bebe', 'animais', 'casa',
    'eletronica', 'roupa', 'saude', 'combustivel', 'restauracao', 'sacos_embalagens', 'outros'))
);
create index linhas_fatura on public.linhas (fatura_id);

-- Registo das leituras por IA (para limitar o gasto de créditos)
create table public.leituras (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sucesso boolean,
  criado_em timestamptz not null default now()
);
create index leituras_user_data on public.leituras (user_id, criado_em desc);

-- Segurança: cada utilizador só vê e mexe no que é seu
alter table public.perfis enable row level security;
alter table public.faturas enable row level security;
alter table public.linhas enable row level security;
alter table public.leituras enable row level security;

revoke all on public.perfis, public.faturas, public.linhas, public.leituras from anon, authenticated;
grant select, insert, update on public.perfis to authenticated;
grant select, insert, update, delete on public.faturas, public.linhas to authenticated;
grant select, insert on public.leituras to authenticated;

create policy "perfil proprio" on public.perfis for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "faturas proprias" on public.faturas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "linhas proprias" on public.linhas for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.faturas f where f.id = fatura_id and f.user_id = auth.uid()));
create policy "leituras proprias" on public.leituras for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permite à app saber se o utilizador é testador, sem expor a lista
create or replace function public.sou_testador() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.testadores t where t.email = lower(auth.jwt() ->> 'email')) $$;
revoke all on function public.sou_testador() from public, anon;
grant execute on function public.sou_testador() to authenticated;

-- Fotografias: pasta privada, cada utilizador só acede à sua subpasta
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturas', 'faturas', false, 5242880, array['image/jpeg']);

create policy "fotos proprias - ler" on storage.objects for select to authenticated
  using (bucket_id = 'faturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos proprias - guardar" on storage.objects for insert to authenticated
  with check (bucket_id = 'faturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos proprias - apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'faturas' and (storage.foldername(name))[1] = auth.uid()::text);
