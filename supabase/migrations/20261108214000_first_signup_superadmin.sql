create or replace function public.is_initial_superadmin_signup_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles)
    and not exists (select 1 from auth.users);
$$;

revoke all on function public.is_initial_superadmin_signup_open() from public, anon, authenticated;
grant execute on function public.is_initial_superadmin_signup_open() to anon, authenticated;

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

  if new.invited_at is null then
    if exists (select 1 from public.profiles)
       or exists (select 1 from auth.users u where u.id <> new.id) then
      raise exception 'Public signups are closed. An administrator invitation is required.';
    end if;
    assigned_role := 'superadmin';
  else
    assigned_role := 'utilisateur';
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
