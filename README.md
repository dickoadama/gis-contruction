# GIS — Gestion intégrée de stock

Application de gestion des ventes, factures, devis, caisse et stocks de matériaux de construction.

## Configuration du navigateur

Le projet utilise Supabase Auth, PostgreSQL, Row Level Security (RLS) et Realtime. Servez le dossier avec un serveur HTTP; l’ouverture directe en `file://` ne permet pas l’authentification.

Dans `js/supabase-config.js`, renseignez l’URL du projet et sa clé `anon`/`publishable`. Cette clé est publique et peut être incluse dans l’application. **N’ajoutez jamais la clé `service_role` au navigateur, au dépôt ou à un fichier distribué.**

Dans Supabase, activez l’authentification par e-mail/mot de passe et ajoutez l’URL du site aux URL de redirection autorisées.

## Installer la base et les fonctions

Installez la CLI Supabase, puis depuis la racine du dépôt :

```sh
supabase login
supabase link --project-ref vwcanlrctpqrfsxqitbj
supabase db push
supabase secrets set GIS_BOOTSTRAP_TOKEN="<jeton aléatoire fort>"
supabase functions deploy admin-users
```

Le jeton de bootstrap peut être généré avec Node.js :

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Une fois la migration appliquée et la fonction déployée, ouvrez **Premier démarrage : créer l’administrateur** et fournissez ce jeton. L’opération n’est possible qu’une seule fois. Supprimez ensuite le secret avec `supabase secrets unset GIS_BOOTSTRAP_TOKEN`.

La fonction `admin-users` utilise la clé de service uniquement côté serveur. Elle vérifie la session, le profil actif et les privilèges avant toute création, modification, désactivation ou suppression de compte.

## Privilèges et données

Les rôles et actions sont conservés dans `roles`; les profils Auth dans `profiles`; les données métier dans `app_records`. Les migrations SQL configurent les politiques RLS : les permissions sont contrôlées par PostgreSQL, pas seulement par les menus de l’interface. Les rôles peuvent gérer les pages et actions autorisées; la création d’administrateurs et les privilèges de gestion sont réservés au SuperAdmin.

**Les données et comptes de l’ancien fournisseur ne sont pas importés automatiquement ni supprimés à distance.** Les mots de passe ne sont pas transférables tels quels; prévoyez un export et une migration séparés si les données doivent être conservées. La première installation Supabase démarre avec ses rôles prédéfinis et les données de démonstration initialisées par l’application.
