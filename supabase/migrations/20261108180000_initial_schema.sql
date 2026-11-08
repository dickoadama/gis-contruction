create table public.roles (
  id text primary key,
  nom text not null,
  icon text not null default '👤',
  color text not null default '#6C63FF',
  is_system boolean not null default false,
  pages jsonb not null default '[]'::jsonb check (jsonb_typeof(pages) = 'array'),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  created_at timestamptz not null default now(),
  constraint roles_id_format check (id ~ '^ROLE_[a-z0-9_-]+$' and id <> 'ROLE_superadmin')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  prenom text not null default '',
  nom text not null default '',
  username text not null unique,
  telephone text not null default '',
  role text not null default 'utilisateur',
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9._-]{3,30}$'),
  constraint profiles_role_format check (
    role ~ '^(ROLE_[a-z0-9_-]+|[a-z0-9_-]+)$'
    and role not in ('ROLE_admin', 'ROLE_superadmin')
  )
);

create table public.app_records (
  collection text not null check (collection in (
    'products', 'clients', 'invoices', 'devis', 'stock_entries',
    'fournisseurs', 'caisse_ops', 'messages', 'notifications'
  )),
  record_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = record_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, record_id)
);

create table public.bootstrap_lock (
  singleton boolean primary key default true check (singleton),
  reserved_email text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.roles (id, nom, icon, color, is_system, pages, actions) values
  ('ROLE_utilisateur', 'Utilisateur', '👤', '#9aaec4', true,
    '["profil","notifications"]'::jsonb, '[]'::jsonb),
  ('ROLE_admin', 'Administrateur', '👑', '#6C63FF', true,
    '["dashboard","produits","stock","inventaire","entrees_stock","factures","devis","caisse","clients","fournisseurs","rapports","messages","notifications","panier","profil","parametres","utilisateurs","roles","archives"]'::jsonb,
    '["create_invoice","delete_invoice","create_devis","manage_stock","manage_users","manage_roles","view_caisse","manage_products","view_reports","manage_company"]'::jsonb),
  ('ROLE_tresorier', 'Trésorier', '💼', '#00D4AA', true,
    '["dashboard","factures","devis","archives","caisse","clients","messages","notifications","panier","profil"]'::jsonb,
    '["create_invoice","create_devis","view_caisse"]'::jsonb),
  ('ROLE_gestionnaire_stock', 'Gest. de Stock', '📦', '#FFA502', true,
    '["dashboard","produits","stock","inventaire","entrees_stock","fournisseurs","messages","notifications","profil"]'::jsonb,
    '["manage_stock","manage_products","view_reports"]'::jsonb),
  ('ROLE_commerciale', 'Commercial', '💹', '#FF6B35', true,
    '["dashboard","factures","devis","archives","clients","messages","notifications","panier","profil"]'::jsonb,
    '["create_invoice","create_devis"]'::jsonb)
on conflict (id) do nothing;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.actif
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.actif and p.role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.actif and p.role = 'superadmin'
  );
$$;

create or replace function public.has_action(p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.roles r
      on r.id = case when p.role like 'ROLE_%' then p.role else 'ROLE_' || p.role end
    where p.id = auth.uid()
      and p.actif
      and (
        p.role in ('admin', 'superadmin')
        or coalesce(r.actions, '[]'::jsonb) ? p_action
      )
  );
$$;

create or replace function public.can_read_record(p_collection text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and case p_collection
    when 'messages' then
      p_data->>'expediteurId' = auth.uid()::text
      or p_data->>'destinataireId' = auth.uid()::text
    when 'notifications' then
      p_data->>'userId' = auth.uid()::text or p_data->'userId' = 'null'::jsonb
    when 'products' then public.has_action('manage_products') or public.has_action('manage_stock')
    when 'stock_entries' then public.has_action('manage_stock')
    when 'fournisseurs' then public.has_action('manage_stock')
    when 'invoices' then public.has_action('create_invoice') or public.has_action('delete_invoice') or public.has_action('view_reports')
    when 'devis' then public.has_action('create_devis')
    when 'clients' then public.has_action('create_invoice') or public.has_action('create_devis')
    when 'caisse_ops' then public.has_action('view_caisse')
    else false
  end;
$$;

create or replace function public.can_write_record(p_collection text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and case p_collection
    when 'messages' then
      p_data->>'expediteurId' = auth.uid()::text
      and nullif(p_data->>'destinataireId', '') is not null
    when 'notifications' then
      p_data->>'userId' = auth.uid()::text
      or (
        p_data->'userId' = 'null'::jsonb
        and (public.is_admin() or public.has_action('manage_stock') or public.has_action('create_invoice'))
      )
      or (
        p_data->>'senderId' = auth.uid()::text
        and nullif(p_data->>'userId', '') is not null
      )
    when 'products' then public.has_action('manage_products') or public.has_action('manage_stock')
    when 'stock_entries' then public.has_action('manage_stock')
    when 'fournisseurs' then public.has_action('manage_stock')
    when 'invoices' then public.has_action('create_invoice')
    when 'devis' then public.has_action('create_devis')
    when 'clients' then public.has_action('create_invoice') or public.has_action('create_devis')
    when 'caisse_ops' then public.has_action('view_caisse') or public.has_action('create_invoice')
    else false
  end;
$$;

create or replace function public.can_update_record(p_collection text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and case p_collection
    when 'messages' then p_data->>'destinataireId' = auth.uid()::text
    when 'notifications' then p_data->>'userId' = auth.uid()::text or p_data->'userId' = 'null'::jsonb
    when 'invoices' then public.has_action('delete_invoice')
    when 'products' then public.can_write_record(p_collection, p_data) or public.has_action('create_invoice')
    else public.can_write_record(p_collection, p_data)
  end;
$$;

create or replace function public.can_delete_record(p_collection text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and case p_collection
    when 'messages' then false
    when 'notifications' then p_data->>'userId' = auth.uid()::text
    when 'invoices' then public.has_action('delete_invoice')
    else public.can_write_record(p_collection, p_data)
  end;
$$;

create or replace function public.list_user_directory()
returns table (id uuid, prenom text, nom text, username text, role text, actif boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.prenom, p.nom, p.username, p.role, p.actif
  from public.profiles p
  where public.is_active_user() and p.actif
  order by p.nom, p.prenom, p.id;
$$;

create or replace function public.list_sales_catalog()
returns table (record_id text, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.record_id,
    case
      when public.has_action('manage_products')
        or public.has_action('manage_stock')
        or public.has_action('view_reports') then r.data
      else r.data - 'prixAchat'
    end
  from public.app_records r
  where r.collection = 'products'
    and public.is_active_user()
    and (
      public.has_action('create_invoice')
      or public.has_action('create_devis')
      or public.has_action('manage_products')
      or public.has_action('manage_stock')
      or public.has_action('view_reports')
    )
  order by r.record_id;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if exists (
    select 1 from public.bootstrap_lock b
    where b.singleton
      and not b.completed
      and coalesce(lower(new.email), '') <> b.reserved_email
  ) then
    raise exception 'Initial administrator setup is in progress';
  end if;

  if requested_username !~ '^[a-z0-9._-]{3,30}$' then
    requested_username := 'user_' || substring(replace(new.id::text, '-', '') from 1 for 25);
  end if;

  insert into public.profiles (id, email, prenom, nom, username, role, actif)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data->>'prenom', ''), 80),
    left(coalesce(new.raw_user_meta_data->>'nom', ''), 80),
    requested_username,
    'utilisateur',
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.touch_app_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_records_touch_updated_at
  before update on public.app_records
  for each row execute function public.touch_app_record();

create or replace function public.enforce_app_record_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection <> old.collection or new.record_id <> old.record_id then
    raise exception 'Record identity cannot be changed';
  end if;

  if old.collection = 'messages'
     and (
       old.data->>'destinataireId' <> auth.uid()::text
       or new.data - 'lu' is distinct from old.data - 'lu'
       or coalesce(jsonb_typeof(new.data->'lu'), 'null') not in ('boolean', 'null')
     ) then
    raise exception 'Only the recipient can mark a message as read';
  end if;

  if old.collection = 'notifications'
     and (
       (old.data->>'userId' <> auth.uid()::text and old.data->'userId' <> 'null'::jsonb)
       or new.data - 'lu' is distinct from old.data - 'lu'
       or coalesce(jsonb_typeof(new.data->'lu'), 'null') not in ('boolean', 'null')
     ) then
    raise exception 'Only the recipient can mark a notification as read';
  end if;

  if old.collection = 'products'
     and public.has_action('create_invoice')
     and not public.has_action('manage_products')
     and not public.has_action('manage_stock') then
    if new.data - 'stock' - 'prixAchat' is distinct from old.data - 'stock' - 'prixAchat'
       or coalesce(jsonb_typeof(new.data->'stock'), 'null') <> 'number'
       or (new.data->>'stock')::numeric < 0 then
      raise exception 'Invoice users can only update product stock';
    end if;
    new.data := (old.data - 'stock') || jsonb_build_object('stock', new.data->'stock');
  end if;

  return new;
end;
$$;

create trigger app_records_enforce_updates
  before update on public.app_records
  for each row execute function public.enforce_app_record_update();

create or replace function public.guard_role_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_actions text[] := array['manage_users', 'manage_roles', 'manage_company'];
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'Role identity cannot be changed';
  end if;
  if tg_op = 'INSERT' and new.is_system and not public.is_superadmin() then
    raise exception 'Only the SuperAdmin can create system roles';
  end if;
  if tg_op = 'INSERT' and new.id = 'ROLE_admin' and not public.is_superadmin() then
    raise exception 'Only the SuperAdmin can create the administrator role';
  end if;
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'System roles cannot be deleted'; end if;
    if exists (
      select 1 from public.profiles p
      where p.role in (old.id, replace(old.id, 'ROLE_', ''))
    ) then
      raise exception 'Role is still assigned to users';
    end if;
    return old;
  end if;

  if new.id <> 'ROLE_admin' and new.actions ?| reserved_actions then
    raise exception 'Administrative actions are reserved for the administrator role';
  end if;
  if tg_op = 'UPDATE' and old.id = 'ROLE_admin' and not public.is_superadmin() then
    raise exception 'Only the SuperAdmin can modify the administrator role';
  end if;
  if tg_op = 'UPDATE' and old.is_system and new.is_system is distinct from old.is_system then
    raise exception 'System role status cannot be changed';
  end if;
  if tg_op = 'UPDATE' and not old.is_system and new.is_system and not public.is_superadmin() then
    raise exception 'Only the SuperAdmin can create system roles';
  end if;
  return new;
end;
$$;

create trigger roles_guard_changes
  before insert or update or delete on public.roles
  for each row execute function public.guard_role_changes();

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.app_records enable row level security;
alter table public.bootstrap_lock enable row level security;

create policy roles_read_active on public.roles
  for select to authenticated using (public.is_active_user());
create policy roles_insert_admin on public.roles
  for insert to authenticated with check (public.is_admin());
create policy roles_update_admin on public.roles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy roles_delete_admin on public.roles
  for delete to authenticated using (public.is_admin());

create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated using (
    id = auth.uid() or (public.is_active_user() and public.is_admin())
  );

create policy app_records_read on public.app_records
  for select to authenticated using (public.can_read_record(collection, data));
create policy app_records_insert on public.app_records
  for insert to authenticated with check (public.can_write_record(collection, data));
create policy app_records_update on public.app_records
  for update to authenticated
  using (public.can_update_record(collection, data))
  with check (public.can_update_record(collection, data));
create policy app_records_delete on public.app_records
  for delete to authenticated using (public.can_delete_record(collection, data));

revoke all on public.bootstrap_lock from public, anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke execute on function public.list_user_directory() from public, anon;
revoke execute on function public.list_sales_catalog() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_superadmin() from public, anon;
revoke execute on function public.has_action(text) from public, anon;
revoke execute on function public.can_read_record(text, jsonb) from public, anon;
revoke execute on function public.can_write_record(text, jsonb) from public, anon;
revoke execute on function public.can_update_record(text, jsonb) from public, anon;
revoke execute on function public.can_delete_record(text, jsonb) from public, anon;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.roles, public.app_records to authenticated;
grant execute on function public.list_user_directory() to authenticated;
grant execute on function public.list_sales_catalog() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.has_action(text) to authenticated;
grant execute on function public.can_read_record(text, jsonb) to authenticated;
grant execute on function public.can_write_record(text, jsonb) to authenticated;
grant execute on function public.can_update_record(text, jsonb) to authenticated;
grant execute on function public.can_delete_record(text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_records'
  ) then
    alter publication supabase_realtime add table public.app_records;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'roles'
  ) then
    alter publication supabase_realtime add table public.roles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
