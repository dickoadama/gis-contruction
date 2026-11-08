'use strict';

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const auth = getAuth();
const db = getFirestore();
const bootstrapToken = defineSecret('GIS_BOOTSTRAP_TOKEN');

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

function fail(code, message) {
  throw new HttpsError(code, message);
}

function validateProfile(data) {
  const prenom = String(data.prenom || '').trim();
  const nom = String(data.nom || '').trim();
  const username = String(data.username || '').trim().toLowerCase();
  const email = String(data.email || '').trim().toLowerCase();
  if (!prenom || !nom || prenom.length > 80 || nom.length > 80) {
    fail('invalid-argument', 'Le prénom et le nom sont requis (80 caractères maximum).');
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    fail('invalid-argument', 'L’identifiant doit comporter 3 à 30 caractères (lettres, chiffres, point, tiret ou tiret bas).');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('invalid-argument', 'Adresse e-mail invalide.');
  }
  return { prenom, nom, username, email };
}

function profileFor(uid, identity, data, role) {
  return {
    id: uid,
    prenom: data.prenom,
    nom: data.nom,
    username: data.username,
    email: identity.email,
    telephone: String(data.telephone || '').trim().slice(0, 40),
    role,
    actif: true,
    createdAt: new Date().toISOString()
  };
}

exports.getBootstrapStatus = onCall(async () => {
  const snapshot = await db.collection('system').doc('bootstrap').get();
  return { configured: snapshot.exists && snapshot.data().state === 'complete' };
});

async function requireCaller(request, adminOnly = false) {
  if (!request.auth) fail('unauthenticated', 'Connexion requise.');
  const snapshot = await db.collection('users').doc(request.auth.uid).get();
  if (!snapshot.exists || snapshot.data().actif !== true) {
    fail('permission-denied', 'Compte inactif ou profil introuvable.');
  }
  const caller = snapshot.data();
  if (adminOnly && !['admin', 'superadmin'].includes(caller.role)) {
    fail('permission-denied', 'Accès réservé à un administrateur.');
  }
  return caller;
}

async function reserveUsername(transaction, username, uid) {
  const usernameRef = db.collection('usernames').doc(username);
  const usernameSnapshot = await transaction.get(usernameRef);
  if (usernameSnapshot.exists && usernameSnapshot.data().uid !== uid) {
    fail('already-exists', 'Cet identifiant est déjà utilisé.');
  }
  transaction.set(usernameRef, { uid });
}

async function saveNewProfile(profile) {
  const userRef = db.collection('users').doc(profile.id);
  const transaction = db.runTransaction(async tx => {
    const userSnapshot = await tx.get(userRef);
    if (userSnapshot.exists) fail('already-exists', 'Un profil existe déjà pour ce compte.');
    await reserveUsername(tx, profile.username, profile.id);
    tx.create(userRef, profile);
  });
  return transaction;
}

exports.bootstrapAdmin = onCall({ secrets: [bootstrapToken] }, async request => {
  const supplied = String(request.data && request.data.setupToken || '');
  const expected = bootstrapToken.value();
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!expected || suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    fail('permission-denied', 'Clé de configuration invalide.');
  }

  const data = validateProfile(request.data || {});
  const password = String(request.data.password || '');
  if (password.length < 12 || password.length > 128) {
    fail('invalid-argument', 'Le mot de passe doit comporter entre 12 et 128 caractères.');
  }

  const lockRef = db.collection('system').doc('bootstrap');
  await db.runTransaction(async tx => {
    const lock = await tx.get(lockRef);
    if (lock.exists) fail('failed-precondition', 'Le compte administrateur initial a déjà été configuré.');
    const users = await tx.get(db.collection('users').limit(1));
    if (!users.empty) fail('failed-precondition', 'La base contient déjà des utilisateurs.');
    const usernameRef = db.collection('usernames').doc(data.username);
    const usernameSnapshot = await tx.get(usernameRef);
    if (usernameSnapshot.exists) fail('already-exists', 'Cet identifiant est déjà utilisé.');
    tx.create(lockRef, { state: 'provisioning', email: data.email });
    tx.create(usernameRef, { pending: true });
  });

  let identity;
  try {
    identity = await auth.createUser({
      email: data.email,
      password,
      emailVerified: true,
      displayName: `${data.prenom} ${data.nom}`
    });
    const profile = profileFor(identity.uid, identity, data, 'superadmin');
    const batch = db.batch();
    batch.set(db.collection('users').doc(identity.uid), profile);
    batch.set(db.collection('usernames').doc(data.username), { uid: identity.uid });
    batch.set(lockRef, { state: 'complete', uid: identity.uid, completedAt: FieldValue.serverTimestamp() });
    INITIAL_ROLES.forEach(role => batch.set(db.collection('roles').doc(role.id), role, { merge: true }));
    await batch.commit();
    return { uid: identity.uid, email: identity.email };
  } catch (error) {
    if (identity) {
      try { await auth.deleteUser(identity.uid); } catch (cleanupError) {
        console.error('bootstrapAdmin could not remove incomplete auth user:', cleanupError);
      }
    }
    try {
      await db.runTransaction(async tx => {
        const lock = await tx.get(lockRef);
        if (lock.exists && lock.data().state === 'provisioning') {
          tx.delete(lockRef);
          tx.delete(db.collection('usernames').doc(data.username));
        }
      });
    } catch (cleanupError) {
      console.error('bootstrapAdmin could not release its setup lock:', cleanupError);
    }
    if (error instanceof HttpsError) throw error;
    if (error.code === 'auth/email-already-exists') {
      fail('already-exists', 'Cette adresse e-mail est déjà associée à un compte Firebase.');
    }
    console.error('bootstrapAdmin failed:', error);
    fail('internal', 'Impossible de configurer le compte administrateur.');
  }
});

exports.completeRegistration = onCall(async request => {
  if (!request.auth || !request.auth.token.email) {
    fail('unauthenticated', 'Connectez-vous avec une adresse e-mail valide.');
  }
  if (request.auth.token.email_verified !== true) {
    fail('failed-precondition', 'Confirmez votre adresse e-mail avant de terminer l’inscription.');
  }

  const data = validateProfile({ ...request.data, email: request.auth.token.email });
  const profile = profileFor(request.auth.uid, { email: data.email }, data, 'utilisateur');
  await saveNewProfile(profile);
  return { uid: profile.id, role: profile.role };
});

exports.createManagedUser = onCall(async request => {
  const caller = await requireCaller(request, true);
  const data = validateProfile(request.data || {});
  const role = String(request.data.role || 'utilisateur');
  if (role === 'superadmin' || (role === 'admin' && caller.role !== 'superadmin')) {
    fail('permission-denied', 'Vous ne pouvez pas attribuer ce rôle.');
  }
  const roleSnapshot = await db.collection('roles').doc(
    role.startsWith('ROLE_') ? role : `ROLE_${role}`
  ).get();
  if (!roleSnapshot.exists) fail('invalid-argument', 'Rôle introuvable.');

  let identity;
  try {
    identity = await auth.createUser({
      email: data.email,
      emailVerified: true,
      displayName: `${data.prenom} ${data.nom}`
    });
    await saveNewProfile(profileFor(identity.uid, identity, { ...data, telephone: request.data.telephone }, role));
    return { uid: identity.uid, email: identity.email };
  } catch (error) {
    if (identity) {
      try { await auth.deleteUser(identity.uid); } catch (cleanupError) {
        console.error('createManagedUser could not remove incomplete auth user:', cleanupError);
      }
    }
    if (error instanceof HttpsError) throw error;
    if (error.code === 'auth/email-already-exists') {
      fail('already-exists', 'Cette adresse e-mail est déjà associée à un compte Firebase.');
    }
    console.error('createManagedUser failed:', error);
    fail('internal', 'Impossible de créer ce compte.');
  }
});

exports.updateUserProfile = onCall(async request => {
  const caller = await requireCaller(request);
  const userId = String(request.data.uid || '');
  if (!userId) fail('invalid-argument', 'Utilisateur introuvable.');
  const isSelf = userId === request.auth.uid;
  if (!isSelf && !['admin', 'superadmin'].includes(caller.role)) {
    fail('permission-denied', 'Accès refusé.');
  }

  const userRef = db.collection('users').doc(userId);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) fail('not-found', 'Utilisateur introuvable.');
  const existing = userSnapshot.data();
  if (!isSelf && existing.role === 'superadmin') {
    fail('permission-denied', 'Vous ne pouvez pas modifier le compte SuperAdmin.');
  }
  const updates = {};
  ['prenom', 'nom', 'telephone'].forEach(key => {
    if (request.data[key] !== undefined) updates[key] = String(request.data[key]).trim().slice(0, 80);
  });

  if (request.data.username !== undefined && request.data.username !== existing.username) {
    const username = String(request.data.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      fail('invalid-argument', 'Identifiant invalide.');
    }
    const newUsernameRef = db.collection('usernames').doc(username);
    const oldUsernameRef = db.collection('usernames').doc(existing.username);
    await db.runTransaction(async tx => {
      const newUsername = await tx.get(newUsernameRef);
      if (newUsername.exists && newUsername.data().uid !== userId) {
        fail('already-exists', 'Cet identifiant est déjà utilisé.');
      }
      tx.set(newUsernameRef, { uid: userId });
      tx.delete(oldUsernameRef);
      tx.update(userRef, { username });
    });
    updates.username = username;
  }

  if (request.data.email !== undefined && request.data.email !== existing.email) {
    if (!['admin', 'superadmin'].includes(caller.role)) {
      fail('permission-denied', 'Seul un administrateur peut modifier l’adresse de connexion.');
    }
    const email = String(request.data.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('invalid-argument', 'Adresse e-mail invalide.');
    await auth.updateUser(userId, { email, emailVerified: false });
    updates.email = email;
  }

  if (request.data.role !== undefined && request.data.role !== existing.role) {
    if (isSelf ||
        !['admin', 'superadmin'].includes(caller.role) ||
        (existing.role === 'admin' && caller.role !== 'superadmin') ||
        (request.data.role === 'admin' && caller.role !== 'superadmin') ||
        request.data.role === 'superadmin' ||
        existing.role === 'superadmin') {
      fail('permission-denied', 'Vous ne pouvez pas attribuer ce rôle.');
    }
    const role = String(request.data.role);
    if (!/^(ROLE_[a-z0-9_-]+|[a-z0-9_-]+)$/.test(role)) {
      fail('invalid-argument', 'Rôle invalide.');
    }
    const roleSnapshot = await db.collection('roles').doc(
      role.startsWith('ROLE_') ? role : `ROLE_${role}`
    ).get();
    if (!roleSnapshot.exists) fail('invalid-argument', 'Rôle introuvable.');
    updates.role = role;
  }

  if (Object.keys(updates).some(key => key !== 'username')) await userRef.update(
    Object.fromEntries(Object.entries(updates).filter(([key]) => key !== 'username'))
  );
  return { ...existing, ...updates };
});

exports.setUserActive = onCall(async request => {
  const caller = await requireCaller(request, true);
  const userId = String(request.data.uid || '');
  if (!userId || userId === request.auth.uid) {
    fail('failed-precondition', 'Un administrateur ne peut pas désactiver son propre compte.');
  }
  const userRef = db.collection('users').doc(userId);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) fail('not-found', 'Utilisateur introuvable.');
  if (userSnapshot.data().role === 'superadmin' || caller.role !== 'superadmin' && userSnapshot.data().role === 'admin') {
    fail('permission-denied', 'Vous ne pouvez pas modifier ce compte administrateur.');
  }
  if (typeof request.data.actif !== 'boolean') {
    fail('invalid-argument', 'Statut de compte invalide.');
  }
  const actif = request.data.actif;
  await userRef.update({ actif });
  await auth.updateUser(userId, { disabled: !actif });
  return { uid: userId, actif };
});

exports.deleteManagedUser = onCall(async request => {
  const caller = await requireCaller(request, true);
  const userId = String(request.data.uid || '');
  if (!userId || userId === request.auth.uid) {
    fail('failed-precondition', 'Vous ne pouvez pas supprimer votre propre compte.');
  }
  const userRef = db.collection('users').doc(userId);
  const snapshot = await userRef.get();
  if (!snapshot.exists) fail('not-found', 'Utilisateur introuvable.');
  const user = snapshot.data();
  if (user.role === 'superadmin' || caller.role !== 'superadmin' && user.role === 'admin') {
    fail('permission-denied', 'Vous ne pouvez pas supprimer ce compte administrateur.');
  }
  const batch = db.batch();
  batch.delete(userRef);
  batch.delete(db.collection('usernames').doc(user.username));
  await batch.commit();
  await auth.deleteUser(userId);
  return { uid: userId };
});

exports.purgeBusinessData = onCall({ timeoutSeconds: 540 }, async request => {
  const caller = await requireCaller(request);
  if (caller.role !== 'superadmin') {
    fail('permission-denied', 'Accès réservé au SuperAdmin.');
  }

  const collections = [
    'products', 'clients', 'invoices', 'devis', 'stock_entries',
    'fournisseurs', 'caisse_ops', 'messages', 'notifications'
  ];
  let deletedCount = 0;
  for (const collection of collections) {
    while (true) {
      const snapshot = await db.collection(collection).limit(400).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach(document => batch.delete(document.ref));
      await batch.commit();
      deletedCount += snapshot.size;
    }
  }
  return { deletedCount };
});
