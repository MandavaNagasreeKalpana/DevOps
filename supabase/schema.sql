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
