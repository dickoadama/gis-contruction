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

  if new.invited_at is null and not exists (
    select 1 from public.bootstrap_lock b
    where b.singleton
      and not b.completed
      and coalesce(lower(new.email), '') = b.reserved_email
  ) then
    raise exception 'An administrator invitation is required to create an account';
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
