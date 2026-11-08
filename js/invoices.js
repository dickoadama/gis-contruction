/**
 * GIS - Module: Factures & Devis
 */
'use strict';

const Invoices = {
  // ─── Numérotation ─────────────────────────────────────────
  generateInvoiceNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${padNum(d.getMonth()+1,2)}${padNum(d.getDate(),2)}`;
    return `FAC-${ymd}-${padNum(DB.nextCounter('invoices'))}`;
  },

  generateDevisNumber() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${padNum(d.getMonth()+1,2)}${padNum(d.getDate(),2)}`;
    return `DEV-${ymd}-${padNum(DB.nextCounter('devis'))}`;
  },

  // ─── Clients ──────────────────────────────────────────────
  getClients(search = '') {
    let clients = DB.getAll('clients');
    if (search) clients = clients.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()) || c.telephone.includes(search));
    return clients;
  },

  getClient(id) { return DB.findById('clients', id); },

  createClient(data) {
    const client = {
      id: generateId('CLI'),
      nom: data.nom,
      telephone: data.telephone || '',
      email: data.email || '',
      adresse: data.adresse || '',
      avoir: 0,
      creance: 0,
      createdAt: new Date().toISOString()
    };
    DB.add('clients', client);
    return client;
  },

  updateClient(id, data) {
    return DB.update('clients', id, data);
  },

  // ─── Factures ─────────────────────────────────────────────
  async createInvoice(data) {
    const user = Auth.getCurrentUser();
    const client = DB.findById('clients', data.clientId);
    if (!client) return { success: false, error: 'Veuillez sélectionner un client valide.' };
    if (!INVOICE_TYPES.some(type => type.id === (data.type || 'normale'))) {
      return { success: false, error: 'Type de facture invalide.' };
    }
    if (!PAYMENT_METHODS.some(method => method.id === (data.modePaiement || 'especes'))) {
      return { success: false, error: 'Mode de paiement invalide.' };
    }
    if (!Array.isArray(data.lignes) || data.lignes.length === 0) {
      return { success: false, error: 'Ajoutez au moins une ligne valide.' };
    }

    const lignes = [];
    for (const line of data.lignes) {
      const qte = Number(line.qte);
      const prixUnitaire = Number(line.prixUnitaire);
      const remise = Number(line.remise || 0);
      if (!Number.isFinite(qte) || qte <= 0 || !Number.isFinite(prixUnitaire) || prixUnitaire < 0 ||
          !Number.isFinite(remise) || remise < 0 || remise > 100) {
        return { success: false, error: 'Une ligne contient une quantité, un prix ou une remise invalide.' };
      }
      const montant = qte * prixUnitaire * (1 - remise / 100);
      if (!Number.isFinite(montant)) {
        return { success: false, error: 'Le montant d’une ligne dépasse la valeur autorisée.' };
      }
      if (line.produitId && !DB.findById('products', line.produitId)) {
        return { success: false, error: 'Un produit de la facture est introuvable.' };
      }
      lignes.push({
        ...line,
        qte,
        prixUnitaire,
        remise,
        montant
      });
    }

    const sousTotal = lignes.reduce((acc, line) => acc + line.montant, 0);
    if (!Number.isFinite(sousTotal)) {
      return { success: false, error: 'Le sous-total de la facture dépasse la valeur autorisée.' };
    }
    const remiseGlobale = Number(data.remiseGlobale || 0);
    if (!Number.isFinite(remiseGlobale) || remiseGlobale < 0 || remiseGlobale > sousTotal) {
      return { success: false, error: 'La remise globale doit être comprise entre zéro et le sous-total.' };
    }
    const total = sousTotal - remiseGlobale;
    const montantPaye = Number(data.montantPaye || 0);
    if (!Number.isFinite(montantPaye) || montantPaye < 0 || montantPaye > total) {
      return { success: false, error: 'Le montant payé doit être compris entre zéro et le total.' };
    }
    if (data.type === 'avoir' && montantPaye > 0) {
      return { success: false, error: 'Un avoir ne peut pas comporter d’encaissement.' };
    }
    if (data.type === 'credit_paye' && montantPaye <= 0) {
      return { success: false, error: 'Indiquez le montant du règlement de la créance.' };
    }
    if (data.type === 'retrait_avoir' && (montantPaye <= 0 || montantPaye > (client.avoir || 0))) {
      return { success: false, error: 'Le retrait doit être positif et ne peut pas dépasser l’avoir disponible du client.' };
    }
    if (data.type === 'retrait_avoir' && !Auth.canDo('view_caisse')) {
      return { success: false, error: 'Un retrait d’avoir nécessite le droit de gestion de la caisse.' };
    }
    if (data.type === 'credit_paye' && montantPaye > (client.creance || 0)) {
      return { success: false, error: 'Le règlement ne peut pas dépasser la créance du client.' };
    }
    if (['normale', 'credit'].includes(data.type || 'normale')) {
      for (const line of lignes) {
        if (!line.produitId) continue;
        const product = DB.findById('products', line.produitId);
        if (!product.actif) return { success: false, error: `${product.name} n’est plus actif.` };
        if (line.qte > product.stock) {
          return { success: false, error: `Stock insuffisant pour ${product.name} : ${product.stock} ${product.unite} disponible(s).` };
        }
      }
    }

    let statut = 'en_attente';
    if (data.type === 'credit') {
      statut = montantPaye >= total ? 'paye' : 'credit';
    } else if (data.type === 'normale' || data.type === 'credit_paye' || data.type === 'retrait_avoir') {
      statut = montantPaye >= total ? 'paye' : montantPaye > 0 ? 'partiel' : 'en_attente';
    } else if (data.type === 'avoir') {
      statut = 'avoir';
    }

    const invoice = {
      id: generateId('FAC'),
      numero: this.generateInvoiceNumber(),
      type: data.type || 'normale',
      clientId: data.clientId,
      clientNom: client.nom,
      date: data.date || todayStr(),
      echeance: data.echeance || null,
      lignes,
      sousTotal,
      remiseGlobale,
      total,
      modePaiement: data.modePaiement || 'especes',
      montantPaye,
      resteAPayer: Math.max(0, total - montantPaye),
      montantCreance: data.type === 'credit' ? Math.max(0, total - montantPaye) : 0,
      statut,
      factureLieeId: data.factureLieeId || null,
      notes: data.notes || '',
      createdBy: user ? user.id : 'system',
      createdByName: user ? `${user.prenom} ${user.nom}` : 'Système',
      createdAt: new Date().toISOString()
    };

    try {
      await DB.addAsync('invoices', invoice);
    } catch (error) {
      console.error('[GIS] Invoice creation failed:', error);
      return { success: false, error: 'La facture n’a pas pu être enregistrée dans le cloud.' };
    }

    // Mise à jour créance/avoir client
    this._updateClientBalance(invoice);

    // Mouvement stock (sortie pour ventes, entrée pour avoirs)
    if (['normale','credit'].includes(invoice.type)) {
      Stock.decreaseStockForInvoice(lignes);
    } else if (invoice.type === 'avoir') {
      Stock.increaseStockForReturn(lignes);
    }

    // Opération caisse
    if (montantPaye > 0 && ['normale','credit','credit_paye','retrait_avoir'].includes(invoice.type)) {
      const caisseResult = Caisse.addOperation({
        type: invoice.type === 'retrait_avoir' ? 'decaissement' : 'encaissement',
        montant: montantPaye,
        modePaiement: invoice.modePaiement,
        description: `Encaissement ${invoice.numero} — ${invoice.clientNom}`,
        factureId: invoice.id,
        date: invoice.date
      });
      if (!caisseResult.success) return caisseResult;
    }

    // Notification
    this._createInvoiceNotif(invoice);

    return { success: true, invoice };
  },

  _updateClientBalance(invoice) {
    const client = DB.findById('clients', invoice.clientId);
    if (!client) return;
    let { creance, avoir } = client;
    if (invoice.type === 'credit') creance += invoice.montantCreance;
    else if (invoice.type === 'credit_paye') creance -= invoice.montantPaye;
    else if (invoice.type === 'avoir') avoir += invoice.total;
    else if (invoice.type === 'retrait_avoir') avoir -= invoice.montantPaye;
    DB.update('clients', invoice.clientId, { creance: Math.max(0, creance), avoir: Math.max(0, avoir) });
  },

  _createInvoiceNotif(invoice) {
    let msg = '';
    if (invoice.type === 'credit') msg = `Facture à crédit créée: ${invoice.numero} — ${formatCurrency(invoice.total)}`;
    else if (invoice.type === 'avoir') msg = `Avoir enregistré: ${invoice.numero} — ${formatCurrency(invoice.total)}`;
    if (msg) {
      DB.add('notifications', {
        id: generateId('NOTIF'),
        userId: null,
        type: 'info',
        titre: 'Nouvelle opération',
        message: msg,
        lu: false,
        createdAt: new Date().toISOString()
      });
    }
  },

  getInvoices(filters = {}) {
    let invoices = DB.getAll('invoices');
    if (filters.type)      invoices = invoices.filter(i => i.type === filters.type);
    if (filters.statut)    invoices = invoices.filter(i => i.statut === filters.statut);
    if (filters.clientId)  invoices = invoices.filter(i => i.clientId === filters.clientId);
    if (filters.dateFrom)  invoices = invoices.filter(i => i.date >= filters.dateFrom);
    if (filters.dateTo)    invoices = invoices.filter(i => i.date <= filters.dateTo);
    if (filters.search)    invoices = invoices.filter(i => i.numero.includes(filters.search) || i.clientNom.toLowerCase().includes(filters.search.toLowerCase()));
    return invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getInvoice(id) { return DB.findById('invoices', id); },

  updateInvoice(id, data) {
    return DB.update('invoices', id, { ...data, updatedAt: new Date().toISOString() });
  },

  cancelInvoice(id) {
    const invoice = DB.findById('invoices', id);
    if (!invoice || invoice.statut === 'annule') return { success: false, error: 'Impossible d\'annuler.' };
    if (invoice.montantPaye > 0 && ['normale','credit','credit_paye','retrait_avoir'].includes(invoice.type) &&
        !PAYMENT_METHODS.some(method => method.id === invoice.modePaiement)) {
      return { success: false, error: 'Mode de paiement inconnu : impossible de rétablir la caisse.' };
    }
    DB.update('invoices', id, { statut: 'annule' });
    // Reverse stock
    if (['normale','credit'].includes(invoice.type)) Stock.increaseStockForReturn(invoice.lignes);
    else if (invoice.type === 'avoir') Stock.decreaseStockForInvoice(invoice.lignes);
    // Reverse solde client (créance / avoir)
    const client = DB.findById('clients', invoice.clientId);
    if (client) {
      let creance = client.creance || 0;
      let avoir = client.avoir || 0;
      if (invoice.type === 'credit') creance -= invoice.montantCreance === undefined ? invoice.total : invoice.montantCreance;
      else if (invoice.type === 'credit_paye') creance += invoice.montantPaye;
      else if (invoice.type === 'avoir') avoir -= invoice.total;
      else if (invoice.type === 'retrait_avoir') avoir += invoice.montantPaye;
      DB.update('clients', invoice.clientId, { creance: Math.max(0, creance), avoir: Math.max(0, avoir) });
    }
    // Reverse caisse si un encaissement avait été enregistré
    if (invoice.montantPaye > 0 && ['normale','credit','credit_paye','retrait_avoir'].includes(invoice.type)) {
      Caisse.addOperation({
        type: invoice.type === 'retrait_avoir' ? 'encaissement' : 'decaissement',
        montant: invoice.montantPaye,
        modePaiement: invoice.modePaiement,
        description: `Remboursement ${invoice.numero} (annulation)`,
        factureId: invoice.id,
        date: todayStr()
      });
    }
    return { success: true };
  },

  // ─── Devis ────────────────────────────────────────────────
  createDevis(data) {
    const user = Auth.getCurrentUser();
    const lignes = data.lignes || [];
    const sousTotal = lignes.reduce((acc, l) => acc + l.montant, 0);
    const remiseGlobale = parseFloat(data.remiseGlobale) || 0;
    const total = sousTotal - remiseGlobale;

    const devis = {
      id: generateId('DEV'),
      numero: this.generateDevisNumber(),
      clientId: data.clientId,
      clientNom: (DB.findById('clients', data.clientId) || {}).nom || 'Inconnu',
      date: data.date || todayStr(),
      validiteJours: parseInt(data.validiteJours) || 30,
      lignes,
      sousTotal,
      remiseGlobale,
      total,
      statut: 'en_attente', // en_attente | accepte | refuse | expire | converti
      factureId: null,
      notes: data.notes || '',
      createdBy: user ? user.id : 'system',
      createdByName: user ? `${user.prenom} ${user.nom}` : 'Système',
      createdAt: new Date().toISOString()
    };
    DB.add('devis', devis);
    return { success: true, devis };
  },

  // Marque en 'expire' les devis en attente dont la date de validité est dépassée
  checkDevisExpiration() {
    const now = new Date();
    DB.getAll('devis').forEach(d => {
      if (d.statut !== 'en_attente') return;
      const exp = new Date(d.date); exp.setDate(exp.getDate() + (d.validiteJours || 30)); exp.setHours(23,59,59);
      if (exp < now) DB.update('devis', d.id, { statut: 'expire', updatedAt: now.toISOString() });
    });
  },

  getDevis(filters = {}) {
    this.checkDevisExpiration();
    let devisList = DB.getAll('devis');
    if (filters.statut)   devisList = devisList.filter(d => d.statut === filters.statut);
    if (filters.clientId) devisList = devisList.filter(d => d.clientId === filters.clientId);
    if (filters.search)   devisList = devisList.filter(d => d.numero.includes(filters.search) || d.clientNom.toLowerCase().includes(filters.search.toLowerCase()));
    return devisList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getDevisById(id) { return DB.findById('devis', id); },

  async convertDevisToInvoice(devisId, invoiceData) {
    const devis = DB.findById('devis', devisId);
    if (!devis) return { success: false, error: 'Devis introuvable' };
    if (devis.statut === 'expire') return { success: false, error: 'Devis expiré — non convertible.' };
    if (devis.statut === 'converti') return { success: false, error: 'Devis déjà converti.' };
    const result = await this.createInvoice({
      ...invoiceData,
      clientId: devis.clientId,
      lignes: devis.lignes,
      remiseGlobale: devis.remiseGlobale,
      notes: devis.notes
    });
    if (result.success) {
      DB.update('devis', devisId, { statut: 'converti', factureId: result.invoice.id });
    }
    return result;
  },

  updateDevisStatut(id, statut) {
    const devis = DB.findById('devis', id);
    if (devis && devis.statut === 'expire' && statut !== 'expire') return { success: false, error: 'Devis expiré.' };
    return DB.update('devis', id, { statut });
  },

  // ─── Statistiques ─────────────────────────────────────────
  getDashboardStats() {
    const invoices = DB.getAll('invoices');
    const today = todayStr();
    const invoicesToday = invoices.filter(i => i.date === today && i.statut !== 'annule');
    const caJour = invoicesToday.reduce((a, i) =>
      a + (['normale', 'credit', 'credit_paye'].includes(i.type) ? i.montantPaye : 0), 0);
    const enAttente = invoices.filter(i => i.statut === 'credit').length;
    const totalCreances = invoices.filter(i => i.statut === 'credit').reduce((a, i) => a + i.resteAPayer, 0);
    const totalAvoirs = DB.getAll('clients').reduce((a, c) => a + (c.avoir || 0), 0);
    return { caJour, enAttente, totalCreances, totalAvoirs, nbFactures: invoicesToday.length };
  },

  getSalesHistory(days = 7) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
      const dayInvoices = DB.getAll('invoices').filter(inv =>
        inv.date === dateStr && !['annule','avoir'].includes(inv.statut) &&
        ['normale', 'credit', 'credit_paye'].includes(inv.type));
      const ca = dayInvoices.reduce((acc, inv) => acc + inv.montantPaye, 0);
      result.push({ date: dateStr, label: d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }), ca, nbFactures: dayInvoices.length });
    }
    return result;
  },

  // ─── Impression ───────────────────────────────────────────
  printInvoice(id) {
    const invoice = DB.findById('invoices', id);
    if (!invoice) return;
    const company = DB.get('company') || GIS_COMPANY;
    const client = DB.findById('clients', invoice.clientId) || {};
    const typeInfo = getInvoiceTypeInfo(invoice.type);
    const payInfo = getPaymentMethodInfo(invoice.modePaiement);

    const lignesHTML = invoice.lignes.map((l, idx) => `
      <tr>
        <td>${idx+1}</td>
        <td>${l.designation}</td>
        <td>${l.unite || ''}</td>
        <td style="text-align:right">${l.qte}</td>
        <td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(l.prixUnitaire)}</td>
        <td style="text-align:right">${l.remise ? l.remise+'%' : '—'}</td>
        <td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(l.montant)}</td>
      </tr>
    `).join('');

    const html = `
    <div style="padding: 10mm; background: #fff; color: #1a1a1a; font-family: Arial, sans-serif; font-size: 12px;">
    <style>
      .header-inv{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #1a1a1a;}
      .company-name{font-size:28px;font-weight:900;color:#1a1a1a;letter-spacing:2px;}
      .company-info{font-size:10px;color:#555;line-height:1.6;}
      .doc-type{font-size:20px;font-weight:700;text-align:right;color:#fff;background:#1a1a1a;padding:8px 16px;border-radius:4px;display:inline-block;}
      .doc-number{font-size:11px;color:#777;text-align:right;margin-top:4px;}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0;}
      .info-box{background:#f8f8f8;padding:12px;border-radius:4px;border-left:3px solid #1a1a1a;}
      .info-box h4{font-size:10px;text-transform:uppercase;color:#888;margin-bottom:6px;}
      .info-box p{font-size:12px;font-weight:600;}
      .table-inv{width:100%;border-collapse:collapse;margin:20px 0;}
      .table-inv thead tr{background:#1a1a1a;color:#fff;}
      .table-inv th{padding:8px 6px;text-align:left;font-size:10px;text-transform:uppercase;}
      .table-inv td{padding:7px 6px;border-bottom:1px solid #eee;font-size:11px;}
      .table-inv tbody tr:nth-child(even){background:#fafafa;}
      .totals{margin-left:auto;width:280px;display:flex;flex-direction:column;}
      .total-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;}
      .total-row.grand{font-size:14px;font-weight:700;border-bottom:2px solid #1a1a1a;padding-top:8px;margin-top:4px;}
      .footer-inv{margin-top:30px;padding-top:15px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:10px;color:#888;}
      .sign-box{text-align:center;border-top:1px solid #999;width:140px;padding-top:4px;font-size:10px;margin-top:30px;}
    </style>
    <div class="header-inv">
      <div>
        <div class="company-name">${company.nom}</div>
        <div class="company-info">
          ${company.slogan}<br>
          ${company.adresse}${company.ville ? ', ' + company.ville : ''}<br>
          ${company.telephone ? 'Tél: ' + company.telephone : ''}
          ${company.email ? ' | Email: ' + company.email : ''}<br>
          ${company.rccm ? 'RCCM: ' + company.rccm : ''}
          ${company.nif ? ' | NIF: ' + company.nif : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div class="doc-type">${typeInfo.icon} ${typeInfo.label.toUpperCase()}</div>
        <div class="doc-number">N° ${invoice.numero}</div>
        <div class="doc-number">Date: ${formatDate(invoice.date)}</div>
        ${invoice.echeance ? `<div class="doc-number">Échéance: ${formatDate(invoice.echeance)}</div>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h4>Client</h4>
        <p>${client.nom || invoice.clientNom}</p>
        ${client.telephone ? `<p style="font-weight:400;color:#555">${client.telephone}</p>` : ''}
        ${client.adresse ? `<p style="font-weight:400;color:#555">${client.adresse}</p>` : ''}
      </div>
      <div class="info-box">
        <h4>Paiement</h4>
        <p>${payInfo.icon} ${payInfo.label}</p>
        <p style="font-weight:400;color:#555">Statut: ${invoice.statut.toUpperCase()}</p>
      </div>
    </div>

    <table class="table-inv">
      <thead>
        <tr><th>#</th><th>Désignation</th><th>Unité</th><th style="text-align:right">Qté</th><th style="text-align:right">P.U (FCFA)</th><th style="text-align:right">Remise</th><th style="text-align:right">Montant (FCFA)</th></tr>
      </thead>
      <tbody>${lignesHTML}</tbody>
    </table>

    <div style="display:flex; justify-content:flex-end">
      <div class="totals">
        <div class="total-row"><span>Sous-total:</span><span>${new Intl.NumberFormat('fr-FR').format(invoice.sousTotal)} FCFA</span></div>
        ${invoice.remiseGlobale > 0 ? `<div class="total-row"><span>Remise globale:</span><span>- ${new Intl.NumberFormat('fr-FR').format(invoice.remiseGlobale)} FCFA</span></div>` : ''}
        <div class="total-row grand"><span>TOTAL:</span><span>${new Intl.NumberFormat('fr-FR').format(invoice.total)} FCFA</span></div>
        ${invoice.montantPaye > 0 ? `<div class="total-row"><span>Montant payé:</span><span>${new Intl.NumberFormat('fr-FR').format(invoice.montantPaye)} FCFA</span></div>` : ''}
        ${invoice.resteAPayer > 0 ? `<div class="total-row" style="color:#c00;font-weight:700"><span>Reste à payer:</span><span>${new Intl.NumberFormat('fr-FR').format(invoice.resteAPayer)} FCFA</span></div>` : ''}
      </div>
    </div>

    ${invoice.notes ? `<div style="margin-top:20px;padding:10px;background:#f8f8f8;border-radius:4px;font-size:11px"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}

    <div class="footer-inv">
      <div>Document émis par <strong>${invoice.createdByName}</strong> le ${formatDateTime(invoice.createdAt)}</div>
      <div class="sign-box">Signature & Cachet</div>
    </div>
    </div>`;

    if (window.html2pdf) {
      this._exportPdf(html, `${invoice.numero}.pdf`);
    } else {
      // html2pdf n'est pas encore chargé : on le télécharge à la demande
      // (il ne ralentit plus le démarrage de l'application)
      if (window.App) window.App.showToast('Génération du PDF en cours...', 'info');
      this._loadPdfLib().then(loaded => {
        if (loaded) this._exportPdf(html, `${invoice.numero}.pdf`);
        else this._fallbackPrint(html);
      });
    }
  },

  // ─── Export PDF (lib lazy-loadée) ─────────────────────────
  _pdfLibPromise: null,
  _loadPdfLib() {
    if (window.html2pdf) return Promise.resolve(true);
    if (!this._pdfLibPromise) {
      this._pdfLibPromise = new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => { this._pdfLibPromise = null; resolve(false); };
        document.head.appendChild(s);
      });
    }
    return this._pdfLibPromise;
  },

  _exportPdf(html, filename) {
    if (window.App) window.App.showToast('Génération du PDF en cours...', 'info');
    const container = document.createElement('div');
    container.innerHTML = html;
    html2pdf().set({
      margin: [10, 0], filename: filename, image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(container).save().then(() => {
      if (window.App) window.App.showToast('PDF téléchargé.', 'success');
    }).catch(() => this._fallbackPrint(html));
  },

  _fallbackPrint(html) {
    const win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><title>Impression</title></head><body>' + html + '</body></html>');
    win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  },

  printDevis(id) {
    const devis = DB.findById('devis', id);
    if (!devis) return;
    const company = DB.get('company') || GIS_COMPANY;
    const client = DB.findById('clients', devis.clientId) || {};
    const expiry = new Date(devis.date);
    expiry.setDate(expiry.getDate() + (parseInt(devis.validiteJours) || 30));

    const lignesHTML = devis.lignes.map((l, idx) => `
      <tr>
        <td>${idx+1}</td>
        <td>${l.designation}</td>
        <td>${l.unite || ''}</td>
        <td style="text-align:right">${l.qte}</td>
        <td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(l.prixUnitaire)}</td>
        <td style="text-align:right">${l.remise ? l.remise+'%' : '—'}</td>
        <td style="text-align:right">${new Intl.NumberFormat('fr-FR').format(l.montant)}</td>
      </tr>
    `).join('');

    const html = `
    <div style="padding: 10mm; background: #fff; color: #1a1a1a; font-family: Arial, sans-serif; font-size: 12px;">
    <style>
    .header-inv{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #1a1a1a;}
    .company-name{font-size:28px;font-weight:900;color:#1a1a1a;letter-spacing:2px;}.company-info{font-size:10px;color:#555;line-height:1.6;}
    .doc-type{font-size:20px;font-weight:700;text-align:right;color:#fff;background:#6C63FF;padding:8px 16px;border-radius:4px;display:inline-block;}
    .doc-number{font-size:11px;color:#777;text-align:right;margin-top:4px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0;}
    .info-box{background:#f8f8f8;padding:12px;border-radius:4px;border-left:3px solid #6C63FF;}
    .info-box h4{font-size:10px;text-transform:uppercase;color:#888;margin-bottom:6px;}.info-box p{font-size:12px;font-weight:600;}
    .table-inv{width:100%;border-collapse:collapse;margin:20px 0;}.table-inv thead tr{background:#6C63FF;color:#fff;}
    .table-inv th{padding:8px 6px;text-align:left;font-size:10px;text-transform:uppercase;}.table-inv td{padding:7px 6px;border-bottom:1px solid #eee;font-size:11px;}
    .table-inv tbody tr:nth-child(even){background:#fafafa;}.totals{margin-left:auto;width:280px;display:flex;flex-direction:column;}
    .total-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;}
    .total-row.grand{font-size:14px;font-weight:700;border-bottom:2px solid #6C63FF;padding-top:8px;margin-top:4px;}
    .footer-inv{margin-top:30px;padding-top:15px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:10px;color:#888;}
    .sign-box{text-align:center;border-top:1px solid #999;width:140px;padding-top:4px;font-size:10px;margin-top:30px;}
    .validity{background:#fff8e1;border:1px solid #ffd54f;padding:10px;border-radius:4px;margin:10px 0;font-size:11px;}
    </style>
    <div class="header-inv">
      <div><div class="company-name">${company.nom}</div>
      <div class="company-info">${company.slogan}<br>${company.adresse}${company.ville ? ', '+company.ville : ''}<br>
      ${company.telephone ? 'Tél: '+company.telephone : ''}${company.email ? ' | '+company.email : ''}<br>
      ${company.rccm ? 'RCCM: '+company.rccm : ''}${company.nif ? ' | NIF: '+company.nif : ''}</div></div>
      <div style="text-align:right"><div class="doc-type">📋 DEVIS</div>
      <div class="doc-number">N° ${devis.numero}</div>
      <div class="doc-number">Date: ${formatDate(devis.date)}</div>
      <div class="doc-number">Valable jusqu'au: ${formatDate(expiry)}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><h4>Client</h4><p>${client.nom || devis.clientNom}</p>
      ${client.telephone ? `<p style="font-weight:400;color:#555">${client.telephone}</p>` : ''}
      ${client.adresse ? `<p style="font-weight:400;color:#555">${client.adresse}</p>` : ''}</div>
      <div class="info-box"><h4>Validité</h4><p>${devis.validiteJours} jours</p>
      <p style="font-weight:400;color:#555">Expiration: ${formatDate(expiry)}</p></div>
    </div>
    <div class="validity">⚠️ Ce devis est valable ${devis.validiteJours} jours à compter du ${formatDate(devis.date)}. Passé ce délai, les prix peuvent être modifiés.</div>
    <table class="table-inv"><thead><tr><th>#</th><th>Désignation</th><th>Unité</th><th style="text-align:right">Qté</th><th style="text-align:right">P.U (FCFA)</th><th style="text-align:right">Remise</th><th style="text-align:right">Montant (FCFA)</th></tr></thead>
    <tbody>${lignesHTML}</tbody></table>

    <div style="display:flex; justify-content:flex-end">
      <div class="totals">
        <div class="total-row"><span>Sous-total:</span><span>${new Intl.NumberFormat('fr-FR').format(devis.sousTotal)} FCFA</span></div>
        ${devis.remiseGlobale > 0 ? `<div class="total-row"><span>Remise:</span><span>- ${new Intl.NumberFormat('fr-FR').format(devis.remiseGlobale)} FCFA</span></div>` : ''}
        <div class="total-row grand"><span>TOTAL DEVIS:</span><span>${new Intl.NumberFormat('fr-FR').format(devis.total)} FCFA</span></div>
      </div>
    </div>
    ${devis.notes ? `<div style="margin-top:20px;padding:10px;background:#f8f8f8;border-radius:4px;font-size:11px"><strong>Notes:</strong> ${devis.notes}</div>` : ''}
    <div class="footer-inv">
      <div>Devis établi par <strong>${devis.createdByName}</strong> le ${formatDateTime(devis.createdAt)}</div>
      <div><div class="sign-box">Bon pour accord<br>(Signature client)</div></div>
    </div>
    </div>`;

    if (window.html2pdf) {
      this._exportPdf(html, `${devis.numero}.pdf`);
    } else {
      this._loadPdfLib().then(loaded => {
        if (loaded) this._exportPdf(html, `${devis.numero}.pdf`);
        else this._fallbackPrint(html);
      });
    }
  }
};
