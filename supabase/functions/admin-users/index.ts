import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function requireProfile(data: Record<string, unknown>) {
  const prenom = String(data.prenom || '').trim();
  const nom = String(data.nom || '').trim();
  const username = String(data.username || '').trim().toLowerCase();
  const email = String(data.email || '').trim().toLowerCase();
  const telephone = String(data.telephone || '').trim().slice(0, 40);
  if (!prenom || !nom || prenom.length > 80 || nom.length > 80) {
    throw new RequestError(400, 'Le prénom et le nom sont requis (80 caractères maximum).');
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new RequestError(400, 'Identifiant invalide.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new RequestError(400, 'Adresse e-mail invalide.');
  }
  return { prenom, nom, username, email, telephone };
}

class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeRole(role: string) {
  const shortRole = role.replace(/^ROLE_/, '');
  if (['admin', 'utilisateur', 'tresorier', 'gestionnaire_stock', 'commerciale'].includes(shortRole)) {
    return shortRole;
  }
  return role.startsWith('ROLE_') ? role : `ROLE_${role}`;
}

function roleId(role: string) {
  return role.startsWith('ROLE_') ? role : `ROLE_${role}`;
}

function getInvitationRedirect(redirectTo: unknown, origin: string | null) {
  if (!origin || typeof redirectTo !== 'string') {
    throw new RequestError(400, 'Adresse de retour de l’invitation invalide.');
  }
  try {
    const requestOrigin = new URL(origin);
    const redirectUrl = new URL(redirectTo);
    const isLocalHttp = requestOrigin.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(requestOrigin.hostname);
    if (
      redirectUrl.origin !== requestOrigin.origin
      || (requestOrigin.protocol !== 'https:' && !isLocalHttp)
    ) {
      throw new RequestError(400, 'Adresse de retour de l’invitation non autorisée.');
    }
    return redirectUrl.toString();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'Adresse de retour de l’invitation invalide.');
  }
}

async function getCaller(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new RequestError(401, 'Connexion requise.');
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) throw new RequestError(401, 'Session invalide.');
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, actif')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || !profile.actif) throw new RequestError(403, 'Compte inactif ou profil introuvable.');
  return { authUser: data.user, profile };
}

function requireAdmin(role: string) {
  if (!['admin', 'superadmin'].includes(role)) {
    throw new RequestError(403, 'Accès réservé à un administrateur.');
  }
}

async function requireRoleExists(role: string) {
  if (role === 'superadmin') throw new RequestError(403, 'Le rôle SuperAdmin ne peut pas être attribué.');
  const { data, error } = await adminClient
    .from('roles')
    .select('id')
    .eq('id', roleId(role))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError(400, 'Rôle introuvable.');
}

async function createUser(data: Record<string, unknown>, callerRole: string, origin: string | null) {
  requireAdmin(callerRole);
  const profile = requireProfile(data);
  const requestedRole = String(data.role || 'utilisateur');
  const role = normalizeRole(requestedRole);
  if (role === 'superadmin') throw new RequestError(403, 'Le rôle SuperAdmin ne peut pas être attribué.');
  if (role === 'admin' && callerRole !== 'superadmin') {
    throw new RequestError(403, 'Seul le SuperAdmin peut attribuer le rôle Administrateur.');
  }
  await requireRoleExists(role);

  const redirectTo = getInvitationRedirect(data.redirectTo, origin);
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo,
    data: {
      prenom: profile.prenom,
      nom: profile.nom,
      username: profile.username
    }
  });
  if (inviteError) throw inviteError;
  if (!invited.user) throw new Error('Supabase n’a pas retourné le compte invité.');

  const { data: savedProfile, error: saveError } = await adminClient
    .from('profiles')
    .update({
      telephone: profile.telephone,
      role,
      actif: true
    })
    .eq('id', invited.user.id)
    .select('*')
    .single();
  if (saveError) {
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(invited.user.id);
    if (deleteError) console.error('Invitation cleanup failed:', deleteError);
    throw saveError;
  }
  return { user: savedProfile };
}

async function updateUser(data: Record<string, unknown>, callerId: string, callerRole: string) {
  const userId = String(data.uid || '');
  if (!userId) throw new RequestError(400, 'Utilisateur introuvable.');
  const isSelf = callerId === userId;
  if (!isSelf) requireAdmin(callerRole);

  const { data: existing, error: loadError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!existing) throw new RequestError(404, 'Utilisateur introuvable.');
  if (!isSelf && existing.role === 'superadmin') {
    throw new RequestError(403, 'Vous ne pouvez pas modifier le compte SuperAdmin.');
  }
  if (existing.role === 'admin' && callerRole !== 'superadmin' && !isSelf) {
    throw new RequestError(403, 'Seul le SuperAdmin peut modifier un administrateur.');
  }

  const updates: Record<string, unknown> = {};
  for (const field of ['prenom', 'nom', 'telephone']) {
    if (data[field] !== undefined) updates[field] = String(data[field]).trim().slice(0, field === 'telephone' ? 40 : 80);
  }
  if (data.username !== undefined && data.username !== existing.username) {
    const username = String(data.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new RequestError(400, 'Identifiant invalide.');
    const { data: usernameOwner, error: usernameError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', userId)
      .maybeSingle();
    if (usernameError) throw usernameError;
    if (usernameOwner) throw new RequestError(409, 'Cet identifiant est déjà utilisé.');
    updates.username = username;
  }
  if (data.role !== undefined && data.role !== existing.role) {
    const role = normalizeRole(String(data.role));
    if (
      isSelf ||
      !['admin', 'superadmin'].includes(callerRole) ||
      (existing.role === 'admin' && callerRole !== 'superadmin') ||
      (role === 'admin' && callerRole !== 'superadmin') ||
      role === 'superadmin' ||
      existing.role === 'superadmin'
    ) {
      throw new RequestError(403, 'Vous ne pouvez pas attribuer ce rôle.');
    }
    await requireRoleExists(role);
    updates.role = role;
  }

  let updatedEmail: string | null = null;
  if (data.email !== undefined && String(data.email).trim().toLowerCase() !== existing.email) {
    if (!['admin', 'superadmin'].includes(callerRole)) {
      throw new RequestError(403, 'Seul un administrateur peut modifier l’adresse de connexion.');
    }
    updatedEmail = String(data.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedEmail)) {
      throw new RequestError(400, 'Adresse e-mail invalide.');
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      email: updatedEmail,
      email_confirm: true
    });
    if (error) throw error;
    updates.email = updatedEmail;
  }

  if (Object.keys(updates).length === 0) return { user: existing };
  const { data: savedProfile, error: saveError } = await adminClient
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single();
  if (saveError) {
    if (updatedEmail) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(userId, {
        email: existing.email,
        email_confirm: true
      });
      if (rollbackError) console.error('Email update rollback failed:', rollbackError);
    }
    throw saveError;
  }
  return { user: savedProfile };
}

async function setUserActive(data: Record<string, unknown>, callerId: string, callerRole: string) {
  requireAdmin(callerRole);
  const userId = String(data.uid || '');
  if (!userId || userId === callerId) {
    throw new RequestError(400, 'Un administrateur ne peut pas désactiver son propre compte.');
  }
  if (typeof data.actif !== 'boolean') throw new RequestError(400, 'Statut de compte invalide.');
  const { data: target, error: loadError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!target) throw new RequestError(404, 'Utilisateur introuvable.');
  if (target.role === 'superadmin' || (target.role === 'admin' && callerRole !== 'superadmin')) {
    throw new RequestError(403, 'Vous ne pouvez pas modifier ce compte administrateur.');
  }
  const { data: savedProfile, error } = await adminClient
    .from('profiles')
    .update({ actif: data.actif })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return { user: savedProfile };
}

async function deleteUser(data: Record<string, unknown>, callerId: string, callerRole: string) {
  requireAdmin(callerRole);
  const userId = String(data.uid || '');
  if (!userId || userId === callerId) {
    throw new RequestError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  }
  const { data: target, error: loadError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!target) throw new RequestError(404, 'Utilisateur introuvable.');
  if (target.role === 'superadmin' || (target.role === 'admin' && callerRole !== 'superadmin')) {
    throw new RequestError(403, 'Vous ne pouvez pas supprimer ce compte administrateur.');
  }
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw error;
  return { uid: userId };
}

async function purgeBusinessData(callerRole: string) {
  if (callerRole !== 'superadmin') throw new RequestError(403, 'Accès réservé au SuperAdmin.');
  const { count, error } = await adminClient
    .from('app_records')
    .delete({ count: 'exact' })
    .not('record_id', 'is', null);
  if (error) throw error;
  return { deletedCount: count || 0 };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Méthode non autorisée.' }, 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');

    const { authUser, profile } = await getCaller(request);
    switch (action) {
      case 'invite_user':
        return respond(await createUser(body, profile.role, request.headers.get('origin')));
      case 'update_user':
        return respond(await updateUser(body, authUser.id, profile.role));
      case 'set_user_active':
        return respond(await setUserActive(body, authUser.id, profile.role));
      case 'delete_user':
        return respond(await deleteUser(body, authUser.id, profile.role));
      case 'purge_business_data':
        return respond(await purgeBusinessData(profile.role));
      default:
        return respond({ error: 'Action inconnue.' }, 400);
    }
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    console.error('admin-users failed:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne.';
    return respond({ error: message }, status);
  }
});
