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
    when 'caisse_ops' then
      public.has_action('view_caisse')
      or (
        (public.has_action('create_invoice') or public.has_action('delete_invoice'))
        and nullif(p_data->>'factureId', '') is not null
      )
    else false
  end;
$$;

create or replace function public.enforce_caisse_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and old.collection = 'caisse_ops' then
    if public.has_action('view_caisse') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
    raise exception 'La gestion des opérations de caisse est réservée aux utilisateurs autorisés';
  end if;

  if tg_op = 'INSERT' and new.collection = 'caisse_ops'
     and not public.has_action('view_caisse') then
    if nullif(new.data->>'factureId', '') is null
       or not (
         (public.has_action('create_invoice') and new.data->>'type' = 'encaissement')
         or (
           public.has_action('delete_invoice')
           and new.data->>'type' in ('encaissement', 'decaissement')
         )
       ) then
      raise exception 'Opération de caisse non autorisée pour ce rôle';
    end if;
    if not exists (
      select 1
      from public.app_records invoice
      where invoice.collection = 'invoices'
        and invoice.record_id = new.data->>'factureId'
        and invoice.data->>'modePaiement' = new.data->>'modePaiement'
        and invoice.data->>'montantPaye' = new.data->>'montant'
    ) then
      raise exception 'L’opération de caisse doit correspondre à une facture existante';
    end if;
  end if;

  return new;
end;
$$;

create trigger app_records_enforce_caisse_permissions
  before insert or update or delete on public.app_records
  for each row execute function public.enforce_caisse_permissions();
