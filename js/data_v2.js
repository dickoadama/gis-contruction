/**
 * GIS - Gestion Intégrée de Stock
 * Entreprise: GIS | Devise: FCFA
 * Module: Base de données & Utilitaires
 */
'use strict';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION ENTREPRISE
// ═══════════════════════════════════════════════════════════
const GIS_COMPANY = {
  nom: 'GIS',
  slogan: 'Votre partenaire en matériaux de construction',
  adresse: 'Adresse à définir dans les paramètres',
  ville: '',
  telephone: '',
  email: '',
  rccm: '',
  nif: '',
  devise: 'FCFA'
};

// ═══════════════════════════════════════════════════════════
// SUPABASE CLOUD DB
// ═══════════════════════════════════════════════════════════
const supabaseConfig = window.GIS_SUPABASE_CONFIG || {};
function isPublicSupabaseKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('sb_publishable_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)));
    return claims.role === 'anon';
  } catch (error) {
    console.error('[GIS] Clé Supabase invalide:', error);
    return false;
  }
}
const supabaseClient = window.supabase && supabaseConfig.url && isPublicSupabaseKey(supabaseConfig.publishableKey)
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  : null;

window.GIS_STATE = {
  products: [], users: [], clients: [], invoices: [], devis: [], stock_entries: [], fournisseurs: [], caisse_ops: [], messages: [], notifications: [], roles: []
};
const CLOUD_COLLECTIONS = Object.keys(window.GIS_STATE);

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════
const CATEGORIES = [
  'Ciment','Fer à béton','Tôlerie','Contreplaqué',
  'Outillage','Faîtières','Pointes','Quincaillerie','Produits chimiques'
];

const PAYMENT_METHODS = [
  { id: 'especes',      label: 'Espèces',      icon: '💵', color: '#2ED573' },
  { id: 'bancaire',     label: 'Bancaire',     icon: '🏦', color: '#6C63FF' },
  { id: 'wave',         label: 'Wave',         icon: '🌊', color: '#00D4AA' },
  { id: 'mtn_money',    label: 'MTN Money',    icon: '📱', color: '#FFA502' },
  { id: 'orange_money', label: 'Orange Money', icon: '🍊', color: '#FF6B35' },
  { id: 'cheque',       label: 'Chèque',       icon: '📄', color: '#A8B2D8' }
];

const INVOICE_TYPES = [
  { id: 'normale',       label: 'Facture Normale',    color: '#6C63FF', bg: 'rgba(108,99,255,0.15)', icon: '🧾' },
  { id: 'credit',        label: 'Facture à Crédit',   color: '#FFA502', bg: 'rgba(255,165,2,0.15)',  icon: '⏳' },
  { id: 'credit_paye',   label: 'Crédit Payé',        color: '#2ED573', bg: 'rgba(46,213,115,0.15)', icon: '✅' },
  { id: 'avoir',         label: 'Avoir',              color: '#FF4757', bg: 'rgba(255,71,87,0.15)',  icon: '↩️' },
  { id: 'retrait_avoir', label: "Retrait d'Avoir",    color: '#00D4AA', bg: 'rgba(0,212,170,0.15)',  icon: '💰' }
];

// ═══════════════════════════════════════════════════════════
// PRODUITS (38 produits)
// ═══════════════════════════════════════════════════════════
const INITIAL_PRODUCTS = [
  { id:'P001', code:'CIM425',   name:'CIMEN 42,5',        categorie:'Ciment',             unite:'Sac',     prixAchat:0, prixVente:0, stock:0, stockMin:50,  actif:true },
  { id:'P002', code:'FER6',     name:'FER 6',             categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P003', code:'FER8N',    name:'FER 8 NOIR',        categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P004', code:'FER8B',    name:'FER 8 BLANC',       categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P005', code:'FER10N',   name:'FER 10 NOIR',       categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P006', code:'FER10B',   name:'FER 10 BLANC',      categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P007', code:'FER12N',   name:'FER 12 NOIR',       categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P008', code:'FER12B',   name:'FER 12 BLANC',      categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P009', code:'FILATT',   name:'FIL ATTACHE',       categorie:'Fer à béton',        unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P010', code:'FER21',    name:'FER 21',            categorie:'Fer à béton',        unite:'Barre',   prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P011', code:'FERATTGAL',name:'FER ATTACHE GAL',   categorie:'Fer à béton',        unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P012', code:'TOL5ET',   name:'TOLE 5 ETOILE',     categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P013', code:'TOLSUP',   name:'TOLE SUPER',        categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P014', code:'TOL1ET',   name:'TOLE 1 ETOILE',     categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P015', code:'TOLTIM',   name:'TOLE TIM',          categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P016', code:'TOLCOUL',  name:'TOLE COULEUR',      categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:20,  actif:true },
  { id:'P017', code:'TOLPE',    name:'TOLE PLANT/ELEPH',  categorie:'Tôlerie',            unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P018', code:'CPLQ5',    name:'CONTRE PLAQ 5MM',   categorie:'Contreplaqué',       unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P019', code:'BROUB',    name:'BROUETTE BLEUE',    categorie:'Outillage',          unite:'Pièce',   prixAchat:0, prixVente:0, stock:0, stockMin:5,   actif:true },
  { id:'P020', code:'BROUV',    name:'BROUETTE VERTE',    categorie:'Outillage',          unite:'Pièce',   prixAchat:0, prixVente:0, stock:0, stockMin:5,   actif:true },
  { id:'P021', code:'FAITORD',  name:'FAITIERE ORD',      categorie:'Faîtières',          unite:'Pièce',   prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P022', code:'FAITCOUL', name:'FAITIERE COULEUR',  categorie:'Faîtières',          unite:'Pièce',   prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P023', code:'PNTN3',    name:'POINTE N3',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P024', code:'PNTN4',    name:'POINTE N4',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P025', code:'PNTN5',    name:'POINTE N5',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P026', code:'PNTN6',    name:'POINTE N6',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P027', code:'PNTN7',    name:'POINTE N7',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P028', code:'PNTN8',    name:'POINTE N8',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P029', code:'PNTN9',    name:'POINTE N9',         categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P030', code:'PNTN10',   name:'POINTE N10',        categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P031', code:'PNTN12',   name:'POINTE N12',        categorie:'Pointes',            unite:'Kg',      prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P032', code:'TIRF80',   name:'TIRFOND80',         categorie:'Quincaillerie',      unite:'Boîte',   prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P033', code:'TIRF100',  name:'TIRFOND100',        categorie:'Quincaillerie',      unite:'Boîte',   prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P034', code:'MAST05',   name:'MASTILEX 0,5L',     categorie:'Produits chimiques', unite:'Bidon',   prixAchat:0, prixVente:0, stock:0, stockMin:5,   actif:true },
  { id:'P035', code:'BROU',     name:'BROUETTE',          categorie:'Outillage',          unite:'Pièce',   prixAchat:0, prixVente:0, stock:0, stockMin:5,   actif:true },
  { id:'P036', code:'PERI1L',   name:'PERICAL 1L',        categorie:'Produits chimiques', unite:'Bidon',   prixAchat:0, prixVente:0, stock:0, stockMin:5,   actif:true },
  { id:'P037', code:'CPLQ8',    name:'Contre plaquet8mm', categorie:'Contreplaqué',       unite:'Feuille', prixAchat:0, prixVente:0, stock:0, stockMin:10,  actif:true },
  { id:'P038', code:'TOLBACM',  name:'TOLE BAC METRE',    categorie:'Tôlerie',            unite:'Mètre',   prixAchat:0, prixVente:0, stock:0, stockMin:50,  actif:true }
];

// ═══════════════════════════════════════════════════════════
// RÔLES INITIAUX (seedés dans la migration Supabase)
// ═══════════════════════════════════════════════════════════
const INITIAL_ROLES = [
  {
    id: 'ROLE_utilisateur',
    nom: 'Utilisateur',
    icon: '👤',
    color: '#9aaec4',
    isSystem: true,
    pages: ['profil', 'notifications'],
    actions: []
  },
  {
    id: 'ROLE_admin',
    nom: 'Administrateur',
    icon: '👑',
    color: '#6C63FF',
    isSystem: true,
    pages: ['dashboard','produits','stock','inventaire','entrees_stock','factures','devis','caisse','clients','fournisseurs','rapports','messages','notifications','panier','profil','parametres','utilisateurs','roles','archives'],
    actions: ['create_invoice','delete_invoice','create_devis','manage_stock','manage_users','manage_roles','view_caisse','manage_products','view_reports','manage_company']
  },
  {
    id: 'ROLE_tresorier',
    nom: 'Trésorier',
    icon: '💼',
    color: '#00D4AA',
    isSystem: true,
    pages: ['dashboard','factures','devis','archives','caisse','clients','messages','notifications','panier','profil'],
    actions: ['create_invoice','create_devis','view_caisse']
  },
  {
    id: 'ROLE_gestionnaire_stock',
    nom: 'Gest. de Stock',
    icon: '📦',
    color: '#FFA502',
    isSystem: true,
    pages: ['dashboard','produits','stock','inventaire','entrees_stock','fournisseurs','messages','notifications','profil'],
    actions: ['manage_stock','manage_products','view_reports']
  },
  {
    id: 'ROLE_commerciale',
    nom: 'Commercial',
    icon: '💹',
    color: '#FF6B35',
    isSystem: true,
    pages: ['dashboard','factures','devis','archives','clients','panier','messages','notifications','profil'],
    actions: ['create_invoice','create_devis']
  }
];

// ═══════════════════════════════════════════════════════════
// DATABASE HELPER (SUPABASE SYNCHRONIZED)
// ═══════════════════════════════════════════════════════════
const DATA_COLLECTIONS = Object.keys(window.GIS_STATE).filter(key => key !== 'users' && key !== 'roles');

function roleFromRow(row) {
  return {
    id: row.id,
    nom: row.nom,
    icon: row.icon,
    color: row.color,
    isSystem: row.is_system,
    pages: row.pages || [],
    actions: row.actions || [],
    createdAt: row.created_at
  };
}

function roleToRow(role) {
  return {
    id: role.id,
    nom: role.nom,
    icon: role.icon,
    color: role.color,
    is_system: !!role.isSystem,
    pages: role.pages || [],
    actions: role.actions || [],
    created_at: role.createdAt || new Date().toISOString()
  };
}

function profileFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    prenom: row.prenom,
    nom: row.nom,
    username: row.username,
    telephone: row.telephone || '',
    role: row.role,
    actif: row.actif,
    createdAt: row.created_at
  };
}

async function fetchAllPages(queryFactory) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Réponse Supabase invalide.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

const DB = {
  isCloudReady: false,
  _cloudStarted: false,
  _channel: null,

  reportCloudWriteError(operation, error) {
    console.error(`[GIS] Supabase ${operation} failed:`, error);
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`Échec de synchronisation (${operation}). Vérifiez vos droits et votre connexion.`, 'error');
    }
  },

  isConfigured() {
    return !!supabaseClient;
  },

  async initCloud(callback) {
    const user = Auth.getCurrentUser();
    if (!supabaseClient || !user || this._cloudStarted) return;
    this._cloudStarted = true;
    try {
      const [records, roles, profiles, invoiceProducts] = await Promise.all([
        fetchAllPages(() => supabaseClient.from('app_records').select('collection,record_id,data')
          .order('collection').order('record_id')),
        fetchAllPages(() => supabaseClient.from('roles').select('*').order('id')),
        fetchAllPages(() => Auth.isAdmin()
          ? supabaseClient.from('profiles').select('*').order('created_at').order('id')
          : supabaseClient.rpc('list_user_directory')),
        fetchAllPages(() => supabaseClient.rpc('list_sales_catalog'))
      ]);

      DATA_COLLECTIONS.forEach(collection => {
        window.GIS_STATE[collection] = records
          .filter(record => record.collection === collection)
          .map(record => ({ ...record.data, id: record.record_id }));
      });
      const products = new Map(window.GIS_STATE.products.map(product => [product.id, product]));
      invoiceProducts.forEach(record => {
        products.set(record.record_id, { ...record.data, id: record.record_id });
      });
      window.GIS_STATE.products = [...products.values()];
      window.GIS_STATE.roles = roles.map(roleFromRow);
      window.GIS_STATE.users = profiles.map(profileFromRow);
      this._channel = supabaseClient
        .channel(`gis-sync-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_records' }, payload => {
          const record = payload.new && payload.new.record_id ? payload.new : payload.old;
          if (!record || !window.GIS_STATE[record.collection]) return;
          const items = window.GIS_STATE[record.collection];
          const index = items.findIndex(item => item.id === record.record_id);
          if (payload.eventType === 'DELETE') {
            if (index >= 0) items.splice(index, 1);
          } else {
            const item = { ...payload.new.data, id: payload.new.record_id };
            if (index >= 0) items[index] = item;
            else items.unshift(item);
          }
          if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, payload => {
          const row = payload.new && payload.new.id ? payload.new : payload.old;
          const currentUser = Auth.getCurrentUser();
          const assignedRoleId = currentUser
            ? (currentUser.role.startsWith('ROLE_') ? currentUser.role : `ROLE_${currentUser.role}`)
            : null;
          if (row && row.id === assignedRoleId) {
            window.location.reload();
            return;
          }
          if (!row || payload.eventType === 'DELETE') {
            window.GIS_STATE.roles = window.GIS_STATE.roles.filter(role => role.id !== row?.id);
          } else {
            const role = roleFromRow(payload.new);
            const index = window.GIS_STATE.roles.findIndex(item => item.id === role.id);
            if (index >= 0) window.GIS_STATE.roles[index] = role;
            else window.GIS_STATE.roles.push(role);
          }
          if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
          const row = payload.new && payload.new.id ? payload.new : payload.old;
          if (!row) return;
          const currentUser = Auth.getCurrentUser();
          if (currentUser && row.id === currentUser.id &&
              (payload.eventType === 'DELETE' || payload.new.role !== currentUser.role || payload.new.actif !== true)) {
            window.location.reload();
            return;
          }
          const index = window.GIS_STATE.users.findIndex(item => item.id === row.id);
          if (payload.eventType === 'DELETE') {
            if (index >= 0) window.GIS_STATE.users.splice(index, 1);
          } else {
            const profile = profileFromRow(payload.new);
            if (index >= 0) window.GIS_STATE.users[index] = profile;
            else window.GIS_STATE.users.push(profile);
          }
          if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
        })
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.reportCloudWriteError('temps réel', error || new Error(status));
          }
        });

      this.isCloudReady = true;
      if (typeof callback === 'function') callback();
      if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
    } catch (error) {
      this._cloudStarted = false;
      this.isCloudReady = false;
      this.reportCloudWriteError('chargement', error);
    }
  },

  stopCloud() {
    if (this._channel && supabaseClient) supabaseClient.removeChannel(this._channel);
    this._channel = null;
    this._cloudStarted = false;
    this.isCloudReady = false;
  },

  get(key) {
    try { return JSON.parse(localStorage.getItem(`GIS_${key}`)); } catch { return null; }
  },
  set(key, value) {
    localStorage.setItem(`GIS_${key}`, JSON.stringify(value));
  },
  getAll(key) {
    if (CLOUD_COLLECTIONS.includes(key)) return window.GIS_STATE[key] || [];
    return this.get(key) || [];
  },
  add(key, item) {
    if (CLOUD_COLLECTIONS.includes(key)) {
      const id = item.id || generateId();
      item.id = id;
      if (key === 'users') {
        this.reportCloudWriteError('ajout utilisateur', new Error('Les profils doivent être créés par la fonction d’administration.'));
        return null;
      }
      const previousIndex = window.GIS_STATE[key].findIndex(existing => existing.id === id);
      const previousItem = previousIndex >= 0 ? window.GIS_STATE[key][previousIndex] : null;
      if (previousIndex >= 0) window.GIS_STATE[key][previousIndex] = item;
      else window.GIS_STATE[key].unshift(item);
      const request = key === 'roles'
        ? supabaseClient.from('roles').upsert(roleToRow(item), { onConflict: 'id' })
        : supabaseClient.from('app_records').upsert({
          collection: key,
          record_id: id,
          data: item
        }, { onConflict: 'collection,record_id' });
      request.then(({ error }) => {
        if (error) {
          if (previousItem) window.GIS_STATE[key][previousIndex] = previousItem;
          else window.GIS_STATE[key] = window.GIS_STATE[key].filter(existing => existing.id !== id);
          this.reportCloudWriteError('ajout', error);
        }
      }).catch(error => this.reportCloudWriteError('ajout', error));
      return item;
    } else {
      const items = this.getAll(key);
      items.push(item);
      this.set(key, items);
      return item;
    }
  },
  update(key, id, updates) {
    if (CLOUD_COLLECTIONS.includes(key)) {
      const idx = window.GIS_STATE[key].findIndex(i => i.id === id);
      if (idx === -1) return null;
      const previous = idx === -1 ? null : window.GIS_STATE[key][idx];
      if (idx !== -1) window.GIS_STATE[key][idx] = { ...previous, ...updates };
      if (key === 'users') {
        this.reportCloudWriteError('modification utilisateur', new Error('Les profils doivent être modifiés par la fonction d’administration.'));
        if (previous) window.GIS_STATE[key][idx] = previous;
        return null;
      }
      const request = key === 'roles'
        ? supabaseClient.from('roles').update(roleToRow(window.GIS_STATE[key][idx])).eq('id', id).select('id').maybeSingle()
        : supabaseClient.from('app_records').update({
          data: window.GIS_STATE[key][idx]
        }).eq('collection', key).eq('record_id', id).select('record_id').maybeSingle();
      request.then(({ data, error }) => {
        if (error || !data) {
          if (previous) window.GIS_STATE[key][idx] = previous;
          this.reportCloudWriteError('modification', error || new Error('Enregistrement absent ou accès refusé.'));
        }
      }).catch(error => this.reportCloudWriteError('modification', error));
      return window.GIS_STATE[key][idx];
    } else {
      const items = this.getAll(key);
      const idx = items.findIndex(i => i.id === id);
      if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; this.set(key, items); return items[idx]; }
      return null;
    }
  },
  delete(key, id) {
    if (CLOUD_COLLECTIONS.includes(key)) {
      const previous = window.GIS_STATE[key].find(item => item.id === id);
      if (key === 'users') {
        this.reportCloudWriteError('suppression utilisateur', new Error('Les profils doivent être supprimés par la fonction d’administration.'));
        return;
      }
      window.GIS_STATE[key] = window.GIS_STATE[key].filter(i => i.id !== id);
      const request = key === 'roles'
        ? supabaseClient.from('roles').delete().eq('id', id).select('id').maybeSingle()
        : supabaseClient.from('app_records').delete().eq('collection', key).eq('record_id', id).select('record_id').maybeSingle();
      request.then(({ data, error }) => {
        if (error || !data) {
          if (previous && !window.GIS_STATE[key].some(item => item.id === id)) {
            window.GIS_STATE[key].push(previous);
          }
          this.reportCloudWriteError('suppression', error || new Error('Enregistrement absent ou accès refusé.'));
        }
      }).catch(error => {
        this.reportCloudWriteError('suppression', error);
      });
    } else {
      this.set(key, this.getAll(key).filter(i => i.id !== id));
    }
  },
  findById(key, id) { return this.getAll(key).find(i => i.id === id) || null; },
  findWhere(key, fn) { return this.getAll(key).filter(fn); },
  nextCounter(key) {
    if (CLOUD_COLLECTIONS.includes(key)) {
      return (window.GIS_STATE[key].length || 0) + 1;
    }
    const counters = this.get('counters') || {};
    counters[key] = (counters[key] || 0) + 1;
    this.set('counters', counters);
    return counters[key];
  }
};

// ═══════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════
function generateId(prefix = 'ID') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount || 0)) + ' FCFA';
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR');
}
function localDateStr(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().split('T')[0];
}
function todayStr() { return localDateStr(); }
function padNum(n, len = 3) { return String(n).padStart(len, '0'); }
function getInvoiceTypeInfo(typeId) {
  return INVOICE_TYPES.find(t => t.id === typeId) || INVOICE_TYPES[0];
}
function getPaymentMethodInfo(id) {
  return PAYMENT_METHODS.find(p => p.id === id) || PAYMENT_METHODS[0];
}

// ═══════════════════════════════════════════════════════════
// INITIALISATION BASE DE DONNÉES
// ═══════════════════════════════════════════════════════════
function initializeDB() {
  if (!Auth.isAdmin()) return;
  if (!DB.get('initialized')) {
    DB.set('company', GIS_COMPANY);
    DB.set('initialized', true);
    console.log('[GIS] Base de données initialisée.');
  }

  if (window.GIS_STATE.products.length === 0) {
    INITIAL_PRODUCTS.forEach(product => DB.add('products', product));
    DB.add('clients', {
      id:'CLI001', nom:'Client Comptant', telephone:'', email:'', adresse:'',
      avoir:0, creance:0, createdAt:new Date().toISOString()
    });
    DB.add('fournisseurs', {
      id:'F001', nom:'Cimenterie Générale', telephone:'0102030405',
      email:'contact@cimenterie.ci', adresse:'Zone Industrielle',
      actif:true, createdAt:new Date().toISOString()
    });
  }

  // Migration : rôles système existants doivent connaître la page 'archives'
  const ARCHIVE_ROLES = ['ROLE_admin', 'ROLE_tresorier', 'ROLE_commerciale'];
  window.GIS_STATE.roles.forEach(r => {
    if (ARCHIVE_ROLES.includes(r.id) && Array.isArray(r.pages) && !r.pages.includes('archives')) {
      DB.update('roles', r.id, { pages: [...r.pages, 'archives'] });
    }
  });
}
