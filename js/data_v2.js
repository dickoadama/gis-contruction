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
// FIREBASE CLOUD DB
// ═══════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyDaPvjKzcETOIJegwbyUpoyL3ZA3rr8670",
  authDomain: "gis-materiaux.firebaseapp.com",
  projectId: "gis-materiaux",
  storageBucket: "gis-materiaux.firebasestorage.app",
  messagingSenderId: "226197523599",
  appId: "1:226197523599:web:19e893110570673264b4fa"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ─── Persistance locale Firestore (réouvertures quasi-instantanées) ───
// Indisponible en file:// ou sur certains navigateurs → sans impact, on
// retombe sur notre propre cache localStorage (voir DB.persistCache).
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    console.warn('[GIS] Persistence Firestore indisponible:', err.code);
  });
} catch (e) { /* non supporté */ }

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
// RÔLES INITIAUX (seedés en Firestore au premier démarrage)
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

  // ─── Synchronisation cloud NON bloquante ──────────────────────
  // Le callback n'est appelé qu'une fois (au premier chargement complet
  // ou échec réseau) ; les mises à jour continues passent par
  // App.onCloudUpdate() qui est débouncée côté UI.
  initCloud(callback) {
    const user = firebase.auth().currentUser;
    if (!user || this._cloudStarted) return;
    this._cloudStarted = true;
    let loaded = 0;
    const totalListeners = CLOUD_COLLECTIONS.length + 2;
    const onProgress = () => {
      loaded++;
      if (loaded >= totalListeners && !this.isCloudReady) {
        this.isCloudReady = true;
        if (typeof callback === 'function') callback();
      }
      this.persistCache();
      if (window.App && typeof window.App.onCloudUpdate === 'function') window.App.onCloudUpdate();
    };
    const listen = (query, onData) => {
      let initialized = false;
      const unsubscribe = query.onSnapshot(snapshot => {
        onData(snapshot);
        if (!initialized) { initialized = true; onProgress(); }
      }, error => {
        console.warn('Firebase sync warning:', error);
        if (!initialized) { initialized = true; onProgress(); }
      });
      this._unsubscribers.push(unsubscribe);
    };
    try {
      CLOUD_COLLECTIONS.forEach(col => {
        if (col === 'messages' || col === 'notifications') return;
        listen(db.collection(col), snapshot => {
          window.GIS_STATE[col] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
      });
      let receivedMessages = [];
      let sentMessages = [];
      const updateMessages = () => {
        window.GIS_STATE.messages = [...new Map(
          [...receivedMessages, ...sentMessages].map(message => [message.id, message])
        ).values()];
      };
      listen(db.collection('messages').where('destinataireId', '==', user.uid), snapshot => {
        receivedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateMessages();
      });
      listen(db.collection('messages').where('expediteurId', '==', user.uid), snapshot => {
        sentMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateMessages();
      });
      let personalNotifications = [];
      let broadcastNotifications = [];
      const updateNotifications = () => {
        window.GIS_STATE.notifications = [...new Map(
          [...personalNotifications, ...broadcastNotifications].map(notification => [notification.id, notification])
        ).values()];
      };
      listen(db.collection('notifications').where('userId', '==', user.uid), snapshot => {
        personalNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateNotifications();
      });
      listen(db.collection('notifications').where('userId', '==', null), snapshot => {
        broadcastNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateNotifications();
      });
    } catch (e) {
      console.error("Critical Firebase Error:", e);
      this._cloudStarted = false;
      this.isCloudReady = true;
      if (typeof callback === 'function') callback();
    }
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
      db.collection(key).doc(id).set(item).catch(error => {
        window.GIS_STATE[key] = window.GIS_STATE[key].filter(existing => existing.id !== id);
        this.persistCache();
        this.reportCloudWriteError('ajout', error);
      });
      if (!window.GIS_STATE[key].find(i => i.id === id)) window.GIS_STATE[key].unshift(item);
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
      db.collection(key).doc(id).update(updates).catch(error => {
        if (previous) window.GIS_STATE[key][idx] = previous;
        this.persistCache();
        this.reportCloudWriteError('modification', error);
      });
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
      db.collection(key).doc(id).delete().catch(error => {
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
