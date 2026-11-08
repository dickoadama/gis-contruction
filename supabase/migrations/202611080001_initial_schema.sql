create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'utilisateur',
  actif boolean not null default false,
  data jsonb not null default '{}'::jsonb
);

create unique index if not exists users_username_unique
  on public.users (lower(data->>'username'))
  where data ? 'username';

create table if not exists public.roles (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

do $$
declare
  collection text;
begin
  foreach collection in array array[
    'products', 'clients', 'invoices', 'devis', 'stock_entries',
    'fournisseurs', 'caisse_ops', 'messages', 'notifications'
  ] loop
    execute format(
      'create table if not exists public.%I (id text primary key, data jsonb not null default ''{}''::jsonb)',
      collection
    );
  end loop;
end;
$$;

create or replace function public.current_role()
returns text
language sql stable security definer
set search_path = public, auth
as $$
  select role from public.users where id = auth.uid() and actif = true
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select exists (select 1 from public.users where id = auth.uid() and actif = true)
$$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.current_role() = 'superadmin'
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.current_role() in ('admin', 'superadmin')
$$;

create or replace function public.can_action(action_name text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select case
    when not public.is_active_user() then false
    when public.is_admin() then true
    else exists (
      select 1
      from public.roles r
      where r.id = case
        when public.current_role() like 'ROLE_%' then public.current_role()
        else 'ROLE_' || public.current_role()
      end
      and coalesce(r.data->'actions', '[]'::jsonb) ? action_name
    )
  end
$$;

create or replace function public.can_read_collection(collection_name text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.is_admin() or case collection_name
    when 'products' then public.can_action('manage_products') or public.can_action('manage_stock') or public.can_action('create_invoice')
    when 'stock_entries' then public.can_action('manage_stock')
    when 'fournisseurs' then public.can_action('manage_stock')
    when 'invoices' then public.can_action('create_invoice') or public.can_action('delete_invoice') or public.can_action('view_reports')
    when 'devis' then public.can_action('create_devis')
    when 'clients' then public.can_action('create_invoice') or public.can_action('create_devis')
    when 'caisse_ops' then public.can_action('view_caisse')
    else false
  end
$$;

create or replace function public.can_insert_collection(collection_name text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.is_admin() or case collection_name
    when 'products' then public.can_action('manage_products') or public.can_action('manage_stock')
    when 'stock_entries' then public.can_action('manage_stock')
    when 'fournisseurs' then public.can_action('manage_stock')
    when 'invoices' then public.can_action('create_invoice')
    when 'devis' then public.can_action('create_devis')
    when 'clients' then public.can_action('create_invoice') or public.can_action('create_devis')
    when 'caisse_ops' then public.can_action('view_caisse') or public.can_action('create_invoice')
    else false
  end
$$;

create or replace function public.can_update_collection(collection_name text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.is_admin() or case collection_name
    when 'products' then public.can_action('manage_products') or public.can_action('manage_stock') or public.can_action('create_invoice')
    when 'stock_entries' then public.can_action('manage_stock')
    when 'fournisseurs' then public.can_action('manage_stock')
    when 'invoices' then public.can_action('delete_invoice')
    when 'devis' then public.can_action('create_devis')
    when 'clients' then public.can_action('create_invoice') or public.can_action('create_devis')
    when 'caisse_ops' then public.can_action('view_caisse') or public.can_action('create_invoice')
    else false
  end
$$;

create or replace function public.can_delete_collection(collection_name text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.is_admin() or case collection_name
    when 'products' then public.can_action('manage_products') or public.can_action('manage_stock')
    when 'stock_entries' then public.can_action('manage_stock')
    when 'fournisseurs' then public.can_action('manage_stock')
    when 'invoices' then public.can_action('delete_invoice')
    when 'devis' then public.can_action('create_devis')
    when 'clients' then public.can_action('create_invoice') or public.can_action('create_devis')
    when 'caisse_ops' then public.can_action('view_caisse') or public.can_action('create_invoice')
    else false
  end
$$;

create or replace function public.guard_product_update()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not public.can_action('manage_products') and not public.can_action('manage_stock')
     and (old.data - 'stock') is distinct from (new.data - 'stock') then
    raise exception 'Modification de produit non autorisée';
  end if;
  return new;
end;
$$;

create or replace function public.guard_read_state_update()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if (old.data - 'lu') is distinct from (new.data - 'lu') then
    raise exception 'Seul le statut de lecture peut être modifié';
  end if;
  return new;
end;
$$;

create or replace function public.guard_user_profile_update()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if old.data->>'email' is distinct from new.data->>'email' then
    raise exception 'L’adresse e-mail doit être modifiée depuis le flux d’authentification';
  end if;
  if lower(trim(coalesce(new.data->>'username', ''))) !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Identifiant invalide (3 à 30 caractères)';
  end if;
  return new;
end;
$$;

drop trigger if exists users_profile_update_guard on public.users;
create trigger users_profile_update_guard
before update on public.users
for each row execute function public.guard_user_profile_update();

drop trigger if exists messages_update_guard on public.messages;
create trigger messages_update_guard
before update on public.messages
for each row execute function public.guard_read_state_update();

drop trigger if exists notifications_update_guard on public.notifications;
create trigger notifications_update_guard
before update on public.notifications
for each row execute function public.guard_read_state_update();

drop trigger if exists products_update_guard on public.products;
create trigger products_update_guard
before update on public.products
for each row execute function public.guard_product_update();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
declare
  managed boolean := coalesce(new.raw_app_meta_data->>'gis_managed' = 'true', false);
  assigned_role text := coalesce(new.raw_app_meta_data->>'gis_role', 'utilisateur');
  profile_username text := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  profile_prenom text := trim(coalesce(new.raw_user_meta_data->>'prenom', ''));
  profile_nom text := trim(coalesce(new.raw_user_meta_data->>'nom', ''));
begin
  if profile_prenom = '' or length(profile_prenom) > 80 or profile_nom = '' or length(profile_nom) > 80 then
    raise exception 'Le prénom et le nom sont requis (80 caractères maximum)';
  end if;
  if profile_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Identifiant invalide (3 à 30 caractères)';
  end if;
  if not managed or assigned_role = 'superadmin' then
    assigned_role := 'utilisateur';
    managed := false;
  end if;

  insert into public.users (id, role, actif, data)
  values (
    new.id,
    assigned_role,
    managed,
    jsonb_build_object(
      'prenom', coalesce(new.raw_user_meta_data->>'prenom', ''),
      'nom', coalesce(new.raw_user_meta_data->>'nom', ''),
      'username', lower(coalesce(new.raw_user_meta_data->>'username', '')),
      'telephone', coalesce(new.raw_user_meta_data->>'telephone', ''),
      'email', coalesce(new.email, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.users enable row level security;
alter table public.roles enable row level security;

create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy users_update on public.users
  for update to authenticated
  using (
    public.is_active_user() and (
      id = auth.uid() or public.is_superadmin() or
      (public.is_admin() and role not in ('admin', 'superadmin', 'ROLE_admin', 'ROLE_superadmin'))
    )
  )
  with check (
    (id = auth.uid() and role = public.current_role() and actif = true) or
    (public.is_superadmin() and id <> auth.uid() and role not in ('superadmin', 'ROLE_superadmin')) or
    (public.is_admin() and not public.is_superadmin() and id <> auth.uid() and role not in ('admin', 'superadmin', 'ROLE_admin', 'ROLE_superadmin'))
  );

create policy users_delete on public.users
  for delete to authenticated
  using (public.is_superadmin() and id <> auth.uid() and role not in ('superadmin', 'ROLE_superadmin'));

create policy roles_read on public.roles
  for select to authenticated
  using (public.is_active_user());

create policy roles_insert on public.roles
  for insert to authenticated
  with check (public.is_admin());

create policy roles_update on public.roles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy roles_delete on public.roles
  for delete to authenticated
  using (public.is_admin());

do $$
declare
  collection text;
begin
  foreach collection in array array[
    'products', 'clients', 'invoices', 'devis', 'stock_entries', 'fournisseurs', 'caisse_ops'
  ] loop
    execute format('alter table public.%I enable row level security', collection);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_read_collection(%L))',
      collection || '_read', collection, collection
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_insert_collection(%L))',
      collection || '_insert', collection, collection
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_update_collection(%L)) with check (public.can_update_collection(%L))',
      collection || '_update', collection, collection, collection
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_delete_collection(%L))',
      collection || '_delete', collection, collection
    );
  end loop;
end;
$$;

alter table public.messages enable row level security;
create policy messages_read on public.messages
  for select to authenticated
  using (public.is_active_user() and (data->>'expediteurId' = auth.uid()::text or data->>'destinataireId' = auth.uid()::text));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_active_user() and data->>'expediteurId' = auth.uid()::text and data->>'destinataireId' is not null);
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_active_user() and data->>'destinataireId' = auth.uid()::text)
  with check (public.is_active_user() and data->>'destinataireId' = auth.uid()::text);
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_superadmin());

alter table public.notifications enable row level security;
create policy notifications_read on public.notifications
  for select to authenticated
  using (public.is_active_user() and (data->>'userId' = auth.uid()::text or data->'userId' = 'null'::jsonb));
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    public.is_active_user() and (
      data->>'userId' = auth.uid()::text or
      (data->'userId' = 'null'::jsonb and (public.is_admin() or public.can_action('manage_stock') or public.can_action('create_invoice'))) or
      (data->>'senderId' = auth.uid()::text and data->>'userId' is not null)
    )
  );
create policy notifications_update on public.notifications
  for update to authenticated
  using (public.is_active_user() and (data->>'userId' = auth.uid()::text or data->'userId' = 'null'::jsonb))
  with check (public.is_active_user() and (data->>'userId' = auth.uid()::text or data->'userId' = 'null'::jsonb));
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (public.is_active_user() and (data->>'userId' = auth.uid()::text or public.is_superadmin()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.users, public.roles, public.products, public.clients, public.invoices,
  public.devis, public.stock_entries, public.fournisseurs, public.caisse_ops,
  public.messages, public.notifications
to authenticated;

insert into public.roles (id, data) values
('ROLE_utilisateur', '{"nom":"Utilisateur","icon":"👤","color":"#9aaec4","description":"Accès au profil et aux notifications. Un administrateur doit lui attribuer un rôle métier.","isSystem":true,"pages":["profil","notifications"],"actions":[]}'),
('ROLE_admin', '{"nom":"Administrateur","icon":"👑","color":"#6C63FF","description":"Gère l’équipe, attribue les rôles métier et pilote les activités de l’entreprise.","isSystem":true,"pages":["dashboard","produits","stock","inventaire","entrees_stock","factures","devis","caisse","clients","fournisseurs","rapports","messages","notifications","panier","profil","parametres","utilisateurs","roles","archives"],"actions":["create_invoice","delete_invoice","create_devis","manage_stock","manage_users","manage_roles","view_caisse","manage_products","view_reports","manage_company"]}'),
('ROLE_chauffeur', '{"nom":"Chauffeur","icon":"🚚","color":"#00A8A8","description":"Consulte ses informations et les notifications liées aux livraisons. Aucun accès aux données financières.","isSystem":true,"pages":["dashboard","messages","notifications","profil"],"actions":[]}'),
('ROLE_chargeur', '{"nom":"Chargeur","icon":"📦","color":"#E58E26","description":"Prépare les commandes et suit les mouvements de stock. N’accède ni à la caisse ni aux paramètres.","isSystem":true,"pages":["dashboard","produits","stock","entrees_stock","inventaire","messages","notifications","profil"],"actions":["manage_stock"]}'),
('ROLE_caisse', '{"nom":"Caisse","icon":"💰","color":"#008F6B","description":"Enregistre les ventes et les règlements, consulte la caisse et les informations clients utiles.","isSystem":true,"pages":["dashboard","factures","devis","archives","caisse","clients","messages","notifications","panier","profil"],"actions":["create_invoice","create_devis","view_caisse"]}'),
('ROLE_gestionnaire_stock', '{"nom":"Gestionnaire de stock","icon":"📦","color":"#FFA502","description":"Gère les produits, réceptions, inventaires, fournisseurs et alertes de réapprovisionnement.","isSystem":true,"pages":["dashboard","produits","stock","inventaire","entrees_stock","fournisseurs","messages","notifications","profil"],"actions":["manage_stock","manage_products","view_reports"]}')
on conflict (id) do update set data = excluded.data;

do $$
declare
  collection text;
begin
  foreach collection in array array[
    'users', 'roles', 'products', 'clients', 'invoices', 'devis',
    'stock_entries', 'fournisseurs', 'caisse_ops', 'messages', 'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = collection
    ) then
      execute format('alter publication supabase_realtime add table public.%I', collection);
    end if;
  end loop;
end;
$$;