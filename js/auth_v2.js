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
  { id: 'utilisateurs',   label: 'Équipe',             icon: '👤' },
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
const Auth = {
  _currentUser: null,

  async restoreSession() {
    if (!supabaseClient) throw new Error('Supabase n’est pas configuré. Renseignez l’URL et la clé publique du projet.');
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session) { this._currentUser = null; return null; }
    return this._loadProfile(session.user);
  },

  async login(email, password) {
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const profile = await this._loadProfile(data.user);
      if (!profile) {
        await supabaseClient.auth.signOut();
        return { success: false, error: 'Compte inactif ou profil introuvable. Contactez un administrateur.' };
      }
      return { success: true, user: this._currentUser };
    } catch (error) {
      console.error('[GIS] Supabase sign-in failed:', error);
      try { await supabaseClient.auth.signOut(); } catch (signOutError) { console.error('[GIS] Could not clear failed sign-in session:', signOutError); }
      return { success: false, error: this._authError(error) };
    }
  },

  async register(data) {
    const { data: result, error } = await supabaseClient.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { prenom: data.prenom, nom: data.nom, username: data.username } }
    });
    if (error) throw error;
    if (result.session) await supabaseClient.auth.signOut();
    return { success: true };
  },

  async sendPasswordReset(email) {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  },

  async _loadProfile(authUser) {
    try {
      const { data, error } = await supabaseClient.from('users').select('*').eq('id', authUser.id).maybeSingle();
      if (error) throw error;
      if (!data || data.actif !== true) {
        this._currentUser = null;
        await supabaseClient.auth.signOut();
        return null;
      }
      this._currentUser = { id: data.id, ...(data.data || {}), email: data.data?.email || authUser.email, role: data.role, actif: data.actif };
      return this._currentUser;
    } catch (error) {
      this._currentUser = null;
      throw error;
    }
  },

  refreshProfile() {
    const profile = this._currentUser && DB.findById('users', this._currentUser.id);
    if (profile) this._currentUser = profile;
  },

  _authError(error) {
    const messages = {
      'invalid_email': 'Adresse e-mail invalide.',
      'invalid_credentials': 'Adresse e-mail ou mot de passe incorrect.',
      'user_already_exists': 'Cette adresse e-mail est déjà utilisée.',
      'weak_password': 'Le mot de passe doit comporter au moins 12 caractères.',
      'email_not_confirmed': 'Confirmez votre adresse e-mail avant de vous connecter.',
      'too_many_requests': 'Trop de tentatives. Réessayez plus tard.',
      'fetch failed': 'Connexion impossible. Vérifiez votre accès Internet.'
    };
    return messages[error.code] || error.message || 'Échec de l’authentification.';
  },

  async logout() {
    DB.stopCloud();
    this._currentUser = null;
    await supabaseClient.auth.signOut();
    window.location.reload();
  },

  getSession() {
    return this._currentUser ? { userId: this._currentUser.id, role: this._currentUser.role } : null;
  },

  getCurrentUser() { return this._currentUser; },

  isLoggedIn() { return !!(this._currentUser && this._currentUser.actif === true); },

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
      { page: 'utilisateurs',  icon: '👤', label: 'Équipe',               group: 'admin' },
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
      const { data: result, error } = await supabaseClient.functions.invoke('manage-users', {
        body: {
          action: 'create',
          prenom: data.prenom,
          nom: data.nom,
          username: data.username,
          email: data.email,
          telephone: data.telephone || '',
          role: data.role || 'utilisateur'
        }
      });
      if (error) throw error;
      const user = { id: result.id, ...data, actif: true };
      if (!window.GIS_STATE.users.some(existing => existing.id === user.id)) window.GIS_STATE.users.push(user);
      DB.persistCache();
      return { success: true, user, warning: result.message };
    } catch (error) {
      console.error('[GIS] Supabase user provisioning failed:', error);
      return { success: false, error: error.message || 'Impossible de créer le compte.' };
    }
  },

  async update(id, data) {
    const currentUser = Auth.getCurrentUser();
    if (!Auth.isAdmin() && currentUser?.id !== id) return { success: false, error: 'Accès refusé.' };
    try {
      const existing = DB.findById('users', id);
      if (existing && data.email && data.email !== existing.email) {
        return { success: false, error: 'L’adresse e-mail de connexion ne peut pas être modifiée depuis ce formulaire.' };
      }
      const user = { ...existing, ...data };
      const { id: userId, role, actif, ...profileData } = user;
      const { error } = await supabaseClient.from('users').update({ role, actif, data: profileData }).eq('id', userId);
      if (error) throw error;
      const index = window.GIS_STATE.users.findIndex(item => item.id === id);
      if (index >= 0) window.GIS_STATE.users[index] = user;
      if (currentUser.id === id) Auth._currentUser = user;
      DB.persistCache();
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
      const { error: verifyError } = await supabaseClient.auth.signInWithPassword({ email: user.email, password: oldPass });
      if (verifyError) throw verifyError;
      const { error } = await supabaseClient.auth.updateUser({ password: newPass });
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('[GIS] Supabase password update failed:', error);
      return { success: false, error: Auth._authError(error) };
    }
  },

  async toggleActive(id) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    const user = DB.findById('users', id);
    if (!user) return { success: false, error: 'Utilisateur introuvable.' };
    return this.update(id, { actif: !user.actif });
  },

  async delete(id) {
    if (!Auth.isAdmin()) return { success: false, error: 'Accès refusé.' };
    try {
      const { error } = await supabaseClient.functions.invoke('manage-users', { body: { action: 'delete', id } });
      if (error) throw error;
      window.GIS_STATE.users = window.GIS_STATE.users.filter(user => user.id !== id);
      DB.persistCache();
      return { success: true };
    } catch (error) {
      console.error('[GIS] Supabase user deletion failed:', error);
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
    const id = 'ROLE_' + data.nom.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
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
