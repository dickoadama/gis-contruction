/**
 * GIS - Module: Authentification & Permissions
 * Architecture: SuperAdmin > Admin > Rôles personnalisés > Utilisateur simple
 */
'use strict';

// ═══════════════════════════════════════════════════════════
// PAGES & ACTIONS DISPONIBLES (utilisées par l'éditeur de rôles)
// ═══════════════════════════════════════════════════════════
const ALL_PAGES = [
  { id: 'dashboard',      label: 'Tableau de bord',    icon: '📊' },
  { id: 'factures',       label: 'Factures',           icon: '🧾' },
  { id: 'devis',          label: 'Devis',              icon: '📋' },
  { id: 'clients',        label: 'Clients',            icon: '👥' },
  { id: 'panier',         label: 'Panier',             icon: '🛒' },
  { id: 'caisse',         label: 'Caisse',             icon: '💰' },
  { id: 'produits',       label: 'Produits',           icon: '🏗️' },
  { id: 'stock',          label: 'État du Stock',      icon: '📦' },
  { id: 'entrees_stock',  label: 'Entrées de Stock',   icon: '📥' },
  { id: 'inventaire',     label: 'Inventaire',         icon: '🔍' },
  { id: 'fournisseurs',   label: 'Fournisseurs',       icon: '🏭' },
  { id: 'rapports',       label: 'Rapports',           icon: '📈' },
  { id: 'messages',       label: 'Messages',           icon: '✉️'  },
  { id: 'notifications',  label: 'Notifications',      icon: '🔔' },
  { id: 'profil',         label: 'Mon Profil',         icon: '🪪' },
  { id: 'parametres',     label: 'Paramètres',         icon: '⚙️'  },
  { id: 'utilisateurs',   label: 'Utilisateurs',       icon: '👤' },
  { id: 'roles',          label: 'Rôles & Droits',     icon: '🔐' },
  { id: 'archives',       label: 'Archives',           icon: '🗄️' },
];

const ALL_ACTIONS = [
  { id: 'create_invoice',  label: 'Créer des factures' },
  { id: 'delete_invoice',  label: 'Annuler des factures' },
  { id: 'create_devis',    label: 'Créer des devis' },
  { id: 'manage_stock',    label: 'Gérer le stock' },
  { id: 'manage_users',    label: 'Gérer les utilisateurs' },
  { id: 'manage_roles',    label: 'Gérer les rôles' },
  { id: 'view_caisse',     label: 'Voir la caisse' },
  { id: 'manage_products', label: 'Gérer les produits' },
  { id: 'view_reports',    label: 'Voir les rapports' },
  { id: 'manage_company',  label: 'Gérer les paramètres entreprise' },
];

// ═══════════════════════════════════════════════════════════
// AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════
async function invokeAdmin(action, payload = {}) {
  if (!supabaseClient) throw new Error('Configuration Supabase manquante.');
  const { data, error } = await supabaseClient.functions.invoke('admin-users', {
    body: { action, ...payload }
  });
  if (error) {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      throw new Error(body.error || error.message);
    }
    throw error;
  }
  return data;
}

const Auth = {
  _currentUser: null,

  async restoreSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) { this._currentUser = null; return null; }
    const profile = await this._loadProfile(user);
    if (!profile) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
    }
    return profile;
  },

  async login(email, password) {
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user.email_confirmed_at) {
        await supabaseClient.auth.signOut();
        return { success: false, error: 'Confirmez votre adresse e-mail avant de vous connecter.' };
      }
      const profile = await this._loadProfile(data.user);
      if (!profile) {
        await supabaseClient.auth.signOut();
        return { success: false, error: 'Compte inactif ou profil introuvable. Contactez un administrateur.' };
      }
      return { success: true, user: this._currentUser };
    } catch (error) {
      console.error('[GIS] Supabase Authentication failed:', error);
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) console.error('[GIS] Could not clear failed sign-in session:', signOutError);
      return { success: false, error: this._authError(error) };
    }
  },

  async register(data) {
    const { data: result, error } = await supabaseClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: window.location.href.split('#')[0],
        data: { prenom: data.prenom, nom: data.nom, username: data.username }
      }
    });
    if (error) throw error;
    if (result.session) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
    }
    return { success: true };
  },

  async bootstrap(data) {
    await invokeAdmin('bootstrap_admin', data);
    return this.login(data.email, data.password);
  },

  async sendPasswordReset(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split('#')[0]
    });
    if (error) throw error;
  },

  async _loadProfile(user) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.actif !== true) {
        this._currentUser = null;
        return null;
      }
      this._currentUser = profileFromRow(data);
      return this._currentUser;
    } catch (error) {
      this._currentUser = null;
      throw error;
    }
  },

  async refreshProfile() {
    const user = this._currentUser;
    if (!user) return;
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.actif !== true) {
        await this.logout();
        return;
      }
      const profile = profileFromRow(data);
      if (profile.role !== user.role) {
        this._currentUser = profile;
        window.location.reload();
        return;
      }
      this._currentUser = profile;
    } catch (error) {
      console.error('[GIS] Supabase profile refresh failed:', error);
      if (window.App) window.App.showToast('Impossible de vérifier les droits du compte.', 'error');
    }
  },

  _authError(error) {
    const messages = {
      invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
      email_not_confirmed: 'Confirmez votre adresse e-mail avant de vous connecter.',
      user_already_exists: 'Cette adresse e-mail est déjà utilisée.',
      weak_password: 'Le mot de passe doit comporter au moins 12 caractères.',
      over_email_send_rate_limit: 'Trop de tentatives. Réessayez plus tard.',
      fetch_failed: 'Connexion impossible. Vérifiez votre accès Internet.'
    };
    return messages[error.code] || error.message || 'Échec de l’authentification.';
  },

  async logout() {
    DB.stopCloud();
    this._currentUser = null;
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    window.location.reload();
  },

  getSession() {
    return this._currentUser
      ? { userId: this._currentUser.id, role: this._currentUser.role }
      : null;
  },

  getCurrentUser() { return this._currentUser; },

  isLoggedIn() { return !!this._currentUser; },

  isSuperAdmin() {
    const user = this.getCurrentUser();
    return !!(user && user.role === 'superadmin');
  },

  isAdmin() {
    const user = this.getCurrentUser();
    return !!(user && ['admin', 'superadmin'].includes(user.role));
  },

  // Résolution des permissions depuis la table Supabase 'roles'
  _getRolePerms(roleId) {
    if (roleId === 'superadmin') {
      // Accès total : toutes les pages/actions connues, PLUS tout ce qui est
      // accordé à l'Admin ou à un rôle personnalisé (héritage garantissant
      // que le SuperAdmin n'est jamais moins privilégié qu'un autre rôle).
      const pages = new Set([...ALL_PAGES.map(p => p.id), 'superadmin']);
      const actions = new Set(ALL_ACTIONS.map(a => a.id));
      DB.getAll('roles').forEach(r => {
        (r.pages || []).forEach(p => pages.add(p));
        (r.actions || []).forEach(a => actions.add(a));
      });
      return { pages: [...pages], actions: [...actions] };
    }
    if (roleId === 'admin') {
      const adminRole = DB.findById('roles', 'ROLE_admin');
      return { pages: adminRole?.pages || [], actions: adminRole?.actions || [] };
    }
    const roles = DB.getAll('roles');
    // Essai 1 : correspondance exacte (ex: custom roles ont leur ID complet)
    let roleObj = roles.find(r => r.id === roleId);
    // Essai 2 : rôles système stockés par leur clé courte (ex: user.role = 'tresorier')
    if (!roleObj) roleObj = roles.find(r => r.id === 'ROLE_' + roleId);
    if (roleObj) return { pages: roleObj.pages || [], actions: roleObj.actions || [] };
    // Défaut minimal
    return { pages: ['profil', 'notifications'], actions: [] };
  },

  hasPage(page) {
    const user = this.getCurrentUser();
    if (!user) return false;
    return this._getRolePerms(user.role).pages.includes(page);
  },

  canDo(action) {
    const user = this.getCurrentUser();
    if (!user) return false;
    return this._getRolePerms(user.role).actions.includes(action);
  },

  getRoleInfo(roleId) {
    if (roleId === 'superadmin') return { label: 'SuperAdmin', color: '#FF4757', icon: '🔑' };
    if (roleId === 'admin')      return { label: 'Administrateur', color: '#6C63FF', icon: '👑' };
    const roles = DB.getAll('roles');
    let roleObj = roles.find(r => r.id === roleId);
    if (!roleObj) roleObj = roles.find(r => r.id === 'ROLE_' + roleId);
    if (roleObj) return { label: roleObj.nom, color: roleObj.color, icon: roleObj.icon };
    return { label: roleId, color: '#666', icon: '👤' };
  },

  getNavItems() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const allNav = [
      { page: 'superadmin',    icon: '🔑', label: 'Console SuperAdmin',  group: 'superadmin' },
      { page: 'dashboard',     icon: '📊', label: 'Tableau de bord',      group: 'principal' },
      { page: 'factures',      icon: '🧾', label: 'Factures',             group: 'commercial' },
      { page: 'devis',         icon: '📋', label: 'Devis',                group: 'commercial' },
      { page: 'archives',      icon: '🗄️', label: 'Archives',             group: 'commercial' },
      { page: 'clients',       icon: '👥', label: 'Clients',              group: 'commercial' },
      { page: 'caisse',        icon: '💰', label: 'Caisse',               group: 'finance' },
      { page: 'produits',      icon: '🏗️', label: 'Produits',             group: 'stock' },
      { page: 'fournisseurs',  icon: '🏭', label: 'Fournisseurs',         group: 'stock' },
      { page: 'entrees_stock', icon: '📥', label: 'Entrées de Stock',     group: 'stock' },
      { page: 'stock',         icon: '📦', label: 'État du Stock',        group: 'stock' },
      { page: 'inventaire',    icon: '🔍', label: 'Inventaire',           group: 'stock' },
      { page: 'rapports',      icon: '📈', label: 'Rapports',             group: 'admin' },
      { page: 'messages',      icon: '✉️',  label: 'Messages',             group: 'communication' },
      { page: 'notifications', icon: '🔔', label: 'Notifications',        group: 'communication' },
      { page: 'panier',        icon: '🛒', label: 'Panier',               group: 'commercial' },
      { page: 'utilisateurs',  icon: '👤', label: 'Utilisateurs',         group: 'admin' },
      { page: 'roles',         icon: '🔐', label: 'Rôles & Droits',       group: 'admin' },
      { page: 'parametres',    icon: '⚙️',  label: 'Paramètres',           group: 'admin' },
      { page: 'profil',        icon: '🪪', label: 'Mon Profil',           group: 'compte' }
    ];
    return allNav.filter(n => this.hasPage(n.page));
  }
};

// ═══════════════════════════════════════════════════════════
// GESTION DES UTILISATEURS
// ═══════════════════════════════════════════════════════════
const UserManager = {
  getAll() { return DB.getAll('users'); },

  async create(data) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    try {
      const result = await invokeAdmin('create_user', {
        prenom: data.prenom,
        nom: data.nom,
        username: data.username,
        email: data.email,
        telephone: data.telephone || '',
        role: data.role || 'utilisateur'
      });
      try {
        await Auth.sendPasswordReset(data.email);
        return { success: true, user: { id: result.user.id, ...data, actif: true } };
      } catch (error) {
        console.error('[GIS] User created but password setup email failed:', error);
        return {
          success: true,
          user: { id: result.user.id, ...data, actif: true },
          warning: 'Compte créé, mais l’envoi du lien a échoué. Utilisez « Réinitialiser le mot de passe » pour le renvoyer.'
        };
      }
    } catch (error) {
      console.error('[GIS] User provisioning failed:', error);
      return { success: false, error: error.message || 'Impossible de créer le compte.' };
    }
  },

  async update(id, data) {
    const currentUser = Auth.getCurrentUser();
    if (!Auth.isAdmin() && currentUser?.id !== id) return { success: false, error: 'Accès refusé.' };
    try {
      const result = await invokeAdmin('update_user', { uid: id, ...data });
      const user = profileFromRow(result.user);
      const index = window.GIS_STATE.users.findIndex(item => item.id === id);
      if (index >= 0) window.GIS_STATE.users[index] = user;
      if (currentUser.id === id) Auth._currentUser = user;
      return { success: true, user };
    } catch (error) {
      console.error('[GIS] User profile update failed:', error);
      return { success: false, error: error.message || 'Impossible de modifier le profil.' };
    }
  },

  async changePassword(id, oldPass, newPass) {
    const user = Auth.getCurrentUser();
    if (!user || user.id !== id) return { success: false, error: 'Accès refusé.' };
    if (!newPass || newPass.length < 12) return { success: false, error: 'Le nouveau mot de passe doit comporter au moins 12 caractères.' };
    try {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: user.email,
        password: oldPass
      });
      if (signInError) throw signInError;
      const { error } = await supabaseClient.auth.updateUser({ password: newPass });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[GIS] Password update failed:', error);
      return { success: false, error: Auth._authError(error) };
    }
  },

  async toggleActive(id) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    const user = DB.findById('users', id);
    if (!user) return { success: false, error: 'Utilisateur introuvable.' };
    try {
      const result = await invokeAdmin('set_user_active', { uid: id, actif: !user.actif });
      const index = window.GIS_STATE.users.findIndex(item => item.id === id);
      if (index >= 0) window.GIS_STATE.users[index] = profileFromRow(result.user);
      return { success: true };
    } catch (error) {
      console.error('[GIS] User status update failed:', error);
      return { success: false, error: error.message || 'Impossible de modifier le statut.' };
    }
  },

  async delete(id) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    try {
      await invokeAdmin('delete_user', { uid: id });
      window.GIS_STATE.users = window.GIS_STATE.users.filter(user => user.id !== id);
      return { success: true };
    } catch (error) {
      console.error('[GIS] User deletion failed:', error);
      return { success: false, error: error.message || 'Impossible de supprimer le compte.' };
    }
  }
};

// ═══════════════════════════════════════════════════════════
// GESTION DES RÔLES (Admin seulement)
// ═══════════════════════════════════════════════════════════
const RoleManager = {
  getAll()         { return DB.getAll('roles'); },
  getById(id)      { return DB.findById('roles', id); },
  getSystemRoles() { return this.getAll().filter(r => r.isSystem); },
  getCustomRoles() { return this.getAll().filter(r => !r.isSystem); },

  // Retourne les rôles qu'un Admin peut assigner (tout sauf superadmin et admin)
  getAssignableRoles() {
    return this.getAll().filter(r => r.id !== 'ROLE_admin');
  },

  // Valeur à stocker dans user.role selon le type de rôle
  getRoleValue(role) {
    if (!role) return 'utilisateur';
    // Rôles système : stocker la clé courte (ex: 'tresorier', 'utilisateur')
    if (role.isSystem) return role.id.replace('ROLE_', '');
    // Rôles custom : stocker l'ID complet
    return role.id;
  },

  create(data) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    const slug = data.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
    const id = `ROLE_${slug}_${Date.now()}`;
    const role = {
      id,
      nom: data.nom,
      icon: data.icon || '👤',
      color: data.color || '#6C63FF',
      isSystem: false,
      pages: data.pages || ['profil', 'notifications'],
      actions: data.actions || [],
      createdAt: new Date().toISOString()
    };
    DB.add('roles', role);
    return { success: true, role };
  },

  update(id, data) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    const role = DB.findById('roles', id);
    if (!role) return { success: false, error: 'Rôle introuvable.' };
    DB.update('roles', id, {
      nom: data.nom,
      icon: data.icon,
      color: data.color,
      pages: data.pages,
      actions: data.actions
    });
    return { success: true };
  },

  delete(id) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    const role = DB.findById('roles', id);
    if (!role) return { success: false, error: 'Rôle introuvable.' };
    if (role.isSystem) return { success: false, error: 'Impossible de supprimer un rôle système.' };
    const roleValue = this.getRoleValue(role);
    const usersWithRole = DB.findWhere('users', u => u.role === id || u.role === roleValue);
    if (usersWithRole.length > 0) return { success: false, error: `Ce rôle est assigné à ${usersWithRole.length} utilisateur(s). Réassignez-les d'abord.` };
    DB.delete('roles', id);
    return { success: true };
  }
};
