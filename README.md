# GIS — Gestion intégrée de stock

Application de gestion des ventes, factures, devis, caisse et stocks de matériaux de construction.

## Configuration du navigateur

Le projet utilise Supabase Auth, PostgreSQL, Row Level Security (RLS) et Realtime. Servez le dossier avec un serveur HTTP; l’ouverture directe en `file://` ne permet pas l’authentification.

Dans `js/supabase-config.js`, renseignez l’URL du projet et sa clé `anon`/`publishable`. Cette clé est publique et peut être incluse dans l’application. **N’ajoutez jamais la clé `service_role` au navigateur, au dépôt ou à un fichier distribué.**

Dans Supabase, activez l’authentification par e-mail/mot de passe et ajoutez l’URL du site aux URL de redirection autorisées. Configurez un fournisseur SMTP si la confirmation d’adresse ou la réinitialisation de mot de passe par e-mail est activée.

## Configurer Supabase depuis le tableau de bord

Aucune CLI ni aucun jeton personnel/bootstrap ne sont nécessaires. Dans le tableau de bord du projet :

1. Dans **Authentication > URL Configuration**, ajoutez l’URL du site aux URL autorisées. Activez les inscriptions par e-mail/mot de passe et réglez la longueur minimale du mot de passe à 12 caractères. Les demandes publiques créent des comptes inactifs jusqu’à leur approbation par un administrateur.
2. Dans **SQL Editor**, exécutez chaque migration non appliquée séparément et dans cet ordre : `20261108180000_initial_schema.sql`, `20261108193000_caisse_role_hardening.sql`, `20261108214000_first_signup_superadmin.sql`, `20261109130000_admin_created_accounts.sql`, puis `20261109140000_self_signup_admin_approval.sql`. Sur une base existante, exécutez seulement les migrations manquantes et vérifiez les déclencheurs avant toute réexécution. Les migrations d’invitation ont été retirées, car le flux actif est l’auto-inscription avec validation par l’administrateur. Gardez une trace des migrations exécutées : le SQL Editor ne les enregistre pas dans l’historique de la CLI.
3. Dans **Edge Functions**, créez ou mettez à jour `admin-users` avec le code de `supabase/functions/admin-users/index.ts`, puis déployez-la. La clé `service_role` doit rester côté serveur; ne l’ajoutez jamais au navigateur.
4. Dans les paramètres API du projet, copiez l’URL Supabase et la clé publique `anon`/`publishable` dans `js/supabase-config.js`. Cette clé publique est nécessaire au navigateur et doit être protégée par les politiques RLS.

## Publication avec GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie les fichiers statiques à chaque push sur `main`. Dans le dépôt GitHub, choisissez **Settings > Pages > Build and deployment > Source > GitHub Actions**. L’application sera disponible à l’adresse `https://dickoadama.github.io/gis-contruction/`.

Ajoutez `https://dickoadama.github.io/gis-contruction/**` aux URL de redirection autorisées dans **Authentication > URL Configuration** de Supabase. GitHub Pages héberge uniquement l’interface : appliquez les migrations nécessaires dans Supabase et déployez la fonction Edge `admin-users` depuis le tableau de bord avant de créer des comptes.

### Premier compte SuperAdmin

Quand `profiles` est vide, le lien **Créer le premier compte SuperAdmin** apparaît sur l’écran de connexion. La première demande d’inscription est promue SuperAdmin dans la même transaction que la création du profil. Un verrou PostgreSQL sérialise les inscriptions simultanées; les autres inscriptions créent des comptes inactifs à approuver. Si la confirmation par e-mail est activée, le premier compte occupe déjà cette place avant la confirmation : vérifiez soigneusement l’adresse et le SMTP.

Le premier visiteur qui soumet l’inscription obtient ce rôle. Déployez les migrations, puis ouvrez l’application seulement lorsque vous êtes prêt à créer votre compte. Sur une base qui possède déjà des profils ou un verrou de bootstrap terminé, cette inscription est fermée; vérifiez le compte existant dans la base au lieu de recommencer.

La fonction `admin-users` vérifie la session, le profil actif et les privilèges avant toute création, modification, désactivation ou suppression de compte.

## Parcours multi-utilisateur en trois étapes

1. **SuperAdmin** : la première inscription depuis l’application reçoit ce rôle et tous les accès; les suivantes créent des comptes en attente d’approbation.
2. **Administrateurs** : le SuperAdmin peut créer leurs comptes directement. Seul le SuperAdmin peut attribuer le rôle Administrateur.
3. **Utilisateurs** : ils créent eux-mêmes leur compte depuis l’écran de connexion. L’application génère leur identifiant automatiquement. Le compte reste inactif jusqu’à son approbation dans la page Utilisateurs. Les administrateurs peuvent également créer des comptes directement.

Les inscriptions sont permises, mais un compte créé publiquement n’a aucun accès tant qu’un administrateur ne l’a pas approuvé. La fonction `admin-users`, qui utilise la clé serveur côté Edge Function, reste le seul moyen de modifier le statut ou le rôle d’un compte; aucun secret serveur n’est envoyé au navigateur. Configurez CAPTCHA ou une limitation de débit dans Supabase pour réduire les inscriptions automatisées.

## Privilèges et données

Les rôles et actions sont conservés dans `roles`; les profils Auth dans `profiles`; les données métier dans `app_records`. Les migrations SQL configurent les politiques RLS : les permissions sont contrôlées par PostgreSQL, pas seulement par les menus de l’interface. Les rôles peuvent gérer les pages et actions autorisées; la création d’administrateurs et les privilèges de gestion sont réservés au SuperAdmin.

**Les données et comptes de l’ancien fournisseur ne sont pas importés automatiquement ni supprimés à distance.** Les mots de passe ne sont pas transférables tels quels; prévoyez un export et une migration séparés si les données doivent être conservées. La première installation Supabase démarre avec ses rôles prédéfinis et les données de démonstration initialisées par l’application.

## Contrôle des rôles avant publication

- **SuperAdmin** : accès complet, gestion des administrateurs et console de purge.
- **Administrateur** : gestion opérationnelle, utilisateurs et rôles; seul le SuperAdmin peut attribuer le rôle Administrateur ou modifier son rôle système.
- **Rôles personnalisés et utilisateur** : pages et actions attribuées; l’interface masque les commandes non autorisées et RLS reste l’autorité finale.
- Les opérations manuelles de caisse nécessitent `view_caisse`. Un rôle de facturation peut uniquement enregistrer l’encaissement lié à une facture; un rôle autorisé à annuler une facture peut enregistrer son mouvement de contrepassation.

Avant la mise en production, vérifiez dans le tableau de bord que les migrations ont été exécutées, redéployez `admin-users`, configurez les URLs Auth et testez avec un compte de chaque niveau. Vérifiez notamment les refus côté base pour un utilisateur inactif, un rôle sans action de caisse, un administrateur qui tente d’attribuer le rôle SuperAdmin et un rôle personnalisé qui tente de modifier les opérations de caisse d’un autre utilisateur. Avec un rôle Commercial, vérifiez aussi qu’une vente enregistre bien la facture, met à jour le stock et crée l’encaissement lié; avec un rôle autorisé, vérifiez l’annulation et ses contre-passations.
