/**
 * GIS - Module: Gestion de Stock
 */
'use strict';

const Stock = {
  // ─── Produits ────────────────────────────────────────────
  getProducts(filters = {}) {
    let products = DB.getAll('products');
    if (filters.categorie) products = products.filter(p => p.categorie === filters.categorie);
    if (filters.search)    products = products.filter(p => p.name.toLowerCase().includes(filters.search.toLowerCase()) || p.code.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.actif !== undefined) products = products.filter(p => p.actif === filters.actif);
    return products;
  },

  getProduct(id) { return DB.findById('products', id); },

  updateProduct(id, data) {
    return DB.update('products', id, { ...data, updatedAt: new Date().toISOString() });
  },

  addProduct(data) {
    const product = {
      id: generateId('P'),
      code: data.code || '',
      name: data.name,
      categorie: data.categorie || 'Autre',
      unite: data.unite || 'Pièce',
      prixAchat: parseFloat(data.prixAchat) || 0,
      prixVente: parseFloat(data.prixVente) || 0,
      stock: parseFloat(data.stock) || 0,
      stockMin: parseFloat(data.stockMin) || 5,
      actif: true,
      createdAt: new Date().toISOString()
    };
    DB.add('products', product);
    return product;
  },

  deleteProduct(id) { DB.update('products', id, { actif: false }); },

  // ─── Mouvements de stock ──────────────────────────────────
  addStockEntry(data) {
    const user = Auth.getCurrentUser();
    const product = DB.findById('products', data.produitId);
    if (!product) return { success: false, error: 'Produit introuvable' };

    const type = data.type || 'entree';
    const qte = Number(data.qte);
    const prixUnitaire = data.prixUnitaire === '' || data.prixUnitaire === undefined
      ? 0
      : Number(data.prixUnitaire);
    if (!['entree', 'sortie', 'retour', 'correction'].includes(type)) {
      return { success: false, error: 'Type de mouvement invalide.' };
    }
    if (!Number.isFinite(qte) || qte < 0 || (type !== 'correction' && qte === 0)) {
      return { success: false, error: 'La quantité doit être positive (ou nulle pour une correction).' };
    }
    if (!Number.isFinite(prixUnitaire) || prixUnitaire < 0) {
      return { success: false, error: 'Le prix unitaire doit être un nombre positif ou nul.' };
    }
    if (type === 'sortie' && qte > product.stock) {
      return { success: false, error: `Stock insuffisant : ${product.stock} ${product.unite} disponible(s).` };
    }

    const entry = {
      id: generateId('ENT'),
      numero: `ENT-${new Date().getFullYear()}${padNum(new Date().getMonth()+1,2)}-${padNum(DB.nextCounter('entries'))}`,
      type, // entree | sortie | retour | correction
      produitId: data.produitId,
      produitName: product.name,
      qte,
      prixUnitaire,
      montant: qte * prixUnitaire,
      fournisseur: data.fournisseur || '',
      reference: data.reference || '',
      date: data.date || todayStr(),
      createdBy: user ? user.id : 'system',
      createdByName: user ? `${user.prenom} ${user.nom}` : 'Système',
      createdAt: new Date().toISOString(),
      notes: data.notes || ''
    };
    DB.add('stock_entries', entry);

    // Mise à jour du stock
    let newStock = product.stock;
    if (entry.type === 'entree' || entry.type === 'retour') newStock += qte;
    else if (entry.type === 'sortie') newStock -= qte;
    else if (entry.type === 'correction') newStock = qte;

    DB.update('products', data.produitId, { stock: newStock, prixAchat: prixUnitaire > 0 ? prixUnitaire : product.prixAchat });

    // Alerte stock bas
    const updatedProduct = DB.findById('products', data.produitId);
    if (updatedProduct.stock < updatedProduct.stockMin) {
      this.createStockAlert(updatedProduct);
    }

    return { success: true, entry };
  },

  getStockEntries(filters = {}) {
    let entries = DB.getAll('stock_entries');
    if (filters.produitId) entries = entries.filter(e => e.produitId === filters.produitId);
    if (filters.type)      entries = entries.filter(e => e.type === filters.type);
    if (filters.dateFrom)  entries = entries.filter(e => e.date >= filters.dateFrom);
    if (filters.dateTo)    entries = entries.filter(e => e.date <= filters.dateTo);
    return entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // ─── Inventaire ───────────────────────────────────────────
  processInventory(items) {
    // items: [{produitId, qtePhysique}]
    if (!Array.isArray(items)) return { success: false, error: 'Inventaire invalide.' };
    const seen = new Set();
    for (const item of items) {
      const quantity = Number(item.qtePhysique);
      if (!DB.findById('products', item.produitId)) {
        return { success: false, error: 'Un produit de cet inventaire est introuvable.' };
      }
      if (seen.has(item.produitId)) {
        return { success: false, error: 'Un produit apparaît plusieurs fois dans cet inventaire.' };
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        return { success: false, error: 'Les quantités physiques doivent être positives ou nulles.' };
      }
      seen.add(item.produitId);
    }

    const user = Auth.getCurrentUser();
    const results = [];
    for (const item of items) {
      const product = DB.findById('products', item.produitId);
      const qtePhysique = Number(item.qtePhysique);
      const ecart = qtePhysique - product.stock;

      const entry = {
        id: generateId('INV'),
        numero: `INV-${new Date().getFullYear()}${padNum(new Date().getMonth()+1,2)}-${padNum(DB.nextCounter('entries'))}`,
        type: 'correction',
        produitId: item.produitId,
        produitName: product.name,
        qte: qtePhysique,
        prixUnitaire: product.prixAchat,
        montant: qtePhysique * product.prixAchat,
        fournisseur: '',
        reference: `INV-${todayStr()}`,
        date: todayStr(),
        createdBy: user ? user.id : 'system',
        createdByName: user ? `${user.prenom} ${user.nom}` : 'Système',
        createdAt: new Date().toISOString(),
        notes: `Inventaire physique - Écart: ${ecart > 0 ? '+' : ''}${ecart}`,
        ecart
      };
      DB.add('stock_entries', entry);
      DB.update('products', item.produitId, { stock: qtePhysique });
      results.push({ product: product.name, ancien: product.stock, nouveau: qtePhysique, ecart });
    }
    return { success: true, results };
  },

  getInventoryReport() {
    const products = DB.getAll('products').filter(p => p.actif);
    return products.map(p => ({
      ...p,
      valeurStock: p.stock * p.prixAchat,
      statut: p.stock <= 0 ? 'rupture' : p.stock < p.stockMin ? 'bas' : 'ok'
    }));
  },

  getLowStockProducts() {
    return DB.getAll('products').filter(p => p.actif && p.stock < p.stockMin);
  },

  getStockValue() {
    return DB.getAll('products').filter(p => p.actif).reduce((acc, p) => acc + (p.stock * p.prixAchat), 0);
  },

  createStockAlert(product) {
    const notif = {
      id: generateId('NOTIF'),
      userId: null, // tous
      type: 'stock_bas',
      titre: 'Stock bas',
      message: `${product.name} — Stock actuel: ${product.stock} ${product.unite} (Minimum: ${product.stockMin})`,
      lu: false,
      createdAt: new Date().toISOString()
    };
    DB.add('notifications', notif);
  },

  // ─── Ajustement de stock lors d'une vente ─────────────────
  decreaseStockForInvoice(lignes) {
    for (const ligne of lignes) {
      const product = DB.findById('products', ligne.produitId);
      if (product) {
        const newStock = product.stock - ligne.qte;
        DB.update('products', ligne.produitId, { stock: newStock });
        if (newStock < product.stockMin) this.createStockAlert({ ...product, stock: newStock });
      }
    }
  },

  increaseStockForReturn(lignes) {
    for (const ligne of lignes) {
      const product = DB.findById('products', ligne.produitId);
      if (product) {
        DB.update('products', ligne.produitId, { stock: product.stock + ligne.qte });
      }
    }
  }
};
