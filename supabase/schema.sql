insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secure-files', 'secure-files', false, 10485760,
  array['application/pdf','image/png','image/jpeg','text/plain','application/zip']);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table public.files enable row level security;

-- Newer Supabase projects no longer grant table privileges to API roles by default.
-- Grant only what the app needs; RLS below still limits each user to their own rows.
revoke all on public.files from anon, authenticated;
grant select, insert, delete on public.files to authenticated;

create policy "Users read own files" on public.files
  for select using (owner_id = auth.uid());
create policy "Users insert own files" on public.files
  for insert with check (owner_id = auth.uid());
create policy "Users delete own files" on public.files
  for delete using (owner_id = auth.uid());

create policy "Upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'secure-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'secure-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'secure-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Share history: one row per generated link. Only the expiry is stored, never the signed URL.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint share_links_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours 1 minute')
);

create index share_links_file_id_idx on public.share_links (file_id, created_at desc);

alter table public.share_links enable row level security;

revoke all on public.share_links from anon, authenticated;
grant select, insert on public.share_links to authenticated;

create policy "Users read own share links" on public.share_links
  for select using (owner_id = auth.uid());
-- A user can only log shares for files they own.
create policy "Users insert own share links" on public.share_links
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.files f where f.id = file_id and f.owner_id = auth.uid())
  );
