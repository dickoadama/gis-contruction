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
// CLIENT SUPABASE
// ═══════════════════════════════════════════════════════════
const supabaseClient = window.GIS_SUPABASE_URL && window.GIS_SUPABASE_ANON_KEY
  ? window.supabase.createClient(window.GIS_SUPABASE_URL, window.GIS_SUPABASE_ANON_KEY)
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
// RÔLES INITIAUX (installés par la migration Supabase)
// ═══════════════════════════════════════════════════════════
const INITIAL_ROLES = [
  {
    id: 'ROLE_utilisateur',
    nom: 'Utilisateur',
    icon: '👤',
    color: '#9aaec4',
    description: 'Accès au profil et aux notifications. Un administrateur doit lui attribuer un rôle métier.',
    isSystem: true,
    pages: ['profil', 'notifications'],
    actions: []
  },
  {
    id: 'ROLE_admin',
    nom: 'Administrateur',
    icon: '👑',
    color: '#6C63FF',
    description: 'Gère l’équipe, attribue les rôles métier et pilote les activités de l’entreprise.',
    isSystem: true,
    pages: ['dashboard','produits','stock','inventaire','entrees_stock','factures','devis','caisse','clients','fournisseurs','rapports','messages','notifications','panier','profil','parametres','utilisateurs','roles','archives'],
    actions: ['create_invoice','delete_invoice','create_devis','manage_stock','manage_users','manage_roles','view_caisse','manage_products','view_reports','manage_company']
  },
  {
    id: 'ROLE_chauffeur',
    nom: 'Chauffeur',
    icon: '🚚',
    color: '#00A8A8',
    description: 'Consulte ses informations et les notifications liées aux livraisons. Aucun accès aux données financières.',
    isSystem: true,
    pages: ['dashboard','messages','notifications','profil'],
    actions: []
  },
  {
    id: 'ROLE_chargeur',
    nom: 'Chargeur',
    icon: '📦',
    color: '#E58E26',
    description: 'Prépare les commandes et suit les mouvements de stock. N’accède ni à la caisse ni aux paramètres.',
    isSystem: true,
    pages: ['dashboard','produits','stock','entrees_stock','inventaire','messages','notifications','profil'],
    actions: ['manage_stock']
  },
  {
    id: 'ROLE_caisse',
    nom: 'Caisse',
    icon: '💰',
    color: '#008F6B',
    description: 'Enregistre les ventes et les règlements, consulte la caisse et les informations clients utiles.',
    isSystem: true,
    pages: ['dashboard','factures','devis','archives','caisse','clients','messages','notifications','panier','profil'],
    actions: ['create_invoice','create_devis','view_caisse']
  },
  {
    id: 'ROLE_gestionnaire_stock',
    nom: 'Gestionnaire de stock',
    icon: '📦',
    color: '#FFA502',
    description: 'Gère les produits, réceptions, inventaires, fournisseurs et alertes de réapprovisionnement.',
    isSystem: true,
    pages: ['dashboard','produits','stock','inventaire','entrees_stock','fournisseurs','messages','notifications','profil'],
    actions: ['manage_stock','manage_products','view_reports']
  }
];

// ═══════════════════════════════════════════════════════════
// DATABASE HELPER (CLOUD SYNCHRONIZED)
// ═══════════════════════════════════════════════════════════
const DB = {
  isCloudReady: false,
  _cacheTimer: null,
  _cloudStarted: false,
  _unsubscribers: [],

  // ─── Cache local instantané (démarrage sans attendre le Cloud) ───
  persistCache() {
    clearTimeout(this._cacheTimer);
    this._cacheTimer = setTimeout(() => {
      try { localStorage.setItem('GIS_state_cache', JSON.stringify(window.GIS_STATE)); } catch (e) { /* quota dépassé */ }
    }, 800);
  },

  reportCloudWriteError(operation, error) {
    console.error(`[GIS] Cloud ${operation} failed:`, error);
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`Échec de synchronisation (${operation}). Vérifiez vos droits et votre connexion.`, 'error');
    }
  },

  hydrateFromCache() {
    try {
      const cached = JSON.parse(localStorage.getItem('GIS_state_cache'));
      if (!cached) return false;
      CLOUD_COLLECTIONS.forEach(col => {
        if (Array.isArray(cached[col])) {
          window.GIS_STATE[col] = col === 'users'
            ? cached[col].map(({ password, ...user }) => user)
            : cached[col];
        }
      });
      return true;
    } catch (e) { return false; }
  },

  // ─── Synchronisation Supabase ──────────────────────────────────
  initCloud(callback) {
    if (!supabaseClient || !Auth.getCurrentUser() || this._cloudStarted) return;
    this._cloudStarted = true;
    const load = async () => {
      await Promise.all(CLOUD_COLLECTIONS.map(async collection => {
        const { data, error } = await supabaseClient.from(collection).select('*');
        if (error) {
          console.warn(`[GIS] Lecture Supabase indisponible (${collection}):`, error.message);
          return;
        }
        window.GIS_STATE[collection] = data.map(row => this.fromRow(collection, row));
      }));
      this.isCloudReady = true;
      this.persistCache();
      if (typeof callback === 'function') callback();
      const channel = supabaseClient.channel('gis-data-sync');
      CLOUD_COLLECTIONS.forEach(collection => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: collection }, payload => {
          const rows = window.GIS_STATE[collection];
          if (payload.eventType === 'DELETE') {
            window.GIS_STATE[collection] = rows.filter(item => item.id !== payload.old.id);
          } else {
            const item = this.fromRow(collection, payload.new);
            const index = rows.findIndex(existing => existing.id === item.id);
            if (index >= 0) rows[index] = item;
            else rows.unshift(item);
          }
          this.persistCache();
          if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
        });
      });
      channel.subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[GIS] Connexion Realtime Supabase indisponible:', status);
        }
      });
      this._unsubscribers.push(() => supabaseClient.removeChannel(channel));
    };
    load().catch(error => {
      console.error('[GIS] Initialisation Supabase impossible:', error);
      this._cloudStarted = false;
      this.isCloudReady = true;
      if (typeof callback === 'function') callback();
    });
  },

  stopCloud() {
    this._unsubscribers.forEach(unsubscribe => unsubscribe());
    this._unsubscribers = [];
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
      this.syncRecord(key, item).catch(error => {
        window.GIS_STATE[key] = window.GIS_STATE[key].filter(existing => existing.id !== id);
        this.persistCache();
        this.reportCloudWriteError('ajout', error);
      });
      if (!window.GIS_STATE[key].find(i => i.id === id)) window.GIS_STATE[key].unshift(item);
      this.persistCache();
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
      const previous = idx === -1 ? null : window.GIS_STATE[key][idx];
      if (idx !== -1) window.GIS_STATE[key][idx] = { ...previous, ...updates };
      const updated = idx === -1 ? null : window.GIS_STATE[key][idx];
      if (updated) this.syncRecord(key, updated).catch(error => {
        if (previous) window.GIS_STATE[key][idx] = previous;
        this.persistCache();
        this.reportCloudWriteError('modification', error);
      });
      this.persistCache();
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
      window.GIS_STATE[key] = window.GIS_STATE[key].filter(i => i.id !== id);
      this.persistCache();
      supabaseClient.from(key).delete().eq('id', id).then(({ error }) => {
        if (error) throw error;
      }).catch(error => {
        if (previous && !window.GIS_STATE[key].some(item => item.id === id)) {
          window.GIS_STATE[key].push(previous);
        }
        this.persistCache();
        this.reportCloudWriteError('suppression', error);
      });
    } else {
      this.set(key, this.getAll(key).filter(i => i.id !== id));
    }
  },
  toRow(key, item) {
    if (key === 'users') {
      const { id, role = 'utilisateur', actif = false, ...data } = item;
      return { id, role, actif, data };
    }
    const { id, ...data } = item;
    return { id, data };
  },
  fromRow(key, row) {
    if (key === 'users') return { id: row.id, ...(row.data || {}), role: row.role, actif: row.actif };
    return { id: row.id, ...(row.data || {}) };
  },
  async syncRecord(key, item) {
    const { error } = await supabaseClient.from(key).upsert(this.toRow(key, item));
    if (error) throw error;
  },
  async purgeBusinessData() {
    const collections = CLOUD_COLLECTIONS.filter(key => !['users', 'roles'].includes(key));
    const results = await Promise.all(collections.map(key => supabaseClient.from(key).delete().not('id', 'is', null)));
    const failed = results.find(result => result.error);
    if (failed) throw failed.error;
    collections.forEach(key => { window.GIS_STATE[key] = []; });
    this.persistCache();
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
