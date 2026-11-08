/**
 * GIS - Module: Application Principale (Routeur & Rendu UI)
 */
'use strict';

// ═══════════════════════════════════════════════════════════
// ÉTAT GLOBAL
// ═══════════════════════════════════════════════════════════
const App = {
  currentPage: 'dashboard',
  cart: [],
  invoiceLines: [],
  devisLines: [],
  inventoryItems: [],
  editingProductId: null,
  selectedInvoiceType: 'normale',
  msgTab: 'recu',

  // ─── Initialisation (démarrage instantané) ─────────────────
  // 1. Restauration du cache local → UI affichée immédiatement
  // 2. Synchronisation Supabase en arrière-plan, sans blocage
  async init() {
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    this.loadCart();
    DB.hydrateFromCache();
    if (!this._networkListenersInstalled) {
      window.addEventListener('online', () => this.updateNetworkStatus());
      window.addEventListener('offline', () => this.updateNetworkStatus());
      this._networkListenersInstalled = true;
    }
    this.updateNetworkStatus();

    try {
      await Auth.restoreSession();
    } catch (error) {
      console.error('[GIS] Restoring Supabase session failed:', error);
      this.showLogin();
      this.showToast(error.message || 'Connexion Supabase indisponible. Vérifiez la configuration du projet et votre réseau.', 'error');
      return;
    }
    if (window.location.hash.includes('type=recovery')) {
      this.showLogin();
      this.showLoginTab('recovery');
      return;
    }
    if (!Auth.isLoggedIn()) { this.showLogin(); this.updateSyncHint(); return; }
    this.showApp();
    this.navigate(this.currentPage);
    this.startCloudSync();
  },

  startCloudSync() {
    DB.initCloud(() => {
      if (Auth.isAdmin() && !this._seeded) {
        this._seeded = true;
        initializeDB();
      }
      this.updateSyncHint();
      if (Auth.isLoggedIn() && this.currentPage && Auth.hasPage(this.currentPage)) {
        this.navigate(this.currentPage);
      }
    });
  },

  // Mise à jour cloud continue — débouncée pour éviter les re-rendus en cascade
  onCloudUpdate() {
    if (this._refreshTimer) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this.updateSyncHint();
      if (!Auth.isLoggedIn()) return;
      Auth.refreshProfile();
      if (!Auth.isLoggedIn()) { Auth.logout(); return; }
      if (document.getElementById('app-shell').style.display === 'none') {
        this.showApp();
        this.navigate(this.currentPage);
        return;
      }
      if (this.currentPage && Auth.hasPage(this.currentPage)) this.navigate(this.currentPage);
      this.updateBadges();
    }, 600);
  },

  // Indicateur discret d'état de synchronisation sur l'écran de connexion
  updateSyncHint() {
    const hint = document.getElementById('login-sync-hint');
    if (!hint) return;
    hint.textContent = DB.isCloudReady
      ? ''
      : '☁️ Synchronisation cloud en arrière-plan — vous pouvez déjà vous connecter.';
  },

  updateNetworkStatus() {
    const status = document.getElementById('network-status');
    if (!status) return;
    const online = navigator.onLine;
    status.textContent = online ? 'En ligne' : 'Hors ligne · données locales';
    status.classList.toggle('offline', !online);
    status.setAttribute('aria-label', online ? 'Connexion Internet disponible' : 'Hors ligne, données locales disponibles');
  },

  // ─── Login ───────────────────────────────────────────────
  showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    this.showLoginTab('login');
  },

  showLoginTab(tab) {
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-register').style.display = 'none';
    document.getElementById('form-forgot').style.display = 'none';
    document.getElementById('form-recovery').style.display = 'none';

    document.getElementById('tab-login').style.color = '#888';
    document.getElementById('tab-login').style.borderBottomColor = 'transparent';
    document.getElementById('tab-register').style.color = '#888';
    document.getElementById('tab-register').style.borderBottomColor = 'transparent';

    if (tab === 'login') {
      document.getElementById('form-login').style.display = 'block';
      document.getElementById('tab-login').style.color = '#6C63FF';
      document.getElementById('tab-login').style.borderBottomColor = '#6C63FF';
    } else if (tab === 'register') {
      document.getElementById('form-register').style.display = 'block';
      document.getElementById('tab-register').style.color = '#6C63FF';
      document.getElementById('tab-register').style.borderBottomColor = '#6C63FF';
    } else if (tab === 'forgot') {
      document.getElementById('form-forgot').style.display = 'block';
      // keep both tabs inactive visually
    } else if (tab === 'recovery') {
      document.getElementById('form-recovery').style.display = 'block';
    }
  },

  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    this.buildSidebar();
    this.updateBadges();
    if (!this._badgeTimer) this._badgeTimer = setInterval(() => this.updateBadges(), 30000);
  },

  // Petit alias de permission (utilisé par le FAB dans index.html)
  hasPage(page) { return Auth.hasPage(page); },

  // ─── Sidebar mobile (tiroir off-canvas) ──────────────────
  toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (sb) sb.classList.contains('open') ? this.closeSidebar() : this.openSidebar();
  },
  openSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebar-overlay')?.classList.add('show');
    document.body.classList.add('nav-open');
  },
  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
    document.body.classList.remove('nav-open');
  },

  async handleLogin() {
    const email = document.getElementById('login-username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const result = await Auth.login(email, password);
    if (result.success) { this.showApp(); this.navigate('dashboard'); }
    else { document.getElementById('login-error').textContent = result.error; }
    if (result.success) this.startCloudSync();
  },

  async handleRegister() {
    const prenom = document.getElementById('reg-prenom').value.trim();
    const nom = document.getElementById('reg-nom').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!prenom || !nom || !username || !email || !password) {
      document.getElementById('reg-error').textContent = 'Tous les champs sont requis.';
      return;
    }
    if (password.length < 12) {
      document.getElementById('reg-error').textContent = 'Le mot de passe doit comporter au moins 12 caractères.';
      return;
    }
    try {
      await Auth.register({ prenom, nom, username, email, password });
      this.showLoginTab('login');
      document.getElementById('login-username').value = email;
      this.showToast('Inscription créée. Confirmez votre adresse e-mail avant de vous connecter.', 'success');
    } catch (error) {
      console.error('[GIS] Registration failed:', error);
      document.getElementById('reg-error').textContent = Auth._authError(error);
    }
  },

  async handleForgot() {
    const email = document.getElementById('forgot-username').value.trim();
    if (!email) {
      this.showToast('Veuillez entrer une adresse e-mail.', 'error');
      return;
    }
    try {
      await Auth.sendPasswordReset(email);
      this.showToast('Si ce compte existe, un lien de réinitialisation a été envoyé.', 'success');
      this.showLoginTab('login');
    } catch (error) {
      console.error('[GIS] Password reset request failed:', error);
      this.showToast(Auth._authError(error), 'error');
    }
  },

  async handlePasswordRecovery() {
    const password = document.getElementById('recovery-password').value;
    const confirmation = document.getElementById('recovery-password-confirm').value;
    const errorEl = document.getElementById('recovery-error');
    if (password.length < 12) { errorEl.textContent = 'Le mot de passe doit comporter au moins 12 caractères.'; return; }
    if (password !== confirmation) { errorEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) { errorEl.textContent = Auth._authError(error); return; }
    try {
      await Auth.restoreSession();
      if (!Auth.isLoggedIn()) {
        this.showLogin();
        this.showToast('Compte inactif. Contactez un administrateur pour activer vos accès.', 'error');
        return;
      }
      this.showApp();
      this.navigate('dashboard');
      this.startCloudSync();
    } catch (sessionError) {
      errorEl.textContent = Auth._authError(sessionError);
    }
  },

  // ─── Sidebar ─────────────────────────────────────────────
  buildSidebar() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const roleInfo = Auth.getRoleInfo(user.role);
    document.getElementById('sidebar-user-name').textContent = `${user.prenom} ${user.nom}`;
    document.getElementById('sidebar-user-role').textContent = roleInfo.label;
    document.getElementById('sidebar-user-role').style.color = roleInfo.color;

    const navItems = Auth.getNavItems();
    const groups = {
      superadmin:'🔑 SuperAdmin',
      principal:'Principal',
      commercial:'Commercial',
      finance:'Finance',
      stock:'Stock',
      communication:'Communication',
      admin:'Administration',
      compte:'Mon Compte'
    };
    const grouped = {};
    for (const item of navItems) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }

    let html = '';
    for (const [grp, label] of Object.entries(groups)) {
      if (!grouped[grp]) continue;
      html += `<div class="nav-group-label">${label}</div>`;
      for (const item of grouped[grp]) {
        html += `<a href="#" class="nav-item" data-page="${item.page}" onclick="App.navigate('${item.page}');return false;">
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
          ${item.page==='notifications' ? '<span class="nav-badge notif-badge" id="notif-badge-nav"></span>' : ''}
          ${item.page==='messages' ? '<span class="nav-badge msg-badge" id="msg-badge-nav"></span>' : ''}
          ${item.page==='panier' ? '<span class="nav-badge cart-badge" id="cart-badge-nav"></span>' : ''}
        </a>`;
      }
    }
    document.getElementById('sidebar-nav').innerHTML = html;
  },

  updateBadges() {
    const nb = Notifs.getUnreadCount();
    const mb = Messages.getUnreadCount();
    const cb = this.cart.length;
    ['notif-badge-nav','notif-badge-header'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = nb || ''; el.style.display = nb ? 'flex' : 'none'; }
    });
    ['msg-badge-nav','msg-badge-header'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = mb || ''; el.style.display = mb ? 'flex' : 'none'; }
    });
    ['cart-badge-nav','cart-badge-header'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = cb || ''; el.style.display = cb ? 'flex' : 'none'; }
    });
  },

  // ─── Navigation ──────────────────────────────────────────
  navigate(page) {
    if (!Auth.hasPage(page)) { this.showToast('Accès refusé pour votre rôle.', 'error'); return; }
    this.currentPage = page;
    this.closeSidebar();
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const titles = {
      dashboard:'Tableau de bord', produits:'Catalogue Produits', stock:'État du Stock',
      inventaire:'Inventaire', entrees_stock:'Entrées de Stock', factures:'Factures',
      devis:'Devis', caisse:'Caisse', clients:'Clients', messages:'Messages',
      notifications:'Notifications', panier:'Panier', profil:'Mon Profil',
      parametres:'Paramètres', utilisateurs:'Gestion Utilisateurs',
      fournisseurs:'Fournisseurs', rapports:'Rapports',
      roles:'Rôles & Droits', superadmin:'Console SuperAdmin', archives:'Archives'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const mc = document.getElementById('main-content');
    mc.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
    setTimeout(() => {
      switch(page) {
        case 'dashboard':      this.renderDashboard(); break;
        case 'produits':       this.renderProduits(); break;
        case 'stock':          this.renderStock(); break;
        case 'inventaire':     this.renderInventaire(); break;
        case 'entrees_stock':  this.renderEntreesStock(); break;
        case 'factures':       this.renderFactures(); break;
        case 'devis':          this.renderDevis(); break;
        case 'archives':       this.renderArchives(); break;
        case 'caisse':         this.renderCaisse(); break;
        case 'clients':        this.renderClients(); break;
        case 'messages':       this.renderMessages(); break;
        case 'notifications':  this.renderNotifications(); break;
        case 'panier':         this.renderPanier(); break;
        case 'profil':         this.renderProfil(); break;
        case 'parametres':     this.renderParametres(); break;
        case 'utilisateurs':   this.renderUtilisateurs(); break;
        case 'fournisseurs':   this.renderFournisseurs(); break;
        case 'rapports':       this.renderRapports(); break;
        case 'roles':          this.renderRoles(); break;
        case 'superadmin':     this.renderSuperAdmin(); break;
      }
    }, 50);
  },

  // ─── DASHBOARD ───────────────────────────────────────────
  renderDashboard() {
    const stats = Invoices.getDashboardStats();
    const soldes = Caisse.getAllSoldes();
    const totalSolde = Caisse.getTotalSolde();
    const lowStock = Stock.getLowStockProducts();
    const salesHistory = Invoices.getSalesHistory(7);
    const recentInvoices = Invoices.getInvoices({}).slice(0, 5);

    const mc = document.getElementById('main-content');
    mc.innerHTML = `
    <div class="dashboard">
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card" style="--accent:#6C63FF">
          <div class="kpi-icon" style="background:rgba(108,99,255,0.15)">💰</div>
          <div class="kpi-content">
            <div class="kpi-label">CA du Jour</div>
            <div class="kpi-value">${formatCurrency(stats.caJour)}</div>
            <div class="kpi-sub">${stats.nbFactures} facture(s) aujourd'hui</div>
          </div>
        </div>
        <div class="kpi-card" style="--accent:#FFA502">
          <div class="kpi-icon" style="background:rgba(255,165,2,0.15)">⏳</div>
          <div class="kpi-content">
            <div class="kpi-label">Créances</div>
            <div class="kpi-value">${formatCurrency(stats.totalCreances)}</div>
            <div class="kpi-sub">${stats.enAttente} facture(s) à crédit</div>
          </div>
        </div>
        <div class="kpi-card" style="--accent:#00D4AA">
          <div class="kpi-icon" style="background:rgba(0,212,170,0.15)">🏦</div>
          <div class="kpi-content">
            <div class="kpi-label">Solde Caisse</div>
            <div class="kpi-value">${formatCurrency(totalSolde.solde)}</div>
            <div class="kpi-sub">Tous modes confondus</div>
          </div>
        </div>
        <div class="kpi-card" style="--accent:#FF4757">
          <div class="kpi-icon" style="background:rgba(255,71,87,0.15)">📦</div>
          <div class="kpi-content">
            <div class="kpi-label">Stock Bas</div>
            <div class="kpi-value">${lowStock.length}</div>
            <div class="kpi-sub">Produit(s) sous seuil</div>
          </div>
        </div>
      </div>

      <!-- Charts & Tables row -->
      <div class="dash-row">
        <!-- Sales Chart -->
        <div class="card chart-card">
          <div class="card-header"><h3>📈 Ventes (7 derniers jours)</h3></div>
          <div class="chart-wrapper">
            <canvas id="sales-chart" height="200"></canvas>
          </div>
        </div>
        <!-- Soldes Caisse -->
        <div class="card">
          <div class="card-header"><h3>💳 Soldes par Mode</h3></div>
          <div class="soldes-list">
            ${soldes.map(s => `
            <div class="solde-item">
              <span class="solde-icon" style="background:${s.color}22;color:${s.color}">${s.icon}</span>
              <div class="solde-info">
                <span class="solde-label">${s.label}</span>
                <span class="solde-value" style="color:${s.solde >= 0 ? '#2ED573' : '#FF4757'}">${formatCurrency(s.solde)}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Invoices & Low Stock -->
      <div class="dash-row">
        <div class="card">
          <div class="card-header"><h3>🧾 Dernières Factures</h3>
            <button class="btn-link" onclick="App.navigate('factures')">Voir tout →</button>
          </div>
          ${recentInvoices.length === 0 ? '<div class="empty-state-small">Aucune facture</div>' : `
          <table class="data-table">
            <thead><tr><th>N°</th><th>Client</th><th>Type</th><th>Montant</th><th>Statut</th></tr></thead>
            <tbody>
              ${recentInvoices.map(inv => {
                const ti = getInvoiceTypeInfo(inv.type);
                return `<tr>
                  <td><code>${inv.numero}</code></td>
                  <td>${inv.clientNom}</td>
                  <td><span class="badge" style="background:${ti.bg};color:${ti.color}">${ti.icon} ${ti.label}</span></td>
                  <td>${formatCurrency(inv.total)}</td>
                  <td><span class="status-badge status-${inv.statut}">${this.statutLabel(inv.statut)}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
        <div class="card">
          <div class="card-header"><h3>⚠️ Stock Bas</h3>
            <button class="btn-link" onclick="App.navigate('stock')">Voir stock →</button>
          </div>
          ${lowStock.length === 0 ? '<div class="empty-state-small" style="color:#2ED573">✅ Tous les stocks sont suffisants</div>' : `
          <div class="low-stock-list">
            ${lowStock.slice(0, 8).map(p => `
            <div class="low-stock-item">
              <div class="low-stock-name">${p.name}</div>
              <div class="low-stock-info">
                <span class="stock-value ${p.stock <= 0 ? 'danger' : 'warning'}">${p.stock} ${p.unite}</span>
                <span class="stock-min">min: ${p.stockMin}</span>
              </div>
            </div>`).join('')}
          </div>`}
        </div>
      </div>
    </div>`;

    this.drawSalesChart(salesHistory);
  },

  drawSalesChart(data, canvasId = 'sales-chart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.parentElement.clientWidth - 40;
    const H = 200;
    canvas.width = W; canvas.height = H;

    const maxCa = Math.max(...data.map(d => d.ca), 1);
    const barW = Math.floor((W - 40) / data.length) - 8;
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = 20 + ((H - 60) / 4) * i;
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      ctx.moveTo(30, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(new Intl.NumberFormat('fr-FR',{notation:'compact'}).format(maxCa - (maxCa/4)*i), 28, y + 4);
    }

    // Bars
    data.forEach((d, i) => {
      const x = 40 + i * (barW + 8);
      const barH = maxCa > 0 ? ((d.ca / maxCa) * (H - 60)) : 0;
      const y = H - 40 - barH;

      const grad = ctx.createLinearGradient(0, y, 0, H - 40);
      grad.addColorStop(0, 'rgba(108,99,255,0.9)');
      grad.addColorStop(1, 'rgba(0,212,170,0.4)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, H - 10);

      if (d.ca > 0) {
        ctx.fillStyle = '#fff'; ctx.font = '9px Inter';
        ctx.fillText(new Intl.NumberFormat('fr-FR',{notation:'compact'}).format(d.ca), x + barW / 2, y - 4);
      }
    });
  },

  // ─── PRODUITS ────────────────────────────────────────────
  renderProduits(filterCat = '', filterSearch = '') {
    const products = Stock.getProducts({ categorie: filterCat || undefined, search: filterSearch || undefined, actif: true });
    const mc = document.getElementById('main-content');
    mc.innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <input type="text" class="search-input" id="prod-search" placeholder="🔍 Rechercher un produit..." value="${filterSearch}" oninput="App.liveSearch('renderProduits', '${filterCat}', this.value)">
        <select class="select-input" id="prod-cat" onchange="App.renderProduits(this.value, document.getElementById('prod-search').value)">
          <option value="">Toutes catégories</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${filterCat===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right">
        ${Auth.canDo('manage_products') ? '<button class="btn btn-primary" onclick="App.openProductModal()">+ Nouveau Produit</button>' : ''}
      </div>
    </div>
    <div class="products-grid">
      ${products.map(p => `
      <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : p.stock < p.stockMin ? 'low-stock' : ''}">
        <div class="product-cat-badge">${p.categorie}</div>
        <div class="product-code">${p.code}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-stock-bar">
          <div class="stock-bar-fill" style="width:${Math.min(100, (p.stock / Math.max(p.stockMin * 2, 1)) * 100)}%;background:${p.stock <= 0 ? '#FF4757' : p.stock < p.stockMin ? '#FFA502' : '#2ED573'}"></div>
        </div>
        <div class="product-details">
          <div class="product-detail-row">
            <span>Stock:</span>
            <span class="${p.stock <= 0 ? 'text-danger' : p.stock < p.stockMin ? 'text-warning' : 'text-success'}">${p.stock} ${p.unite}</span>
          </div>
          <div class="product-detail-row">
            <span>Prix vente:</span>
            <span class="text-primary">${formatCurrency(p.prixVente)}</span>
          </div>
          <div class="product-detail-row">
            <span>Prix achat:</span>
            <span>${formatCurrency(p.prixAchat)}</span>
          </div>
        </div>
        <div class="product-actions">
          ${Auth.canDo('manage_products') ? `<button class="btn btn-sm btn-outline" onclick="App.openProductModal('${p.id}')">✏️ Modifier</button>` : ''}
          ${Auth.hasPage('panier') ? `<button class="btn btn-sm btn-primary" onclick="App.addToCart('${p.id}')">🛒 Panier</button>` : ''}
        </div>
      </div>`).join('')}
    </div>
    ${this.productModal()}`;
  },

  productModal() {
    return `
    <div id="product-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3 id="product-modal-title">Nouveau Produit</h3><button class="modal-close" onclick="App.closeModal('product-modal')">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Code</label><input type="text" id="pm-code" class="form-input" placeholder="Ex: CIM425"></div>
            <div class="form-group"><label>Nom *</label><input type="text" id="pm-name" class="form-input" placeholder="Nom du produit"></div>
            <div class="form-group"><label>Catégorie</label>
              <select id="pm-cat" class="form-input">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
            <div class="form-group"><label>Unité</label><input type="text" id="pm-unite" class="form-input" placeholder="Ex: Sac, Barre..."></div>
            <div class="form-group"><label>Prix d'achat (FCFA)</label><input type="number" id="pm-pa" class="form-input" min="0"></div>
            <div class="form-group"><label>Prix de vente (FCFA)</label><input type="number" id="pm-pv" class="form-input" min="0"></div>
            <div class="form-group"><label>Stock actuel</label><input type="number" id="pm-stock" class="form-input" min="0"></div>
            <div class="form-group"><label>Stock minimum</label><input type="number" id="pm-stockmin" class="form-input" min="0"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('product-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveProduct()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openProductModal(id = null) {
    this.editingProductId = id;
    document.getElementById('product-modal-title').textContent = id ? 'Modifier le Produit' : 'Nouveau Produit';
    if (id) {
      const p = Stock.getProduct(id);
      if (p) {
        document.getElementById('pm-code').value = p.code;
        document.getElementById('pm-name').value = p.name;
        document.getElementById('pm-cat').value = p.categorie;
        document.getElementById('pm-unite').value = p.unite;
        document.getElementById('pm-pa').value = p.prixAchat;
        document.getElementById('pm-pv').value = p.prixVente;
        document.getElementById('pm-stock').value = p.stock;
        document.getElementById('pm-stockmin').value = p.stockMin;
      }
    } else {
      ['pm-code','pm-name','pm-unite','pm-pa','pm-pv','pm-stock','pm-stockmin'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    }
    document.getElementById('product-modal').style.display = 'flex';
  },

  saveProduct() {
    const data = {
      code: document.getElementById('pm-code').value.trim(),
      name: document.getElementById('pm-name').value.trim(),
      categorie: document.getElementById('pm-cat').value,
      unite: document.getElementById('pm-unite').value.trim(),
      prixAchat: parseFloat(document.getElementById('pm-pa').value) || 0,
      prixVente: parseFloat(document.getElementById('pm-pv').value) || 0,
      stock: parseFloat(document.getElementById('pm-stock').value) || 0,
      stockMin: parseFloat(document.getElementById('pm-stockmin').value) || 5
    };
    if (!data.name) { this.showToast('Le nom du produit est requis.', 'error'); return; }
    if ([data.prixAchat, data.prixVente, data.stock, data.stockMin].some(value => !Number.isFinite(value) || value < 0)) {
      this.showToast('Les prix et les quantités doivent être positifs ou nuls.', 'error');
      return;
    }
    if (this.editingProductId) Stock.updateProduct(this.editingProductId, data);
    else Stock.addProduct(data);
    this.closeModal('product-modal');
    this.showToast('Produit enregistré avec succès.', 'success');
    this.renderProduits();
  },

  // ─── STOCK ───────────────────────────────────────────────
  renderStock(filterCat = '', filterSearch = '') {
    const report = Stock.getInventoryReport();
    let filtered = report;
    if (filterCat) filtered = filtered.filter(p => p.categorie === filterCat);
    if (filterSearch) filtered = filtered.filter(p => p.name.toLowerCase().includes(filterSearch.toLowerCase()));

    const totalVal = filtered.reduce((a, p) => a + p.valeurStock, 0);
    const ruptures = filtered.filter(p => p.stock <= 0).length;
    const bas = filtered.filter(p => p.stock > 0 && p.stock < p.stockMin).length;

    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <input type="text" class="search-input" id="stock-search" placeholder="🔍 Rechercher..." value="${filterSearch}" oninput="App.liveSearch('renderStock', '${filterCat}', this.value)">
        <select class="select-input" onchange="App.renderStock(this.value, document.getElementById('stock-search').value)">
          <option value="">Toutes catégories</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${filterCat===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar-right">
        <div class="kpi-mini"><span>Valeur stock:</span><strong>${formatCurrency(totalVal)}</strong></div>
        <div class="kpi-mini danger"><span>Ruptures:</span><strong>${ruptures}</strong></div>
        <div class="kpi-mini warning"><span>Bas:</span><strong>${bas}</strong></div>
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Code</th><th>Produit</th><th>Catégorie</th><th>Unité</th><th>Stock</th><th>Min</th><th>P. Achat</th><th>P. Vente</th><th>Valeur</th><th>Statut</th></tr></thead>
        <tbody>
          ${filtered.map(p => `
          <tr>
            <td><code>${p.code}</code></td>
            <td><strong>${p.name}</strong></td>
            <td><span class="cat-tag">${p.categorie}</span></td>
            <td>${p.unite}</td>
            <td class="${p.stock <= 0 ? 'text-danger fw-bold' : p.stock < p.stockMin ? 'text-warning fw-bold' : 'text-success'}">${p.stock}</td>
            <td class="text-muted">${p.stockMin}</td>
            <td>${formatCurrency(p.prixAchat)}</td>
            <td class="text-primary">${formatCurrency(p.prixVente)}</td>
            <td>${formatCurrency(p.valeurStock)}</td>
            <td><span class="status-badge status-${p.statut}">${p.statut === 'ok' ? '✅ OK' : p.statut === 'bas' ? '⚠️ Bas' : '🔴 Rupture'}</span></td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="8" class="text-right fw-bold">VALEUR TOTALE DU STOCK:</td><td colspan="2" class="text-primary fw-bold">${formatCurrency(totalVal)}</td></tr>
        </tfoot>
      </table>
    </div>`;
  },

  // ─── ENTRÉES DE STOCK ────────────────────────────────────
  renderEntreesStock() {
    const entries = Stock.getStockEntries({}).slice(0, 50);
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <button class="btn btn-primary" onclick="App.openEntryModal()">+ Nouvelle Entrée de Stock</button>
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>N°</th><th>Date</th><th>Type</th><th>Produit</th><th>Quantité</th><th>P. Unitaire</th><th>Montant</th><th>Référence</th><th>Par</th></tr></thead>
        <tbody>
          ${entries.length === 0 ? '<tr><td colspan="9" class="empty-cell">Aucune entrée enregistrée</td></tr>' : ''}
          ${entries.map(e => `
          <tr>
            <td><code>${e.numero}</code></td>
            <td>${formatDate(e.date)}</td>
            <td><span class="badge ${e.type==='entree'?'badge-success':e.type==='sortie'?'badge-danger':e.type==='correction'?'badge-info':'badge-warning'}">${e.type.toUpperCase()}</span></td>
            <td>${e.produitName}</td>
            <td class="fw-bold">${e.qte}</td>
            <td>${formatCurrency(e.prixUnitaire)}</td>
            <td>${formatCurrency(e.montant)}</td>
            <td class="text-muted">${e.reference || '—'}</td>
            <td class="text-muted">${e.createdByName}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <!-- Modal Entrée -->
    <div id="entry-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3>Nouvelle Entrée de Stock</h3><button class="modal-close" onclick="App.closeModal('entry-modal')">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Type d'opération *</label>
              <select id="ent-type" class="form-input">
                <option value="entree">Entrée (Réception)</option>
                <option value="retour">Retour fournisseur</option>
                <option value="correction">Correction d'inventaire</option>
              </select>
            </div>
            <div class="form-group"><label>Produit *</label>
              <select id="ent-produit" class="form-input">
                <option value="">-- Sélectionner --</option>
                ${Stock.getProducts({actif:true}).map(p => `<option value="${p.id}">${p.name} (Stock: ${p.stock} ${p.unite})</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Quantité *</label><input type="number" id="ent-qte" class="form-input" min="0" step="0.01"></div>
            <div class="form-group"><label>Prix unitaire (FCFA)</label><input type="number" id="ent-pu" class="form-input" min="0"></div>
            <div class="form-group"><label>Fournisseur</label><input type="text" id="ent-fourn" class="form-input" placeholder="Nom fournisseur"></div>
            <div class="form-group"><label>Référence BL/BC</label><input type="text" id="ent-ref" class="form-input" placeholder="N° Bon de livraison"></div>
            <div class="form-group"><label>Date</label><input type="date" id="ent-date" class="form-input" value="${todayStr()}"></div>
            <div class="form-group"><label>Notes</label><input type="text" id="ent-notes" class="form-input" placeholder="Observations..."></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('entry-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveEntry()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openEntryModal() { document.getElementById('entry-modal').style.display = 'flex'; },

  saveEntry() {
    const data = {
      type: document.getElementById('ent-type').value,
      produitId: document.getElementById('ent-produit').value,
      qte: parseFloat(document.getElementById('ent-qte').value) || 0,
      prixUnitaire: parseFloat(document.getElementById('ent-pu').value) || 0,
      fournisseur: document.getElementById('ent-fourn').value,
      reference: document.getElementById('ent-ref').value,
      date: document.getElementById('ent-date').value,
      notes: document.getElementById('ent-notes').value
    };
    const quantityIsValid = data.type === 'correction' ? data.qte >= 0 : data.qte > 0;
    if (!data.produitId || !quantityIsValid) {
      this.showToast(data.type === 'correction' ? 'Produit et quantité valide requis.' : 'Produit et quantité positive requis.', 'error');
      return;
    }
    const result = Stock.addStockEntry(data);
    if (result.success) {
      this.closeModal('entry-modal');
      this.showToast('Mouvement de stock enregistré.', 'success');
      this.renderEntreesStock();
    } else this.showToast(result.error, 'error');
  },

  // ─── INVENTAIRE ──────────────────────────────────────────
  renderInventaire() {
    const products = Stock.getProducts({ actif: true });
    this.inventoryItems = products.map(p => ({ produitId: p.id, nom: p.name, unite: p.unite, stockTheorique: p.stock, qtePhysique: p.stock }));

    document.getElementById('main-content').innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>📋 Saisie Inventaire Physique — ${formatDate(todayStr())}</h3>
        <button class="btn btn-primary" onclick="App.validateInventory()">✅ Valider l'inventaire</button>
      </div>
      <p class="text-muted" style="padding:0 20px 10px">Saisissez les quantités physiques comptées. Les écarts seront calculés automatiquement.</p>
      <table class="data-table" id="inv-table">
        <thead><tr><th>Produit</th><th>Unité</th><th>Stock Théorique</th><th>Quantité Physique</th><th>Écart</th></tr></thead>
        <tbody>
          ${this.inventoryItems.map((item, idx) => `
          <tr id="inv-row-${idx}">
            <td><strong>${item.nom}</strong></td>
            <td>${item.unite}</td>
            <td class="text-primary">${item.stockTheorique}</td>
            <td><input type="number" class="form-input-inline inv-qty" data-idx="${idx}" value="${item.qtePhysique}" min="0" step="0.01" oninput="App.updateInventoryRow(${idx}, this.value)"></td>
            <td class="inv-ecart-${idx} ${item.qtePhysique - item.stockTheorique !== 0 ? (item.qtePhysique - item.stockTheorique > 0 ? 'text-success' : 'text-danger') : 'text-muted'}">
              ${item.qtePhysique - item.stockTheorique > 0 ? '+' : ''}${item.qtePhysique - item.stockTheorique}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  },

  updateInventoryRow(idx, val) {
    if (!this.inventoryItems[idx]) return;
    const qte = val === '' ? NaN : Number(val);
    this.inventoryItems[idx].qtePhysique = qte;
    const ecart = qte - this.inventoryItems[idx].stockTheorique;
    const el = document.querySelector(`.inv-ecart-${idx}`);
    if (el) {
      el.textContent = Number.isFinite(ecart) ? (ecart > 0 ? '+' : '') + ecart : '—';
      el.className = `inv-ecart-${idx} ${!Number.isFinite(ecart) ? 'text-warning' : ecart !== 0 ? (ecart > 0 ? 'text-success' : 'text-danger') : 'text-muted'}`;
    }
  },

  async validateInventory() {
    const ok = await GISDialog.confirm({
      title: 'Valider l\'inventaire',
      message: 'Les stocks seront ajustés aux quantités physiques saisies. Cette action crée des mouvements de correction. Continuer ?',
      icon: '🔍', type: 'primary', confirmLabel: 'Valider l\'inventaire'
    });
    if (!ok) return;
    const result = Stock.processInventory(this.inventoryItems);
    if (!result.success) {
      this.showToast(result.error, 'error');
      return;
    }
    this.showToast(`Inventaire validé: ${result.results.length} produits mis à jour.`, 'success');
    this.renderInventaire();
  },

  // ─── FACTURES ────────────────────────────────────────────
  renderFactures(filterType = '', filterSearch = '', filterStatut = '') {
    const invoices = Invoices.getInvoices({ type: filterType || undefined, statut: filterStatut || undefined, search: filterSearch || undefined });

    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <input type="text" class="search-input" id="fac-search" placeholder="🔍 N° facture, client..." value="${filterSearch}" oninput="App.liveSearch('renderFactures', '${filterType}', this.value, '${filterStatut}')">
        <select class="select-input" onchange="App.renderFactures(this.value, document.getElementById('fac-search').value, '${filterStatut}')">
          <option value="">Tous types</option>
          ${INVOICE_TYPES.map(t => `<option value="${t.id}" ${filterType===t.id?'selected':''}>${t.icon} ${t.label}</option>`).join('')}
        </select>
        <select class="select-input" onchange="App.renderFactures('${filterType}', document.getElementById('fac-search').value, this.value)">
          <option value="">Tous statuts</option>
          <option value="paye" ${filterStatut==='paye'?'selected':''}>Payé</option>
          <option value="credit" ${filterStatut==='credit'?'selected':''}>Crédit</option>
          <option value="partiel" ${filterStatut==='partiel'?'selected':''}>Partiel</option>
          <option value="annule" ${filterStatut==='annule'?'selected':''}>Annulé</option>
        </select>
      </div>
      <div class="toolbar-right">
        ${Auth.canDo('create_invoice') ? '<button class="btn btn-primary" onclick="App.openFactureForm()">+ Nouvelle Facture</button>' : ''}
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>N° Facture</th><th>Date</th><th>Client</th><th>Type</th><th>Total</th><th>Payé</th><th>Reste</th><th>Mode</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${invoices.length === 0 ? '<tr><td colspan="10" class="empty-cell">Aucune facture trouvée</td></tr>' : ''}
          ${invoices.map(inv => {
            const ti = getInvoiceTypeInfo(inv.type);
            const pm = getPaymentMethodInfo(inv.modePaiement);
            return `<tr>
              <td><code class="clickable" onclick="App.openFactureDetail('${inv.id}')">${inv.numero}</code></td>
              <td>${formatDate(inv.date)}</td>
              <td>${inv.clientNom}</td>
              <td><span class="badge" style="background:${ti.bg};color:${ti.color};font-size:10px">${ti.icon} ${ti.label}</span></td>
              <td class="fw-bold">${formatCurrency(inv.total)}</td>
              <td class="text-success">${formatCurrency(inv.montantPaye)}</td>
              <td class="${inv.resteAPayer > 0 ? 'text-danger fw-bold' : 'text-muted'}">${inv.resteAPayer > 0 ? formatCurrency(inv.resteAPayer) : '—'}</td>
              <td>${pm.icon} ${pm.label}</td>
              <td><span class="status-badge status-${inv.statut}">${this.statutLabel(inv.statut)}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" title="Imprimer" onclick="Invoices.printInvoice('${inv.id}')">🖨️</button>
                  ${inv.statut !== 'annule' ? `<button class="btn-icon" title="Annuler" onclick="App.cancelInvoice('${inv.id}')">❌</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  },

  openFactureForm(devisId = null) {
    this.selectedInvoiceType = 'normale';
    const clients = Invoices.getClients();
    const products = Stock.getProducts({ actif: true });
    this.invoiceLines = [];
    if (devisId) {
      const devis = Invoices.getDevisById(devisId);
      if (devis) this.invoiceLines = devis.lignes.map(l => ({ ...l }));
    }

    document.getElementById('main-content').innerHTML = `
    <div class="form-page">
      <div class="form-page-header">
        <h2>🧾 Nouvelle Facture</h2>
        <button class="btn btn-outline" onclick="App.navigate('factures')">← Retour</button>
      </div>

      <!-- Type Facture -->
      <div class="card">
        <div class="card-header"><h3>Type de Facture</h3></div>
        <div class="type-selector">
          ${INVOICE_TYPES.map(t => `
          <label class="type-option" style="--tc:${t.color};--tbg:${t.bg}">
            <input type="radio" name="inv-type" value="${t.id}" ${t.id==='normale'?'checked':''} onchange="App.selectedInvoiceType=this.value;App.updateInvoiceTypeUI()">
            <span class="type-option-content">
              <span class="type-opt-icon">${t.icon}</span>
              <span class="type-opt-label">${t.label}</span>
            </span>
          </label>`).join('')}
        </div>
      </div>

      <!-- Infos générales -->
      <div class="card">
        <div class="card-header"><h3>Informations Générales</h3></div>
        <div class="form-grid">
          <div class="form-group">
            <label>Client *</label>
            <div style="display:flex;gap:8px">
              <select id="inv-client" class="form-input" style="flex:1">
                <option value="">-- Sélectionner --</option>
                ${clients.map(c => `<option value="${c.id}" data-avoir="${c.avoir}" data-creance="${c.creance}">${c.nom} ${c.telephone ? '('+c.telephone+')' : ''}</option>`).join('')}
              </select>
              <button class="btn btn-outline btn-sm" onclick="App.openClientModal()">+</button>
            </div>
            <div id="client-info-box" style="display:none;margin-top:6px;padding:8px;background:rgba(108,99,255,0.1);border-radius:6px;font-size:12px"></div>
          </div>
          <div class="form-group"><label>Date *</label><input type="date" id="inv-date" class="form-input" value="${todayStr()}"></div>
          <div class="form-group" id="echeance-group" style="display:none"><label>Échéance</label><input type="date" id="inv-echeance" class="form-input"></div>
          <div class="form-group">
            <label>Mode de paiement</label>
            <select id="inv-mode" class="form-input">
              ${PAYMENT_METHODS.map(pm => `<option value="${pm.id}">${pm.icon} ${pm.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="facture-liee-group" style="display:none">
            <label>Facture liée</label>
            <select id="inv-facture-liee" class="form-input">
              <option value="">-- Sélectionner une facture --</option>
              ${Invoices.getInvoices({ statut:'credit' }).map(i => `<option value="${i.id}">${i.numero} — ${i.clientNom} — ${formatCurrency(i.resteAPayer)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Montant payé (FCFA)</label><input type="number" id="inv-paye" class="form-input" min="0" oninput="App.updateInvoiceTotals()"></div>
          <div class="form-group"><label>Notes</label><input type="text" id="inv-notes" class="form-input" placeholder="Observations..."></div>
        </div>
      </div>

      <!-- Lignes de facture -->
      <div class="card">
        <div class="card-header">
          <h3>Lignes de Facture</h3>
          <button class="btn btn-outline btn-sm" onclick="App.addInvoiceLine()">+ Ajouter une ligne</button>
        </div>
        <table class="data-table" id="invoice-lines-table">
          <thead><tr><th>Produit</th><th>Désignation</th><th>Qté</th><th>P.U. (FCFA)</th><th>Remise%</th><th>Montant</th><th></th></tr></thead>
          <tbody id="invoice-lines-body"></tbody>
        </table>
        <div class="invoice-totals">
          <div class="total-row"><span>Sous-total:</span><span id="inv-sous-total">0 FCFA</span></div>
          <div class="total-row">
            <span>Remise globale (FCFA):</span>
            <input type="number" id="inv-remise-globale" class="form-input-inline" min="0" value="0" oninput="App.updateInvoiceTotals()">
          </div>
          <div class="total-row grand"><span>TOTAL:</span><span id="inv-total">0 FCFA</span></div>
          <div class="total-row"><span>Montant payé:</span><span id="inv-paye-display">0 FCFA</span></div>
          <div class="total-row" style="color:#FF4757"><span>Reste à payer:</span><span id="inv-reste">0 FCFA</span></div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-outline" onclick="App.navigate('factures')">Annuler</button>
        <button class="btn btn-secondary" onclick="App.saveInvoice(true)">🖨️ Enregistrer & Imprimer</button>
        <button class="btn btn-primary" onclick="App.saveInvoice(false)">💾 Enregistrer</button>
      </div>
    </div>
    <!-- Client modal -->
    ${this.clientFormModal()}`;

    // Setup client listener
    document.getElementById('inv-client').addEventListener('change', function() {
      const opt = this.options[this.selectedIndex];
      const avoir = parseFloat(opt.dataset.avoir) || 0;
      const creance = parseFloat(opt.dataset.creance) || 0;
      const box = document.getElementById('client-info-box');
      if (this.value && (avoir > 0 || creance > 0)) {
        box.style.display = 'block';
        box.innerHTML = `${avoir > 0 ? `<span style="color:#00D4AA">💰 Avoir: ${formatCurrency(avoir)}</span>` : ''}
          ${creance > 0 ? `<span style="color:#FF4757;margin-left:10px">⏳ Créance: ${formatCurrency(creance)}</span>` : ''}`;
      } else box.style.display = 'none';
    });

    this.invoiceLines.forEach(() => {});
    this.renderInvoiceLines();
    if (this.invoiceLines.length === 0) this.addInvoiceLine();
  },

  addInvoiceLine() {
    const products = Stock.getProducts({ actif: true });
    const idx = this.invoiceLines.length;
    this.invoiceLines.push({ produitId: '', designation: '', unite: '', qte: 1, prixUnitaire: 0, remise: 0, montant: 0 });
    const tbody = document.getElementById('invoice-lines-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.id = `inv-line-${idx}`;
    tr.innerHTML = `
      <td><select class="form-input-inline" style="width:170px" onchange="App.fillInvoiceLine(${idx}, this.value)">
        <option value="">-- Produit --</option>
        ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select></td>
      <td><input type="text" class="form-input-inline" id="il-desig-${idx}" style="width:130px" placeholder="Désignation"></td>
      <td><input type="number" class="form-input-inline" id="il-qte-${idx}" style="width:70px" value="1" min="0.01" step="0.01" oninput="App.calcInvoiceLine(${idx})"></td>
      <td><input type="number" class="form-input-inline" id="il-pu-${idx}" style="width:100px" value="0" min="0" oninput="App.calcInvoiceLine(${idx})"></td>
      <td><input type="number" class="form-input-inline" id="il-rem-${idx}" style="width:60px" value="0" min="0" max="100" oninput="App.calcInvoiceLine(${idx})"></td>
      <td id="il-mont-${idx}" class="fw-bold text-primary">0 FCFA</td>
      <td><button class="btn-icon text-danger" onclick="App.removeInvoiceLine(${idx})">🗑️</button></td>`;
    tbody.appendChild(tr);
    if (this.invoiceLines[idx].produitId) {
      // pre-fill if coming from devis
      const line = this.invoiceLines[idx];
      document.getElementById(`il-desig-${idx}`).value = line.designation;
      document.getElementById(`il-qte-${idx}`).value = line.qte;
      document.getElementById(`il-pu-${idx}`).value = line.prixUnitaire;
      document.getElementById(`il-rem-${idx}`).value = line.remise;
      this.calcInvoiceLine(idx);
    }
  },

  renderInvoiceLines() {
    const tbody = document.getElementById('invoice-lines-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const tmp = [...this.invoiceLines];
    this.invoiceLines = [];
    tmp.forEach(() => this.addInvoiceLine());
  },

  fillInvoiceLine(idx, produitId) {
    const p = Stock.getProduct(produitId);
    if (!p) return;
    this.invoiceLines[idx].produitId = produitId;
    this.invoiceLines[idx].unite = p.unite;
    document.getElementById(`il-desig-${idx}`).value = p.name;
    document.getElementById(`il-pu-${idx}`).value = p.prixVente;
    this.calcInvoiceLine(idx);
  },

  calcInvoiceLine(idx) {
    const qte = parseFloat(document.getElementById(`il-qte-${idx}`)?.value) || 0;
    const pu = parseFloat(document.getElementById(`il-pu-${idx}`)?.value) || 0;
    const rem = parseFloat(document.getElementById(`il-rem-${idx}`)?.value) || 0;
    const montant = qte * pu * (1 - rem / 100);
    if (this.invoiceLines[idx]) {
      this.invoiceLines[idx].qte = qte; this.invoiceLines[idx].prixUnitaire = pu;
      this.invoiceLines[idx].remise = rem; this.invoiceLines[idx].montant = montant;
      this.invoiceLines[idx].designation = document.getElementById(`il-desig-${idx}`)?.value || '';
    }
    const el = document.getElementById(`il-mont-${idx}`);
    if (el) el.textContent = formatCurrency(montant);
    this.updateInvoiceTotals();
  },

  removeInvoiceLine(idx) {
    document.getElementById(`inv-line-${idx}`)?.remove();
    this.invoiceLines[idx] = null;
    this.updateInvoiceTotals();
  },

  updateInvoiceTotals() {
    const activeLignes = this.invoiceLines.filter(l => l !== null);
    const sousTotal = activeLignes.reduce((a, l) => a + l.montant, 0);
    const remise = parseFloat(document.getElementById('inv-remise-globale')?.value) || 0;
    const total = sousTotal - remise;
    const paye = parseFloat(document.getElementById('inv-paye')?.value) || 0;
    const reste = Math.max(0, total - paye);
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('inv-sous-total', formatCurrency(sousTotal));
    el('inv-total', formatCurrency(total));
    el('inv-paye-display', formatCurrency(paye));
    el('inv-reste', formatCurrency(reste));
  },

  updateInvoiceTypeUI() {
    const t = this.selectedInvoiceType;
    const echeance = document.getElementById('echeance-group');
    const liee = document.getElementById('facture-liee-group');
    if (echeance) echeance.style.display = t === 'credit' ? 'block' : 'none';
    if (liee) liee.style.display = ['credit_paye','retrait_avoir'].includes(t) ? 'block' : 'none';
  },

  saveInvoice(print = false) {
    const clientId = document.getElementById('inv-client').value;
    if (!clientId) { this.showToast('Veuillez sélectionner un client.', 'error'); return; }
    const activeLignes = this.invoiceLines.filter(l => l !== null && l.qte > 0);
    if (activeLignes.length === 0) { this.showToast('Ajoutez au moins une ligne.', 'error'); return; }
    const data = {
      type: this.selectedInvoiceType,
      clientId,
      date: document.getElementById('inv-date').value,
      echeance: document.getElementById('inv-echeance')?.value || null,
      modePaiement: document.getElementById('inv-mode').value,
      montantPaye: parseFloat(document.getElementById('inv-paye').value) || 0,
      remiseGlobale: parseFloat(document.getElementById('inv-remise-globale').value) || 0,
      factureLieeId: document.getElementById('inv-facture-liee')?.value || null,
      notes: document.getElementById('inv-notes').value,
      lignes: activeLignes.map(l => ({ ...l, unite: Stock.getProduct(l.produitId)?.unite || '' }))
    };
    const result = Invoices.createInvoice(data);
    if (result.success) {
      this.showToast(`Facture ${result.invoice.numero} créée.`, 'success');
      this.updateBadges();
      if (print) Invoices.printInvoice(result.invoice.id);
      this.navigate('factures');
    } else this.showToast(result.error || 'Erreur lors de la création.', 'error');
  },

  async cancelInvoice(id) {
    const inv = Invoices.getInvoice(id);
    const ok = await GISDialog.confirm({
      title: 'Annuler la facture',
      message: `Annuler ${inv ? inv.numero : 'cette facture'} ? Le stock, la caisse et les soldes client seront rétablis automatiquement.`,
      icon: '🧾', confirmLabel: 'Annuler la facture', cancelLabel: 'Retour'
    });
    if (!ok) return;
    const result = Invoices.cancelInvoice(id);
    if (!result.success) { this.showToast(result.error, 'error'); return; }
    this.showToast('Facture annulée.', 'info');
    this.renderFactures();
  },

  openFactureDetail(id) {
    Invoices.printInvoice(id);
  },

  // ─── DEVIS ───────────────────────────────────────────────
  renderDevis(filterSearch = '', filterStatut = '') {
    const devisList = Invoices.getDevis({ search: filterSearch || undefined, statut: filterStatut || undefined });
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <input type="text" class="search-input" id="dev-search" placeholder="🔍 N° devis, client..." value="${filterSearch}" oninput="App.liveSearch('renderDevis', this.value, document.getElementById('dev-statut').value)">
        <select class="select-input" id="dev-statut" onchange="App.renderDevis(document.getElementById('dev-search').value, this.value)">
          <option value="">Tous statuts</option>
          <option value="en_attente" ${filterStatut==='en_attente'?'selected':''}>⏸️ En attente</option>
          <option value="accepte" ${filterStatut==='accepte'?'selected':''}>✅ Accepté</option>
          <option value="refuse" ${filterStatut==='refuse'?'selected':''}>❌ Refusé</option>
          <option value="converti" ${filterStatut==='converti'?'selected':''}>🧾 Converti</option>
          <option value="expire" ${filterStatut==='expire'?'selected':''}>⏰ Expiré</option>
        </select>
      </div>
      <div class="toolbar-right">
        ${Auth.canDo('create_devis') ? '<button class="btn btn-primary" onclick="App.openDevisForm()">+ Nouveau Devis</button>' : ''}
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>N° Devis</th><th>Date</th><th>Client</th><th>Total</th><th>Validité</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${devisList.length === 0 ? '<tr><td colspan="7" class="empty-cell">Aucun devis</td></tr>' : ''}
          ${devisList.map(d => {
            const exp = new Date(d.date); exp.setDate(exp.getDate() + d.validiteJours);
            const isExp = d.statut === 'expire';
            return `<tr>
              <td><code>${d.numero}</code></td>
              <td>${formatDate(d.date)}</td>
              <td>${d.clientNom}</td>
              <td class="fw-bold">${formatCurrency(d.total)}</td>
              <td>${d.validiteJours}j <small class="text-muted">(exp: ${formatDate(exp)})</small></td>
              <td><span class="status-badge ${isExp ? 'status-annule' : 'status-devis-'+d.statut}">${isExp ? '⏰ Expiré' : d.statut.toUpperCase()}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" title="Imprimer" onclick="Invoices.printDevis('${d.id}')">🖨️</button>
                  ${d.statut === 'en_attente' ? `<button class="btn-icon" title="Convertir en facture" onclick="App.convertDevis('${d.id}')">🧾</button>` : ''}
                  ${d.statut === 'en_attente' ? `<button class="btn-icon" title="Marquer accepté" onclick="Invoices.updateDevisStatut('${d.id}','accepte');App.renderDevis()">✅</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  },

  // ─── ARCHIVES ──────────────────────────────────────────────
  archFilters: { search:'', cat:'', dateFrom:'', dateTo:'' },

  applyArchFilters() {
    this.archFilters = {
      search:   (document.getElementById('arch-search')?.value || '').trim().toLowerCase(),
      cat:      document.getElementById('arch-cat')?.value || '',
      dateFrom: document.getElementById('arch-from')?.value || '',
      dateTo:   document.getElementById('arch-to')?.value || ''
    };
    this.renderArchives();
  },

  resetArchFilters() {
    this.archFilters = { search:'', cat:'', dateFrom:'', dateTo:'' };
    this.renderArchives();
  },

  // Agrège toutes les traces : factures, devis, opérations de caisse, avoirs, crédits
  getArchiveRecords() {
    const records = [];
    DB.getAll('invoices').forEach(inv => {
      const ti = getInvoiceTypeInfo(inv.type);
      records.push({
        date: inv.date, createdAt: inv.createdAt,
        cat: 'facture', subType: inv.type,
        numero: inv.numero, tier: inv.clientNom || '—', tierId: inv.clientId || null,
        label: ti.label, icon: ti.icon, color: ti.color, bg: ti.bg,
        montant: inv.total || 0, paye: inv.montantPaye || 0,
        statut: inv.statut, id: inv.id, docType: 'invoice',
        by: inv.createdByName || ''
      });
    });
    DB.getAll('devis').forEach(d => {
      records.push({
        date: d.date, createdAt: d.createdAt,
        cat: 'devis', subType: 'devis',
        numero: d.numero, tier: d.clientNom || '—', tierId: d.clientId || null,
        label: 'Devis', icon: '📋', color: '#9aaec4', bg: 'rgba(154,174,196,0.15)',
        montant: d.total || 0, paye: 0,
        statut: d.statut, id: d.id, docType: 'devis',
        by: d.createdByName || ''
      });
    });
    DB.getAll('caisse_ops').forEach(op => {
      const pm = getPaymentMethodInfo(op.modePaiement);
      const isEnc = op.type !== 'decaissement';
      records.push({
        date: op.date, createdAt: op.createdAt,
        cat: 'paiement', subType: isEnc ? 'encaissement' : 'decaissement',
        numero: op.factureId ? (DB.findById('invoices', op.factureId)?.numero || '—') : '—',
        tier: op.description || 'Opération de caisse',
        label: isEnc ? 'Encaissement' : 'Décaissement',
        icon: isEnc ? '💵' : '💸', color: isEnc ? '#2ED573' : '#FF4757',
        bg: isEnc ? 'rgba(46,213,115,0.15)' : 'rgba(255,71,87,0.15)',
        montant: op.montant || 0, paye: op.montant || 0,
        statut: null, id: op.id, docType: 'caisse',
        modePaiement: `${pm.icon} ${pm.label}`,
        by: op.createdByName || ''
      });
    });
    return records.sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Classe CSS de badge statut adaptée (factures vs devis)
  archStatutClass(statut) {
    if (['paye','credit','partiel','annule','avoir'].includes(statut)) return 'status-' + statut;
    if (['en_attente','accepte','refuse','converti'].includes(statut)) return 'status-devis-' + statut;
    return 'status-annule'; // expire et inconnus
  },

  // Récapitulatif par client : crédits (contractés/remboursés) ou avoirs (émis/retraits)
  archivesSyntheseHTML(records, cat) {
    const isCredit = cat === 'credit';
    const byClient = {};
    records.forEach(r => {
      if (r.statut === 'annule') return; // hors factures annulées
      const key = r.tierId || r.tier || '—';
      if (!byClient[key]) byClient[key] = { id: r.tierId, nom: r.tier, pri: { nb: 0, tot: 0 }, paye: { nb: 0, tot: 0 } };
      const c = byClient[key];
      const subP = isCredit ? 'credit' : 'avoir';
      const subR = isCredit ? 'credit_paye' : 'retrait_avoir';
      if (r.subType === subP) { c.pri.nb++; c.pri.tot += r.montant; }
      if (r.subType === subR) { c.paye.nb++; c.paye.tot += (r.paye || r.montant); }
      // Les crédits remboursés partiels restent comptabilisés dans 'credit' via montantPaye
      if (isCredit && r.subType === 'credit' && r.paye > 0) { c.paye.tot += r.paye; }
    });
    const clients = Object.values(byClient).sort((a, b) => b.pri.tot - a.pri.tot);
    const titres = isCredit
      ? { col1: '⏳ Crédits contractés (nb / total)', col2: '✅ Crédits remboursés (nb / total)', col3: 'Reste dû (créance)' }
      : { col1: '↩️ Avoirs émis (nb / total)', col2: '💰 Retraits d\'avoir (nb / total)', col3: 'Solde avoir actuel' };
    return `
    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><h3>${isCredit ? '👥 Récapitulatif des clients — crédits' : '👥 Récapitulatif des clients — avoirs'} <small class="text-muted" style="font-weight:400">(hors annulées)</small></h3></div>
      <table class="data-table">
        <thead><tr><th>Client</th><th>${titres.col1}</th><th>${titres.col2}</th><th>${titres.col3}</th></tr></thead>
        <tbody>
          ${clients.length === 0 ? '<tr><td colspan="4" class="empty-cell">Aucune opération de ce type</td></tr>' : ''}
          ${clients.map(c => {
            const client = c.id ? DB.findById('clients', c.id) : null;
            const solde = isCredit ? (client?.creance || 0) : (client?.avoir || 0);
            const colSolde = solde > 0 ? (isCredit ? '#FF4757' : '#2ED573') : 'inherit';
            return `<tr>
              <td><strong>${c.nom}</strong></td>
              <td>${c.pri.nb} × <span class="fw-bold">${formatCurrency(c.pri.tot)}</span></td>
              <td>${isCredit ? (c.paye.nb ? c.paye.nb + ' × ' : '— ') + formatCurrency(c.paye.tot) : `${c.paye.nb} × ${formatCurrency(c.paye.tot)}`}</td>
              <td class="fw-bold" style="color:${colSolde}">${formatCurrency(solde)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  },

  // Suggestions en temps réel pendant la saisie (N°, client, description, auteur)
  archAutocomplete() {
    const input = document.getElementById('arch-search');
    const box = document.getElementById('arch-suggest');
    if (!input || !box) return;
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.style.display = 'none'; box.innerHTML = ''; this._archSuggestions = []; return; }
    const seen = new Set();
    const sugg = [];
    this.getArchiveRecords().forEach(r => {
      if (![r.numero, r.tier, r.label, r.by].some(t => (t || '').toLowerCase().includes(q))) return;
      const key = r.docType + '|' + (r.id || '');
      if (seen.has(key)) return;
      seen.add(key);
      sugg.push(r);
    });
    const shown = sugg.slice(0, 12);
    this._archSuggestions = shown;
    if (shown.length === 0) {
      box.innerHTML = '<div class="arch-suggest-empty">Aucune suggestion — précisez votre recherche</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = shown.map((r, i) => `
      <div class="arch-suggest-item" onmousedown="App.archPickSuggestion(${i})">
        <span class="badge" style="background:${r.bg};color:${r.color}">${r.icon}</span>
        <span style="min-width:110px"><code>${r.numero}</code></span>
        <span class="fw-bold" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${r.tier}</span>
        <span class="text-muted">${formatDate(r.date)}</span>
        <span class="text-muted">${formatCurrency(r.montant)}</span>
      </div>`).join('') +
      (sugg.length > shown.length ? `<div class="arch-suggest-empty">… ${sugg.length - shown.length} autre(s) — affinez ou filtrez par type/dates</div>` : '');
    box.style.display = 'block';
  },

  // Masque la liste (décalé pour laisser le clic sur une suggestion s'exécuter)
  archHideSuggest() {
    setTimeout(() => {
      const box = document.getElementById('arch-suggest');
      if (box) box.style.display = 'none';
    }, 180);
  },

  // Sélection d'une suggestion → remplit la recherche et applique le filtre
  archPickSuggestion(i) {
    const r = (this._archSuggestions || [])[i];
    if (!r) return;
    const input = document.getElementById('arch-search');
    if (input) input.value = r.numero !== '—' ? r.numero : r.tier;
    const box = document.getElementById('arch-suggest');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
    this.applyArchFilters();
  },

  renderArchives() {
    const f = this.archFilters;
    Invoices.checkDevisExpiration();
    let records = this.getArchiveRecords();

    // Filtre par catégorie
    if (f.cat === 'avoir')       records = records.filter(r => r.subType === 'avoir' || r.subType === 'retrait_avoir');
    else if (f.cat === 'credit') records = records.filter(r => r.subType === 'credit' || r.subType === 'credit_paye');
    else if (f.cat)              records = records.filter(r => r.cat === f.cat);
    // Filtre par dates
    if (f.dateFrom) records = records.filter(r => r.date >= f.dateFrom);
    if (f.dateTo)   records = records.filter(r => r.date <= f.dateTo);
    // Recherche texte
    if (f.search) records = records.filter(r =>
      [r.numero, r.tier, r.label, r.by].some(t => (t || '').toLowerCase().includes(f.search)));

    const nbTotal = records.length;
    const facturesValide = records.filter(r => r.cat === 'facture' && r.statut !== 'annule');
    const totaux = {
      facture: facturesValide.reduce((a, r) => a + r.montant, 0),
      encaisse: records.filter(r => r.cat === 'paiement' && r.subType === 'encaissement').reduce((a, r) => a + r.montant, 0),
      decaisse: records.filter(r => r.cat === 'paiement' && r.subType === 'decaissement').reduce((a, r) => a + r.montant, 0)
    };
    const shown = records.slice(0, 500);

    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left" style="flex-wrap:wrap; gap:8px; display:flex;">
        <div style="position:relative">
          <input type="text" id="arch-search" class="search-input" placeholder="🔍 N° facture, client, description..." value="${f.search}" autocomplete="off"
            oninput="App.archAutocomplete()" onfocus="App.archAutocomplete()" onblur="App.archHideSuggest()"
            onkeydown="if(event.key==='Enter'){App.archHideSuggest();App.applyArchFilters()}">
          <div id="arch-suggest" class="arch-suggest" style="display:none"></div>
        </div>
        <select id="arch-cat" class="form-input" style="width:auto" onchange="App.applyArchFilters()">
          <option value="">Toutes opérations</option>
          <option value="facture" ${f.cat==='facture'?'selected':''}>🧾 Factures</option>
          <option value="devis" ${f.cat==='devis'?'selected':''}>📋 Devis</option>
          <option value="paiement" ${f.cat==='paiement'?'selected':''}>💰 Paiements / Caisse</option>
          <option value="credit" ${f.cat==='credit'?'selected':''}>⏳ Crédits</option>
          <option value="avoir" ${f.cat==='avoir'?'selected':''}>↩️ Avoirs & Retraits d'avoir</option>
        </select>
        <input type="date" id="arch-from" class="form-input" style="width:auto" value="${f.dateFrom}" title="Date de début">
        <span class="text-muted">→</span>
        <input type="date" id="arch-to" class="form-input" style="width:auto" value="${f.dateTo}" title="Date de fin">
        <button class="btn btn-primary btn-sm" onclick="App.applyArchFilters()">Filtrer</button>
        <button class="btn btn-outline btn-sm" onclick="App.resetArchFilters()">✕ Réinitialiser</button>
      </div>
    </div>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card" style="--accent:#6C63FF">
        <div class="kpi-icon" style="background:rgba(108,99,255,0.15)">🗄️</div>
        <div class="kpi-content"><div class="kpi-label">Traces trouvées</div><div class="kpi-value">${nbTotal}</div><div class="kpi-sub">Toutes catégories</div></div>
      </div>
      <div class="kpi-card" style="--accent:#2ED573">
        <div class="kpi-icon" style="background:rgba(46,213,115,0.15)">🧾</div>
        <div class="kpi-content"><div class="kpi-label">Total Facturé</div><div class="kpi-value">${formatCurrency(totaux.facture)}</div><div class="kpi-sub">Hors annulées</div></div>
      </div>
      <div class="kpi-card" style="--accent:#00D4AA">
        <div class="kpi-icon" style="background:rgba(0,212,170,0.15)">💵</div>
        <div class="kpi-content"><div class="kpi-label">Encaissé</div><div class="kpi-value">${formatCurrency(totaux.encaisse)}</div><div class="kpi-sub">Entrées de caisse</div></div>
      </div>
      <div class="kpi-card" style="--accent:#FF4757">
        <div class="kpi-icon" style="background:rgba(255,71,87,0.15)">💸</div>
        <div class="kpi-content"><div class="kpi-label">Décaissé</div><div class="kpi-value">${formatCurrency(totaux.decaisse)}</div><div class="kpi-sub">Sorties de caisse</div></div>
      </div>
    </div>
    ${(f.cat === 'credit' || f.cat === 'avoir') ? this.archivesSyntheseHTML(records, f.cat) : ''}
    <div class="card">
      ${nbTotal > 500 ? `<div class="empty-state-small" style="color:#FFA502">⚠️ Affichage limité aux 500 traces les plus récentes — affinez les dates.</div>` : ''}
      <table class="data-table">
        <thead><tr><th>Date</th><th>Type d'opération</th><th>Document</th><th>Client / Description</th><th>Montant</th><th>Payé</th><th>Statut</th><th>Auteur</th><th>Actions</th></tr></thead>
        <tbody>
          ${shown.length === 0 ? '<tr><td colspan="9" class="empty-cell">Aucune trace ne correspond aux critères</td></tr>' : ''}
          ${shown.map(r => `<tr>
            <td>${formatDate(r.date)}</td>
            <td><span class="badge" style="background:${r.bg};color:${r.color}">${r.icon} ${r.label}</span></td>
            <td><code>${r.numero}</code></td>
            <td>${r.tier}</td>
            <td class="fw-bold">${formatCurrency(r.montant)}</td>
            <td>${r.paye ? formatCurrency(r.paye) : '—'}</td>
            <td>${r.statut ? `<span class="status-badge ${this.archStatutClass(r.statut)}">${this.statutLabel(r.statut)}</span>` : '—'}</td>
            <td>${r.by || '—'}</td>
            <td>
              <div class="action-btns">
                ${r.docType === 'invoice' ? `<button class="btn-icon" title="Imprimer" onclick="Invoices.printInvoice('${r.id}')">🖨️</button>` : ''}
                ${r.docType === 'devis' ? `<button class="btn-icon" title="Imprimer" onclick="Invoices.printDevis('${r.id}')">🖨️</button>` : ''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  },

  openDevisForm() {
    const clients = Invoices.getClients();
    const products = Stock.getProducts({ actif: true });
    this.devisLines = [];

    document.getElementById('main-content').innerHTML = `
    <div class="form-page">
      <div class="form-page-header"><h2>📋 Nouveau Devis</h2><button class="btn btn-outline" onclick="App.navigate('devis')">← Retour</button></div>
      <div class="card">
        <div class="card-header"><h3>Informations</h3></div>
        <div class="form-grid">
          <div class="form-group"><label>Client *</label>
            <div style="display:flex;gap:8px">
              <select id="dev-client" class="form-input" style="flex:1">
                <option value="">-- Sélectionner --</option>
                ${clients.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}
              </select>
              <button class="btn btn-outline btn-sm" onclick="App.openClientModal()">+</button>
            </div>
          </div>
          <div class="form-group"><label>Date</label><input type="date" id="dev-date" class="form-input" value="${todayStr()}"></div>
          <div class="form-group"><label>Validité (jours)</label><input type="number" id="dev-validite" class="form-input" value="30" min="1"></div>
          <div class="form-group"><label>Notes</label><input type="text" id="dev-notes" class="form-input"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Lignes du Devis</h3><button class="btn btn-outline btn-sm" onclick="App.addDevisLine()">+ Ajouter</button></div>
        <table class="data-table">
          <thead><tr><th>Produit</th><th>Désignation</th><th>Qté</th><th>P.U.</th><th>Remise%</th><th>Montant</th><th></th></tr></thead>
          <tbody id="devis-lines-body"></tbody>
        </table>
        <div class="invoice-totals">
          <div class="total-row"><span>Remise globale:</span><input type="number" id="dev-remise" class="form-input-inline" value="0" oninput="App.updateDevisTotals()"></div>
          <div class="total-row grand"><span>TOTAL DEVIS:</span><span id="dev-total">0 FCFA</span></div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="App.navigate('devis')">Annuler</button>
        <button class="btn btn-secondary" onclick="App.saveDevis(true)">🖨️ Enregistrer & Imprimer</button>
        <button class="btn btn-primary" onclick="App.saveDevis(false)">💾 Enregistrer</button>
      </div>
    </div>
    ${this.clientFormModal()}`;
    this.addDevisLine();
  },

  addDevisLine() {
    const products = Stock.getProducts({ actif: true });
    const idx = this.devisLines.length;
    this.devisLines.push({ produitId:'', designation:'', unite:'', qte:1, prixUnitaire:0, remise:0, montant:0 });
    const tbody = document.getElementById('devis-lines-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.id = `dev-line-${idx}`;
    tr.innerHTML = `
      <td><select class="form-input-inline" style="width:170px" onchange="App.fillDevisLine(${idx}, this.value)">
        <option value="">-- Produit --</option>
        ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select></td>
      <td><input type="text" class="form-input-inline" id="dl-desig-${idx}" style="width:130px" placeholder="Désignation"></td>
      <td><input type="number" class="form-input-inline" id="dl-qte-${idx}" style="width:70px" value="1" min="0.01" oninput="App.calcDevisLine(${idx})"></td>
      <td><input type="number" class="form-input-inline" id="dl-pu-${idx}" style="width:100px" value="0" oninput="App.calcDevisLine(${idx})"></td>
      <td><input type="number" class="form-input-inline" id="dl-rem-${idx}" style="width:60px" value="0" max="100" oninput="App.calcDevisLine(${idx})"></td>
      <td id="dl-mont-${idx}" class="fw-bold text-primary">0 FCFA</td>
      <td><button class="btn-icon text-danger" onclick="document.getElementById('dev-line-${idx}').remove();App.devisLines[${idx}]=null;App.updateDevisTotals()">🗑️</button></td>`;
    tbody.appendChild(tr);
  },

  fillDevisLine(idx, produitId) {
    const p = Stock.getProduct(produitId);
    if (!p) return;
    this.devisLines[idx].produitId = produitId; this.devisLines[idx].unite = p.unite;
    document.getElementById(`dl-desig-${idx}`).value = p.name;
    document.getElementById(`dl-pu-${idx}`).value = p.prixVente;
    this.calcDevisLine(idx);
  },

  calcDevisLine(idx) {
    const q = parseFloat(document.getElementById(`dl-qte-${idx}`)?.value) || 0;
    const pu = parseFloat(document.getElementById(`dl-pu-${idx}`)?.value) || 0;
    const r = parseFloat(document.getElementById(`dl-rem-${idx}`)?.value) || 0;
    const m = q * pu * (1 - r/100);
    if (this.devisLines[idx]) {
      this.devisLines[idx].qte=q; this.devisLines[idx].prixUnitaire=pu; this.devisLines[idx].remise=r; this.devisLines[idx].montant=m;
      this.devisLines[idx].designation = document.getElementById(`dl-desig-${idx}`)?.value || '';
    }
    const el = document.getElementById(`dl-mont-${idx}`);
    if (el) el.textContent = formatCurrency(m);
    this.updateDevisTotals();
  },

  updateDevisTotals() {
    const st = this.devisLines.filter(l=>l!==null).reduce((a,l)=>a+l.montant, 0);
    const rem = parseFloat(document.getElementById('dev-remise')?.value) || 0;
    const el = document.getElementById('dev-total');
    if (el) el.textContent = formatCurrency(st - rem);
  },

  saveDevis(print = false) {
    const clientId = document.getElementById('dev-client').value;
    if (!clientId) { this.showToast('Veuillez sélectionner un client.', 'error'); return; }
    const lignes = this.devisLines.filter(l => l !== null && l.qte > 0);
    if (lignes.length === 0) { this.showToast('Ajoutez au moins une ligne.', 'error'); return; }
    const result = Invoices.createDevis({
      clientId,
      date: document.getElementById('dev-date').value,
      validiteJours: parseInt(document.getElementById('dev-validite').value) || 30,
      remiseGlobale: parseFloat(document.getElementById('dev-remise').value) || 0,
      notes: document.getElementById('dev-notes').value,
      lignes
    });
    if (result.success) {
      this.showToast(`Devis ${result.devis.numero} créé.`, 'success');
      if (print) Invoices.printDevis(result.devis.id);
      this.navigate('devis');
    }
  },

  convertDevis(devisId) {
    const devis = Invoices.getDevisById(devisId);
    if (!devis) return;
    const typeOpts = INVOICE_TYPES.map(t => t.label).join('\n');
    const modeOpts = PAYMENT_METHODS.map(pm => pm.label).join('\n');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay'; modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header"><h3>Convertir en Facture — ${devis.numero}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Type de facture</label>
              <select id="conv-type" class="form-input">
                ${INVOICE_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Mode de paiement</label>
              <select id="conv-mode" class="form-input">
                ${PAYMENT_METHODS.map(pm => `<option value="${pm.id}">${pm.icon} ${pm.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Montant payé (FCFA)</label><input type="number" id="conv-paye" class="form-input" value="${devis.total}" min="0"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="App.doConvertDevis('${devisId}', this.closest('.modal-overlay'))">🧾 Convertir</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  },

  doConvertDevis(devisId, modalEl) {
    const result = Invoices.convertDevisToInvoice(devisId, {
      type: document.getElementById('conv-type').value,
      modePaiement: document.getElementById('conv-mode').value,
      montantPaye: parseFloat(document.getElementById('conv-paye').value) || 0
    });
    modalEl.remove();
    if (result.success) {
      this.showToast(`Facture ${result.invoice.numero} créée.`, 'success');
      this.navigate('factures');
    } else this.showToast(result.error, 'error');
  },

  // ─── CAISSE ──────────────────────────────────────────────
  renderCaisse() {
    const soldes = Caisse.getAllSoldes();
    const total = Caisse.getTotalSolde();
    const ops = Caisse.getOperations({ date: todayStr() });

    document.getElementById('main-content').innerHTML = `
    <div class="caisse-page">
      <!-- Soldes cards -->
      <div class="caisse-soldes">
        ${soldes.map(s => `
        <div class="caisse-card" style="border-color:${s.color}44">
          <div class="caisse-card-icon" style="background:${s.color}22;color:${s.color}">${s.icon}</div>
          <div class="caisse-card-info">
            <div class="caisse-card-label">${s.label}</div>
            <div class="caisse-card-value" style="color:${s.solde >= 0 ? '#2ED573' : '#FF4757'}">${formatCurrency(s.solde)}</div>
            <div class="caisse-card-sub">Enc: ${formatCurrency(s.encaissements)} | Déc: ${formatCurrency(s.decaissements)}</div>
          </div>
        </div>`).join('')}
      </div>

      <!-- Total + Actions -->
      <div class="caisse-actions-row">
        <div class="caisse-total-card">
          <span>💰 Solde Total Général:</span>
          <span class="caisse-total-val" style="color:${total.solde >= 0 ? '#2ED573' : '#FF4757'}">${formatCurrency(total.solde)}</span>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-primary" onclick="App.openCaisseModal('encaissement')">+ Encaissement</button>
          <button class="btn btn-danger" onclick="App.openCaisseModal('decaissement')">- Décaissement</button>
        </div>
      </div>

      <!-- Journal du jour -->
      <div class="card">
        <div class="card-header"><h3>📒 Journal du Jour — ${formatDate(todayStr())}</h3></div>
        <table class="data-table">
          <thead><tr><th>Heure</th><th>Type</th><th>Mode</th><th>Description</th><th>Montant</th></tr></thead>
          <tbody>
            ${ops.length === 0 ? '<tr><td colspan="5" class="empty-cell">Aucune opération aujourd\'hui</td></tr>' : ''}
            ${ops.map(op => `<tr>
              <td class="text-muted">${new Date(op.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td>
              <td><span class="badge ${op.type==='encaissement'?'badge-success':'badge-danger'}">${op.type.toUpperCase()}</span></td>
              <td>${getPaymentMethodInfo(op.modePaiement).icon} ${getPaymentMethodInfo(op.modePaiement).label}</td>
              <td>${op.description}</td>
              <td class="${op.type==='encaissement'?'text-success':'text-danger'} fw-bold">
                ${op.type==='encaissement'?'+':'-'} ${formatCurrency(op.montant)}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div id="caisse-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3 id="caisse-modal-title">Encaissement</h3><button class="modal-close" onclick="App.closeModal('caisse-modal')">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Montant (FCFA) *</label><input type="number" id="cais-montant" class="form-input" min="0" placeholder="0"></div>
            <div class="form-group"><label>Mode de paiement</label>
              <select id="cais-mode" class="form-input">
                ${PAYMENT_METHODS.map(pm => `<option value="${pm.id}">${pm.icon} ${pm.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1"><label>Description *</label><input type="text" id="cais-desc" class="form-input" placeholder="Motif de l'opération..."></div>
            <div class="form-group"><label>Date</label><input type="date" id="cais-date" class="form-input" value="${todayStr()}"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('caisse-modal')">Annuler</button>
          <button class="btn btn-primary" id="caisse-save-btn" onclick="App.saveCaisseOp()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openCaisseModal(type) {
    this._caisseOpType = type;
    document.getElementById('caisse-modal-title').textContent = type === 'encaissement' ? '💵 Nouvel Encaissement' : '💸 Nouveau Décaissement';
    document.getElementById('caisse-modal').style.display = 'flex';
    document.getElementById('cais-montant').value = '';
    document.getElementById('cais-desc').value = '';
  },

  saveCaisseOp() {
    const montant = parseFloat(document.getElementById('cais-montant').value) || 0;
    const desc = document.getElementById('cais-desc').value.trim();
    if (!montant || !desc) { this.showToast('Montant et description requis.', 'error'); return; }
    const result = Caisse.addOperation({ type: this._caisseOpType, montant, modePaiement: document.getElementById('cais-mode').value, description: desc, date: document.getElementById('cais-date').value });
    if (!result.success) { this.showToast(result.error, 'error'); return; }
    this.closeModal('caisse-modal');
    this.showToast('Opération enregistrée.', 'success');
    this.renderCaisse();
  },

  // ─── CLIENTS ─────────────────────────────────────────────
  renderClients(filterSearch = '') {
    const clients = Invoices.getClients(filterSearch);
    const totalCreance = clients.reduce((a, c) => a + (c.creance || 0), 0);
    const totalAvoir = clients.reduce((a, c) => a + (c.avoir || 0), 0);
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left"><input type="text" class="search-input" id="cli-search" placeholder="🔍 Nom, téléphone..." value="${filterSearch}" oninput="App.liveSearch('renderClients', this.value)"></div>
      <div class="toolbar-right">
        <div class="kpi-mini danger"><span>Créances:</span><strong>${formatCurrency(totalCreance)}</strong></div>
        <div class="kpi-mini"><span>Avoirs:</span><strong>${formatCurrency(totalAvoir)}</strong></div>
        <button class="btn btn-primary" onclick="App.openClientModal()">+ Nouveau Client</button>
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Adresse</th><th>Créance</th><th>Avoir</th><th>Actions</th></tr></thead>
        <tbody>
          ${clients.length === 0 ? '<tr><td colspan="7" class="empty-cell">Aucun client</td></tr>' : ''}
          ${clients.map(c => `<tr>
            <td><strong>${c.nom}</strong></td>
            <td>${c.telephone || '—'}</td>
            <td>${c.email || '—'}</td>
            <td>${c.adresse || '—'}</td>
            <td class="${(c.creance||0) > 0 ? 'text-danger fw-bold' : 'text-muted'}">${formatCurrency(c.creance||0)}</td>
            <td class="${(c.avoir||0) > 0 ? 'text-success fw-bold' : 'text-muted'}">${formatCurrency(c.avoir||0)}</td>
            <td>
              <div class="action-btns">
                <button class="btn-icon" onclick="App.editClientModal('${c.id}')">✏️</button>
                <button class="btn-icon" onclick="App.navigate('factures')">🧾</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${this.clientFormModal()}`;
  },

  clientFormModal() {
    return `
    <div id="client-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3 id="client-modal-title">Nouveau Client</h3><button class="modal-close" onclick="App.closeModal('client-modal')">✕</button></div>
        <div class="modal-body">
          <input type="hidden" id="client-edit-id">
          <div class="form-grid">
            <div class="form-group"><label>Nom *</label><input type="text" id="cli-nom" class="form-input"></div>
            <div class="form-group"><label>Téléphone</label><input type="text" id="cli-tel" class="form-input"></div>
            <div class="form-group"><label>Email</label><input type="email" id="cli-email" class="form-input"></div>
            <div class="form-group"><label>Adresse</label><input type="text" id="cli-adresse" class="form-input"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('client-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveClient()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openClientModal() {
    document.getElementById('client-modal-title').textContent = 'Nouveau Client';
    document.getElementById('client-edit-id').value = '';
    ['cli-nom','cli-tel','cli-email','cli-adresse'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('client-modal').style.display = 'flex';
  },

  editClientModal(id) {
    const c = Invoices.getClient(id);
    if (!c) return;
    document.getElementById('client-modal-title').textContent = 'Modifier Client';
    document.getElementById('client-edit-id').value = id;
    document.getElementById('cli-nom').value = c.nom;
    document.getElementById('cli-tel').value = c.telephone || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-adresse').value = c.adresse || '';
    document.getElementById('client-modal').style.display = 'flex';
  },

  saveClient() {
    const nom = document.getElementById('cli-nom').value.trim();
    if (!nom) { this.showToast('Le nom est requis.', 'error'); return; }
    const data = { nom, telephone: document.getElementById('cli-tel').value, email: document.getElementById('cli-email').value, adresse: document.getElementById('cli-adresse').value };
    const editId = document.getElementById('client-edit-id').value;
    if (editId) Invoices.updateClient(editId, data);
    else Invoices.createClient(data);
    this.closeModal('client-modal');
    this.showToast('Client enregistré.', 'success');
    if (this.currentPage === 'clients') this.renderClients();
  },

  // ─── MESSAGES ────────────────────────────────────────────
  renderMessages() {
    const users = UserManager.getAll().filter(u => u.id !== Auth.getCurrentUser()?.id);
    const received = Messages.getReceived();
    const sent = Messages.getSent();
    const tab = this.msgTab;

    document.getElementById('main-content').innerHTML = `
    <div class="messages-layout">
      <div class="messages-sidebar">
        <div class="msg-tabs">
          <button class="msg-tab ${tab==='recu'?'active':''}" onclick="App.msgTab='recu';App.renderMessages()">📥 Reçus (${received.filter(m=>!m.lu).length})</button>
          <button class="msg-tab ${tab==='envoye'?'active':''}" onclick="App.msgTab='envoye';App.renderMessages()">📤 Envoyés</button>
        </div>
        <div class="msg-list">
          ${(tab==='recu'?received:sent).map(m => `
          <div class="msg-item ${!m.lu && tab==='recu' ? 'unread' : ''}" onclick="App.openMessage('${m.id}','${tab}')">
            <div class="msg-item-header">
              <span class="msg-from">${tab==='recu' ? m.expediteurNom : m.destinataireNom}</span>
              <span class="msg-time">${new Date(m.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>
            <div class="msg-subject">${m.sujet}</div>
            <div class="msg-preview">${m.contenu.substring(0, 60)}...</div>
          </div>`).join('')}
          ${(tab==='recu'?received:sent).length === 0 ? '<div class="empty-state-small">Aucun message</div>' : ''}
        </div>
      </div>
      <div class="messages-main">
        <div id="msg-content" class="msg-empty-state">
          <div>✉️</div>
          <p>Sélectionnez un message ou rédigez-en un nouveau</p>
          <button class="btn btn-primary" onclick="App.openNewMessage()">✏️ Nouveau Message</button>
        </div>
      </div>
    </div>

    <!-- New Message Modal -->
    <div id="new-msg-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3>✏️ Nouveau Message</h3><button class="modal-close" onclick="App.closeModal('new-msg-modal')">✕</button></div>
        <div class="modal-body">
          <div class="form-group"><label>Destinataire *</label>
            <select id="msg-to" class="form-input">
              <option value="">-- Sélectionner --</option>
              ${users.map(u => `<option value="${u.id}">${u.prenom} ${u.nom} (${Auth.getRoleInfo(u.role).label})</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Sujet *</label><input type="text" id="msg-sujet" class="form-input"></div>
          <div class="form-group"><label>Message *</label><textarea id="msg-contenu" class="form-input" rows="6" style="resize:vertical"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('new-msg-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.sendMessage()">📤 Envoyer</button>
        </div>
      </div>
    </div>`;
  },

  openMessage(id, tab) {
    const all = tab === 'recu' ? Messages.getReceived() : Messages.getSent();
    const msg = all.find(m => m.id === id);
    if (!msg) return;
    if (!msg.lu && tab === 'recu') { Messages.markAsRead(id); this.updateBadges(); }
    document.getElementById('msg-content').innerHTML = `
    <div class="msg-detail">
      <div class="msg-detail-header">
        <div><strong>${tab === 'recu' ? 'De: ' + msg.expediteurNom : 'À: ' + msg.destinataireNom}</strong></div>
        <div class="msg-detail-date">${formatDateTime(msg.createdAt)}</div>
      </div>
      <div class="msg-detail-subject">${msg.sujet}</div>
      <div class="msg-detail-body">${msg.contenu.replace(/\n/g, '<br>')}</div>
      ${tab === 'recu' ? `<div style="margin-top:16px"><button class="btn btn-primary btn-sm" onclick="App.replyMessage('${msg.expediteurId}','${msg.sujet}')">↩️ Répondre</button></div>` : ''}
    </div>`;
  },

  openNewMessage() { document.getElementById('new-msg-modal').style.display = 'flex'; },

  replyMessage(toId, sujet) {
    document.getElementById('new-msg-modal').style.display = 'flex';
    setTimeout(() => { document.getElementById('msg-to').value = toId; document.getElementById('msg-sujet').value = 'RE: ' + sujet; }, 50);
  },

  sendMessage() {
    const to = document.getElementById('msg-to').value;
    const sujet = document.getElementById('msg-sujet').value.trim();
    const contenu = document.getElementById('msg-contenu').value.trim();
    if (!to || !sujet || !contenu) { this.showToast('Tous les champs sont requis.', 'error'); return; }
    Messages.send(to, sujet, contenu);
    this.closeModal('new-msg-modal');
    this.showToast('Message envoyé.', 'success');
    this.updateBadges();
    this.msgTab = 'envoye';
    this.renderMessages();
  },

  // ─── NOTIFICATIONS ───────────────────────────────────────
  renderNotifications() {
    const notifs = Notifs.getAll();
    const typeIcons = { stock_bas:'📦', info:'ℹ️', message:'✉️', facture_en_retard:'⏳' };
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left"></div>
      <div class="toolbar-right">
        <button class="btn btn-outline" onclick="Notifs.markAllRead();App.updateBadges();App.renderNotifications()">✅ Tout lire</button>
        <button class="btn btn-outline" onclick="Notifs.clearAll();App.updateBadges();App.renderNotifications()">🗑️ Effacer tout</button>
      </div>
    </div>
    <div class="notifs-list">
      ${notifs.length === 0 ? '<div class="empty-state"><div>🔔</div><p>Aucune notification</p></div>' : ''}
      ${notifs.map(n => `
      <div class="notif-item ${n.lu ? 'read' : 'unread'}" onclick="Notifs.markAsRead('${n.id}');App.updateBadges();App.renderNotifications()">
        <div class="notif-icon">${typeIcons[n.type] || '📢'}</div>
        <div class="notif-content">
          <div class="notif-titre">${n.titre}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-time">${formatDateTime(n.createdAt)}</div>
        </div>
        <div class="notif-actions">
          ${!n.lu ? '<span class="unread-dot"></span>' : ''}
          <button class="btn-icon" onclick="event.stopPropagation();Notifs.delete('${n.id}');App.renderNotifications()">🗑️</button>
        </div>
      </div>`).join('')}
    </div>`;
    Notifs.markAllRead();
    this.updateBadges();
  },

  // ─── PANIER ──────────────────────────────────────────────
  renderPanier() {
    const products = Stock.getProducts({ actif: true });
    const total = this.cart.reduce((a, item) => a + item.montant, 0);
    document.getElementById('main-content').innerHTML = `
    <div class="panier-layout">
      <div class="catalogue-panel">
        <h3 style="margin-bottom:12px">📦 Catalogue</h3>
        <input type="text" class="search-input" id="cat-search" placeholder="🔍 Rechercher..." oninput="App.filterCatalogue(this.value)" style="width:100%;margin-bottom:12px">
        <div class="catalogue-list" id="catalogue-list">
          ${products.map(p => `
          <div class="catalogue-item" data-name="${p.name.toLowerCase()}">
            <div class="catalogue-item-info">
              <div class="catalogue-item-name">${p.name}</div>
              <div class="catalogue-item-details"><span class="cat-tag">${p.categorie}</span><span class="text-primary">${formatCurrency(p.prixVente)}</span></div>
              <div class="text-muted" style="font-size:11px">Stock: ${p.stock} ${p.unite}</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="App.addToCart('${p.id}')">+</button>
          </div>`).join('')}
        </div>
      </div>
      <div class="panier-panel">
        <h3 style="margin-bottom:12px">🛒 Panier (${this.cart.length} article(s))</h3>
        ${this.cart.length === 0 ? '<div class="empty-state-small">Votre panier est vide</div>' : `
        <div class="panier-items">
          ${this.cart.map((item, idx) => `
          <div class="panier-item">
            <div class="panier-item-name">${item.name}</div>
            <div class="panier-item-controls">
              <button class="btn-qty" onclick="App.updateCartQty(${idx}, ${item.qte - 1})">−</button>
              <span class="cart-qty">${item.qte}</span>
              <button class="btn-qty" onclick="App.updateCartQty(${idx}, ${item.qte + 1})">+</button>
              <input type="number" class="form-input-inline" value="${item.prixUnitaire}" style="width:90px" oninput="App.updateCartPrice(${idx}, this.value)">
              <span class="panier-item-total">${formatCurrency(item.montant)}</span>
              <button class="btn-icon text-danger" onclick="App.removeFromCart(${idx})">🗑️</button>
            </div>
          </div>`).join('')}
        </div>
        <div class="panier-total">
          <span>TOTAL:</span><span class="panier-total-val">${formatCurrency(total)}</span>
        </div>
        <div class="panier-actions">
          <button class="btn btn-outline" onclick="App.clearCart()">🗑️ Vider</button>
          <button class="btn btn-secondary" onclick="App.cartToDevis()">📋 → Devis</button>
          <button class="btn btn-primary" onclick="App.cartToFacture()">🧾 → Facture</button>
        </div>`}
      </div>
    </div>`;
  },

  addToCart(productId) {
    const p = Stock.getProduct(productId);
    if (!p) return;
    const existing = this.cart.find(i => i.produitId === productId);
    if (existing) { existing.qte++; existing.montant = existing.qte * existing.prixUnitaire; }
    else this.cart.push({ produitId:p.id, name:p.name, unite:p.unite, qte:1, prixUnitaire:p.prixVente, remise:0, montant:p.prixVente, designation:p.name });
    this.saveCart();
    this.updateBadges();
    this.showToast(`${p.name} ajouté au panier.`, 'success');
    if (this.currentPage === 'panier') this.renderPanier();
  },

  updateCartQty(idx, qte) {
    if (qte <= 0) { this.removeFromCart(idx); return; }
    this.cart[idx].qte = qte;
    this.cart[idx].montant = qte * this.cart[idx].prixUnitaire;
    this.saveCart();
    this.renderPanier();
  },

  updateCartPrice(idx, price) {
    this.cart[idx].prixUnitaire = parseFloat(price) || 0;
    this.cart[idx].montant = this.cart[idx].qte * this.cart[idx].prixUnitaire;
    this.saveCart();
    this.renderPanier();
  },

  removeFromCart(idx) {
    this.cart.splice(idx, 1);
    this.saveCart();
    this.updateBadges();
    this.renderPanier();
  },

  clearCart() {
    this.cart = [];
    this.saveCart();
    this.updateBadges();
    this.renderPanier();
  },

  saveCart() { DB.set('cart', this.cart); },
  loadCart() { this.cart = DB.get('cart') || []; },

  filterCatalogue(search) {
    document.querySelectorAll('.catalogue-item').forEach(el => {
      el.style.display = el.dataset.name.includes(search.toLowerCase()) ? 'flex' : 'none';
    });
  },

  cartToFacture() {
    if (this.cart.length === 0) return;
    this.invoiceLines = this.cart.map(i => ({ ...i }));
    this.navigate('factures');
    setTimeout(() => this.openFactureForm(), 100);
  },

  cartToDevis() {
    if (this.cart.length === 0) return;
    this.devisLines = this.cart.map(i => ({ ...i }));
    this.navigate('devis');
    setTimeout(() => this.openDevisForm(), 100);
  },

  // ─── PROFIL ──────────────────────────────────────────────
  renderProfil() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const roleInfo = Auth.getRoleInfo(user.role);
    document.getElementById('main-content').innerHTML = `
    <div class="profil-page">
      <div class="card profil-card">
        <div class="profil-avatar">${user.prenom[0]}${user.nom[0]}</div>
        <div class="profil-info">
          <div class="profil-name">${user.prenom} ${user.nom}</div>
          <div class="profil-role" style="color:${roleInfo.color}">${roleInfo.icon} ${roleInfo.label}</div>
          <div class="profil-meta">${user.email || ''} ${user.telephone ? '| ' + user.telephone : ''}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Modifier mes informations</h3></div>
        <div class="form-grid" style="padding:20px">
          <div class="form-group"><label>Prénom</label><input type="text" id="prof-prenom" class="form-input" value="${user.prenom}"></div>
          <div class="form-group"><label>Nom</label><input type="text" id="prof-nom" class="form-input" value="${user.nom}"></div>
          <div class="form-group"><label>Email de connexion</label><input type="email" id="prof-email" class="form-input" value="${user.email || ''}" readonly></div>
          <div class="form-group"><label>Téléphone</label><input type="text" id="prof-tel" class="form-input" value="${user.telephone || ''}"></div>
        </div>
        <div style="padding:0 20px 20px"><button class="btn btn-primary" onclick="App.saveProfil()">💾 Enregistrer</button></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Changer le mot de passe</h3></div>
        <div class="form-grid" style="padding:20px">
          <div class="form-group"><label>Ancien mot de passe</label><input type="password" id="pwd-old" class="form-input"></div>
          <div class="form-group"><label>Nouveau mot de passe</label><input type="password" id="pwd-new" class="form-input"></div>
          <div class="form-group"><label>Confirmer</label><input type="password" id="pwd-confirm" class="form-input"></div>
        </div>
        <div style="padding:0 20px 20px"><button class="btn btn-secondary" onclick="App.changePassword()">🔐 Changer</button></div>
      </div>
    </div>`;
  },

  async saveProfil() {
    const user = Auth.getCurrentUser();
    const prenom = document.getElementById('prof-prenom').value.trim();
    const nom = document.getElementById('prof-nom').value.trim();
    if (!prenom || !nom) { this.showToast('Prénom et nom requis.', 'error'); return; }
    const result = await UserManager.update(user.id, {
      prenom, nom,
      telephone: document.getElementById('prof-tel').value
    });
    if (result && result.success === false) { this.showToast(result.error, 'error'); return; }
    this.buildSidebar();
    this.renderProfil();
    this.showToast('Profil mis à jour.', 'success');
  },

  async changePassword() {
    const user = Auth.getCurrentUser();
    const oldPass = document.getElementById('pwd-old').value;
    const newPass = document.getElementById('pwd-new').value;
    const confirm = document.getElementById('pwd-confirm').value;
    if (newPass.length < 12 || newPass !== confirm) {
      this.showToast('Le nouveau mot de passe doit comporter 12 caractères minimum et correspondre à la confirmation.', 'error');
      return;
    }
    const result = await UserManager.changePassword(user.id, oldPass, newPass);
    if (result.success) { this.showToast('Mot de passe modifié.', 'success'); this.renderProfil(); }
    else this.showToast(result.error, 'error');
  },

  // ─── PARAMÈTRES ──────────────────────────────────────────
  renderParametres() {
    const company = DB.get('company') || GIS_COMPANY;
    document.getElementById('main-content').innerHTML = `
    <div class="form-page">
      <div class="card">
        <div class="card-header"><h3>🏢 Informations Entreprise</h3></div>
        <div class="form-grid" style="padding:20px">
          <div class="form-group"><label>Nom de l'entreprise</label><input type="text" id="co-nom" class="form-input" value="${company.nom}"></div>
          <div class="form-group"><label>Slogan</label><input type="text" id="co-slogan" class="form-input" value="${company.slogan}"></div>
          <div class="form-group"><label>Adresse</label><input type="text" id="co-adresse" class="form-input" value="${company.adresse}"></div>
          <div class="form-group"><label>Ville</label><input type="text" id="co-ville" class="form-input" value="${company.ville || ''}"></div>
          <div class="form-group"><label>Téléphone</label><input type="text" id="co-tel" class="form-input" value="${company.telephone}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="co-email" class="form-input" value="${company.email}"></div>
          <div class="form-group"><label>RCCM</label><input type="text" id="co-rccm" class="form-input" value="${company.rccm}"></div>
          <div class="form-group"><label>NIF</label><input type="text" id="co-nif" class="form-input" value="${company.nif}"></div>
        </div>
        <div style="padding:0 20px 20px"><button class="btn btn-primary" onclick="App.saveCompany()">💾 Enregistrer</button></div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-header"><h3>⚠️ Zone Danger</h3></div>
        <div style="padding:20px">
          <p class="text-muted" style="margin-bottom:16px">Ces actions sont irréversibles. Utilisez avec précaution.</p>
          <button class="btn btn-danger" onclick="App.resetDB()">🗑️ Réinitialiser toutes les données</button>
        </div>
      </div>
    </div>`;
  },

  saveCompany() {
    const company = {
      nom: document.getElementById('co-nom').value,
      slogan: document.getElementById('co-slogan').value,
      adresse: document.getElementById('co-adresse').value,
      ville: document.getElementById('co-ville').value,
      telephone: document.getElementById('co-tel').value,
      email: document.getElementById('co-email').value,
      rccm: document.getElementById('co-rccm').value,
      nif: document.getElementById('co-nif').value,
      devise: 'FCFA'
    };
    DB.set('company', company);
    this.showToast('Paramètres enregistrés.', 'success');
  },

  async resetDB() {
    const ok1 = await GISDialog.confirm({
      title: 'Réinitialiser les données',
      message: 'Toutes les données locales (cache, session, panier) seront supprimées. Cette action est irréversible.',
      icon: '🗑️', confirmLabel: 'Continuer'
    });
    if (!ok1) return;
    const ok2 = await GISDialog.confirm({
      title: 'Dernière confirmation',
      message: 'Êtes-vous absolument sûr(e) de vouloir tout réinitialiser ?',
      icon: '⚠️', confirmLabel: 'Tout réinitialiser'
    });
    if (!ok2) return;
    localStorage.clear();
    window.location.reload();
  },

  // ─── UTILISATEURS ────────────────────────────────────────
  renderUtilisateurs() {
    const users = UserManager.getAll().filter(user => !['admin', 'superadmin'].includes(user.role));
    const teamRoles = RoleManager.getAll().filter(role => ['ROLE_chauffeur', 'ROLE_chargeur', 'ROLE_caisse', 'ROLE_gestionnaire_stock'].includes(role.id));
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left"><span class="text-muted">Gestion des collaborateurs et attribution de leurs accès.</span></div>
      <div class="toolbar-right"><button class="btn btn-primary" onclick="App.openUserModal()">+ Ajouter un collègue</button></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px">
      ${teamRoles.map(role => `
      <div class="card" style="padding:16px;border-top:3px solid ${role.color || '#00A8A8'}">
        <h3 style="font-size:15px;margin-bottom:8px">${role.icon || '👤'} ${role.nom}</h3>
        <p class="text-muted" style="font-size:12px;line-height:1.5">${role.description || 'Accès limité selon les permissions attribuées.'}</p>
      </div>`).join('')}
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Utilisateur</th><th>Identifiant</th><th>Rôle</th><th>Email</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => {
            const ri = Auth.getRoleInfo(u.role);
            return `<tr>
              <td><div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:50%;background:${ri.color}33;color:${ri.color};display:flex;align-items:center;justify-content:center;font-weight:700">${u.prenom[0]}${u.nom[0]}</div>
                <div><div class="fw-bold">${u.prenom} ${u.nom}</div><div class="text-muted" style="font-size:11px">${u.email || ''}</div></div>
              </div></td>
              <td><code>${u.username}</code><br><small>${u.email || ''}</small></td>
              <td><span class="badge" style="background:${ri.color}22;color:${ri.color}">${ri.icon} ${ri.label}</span></td>
              <td>${u.email || '—'}</td>
              <td><span class="status-badge ${u.actif ? 'status-paye' : 'status-annule'}">${u.actif ? '✅ Actif' : '❌ Inactif'}</span></td>
              <td>
                <div class="action-btns">
                  ${u.role !== 'superadmin' && (Auth.isSuperAdmin() || u.role !== 'admin') ? `<button class="btn-icon" onclick="App.openUserModal('${u.id}')">✏️</button>` : ''}
                  ${u.id !== Auth.getCurrentUser()?.id && u.role !== 'superadmin' ? `<button class="btn-icon" onclick="App.toggleUserActive('${u.id}')">${u.actif ? '🔒' : '🔓'}</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div id="user-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3 id="user-modal-title">Nouvel Utilisateur</h3><button class="modal-close" onclick="App.closeModal('user-modal')">✕</button></div>
        <div class="modal-body">
          <input type="hidden" id="user-edit-id">
          <div class="form-grid">
            <div class="form-group"><label>Prénom *</label><input type="text" id="usr-prenom" class="form-input"></div>
            <div class="form-group"><label>Nom *</label><input type="text" id="usr-nom" class="form-input"></div>
            <div class="form-group"><label>Identifiant *</label><input type="text" id="usr-username" class="form-input"></div>
            <div class="form-group"><label>Rôle *</label>
              <select id="usr-role" class="form-input">
                ${RoleManager.getAll()
                  .filter(r => r.id !== 'ROLE_admin' || Auth.isSuperAdmin())
                  .map(r => `<option value="${RoleManager.getRoleValue(r)}">${r.icon} ${r.nom}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="form-group"><label>Email</label><input type="email" id="usr-email" class="form-input"></div>
            <div class="form-group"><label>Téléphone</label><input type="text" id="usr-tel" class="form-input"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('user-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveUser()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openUserModal(id = null) {
    document.getElementById('user-modal-title').textContent = id ? 'Modifier Utilisateur' : 'Nouvel Utilisateur';
    document.getElementById('user-edit-id').value = id || '';
    if (id) {
      const u = DB.findById('users', id);
      if (u) {
        document.getElementById('usr-prenom').value = u.prenom;
        document.getElementById('usr-nom').value = u.nom;
        document.getElementById('usr-username').value = u.username;
        document.getElementById('usr-role').value = u.role;
        document.getElementById('usr-email').value = u.email || '';
        document.getElementById('usr-email').readOnly = true;
        document.getElementById('usr-tel').value = u.telephone || '';
      }
    } else {
      ['usr-prenom','usr-nom','usr-username','usr-email','usr-tel'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      document.getElementById('usr-email').readOnly = false;
      document.getElementById('usr-role').value = 'utilisateur';
    }
    document.getElementById('user-modal').style.display = 'flex';
  },

  async saveUser() {
    const editId = document.getElementById('user-edit-id').value;
    const data = {
      prenom: document.getElementById('usr-prenom').value.trim(),
      nom: document.getElementById('usr-nom').value.trim(),
      username: document.getElementById('usr-username').value.trim(),
      role: document.getElementById('usr-role').value,
      email: document.getElementById('usr-email').value,
      telephone: document.getElementById('usr-tel').value
    };
    if (!data.prenom || !data.nom || !data.username) { this.showToast('Prénom, nom et identifiant requis.', 'error'); return; }
    let result;
    if (editId) {
      result = await UserManager.update(editId, data);
      if (result.success !== false) { this.closeModal('user-modal'); this.showToast('Utilisateur modifié.', 'success'); this.renderUtilisateurs(); }
    } else {
      if (!data.email) { this.showToast('Une adresse e-mail est requise pour le nouveau compte.', 'error'); return; }
      result = await UserManager.create(data);
      if (result.success) {
        this.closeModal('user-modal');
        this.showToast(result.warning || 'Compte créé. Un lien de définition du mot de passe a été envoyé par e-mail.', result.warning ? 'error' : 'success');
        this.renderUtilisateurs();
      }
    }
    if (result.success === false) this.showToast(result.error, 'error');
  },

  async toggleUserActive(id) {
    const result = await UserManager.toggleActive(id);
    if (!result.success) { this.showToast(result.error, 'error'); return; }
    this.showToast('Statut du compte modifié.', 'success');
    this.renderUtilisateurs();
  },

  showGuideMetiers() {
    let modal = document.getElementById('guide-metiers-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'guide-metiers-modal';
      modal.className = 'modal-overlay';
      modal.style.display = 'none';
      modal.innerHTML = `
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3>📖 Guide des Métiers & Organisation</h3>
          <button class="modal-close" onclick="document.getElementById('guide-metiers-modal').style.display='none'">✕</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow-y: auto; padding: 20px; line-height: 1.6; color: #e1e1e1;">
          <p style="margin-bottom: 15px;">Une entreprise de vente de matériaux de construction s'appuie sur une organisation combinant expertise technique, logistique et force de vente. Les rôles se divisent généralement en quatre grands pôles pour couvrir toute la chaîne, allant de l'approvisionnement à la livraison sur les chantiers.</p>

          <h4 style="color: #6C63FF; margin-top: 20px;">1. Pôle Commercial et Conseil</h4>
          <ul style="padding-left: 20px; margin-bottom: 15px;">
            <li><strong style="color:#00D4AA">Vendeur Comptoir / Conseiller Technique :</strong> En première ligne, il accueille les artisans et les particuliers. Il identifie leurs besoins, rédige les devis et les conseille sur le choix des matériaux adéquats.</li>
            <li><strong style="color:#00D4AA">Technico-Commercial Itinérant :</strong> Il se déplace sur le terrain pour démarcher les professionnels du bâtiment (maçons, plombiers, etc.). Il vend des volumes plus importants et fidélise la clientèle.</li>
            <li><strong style="color:#00D4AA">Commercial Sédentaire :</strong> Il gère les appels entrants, traite les commandes complexes et établit les offres de prix depuis les bureaux.</li>
          </ul>

          <h4 style="color: #6C63FF; margin-top: 20px;">2. Pôle Logistique et Magasinage</h4>
          <ul style="padding-left: 20px; margin-bottom: 15px;">
            <li><strong style="color:#00D4AA">Magasinier-Cariste :</strong> Il réceptionne les livraisons des fournisseurs, gère les stocks, prépare les commandes et charge les véhicules des clients. Il est habilité à conduire des engins de manutention (chariots élévateurs).</li>
            <li><strong style="color:#00D4AA">Chauffeur-Livreur :</strong> Il assure l'acheminement des commandes lourdes et volumineuses (palettes de parpaings, sacs de ciment, plaques de plâtre) directement sur les chantiers ou chez les clients.</li>
          </ul>

          <h4 style="color: #6C63FF; margin-top: 20px;">3. Pôle Achats et Approvisionnement</h4>
          <ul style="padding-left: 20px; margin-bottom: 15px;">
            <li><strong style="color:#00D4AA">Chef de Produit / Acheteur :</strong> Il négocie les prix et les délais avec les fabricants et fournisseurs. Il décide des gammes de matériaux à stocker en fonction de la saisonnalité et de la demande.</li>
            <li><strong style="color:#00D4AA">Approvisionneur :</strong> Il anticipe les besoins en réassort pour éviter les ruptures de stock sur les matériaux essentiels.</li>
          </ul>

          <h4 style="color: #6C63FF; margin-top: 20px;">4. Pôle Direction et Support</h4>
          <ul style="padding-left: 20px; margin-bottom: 15px;">
            <li><strong style="color:#00D4AA">Chef d'Agence / Directeur de Magasin :</strong> Il supervise l'ensemble du site. Il gère le budget, fixe les objectifs commerciaux et coordonne l'équipe de vente et la logistique.</li>
            <li><strong style="color:#00D4AA">Assistant(e) Commercial(e) et Comptable :</strong> Il s'occupe de la facturation, des relances clients, du suivi des règlements et de la gestion administrative de l'agence.</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('guide-metiers-modal').style.display='none'">Compris</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
  },

  // ─── UTILITAIRES UI ──────────────────────────────────────
  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  // Re-rendu d'une page de liste en conservant le focus et la position du
  // curseur du champ de recherche actif (évite le "saut" à chaque frappe).
  liveSearch(renderFn, ...args) {
    const active = document.activeElement;
    const id = active && active.id ? active.id : null;
    const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    this[renderFn](...args);
    if (id) {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        if (caret !== null) { try { el.setSelectionRange(caret, caret); } catch (e) {} }
      }
    }
  },

  showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.className = 'toast', 3500);
  },

  statutLabel(statut) {
    const labels = { paye:'✅ Payé', credit:'⏳ Crédit', partiel:'🔶 Partiel', annule:'❌ Annulé', avoir:'↩️ Avoir', en_attente:'⏸️ En attente', expire:'⏰ Expiré', converti:'🧾 Converti' };
    return labels[statut] || statut;
  },

  // ─── FOURNISSEURS ─────────────────────────────────────────
  renderFournisseurs(filterSearch = '') {
    const fournisseurs = DB.getAll('fournisseurs').filter(f => f.nom.toLowerCase().includes(filterSearch.toLowerCase()));

    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <input type="text" class="search-input" id="four-search" placeholder="🔍 Rechercher..." value="${filterSearch}" oninput="App.liveSearch('renderFournisseurs', this.value)">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary" onclick="App.openFournisseurModal()">+ Nouveau Fournisseur</button>
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Adresse</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${fournisseurs.length === 0 ? '<tr><td colspan="6" class="empty-cell">Aucun fournisseur trouvé</td></tr>' : ''}
          ${fournisseurs.map(f => `
          <tr>
            <td><strong>${f.nom}</strong></td>
            <td>${f.telephone || '—'}</td>
            <td>${f.email || '—'}</td>
            <td>${f.adresse || '—'}</td>
            <td><span class="status-badge status-${f.actif?'ok':'annule'}">${f.actif?'Actif':'Inactif'}</span></td>
            <td>
              <div class="action-btns">
                <button class="btn-icon" title="Modifier" onclick="App.openFournisseurModal('${f.id}')">✏️</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <!-- Modal -->
    <div id="fourn-modal" class="modal-overlay" style="display:none">
      <div class="modal">
        <div class="modal-header"><h3 id="fourn-modal-title">Nouveau Fournisseur</h3><button class="modal-close" onclick="App.closeModal('fourn-modal')">✕</button></div>
        <div class="modal-body">
          <input type="hidden" id="fourn-id">
          <div class="form-grid">
            <div class="form-group"><label>Nom du fournisseur *</label><input type="text" id="fourn-nom" class="form-input"></div>
            <div class="form-group"><label>Téléphone</label><input type="text" id="fourn-tel" class="form-input"></div>
            <div class="form-group"><label>Email</label><input type="email" id="fourn-email" class="form-input"></div>
            <div class="form-group"><label>Adresse</label><input type="text" id="fourn-adresse" class="form-input"></div>
            <div class="form-group"><label>Statut</label>
              <select id="fourn-actif" class="form-input"><option value="true">Actif</option><option value="false">Inactif</option></select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('fourn-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveFournisseur()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openFournisseurModal(id = null) {
    document.getElementById('fourn-modal-title').textContent = id ? 'Modifier le Fournisseur' : 'Nouveau Fournisseur';
    document.getElementById('fourn-id').value = id || '';
    if (id) {
      const f = DB.findById('fournisseurs', id);
      if (f) {
        document.getElementById('fourn-nom').value = f.nom;
        document.getElementById('fourn-tel').value = f.telephone;
        document.getElementById('fourn-email').value = f.email;
        document.getElementById('fourn-adresse').value = f.adresse;
        document.getElementById('fourn-actif').value = f.actif ? 'true' : 'false';
      }
    } else {
      ['fourn-nom','fourn-tel','fourn-email','fourn-adresse'].forEach(el => document.getElementById(el).value = '');
      document.getElementById('fourn-actif').value = 'true';
    }
    document.getElementById('fourn-modal').style.display = 'flex';
  },

  saveFournisseur() {
    const id = document.getElementById('fourn-id').value;
    const data = {
      nom: document.getElementById('fourn-nom').value.trim(),
      telephone: document.getElementById('fourn-tel').value.trim(),
      email: document.getElementById('fourn-email').value.trim(),
      adresse: document.getElementById('fourn-adresse').value.trim(),
      actif: document.getElementById('fourn-actif').value === 'true'
    };
    if (!data.nom) { this.showToast('Le nom est requis.', 'error'); return; }
    if (id) { DB.update('fournisseurs', id, data); }
    else { DB.add('fournisseurs', { id: generateId('F'), ...data, createdAt: new Date().toISOString() }); }
    this.closeModal('fourn-modal');
    this.showToast('Fournisseur enregistré.', 'success');
    this.renderFournisseurs(document.querySelector('.search-input').value);
  },

  // ─── RAPPORTS ─────────────────────────────────────────────
  _rapportPeriod: '30',
  _rapportFrom: '',
  _rapportTo: '',

  _reportRange() {
    const fmt = d => `${d.getFullYear()}-${padNum(d.getMonth()+1,2)}-${padNum(d.getDate(),2)}`;
    const today = new Date();
    let from = '', to = fmt(today);
    const p = this._rapportPeriod;
    if (p === 'all') { from = ''; to = ''; }
    else if (p === '7' || p === '30') { const d = new Date(); d.setDate(d.getDate() - (parseInt(p) - 1)); from = fmt(d); }
    else if (p === 'month') { from = fmt(new Date(today.getFullYear(), today.getMonth(), 1)); }
    else if (p === 'custom') { from = this._rapportFrom || ''; to = this._rapportTo || ''; }
    return { from, to };
  },

  _reportInvoices() {
    const { from, to } = this._reportRange();
    return DB.getAll('invoices').filter(i => {
      if (from && i.date < from) return false;
      if (to && i.date > to) return false;
      return true;
    });
  },

  _reportSeries(invoices) {
    const { from, to } = this._reportRange();
    const spanDays = (from && to) ? Math.round((new Date(to) - new Date(from)) / 86400000) : 999;
    const monthly = spanDays > 62;
    const map = {};
    invoices.filter(i => i.statut !== 'annule' && i.type !== 'avoir').forEach(i => {
      const key = monthly ? i.date.slice(0, 7) : i.date;
      map[key] = (map[key] || 0) + (i.montantPaye || 0);
    });
    return Object.keys(map).sort().map(k => ({
      label: monthly
        ? new Date(k + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
        : new Date(k).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      ca: map[k]
    }));
  },

  setRapportPeriod(value) {
    this._rapportPeriod = value;
    this.renderRapports();
  },

  applyCustomRange() {
    this._rapportFrom = document.getElementById('rap-from')?.value || '';
    this._rapportTo = document.getElementById('rap-to')?.value || '';
    this._rapportPeriod = 'custom';
    this.renderRapports();
  },

  renderRapports() {
    if (!Auth.canDo('view_reports')) { this.showToast('Accès aux rapports non autorisé.', 'error'); return; }
    const invoices = this._reportInvoices();
    const active = invoices.filter(i => i.statut !== 'annule');
    const sales = active.filter(i => i.type !== 'avoir');

    const caTotal = sales.reduce((s, i) => s + (i.total || 0), 0);
    const caPaye = active.reduce((s, i) => s + (i.montantPaye || 0), 0);
    const creances = sales.reduce((s, i) => s + (i.resteAPayer || 0), 0);

    // Marge estimée (prix de vente − prix d'achat actuel)
    let coutTotal = 0;
    sales.forEach(i => (i.lignes || []).forEach(l => {
      const prod = DB.findById('products', l.produitId);
      coutTotal += (parseFloat(l.qte) || 0) * (prod ? (prod.prixAchat || 0) : 0);
    }));
    const marge = caTotal - coutTotal;
    const margePct = caTotal > 0 ? (marge / caTotal * 100) : 0;

    // CA par type
    const byType = {};
    active.forEach(i => { byType[i.type] = (byType[i.type] || 0) + (i.total || 0); });

    // Top produits
    const prodMap = {};
    sales.forEach(i => (i.lignes || []).forEach(l => {
      const key = l.produitId || l.designation;
      if (!prodMap[key]) prodMap[key] = { nom: l.designation, qte: 0, montant: 0, unite: l.unite || '' };
      prodMap[key].qte += parseFloat(l.qte) || 0;
      prodMap[key].montant += parseFloat(l.montant) || 0;
    }));
    const topProduits = Object.values(prodMap).sort((a, b) => b.montant - a.montant).slice(0, 8);

    // Top clients
    const cliMap = {};
    sales.forEach(i => {
      const key = i.clientId || i.clientNom;
      if (!cliMap[key]) cliMap[key] = { nom: i.clientNom, total: 0, nb: 0 };
      cliMap[key].total += i.total || 0;
      cliMap[key].nb += 1;
    });
    const topClients = Object.values(cliMap).sort((a, b) => b.total - a.total).slice(0, 8);

    // Répartition des encaissements par mode
    const { from, to } = this._reportRange();
    const ops = Caisse.getOperations({ dateFrom: from || undefined, dateTo: to || undefined });
    const byMode = PAYMENT_METHODS.map(pm => ({
      ...pm,
      total: ops.filter(o => o.modePaiement === pm.id && o.type === 'encaissement').reduce((a, o) => a + o.montant, 0)
    })).filter(m => m.total > 0).sort((a, b) => b.total - a.total);
    const totalEnc = byMode.reduce((a, m) => a + m.total, 0);

    const series = this._reportSeries(invoices);
    const periodLabel = { '7':'7 derniers jours', '30':'30 derniers jours', 'month':'Mois en cours', 'all':'Tout l\'historique', 'custom':'Période personnalisée' }[this._rapportPeriod] || '';
    const rangeLabel = (from || to) ? `${from ? formatDate(from) : '…'} → ${to ? formatDate(to) : '…'}` : 'Toutes dates';

    const p = this._rapportPeriod;
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left">
        <select class="select-input" id="rap-period" onchange="App.setRapportPeriod(this.value)">
          <option value="7" ${p==='7'?'selected':''}>7 derniers jours</option>
          <option value="30" ${p==='30'?'selected':''}>30 derniers jours</option>
          <option value="month" ${p==='month'?'selected':''}>Mois en cours</option>
          <option value="all" ${p==='all'?'selected':''}>Tout l'historique</option>
          <option value="custom" ${p==='custom'?'selected':''}>Personnalisé…</option>
        </select>
        <span id="rap-custom" style="display:${p==='custom'?'inline-flex':'none'};gap:8px;align-items:center">
          <input type="date" id="rap-from" class="form-input" style="width:auto" value="${this._rapportFrom}">
          <span class="text-muted">→</span>
          <input type="date" id="rap-to" class="form-input" style="width:auto" value="${this._rapportTo}">
          <button class="btn btn-sm btn-primary" onclick="App.applyCustomRange()">Appliquer</button>
        </span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-outline btn-sm" onclick="App.exportReportCSV()" title="Exporter la synthèse">📊 Synthèse CSV</button>
        <button class="btn btn-outline btn-sm" onclick="App.exportInvoicesCSV()" title="Exporter les factures de la période">🧾 Factures CSV</button>
        <button class="btn btn-outline btn-sm" onclick="App.exportStockCSV()" title="Exporter l'état du stock">📦 Stock CSV</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" style="--accent:#7C6FFF">
        <div class="kpi-icon" style="background:rgba(124,111,255,0.15)">💰</div>
        <div class="kpi-content"><div class="kpi-label">CA Généré</div><div class="kpi-value">${formatCurrency(caTotal)}</div><div class="kpi-sub">${sales.length} vente(s) · ${periodLabel}</div></div>
      </div>
      <div class="kpi-card" style="--accent:#2EE88A">
        <div class="kpi-icon" style="background:rgba(46,232,138,0.15)">✅</div>
        <div class="kpi-content"><div class="kpi-label">CA Encaissé</div><div class="kpi-value">${formatCurrency(caPaye)}</div><div class="kpi-sub">${rangeLabel}</div></div>
      </div>
      <div class="kpi-card" style="--accent:#FF4B6B">
        <div class="kpi-icon" style="background:rgba(255,75,107,0.15)">⏳</div>
        <div class="kpi-content"><div class="kpi-label">Créances (Reste)</div><div class="kpi-value">${formatCurrency(creances)}</div><div class="kpi-sub">À recouvrer</div></div>
      </div>
      <div class="kpi-card" style="--accent:#FFB347">
        <div class="kpi-icon" style="background:rgba(255,179,71,0.15)">📈</div>
        <div class="kpi-content"><div class="kpi-label">Marge Estimée</div><div class="kpi-value">${formatCurrency(marge)}</div><div class="kpi-sub">${margePct.toFixed(1)} % du CA</div></div>
      </div>
    </div>

    <div class="dash-row">
      <div class="card chart-card">
        <div class="card-header"><h3>📈 Évolution des encaissements</h3></div>
        <div class="chart-wrapper"><canvas id="rapport-chart" height="200"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>💳 Encaissements par mode</h3></div>
        <div class="card-body" style="padding:16px">
          ${byMode.length === 0 ? '<div class="empty-state-small">Aucun encaissement sur la période</div>' : byMode.map(m => `
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>${m.icon} ${m.label}</span><strong>${formatCurrency(m.total)}</strong>
            </div>
            <div style="height:7px;border-radius:4px;background:rgba(255,255,255,0.06);overflow:hidden">
              <div style="height:100%;width:${totalEnc>0?(m.total/totalEnc*100):0}%;background:${m.color};border-radius:4px"></div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="dash-row">
      <div class="card">
        <div class="card-header"><h3>🏆 Top Produits</h3></div>
        ${topProduits.length === 0 ? '<div class="empty-state-small">Aucune vente sur la période</div>' : `
        <table class="data-table">
          <thead><tr><th>#</th><th>Produit</th><th>Qté</th><th>CA</th></tr></thead>
          <tbody>${topProduits.map((t, i) => `<tr>
            <td>${i+1}</td><td><strong>${t.nom}</strong></td>
            <td>${new Intl.NumberFormat('fr-FR').format(t.qte)} ${t.unite}</td>
            <td class="fw-bold">${formatCurrency(t.montant)}</td></tr>`).join('')}
          </tbody>
        </table>`}
      </div>
      <div class="card">
        <div class="card-header"><h3>👥 Top Clients</h3></div>
        ${topClients.length === 0 ? '<div class="empty-state-small">Aucun client sur la période</div>' : `
        <table class="data-table">
          <thead><tr><th>#</th><th>Client</th><th>Factures</th><th>CA</th></tr></thead>
          <tbody>${topClients.map((c, i) => `<tr>
            <td>${i+1}</td><td><strong>${c.nom}</strong></td>
            <td>${c.nb}</td><td class="fw-bold">${formatCurrency(c.total)}</td></tr>`).join('')}
          </tbody>
        </table>`}
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>🧾 CA par type de document</h3></div>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Montant</th><th>Part</th></tr></thead>
        <tbody>
          ${Object.keys(byType).length === 0 ? '<tr><td colspan="3" class="empty-cell">Aucune donnée</td></tr>' : ''}
          ${Object.keys(byType).map(t => {
            const ti = getInvoiceTypeInfo(t);
            const part = caTotal > 0 && t !== 'avoir' ? (byType[t] / caTotal * 100).toFixed(1) + ' %' : '—';
            return `<tr><td><span class="badge" style="background:${ti.bg};color:${ti.color}">${ti.icon} ${ti.label}</span></td><td class="fw-bold">${formatCurrency(byType[t])}</td><td>${part}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

    this.drawSalesChart(series.length ? series : [{ label: '—', ca: 0 }], 'rapport-chart');
  },

  // ─── EXPORTS CSV ──────────────────────────────────────────
  downloadCSV(filename, headers, rows) {
    const esc = v => { const s = (v == null ? '' : String(v)); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    this.showToast('Export CSV téléchargé.', 'success');
  },

  exportReportCSV() {
    const invoices = this._reportInvoices();
    const active = invoices.filter(i => i.statut !== 'annule');
    const sales = active.filter(i => i.type !== 'avoir');
    const caTotal = sales.reduce((s, i) => s + (i.total || 0), 0);
    const caPaye = active.reduce((s, i) => s + (i.montantPaye || 0), 0);
    const creances = sales.reduce((s, i) => s + (i.resteAPayer || 0), 0);
    let cout = 0;
    sales.forEach(i => (i.lignes || []).forEach(l => { const p = DB.findById('products', l.produitId); cout += (parseFloat(l.qte)||0) * (p ? (p.prixAchat||0) : 0); }));
    const { from, to } = this._reportRange();
    const rows = [
      ['Période (début)', from || 'Toutes dates'],
      ['Période (fin)', to || 'Toutes dates'],
      ['CA généré (FCFA)', caTotal],
      ['CA encaissé (FCFA)', caPaye],
      ['Créances / reste à payer (FCFA)', creances],
      ['Coût d\'achat estimé (FCFA)', cout],
      ['Marge estimée (FCFA)', caTotal - cout],
      ['Nombre de ventes', sales.length],
      ['Nombre de documents', active.length],
      ['Valeur du stock (FCFA)', Stock.getStockValue()]
    ];
    this.downloadCSV(`GIS-synthese-${todayStr()}.csv`, ['Indicateur', 'Valeur'], rows);
  },

  exportInvoicesCSV() {
    const invoices = this._reportInvoices().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const headers = ['Numéro', 'Date', 'Type', 'Client', 'Sous-total', 'Remise', 'Total', 'Payé', 'Reste', 'Statut', 'Mode', 'Émis par'];
    const rows = invoices.map(i => [
      i.numero, i.date, (getInvoiceTypeInfo(i.type) || {}).label || i.type, i.clientNom,
      i.sousTotal, i.remiseGlobale, i.total, i.montantPaye, i.resteAPayer,
      i.statut, (getPaymentMethodInfo(i.modePaiement) || {}).label || i.modePaiement, i.createdByName
    ]);
    this.downloadCSV(`GIS-factures-${todayStr()}.csv`, headers, rows);
  },

  exportStockCSV() {
    const products = Stock.getInventoryReport();
    const headers = ['Code', 'Produit', 'Catégorie', 'Unité', 'Prix achat', 'Prix vente', 'Stock', 'Stock min', 'Valeur stock', 'Statut'];
    const rows = products.map(p => [p.code, p.name, p.categorie, p.unite, p.prixAchat, p.prixVente, p.stock, p.stockMin, p.valeurStock, p.statut]);
    this.downloadCSV(`GIS-stock-${todayStr()}.csv`, headers, rows);
  },

  // ─── RÔLES & DROITS ───────────────────────────────────────
  renderRoles() {
    const roles = RoleManager.getAll();
    document.getElementById('main-content').innerHTML = `
    <div class="page-toolbar">
      <div class="toolbar-left"><span class="text-muted">Définissez qui voit quoi et qui peut faire quoi.</span></div>
      <div class="toolbar-right">${Auth.isAdmin() ? '<button class="btn btn-primary" onclick="App.openRoleModal()">+ Nouveau Rôle</button>' : ''}</div>
    </div>
    <div class="roles-grid">
      ${roles.map(r => {
        const roleValue = RoleManager.getRoleValue(r);
        const usersCount = DB.findWhere('users', u => u.role === r.id || u.role === roleValue).length;
        return `
        <div class="card role-card" style="border-left:4px solid ${r.color || '#6C63FF'}">
          <div class="card-header">
            <h3>${r.icon || '👤'} ${r.nom} ${r.isSystem ? '<span class="badge badge-info">Système</span>' : ''}</h3>
            <div class="action-btns">
              ${Auth.isAdmin() ? `<button class="btn-icon" title="Modifier" onclick="App.openRoleModal('${r.id}')">✏️</button>` : ''}
              ${!r.isSystem && Auth.isAdmin() ? `<button class="btn-icon text-danger" title="Supprimer" onclick="App.deleteRole('${r.id}')">🗑️</button>` : ''}
            </div>
          </div>
          <div style="padding:12px 20px">
            <div class="text-muted" style="font-size:12px;margin-bottom:8px">👥 ${usersCount} utilisateur(s) · 📄 ${(r.pages || []).length} page(s) · ⚡ ${(r.actions || []).length} action(s)</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${(r.pages || []).map(pid => {
                const pg = ALL_PAGES.find(p => p.id === pid);
                return pg ? `<span class="cat-tag">${pg.icon} ${pg.label}</span>` : '';
              }).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${this.roleModal()}`;
  },

  roleModal() {
    return `
    <div id="role-modal" class="modal-overlay" style="display:none">
      <div class="modal" style="max-width:720px">
        <div class="modal-header"><h3 id="role-modal-title">Nouveau Rôle</h3><button class="modal-close" onclick="App.closeModal('role-modal')">✕</button></div>
        <div class="modal-body">
          <input type="hidden" id="role-edit-id">
          <div class="form-grid">
            <div class="form-group"><label>Nom du rôle *</label><input type="text" id="role-nom" class="form-input" placeholder="Ex: Superviseur Caisse"></div>
            <div class="form-group"><label>Icône</label><input type="text" id="role-icon" class="form-input" value="👤"></div>
            <div class="form-group"><label>Couleur</label><input type="color" id="role-color" class="form-input" value="#6C63FF"></div>
          </div>
          <h4 style="margin:14px 0 8px">📄 Pages accessibles</h4>
          <div class="perm-grid">
            ${ALL_PAGES.map(p => `<label class="perm-check"><input type="checkbox" class="role-page-cb" value="${p.id}"> ${p.icon} ${p.label}</label>`).join('')}
          </div>
          <h4 style="margin:14px 0 8px">⚡ Actions autorisées</h4>
          <div class="perm-grid">
            ${ALL_ACTIONS.map(a => `<label class="perm-check"><input type="checkbox" class="role-action-cb" value="${a.id}"> ${a.label}</label>`).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="App.closeModal('role-modal')">Annuler</button>
          <button class="btn btn-primary" onclick="App.saveRole()">💾 Enregistrer</button>
        </div>
      </div>
    </div>`;
  },

  openRoleModal(id = null) {
    document.getElementById('role-modal-title').textContent = id ? 'Modifier le Rôle' : 'Nouveau Rôle';
    document.getElementById('role-edit-id').value = id || '';
    document.querySelectorAll('.role-page-cb, .role-action-cb').forEach(cb => cb.checked = false);
    const role = id ? RoleManager.getById(id) : null;
    if (role) {
      document.getElementById('role-nom').value = role.nom || '';
      document.getElementById('role-icon').value = role.icon || '👤';
      document.getElementById('role-color').value = role.color || '#6C63FF';
      document.querySelectorAll('.role-page-cb').forEach(cb => { cb.checked = (role.pages || []).includes(cb.value); });
      document.querySelectorAll('.role-action-cb').forEach(cb => { cb.checked = (role.actions || []).includes(cb.value); });
    } else {
      document.getElementById('role-nom').value = '';
      document.getElementById('role-icon').value = '👤';
      document.getElementById('role-color').value = '#6C63FF';
    }
    document.getElementById('role-modal').style.display = 'flex';
  },

  saveRole() {
    const editId = document.getElementById('role-edit-id').value;
    const data = {
      nom: document.getElementById('role-nom').value.trim(),
      icon: document.getElementById('role-icon').value.trim() || '👤',
      color: document.getElementById('role-color').value,
      pages: [...document.querySelectorAll('.role-page-cb:checked')].map(cb => cb.value),
      actions: [...document.querySelectorAll('.role-action-cb:checked')].map(cb => cb.value)
    };
    if (!data.nom) { this.showToast('Le nom du rôle est requis.', 'error'); return; }
    const result = editId ? RoleManager.update(editId, data) : RoleManager.create(data);
    if (result.success !== false) {
      this.closeModal('role-modal');
      this.showToast(editId ? 'Rôle modifié.' : 'Rôle créé.', 'success');
      this.buildSidebar();
      this.renderRoles();
    } else this.showToast(result.error, 'error');
  },

  async deleteRole(id) {
    const role = RoleManager.getById(id);
    const ok = await GISDialog.confirm({
      title: 'Supprimer le rôle',
      message: `Supprimer le rôle « ${role ? role.nom : ''} » ? Cette action est définitive.`,
      icon: '🔐', confirmLabel: 'Supprimer'
    });
    if (!ok) return;
    const result = RoleManager.delete(id);
    if (result.success) { this.showToast('Rôle supprimé.', 'success'); this.renderRoles(); }
    else this.showToast(result.error, 'error');
  },

  // ─── CONSOLE SUPERADMIN ───────────────────────────────────
  renderSuperAdmin() {
    if (!Auth.isSuperAdmin()) {
      this.showToast('Accès réservé au SuperAdmin.', 'error');
      this.navigate('dashboard');
      return;
    }
    const users = DB.getAll('users');
    const administrators = users.filter(user => user.role === 'admin');
    const counts = {
      users: users.length,
      products: DB.getAll('products').length,
      invoices: DB.getAll('invoices').length,
      devis: DB.getAll('devis').length,
      clients: DB.getAll('clients').length,
      roles: DB.getAll('roles').length
    };
    document.getElementById('main-content').innerHTML = `
    <div class="card" style="border-left:4px solid #FF4757">
      <div class="card-header"><h3>🔑 Console SuperAdmin</h3><span class="badge" style="background:rgba(255,71,87,0.15);color:#FF4757">Accès total</span></div>
      <div class="kpi-grid" style="padding:0 20px 20px">
        ${Object.entries({ users:'👤 Utilisateurs', products:'🏗️ Produits', invoices:'🧾 Factures', devis:'📋 Devis', clients:'👥 Clients', roles:'🔐 Rôles' }).map(([k, label]) => `
        <div class="kpi-card" style="--accent:#FF4757">
          <div class="kpi-content">
            <div class="kpi-label">${label}</div>
            <div class="kpi-value">${counts[k]}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header"><h3>👑 Gestion des Administrateurs</h3>
        <button class="btn btn-primary btn-sm" onclick="App.saCreateAdmin()">+ Créer un Administrateur</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Administrateur</th><th>Identifiant</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${administrators.length ? administrators.map(u => `<tr>
              <td><strong>${u.prenom} ${u.nom}</strong></td>
              <td><code>${u.username}</code></td>
              <td><span class="status-badge ${u.actif ? 'status-paye' : 'status-annule'}">${u.actif ? '✅ Actif' : '❌ Inactif'}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" title="Réinitialiser le mot de passe" onclick="App.saResetPassword('${u.id}')">🔑</button>
                  ${u.id !== Auth.getCurrentUser()?.id && u.role !== 'superadmin' ? `<button class="btn-icon" title="Activer/Désactiver" onclick="App.saToggleActive('${u.id}')">${u.actif ? '🔒' : '🔓'}</button>` : ''}
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Aucun administrateur secondaire.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:20px;border-left:4px solid #FF4757">
      <div class="card-header"><h3>⚠️ Zone Danger (SuperAdmin)</h3></div>
      <div style="padding:20px;display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-danger" onclick="App.saWipeCloudDB()">🗑️ Purger les données opérationnelles</button>
      </div>
    </div>`;
  },

  async saResetPassword(userId) {
    if (!Auth.isSuperAdmin()) return;
    const u = DB.findById('users', userId);
    if (!u) return;
    try {
      await Auth.sendPasswordReset(u.email);
      this.showToast(`Un lien de réinitialisation a été envoyé à ${u.email}.`, 'success');
    } catch (error) {
      console.error('[GIS] Administrator password reset failed:', error);
      this.showToast(Auth._authError(error), 'error');
    }
  },

  saCreateAdmin() {
    if (!Auth.isSuperAdmin()) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay'; modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header"><h3>👑 Nouvel Administrateur</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Prénom *</label><input type="text" id="sa-adm-prenom" class="form-input" value="GIS"></div>
            <div class="form-group"><label>Nom *</label><input type="text" id="sa-adm-nom" class="form-input" value="Admin"></div>
            <div class="form-group"><label>Identifiant *</label><input type="text" id="sa-adm-username" class="form-input" placeholder="ex: admin2"></div>
            <div class="form-group"><label>Adresse e-mail *</label><input type="email" id="sa-adm-email" class="form-input" placeholder="admin@exemple.com"></div>
          </div>
          <p class="text-muted" style="padding:0 14px;font-size:12px">Un lien de définition du mot de passe sera envoyé à cette adresse. Ce compte aura un accès Administrateur complet, hors console SuperAdmin.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="App.saCreateAdminSave(this.closest('.modal-overlay'))">👑 Créer l'administrateur</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById('sa-adm-username')?.focus(), 60);
  },

  async saCreateAdminSave(modalEl) {
    if (!Auth.isSuperAdmin()) return;
    const prenom = document.getElementById('sa-adm-prenom').value.trim() || 'GIS';
    const nom = document.getElementById('sa-adm-nom').value.trim() || 'Admin';
    const username = document.getElementById('sa-adm-username').value.trim();
    const email = document.getElementById('sa-adm-email').value.trim();
    if (!username || !email) { this.showToast('Identifiant et adresse e-mail requis.', 'error'); return; }
    const result = await UserManager.create({
      prenom, nom, username, email, role: 'admin'
    });
    if (!result.success) { this.showToast(result.error, 'error'); return; }
    modalEl.remove();
    this.showToast(result.warning || 'Administrateur créé. Un lien de définition du mot de passe a été envoyé par e-mail.', result.warning ? 'error' : 'success');
    this.renderSuperAdmin();
  },

  async saToggleActive(userId) {
    if (!Auth.isSuperAdmin()) return;
    const result = await UserManager.toggleActive(userId);
    if (!result.success) { this.showToast(result.error, 'error'); return; }
    this.showToast('Statut du compte modifié.', 'success');
    this.renderSuperAdmin();
  },

  async saWipeCloudDB() {
    if (!Auth.isSuperAdmin()) return;
    const ok1 = await GISDialog.confirm({
      title: 'Purger les données opérationnelles',
      message: 'Supprimer définitivement les produits, clients, factures, devis, stocks, opérations de caisse, messages et notifications ? Les comptes utilisateurs, rôles et paramètres de bootstrap seront conservés.',
      icon: '☁️', confirmLabel: 'Purger les données'
    });
    if (!ok1) return;
    const ok2 = await GISDialog.confirm({
      title: 'Dernière confirmation',
      message: 'Cette action est IRRÉVERSIBLE et concerne tous les appareils synchronisés. Continuer ?',
      icon: '⚠️', confirmLabel: 'Oui, purger'
    });
    if (!ok2) return;
    try {
      await DB.purgeBusinessData();
      localStorage.removeItem('GIS_state_cache');
      window.location.reload();
    } catch (error) {
      console.error('[GIS] Supabase business data purge failed:', error);
      this.showToast(error.message || 'Impossible de purger les données.', 'error');
    }
  }

};

// ═══════════════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
        App.showLoginTab('recovery');
      }
    });
  }
  App.init();
  // Close modals on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none';
  });
});
