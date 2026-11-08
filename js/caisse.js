/**
 * GIS - Module: Caisse
 */
'use strict';

const Caisse = {
  addOperation(data) {
    const user = Auth.getCurrentUser();
    const montant = Number(data.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      return { success: false, error: 'Le montant doit être un nombre supérieur à zéro.' };
    }
    if (!['encaissement', 'decaissement'].includes(data.type || 'encaissement')) {
      return { success: false, error: 'Type d’opération invalide.' };
    }
    if (!PAYMENT_METHODS.some(method => method.id === (data.modePaiement || 'especes'))) {
      return { success: false, error: 'Mode de paiement invalide.' };
    }
    const op = {
      id: generateId('CAISSE'),
      type: data.type || 'encaissement', // encaissement | decaissement
      montant,
      modePaiement: data.modePaiement || 'especes',
      description: data.description || '',
      factureId: data.factureId || null,
      date: data.date || todayStr(),
      createdBy: user ? user.id : 'system',
      createdByName: user ? `${user.prenom} ${user.nom}` : 'Système',
      createdAt: new Date().toISOString()
    };
    DB.add('caisse_ops', op);
    return { success: true, operation: op };
  },

  getOperations(filters = {}) {
    let ops = DB.getAll('caisse_ops');
    if (filters.type)          ops = ops.filter(o => o.type === filters.type);
    if (filters.modePaiement)  ops = ops.filter(o => o.modePaiement === filters.modePaiement);
    if (filters.dateFrom)      ops = ops.filter(o => o.date >= filters.dateFrom);
    if (filters.dateTo)        ops = ops.filter(o => o.date <= filters.dateTo);
    if (filters.date)          ops = ops.filter(o => o.date === filters.date);
    return ops.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getSolde(modePaiement) {
    const ops = DB.getAll('caisse_ops').filter(o => o.modePaiement === modePaiement);
    const encaiss = ops.filter(o => o.type === 'encaissement').reduce((a, o) => a + o.montant, 0);
    const decaiss = ops.filter(o => o.type === 'decaissement').reduce((a, o) => a + o.montant, 0);
    return encaiss - decaiss;
  },

  getAllSoldes() {
    return PAYMENT_METHODS.map(pm => ({
      ...pm,
      solde: this.getSolde(pm.id),
      encaissements: DB.getAll('caisse_ops').filter(o => o.modePaiement === pm.id && o.type === 'encaissement').reduce((a, o) => a + o.montant, 0),
      decaissements: DB.getAll('caisse_ops').filter(o => o.modePaiement === pm.id && o.type === 'decaissement').reduce((a, o) => a + o.montant, 0)
    }));
  },

  getTotalSolde() {
    const ops = DB.getAll('caisse_ops');
    const enc = ops.filter(o => o.type === 'encaissement').reduce((a, o) => a + o.montant, 0);
    const dec = ops.filter(o => o.type === 'decaissement').reduce((a, o) => a + o.montant, 0);
    return { encaissements: enc, decaissements: dec, solde: enc - dec };
  },

  getJournal(date = null) {
    const d = date || todayStr();
    const ops = this.getOperations({ date: d });
    const enc = ops.filter(o => o.type === 'encaissement').reduce((a, o) => a + o.montant, 0);
    const dec = ops.filter(o => o.type === 'decaissement').reduce((a, o) => a + o.montant, 0);
    return { date: d, operations: ops, totalEncaissements: enc, totalDecaissements: dec, soldeJour: enc - dec };
  },

  getStatsByPeriod(dateFrom, dateTo) {
    const ops = this.getOperations({ dateFrom, dateTo });
    const byMode = {};
    for (const pm of PAYMENT_METHODS) {
      const modeOps = ops.filter(o => o.modePaiement === pm.id);
      byMode[pm.id] = {
        label: pm.label,
        icon: pm.icon,
        encaissements: modeOps.filter(o => o.type === 'encaissement').reduce((a, o) => a + o.montant, 0),
        decaissements: modeOps.filter(o => o.type === 'decaissement').reduce((a, o) => a + o.montant, 0)
      };
      byMode[pm.id].solde = byMode[pm.id].encaissements - byMode[pm.id].decaissements;
    }
    return byMode;
  }
};

// ─── Messages ────────────────────────────────────────────────────────────────
const Messages = {
  send(destinataireId, sujet, contenu) {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const dest = DB.findById('users', destinataireId) || {};
    const msg = {
      id: generateId('MSG'),
      expediteurId: user.id,
      expediteurNom: `${user.prenom} ${user.nom}`,
      destinataireId,
      destinataireNom: `${dest.prenom || ''} ${dest.nom || ''}`.trim(),
      sujet,
      contenu,
      lu: false,
      createdAt: new Date().toISOString()
    };
    DB.add('messages', msg);
    // Notif pour le destinataire
    DB.add('notifications', {
      id: generateId('NOTIF'),
      userId: destinataireId,
      senderId: user.id,
      type: 'message',
      titre: 'Nouveau message',
      message: `De ${user.prenom} ${user.nom}: ${sujet}`,
      lu: false,
      createdAt: new Date().toISOString()
    });
    return msg;
  },

  getReceived() {
    const user = Auth.getCurrentUser();
    if (!user) return [];
    return DB.findWhere('messages', m => m.destinataireId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getSent() {
    const user = Auth.getCurrentUser();
    if (!user) return [];
    return DB.findWhere('messages', m => m.expediteurId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markAsRead(id) {
    DB.update('messages', id, { lu: true });
  },

  getUnreadCount() {
    const user = Auth.getCurrentUser();
    if (!user) return 0;
    return DB.findWhere('messages', m => m.destinataireId === user.id && !m.lu).length;
  }
};

// ─── Notifications ───────────────────────────────────────────────────────────
const Notifs = {
  getAll() {
    const user = Auth.getCurrentUser();
    if (!user) return [];
    return DB.getAll('notifications')
      .filter(n => n.userId === null || n.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getUnreadCount() {
    const user = Auth.getCurrentUser();
    if (!user) return 0;
    return DB.getAll('notifications').filter(n => (n.userId === null || n.userId === user.id) && !n.lu).length;
  },

  markAsRead(id) { DB.update('notifications', id, { lu: true }); },

  markAllRead() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    DB.getAll('notifications').forEach(n => {
      if ((n.userId === null || n.userId === undefined || n.userId === user.id) && !n.lu) {
        DB.update('notifications', n.id, { lu: true });
      }
    });
  },

  delete(id) { DB.delete('notifications', id); },

  clearAll() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    DB.getAll('notifications').forEach(n => {
      if (n.userId === null || n.userId === undefined || n.userId === user.id) {
        DB.delete('notifications', n.id);
      }
    });
  }
};
