import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Connexion requise.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Configuration serveur incomplète.' }, 500);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Session invalide.' }, 401);

  const { data: caller, error: callerError } = await adminClient
    .from('users')
    .select('role, actif')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (callerError || !caller?.actif || !['admin', 'superadmin'].includes(caller.role)) {
    return json({ error: 'Accès réservé à un administrateur actif.' }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }

  if (input.action === 'create') {
    const prenom = String(input.prenom || '').trim();
    const nom = String(input.nom || '').trim();
    const username = String(input.username || '').trim().toLowerCase();
    const email = String(input.email || '').trim().toLowerCase();
    const telephone = String(input.telephone || '').trim().slice(0, 40);
    const role = String(input.role || 'utilisateur').replace(/^ROLE_/, '');
    if (!prenom || !nom || prenom.length > 80 || nom.length > 80) return json({ error: 'Prénom et nom requis (80 caractères maximum).' }, 400);
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Identifiant invalide (3 à 30 caractères).' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse e-mail invalide.' }, 400);
    if (role === 'superadmin' || (role === 'admin' && caller.role !== 'superadmin')) {
      return json({ error: 'Vous ne pouvez pas attribuer ce rôle.' }, 403);
    }

    const roleId = `ROLE_${role}`;
    const { data: roleRecord, error: roleError } = await adminClient
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .maybeSingle();
    if (roleError || !roleRecord) return json({ error: 'Rôle introuvable.' }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      email_confirm: false,
      user_metadata: { prenom, nom, username, telephone },
      app_metadata: { gis_managed: true, gis_role: role }
    });
    if (createError || !created.user) return json({ error: createError?.message || 'Impossible de créer le compte.' }, 400);

    const redirectTo = Deno.env.get('APP_URL');
    const { error: mailError } = await adminClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (mailError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: `Compte non créé : ${mailError.message}` }, 502);
    }
    return json({ id: created.user.id, message: 'Un lien sécurisé de définition du mot de passe a été envoyé.' });
  }

  if (input.action === 'delete') {
    const targetId = String(input.id || '');
    if (!targetId || targetId === authData.user.id) return json({ error: 'Compte cible invalide.' }, 400);
    const { data: target, error: targetError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', targetId)
      .maybeSingle();
    if (targetError || !target) return json({ error: 'Utilisateur introuvable.' }, 404);
    if (target.role === 'superadmin' || (target.role === 'admin' && caller.role !== 'superadmin')) {
      return json({ error: 'Vous ne pouvez pas supprimer ce compte.' }, 403);
    }
    const { error } = await adminClient.auth.admin.deleteUser(targetId);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  return json({ error: 'Action inconnue.' }, 400);
});