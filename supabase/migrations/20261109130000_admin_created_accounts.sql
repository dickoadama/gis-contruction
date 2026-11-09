drop table if exists public.admin_invitation_tokens;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  assigned_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('gis:first-superadmin-signup', 0));

  if not exists (select 1 from public.profiles)
     and not exists (select 1 from auth.users u where u.id <> new.id) then
    assigned_role := 'superadmin';
  elsif coalesce(new.raw_app_meta_data->>'gis_created_by_admin', 'false') = 'true' then
    assigned_role := 'utilisateur';
  else
    raise exception 'Public signups are closed. An administrator must create this account.';
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
    assigned_role,
    true
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;