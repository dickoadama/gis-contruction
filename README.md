# GIS — Gestion intégrée de stock

Application web de gestion de ventes, factures, devis, caisse et stocks de matériaux de construction. L’authentification, les données et la synchronisation temps réel reposent sur Supabase.

## Configuration Supabase

1. Créez un projet Supabase et copiez son URL ainsi que sa clé publique `anon`/`publishable` dans `js/supabase-config.js`. Cette clé peut être exposée au navigateur; ne mettez jamais la clé `service_role` dans ce fichier.
2. Appliquez le schéma et les politiques de sécurité depuis la racine du dépôt :

   ```sh
   supabase link --project-ref <PROJECT_REF>
   supabase db push
   ```

3. Configurez les URL d’application et de redirection dans **Authentication > URL Configuration**. Activez la confirmation des adresses e-mail.
4. Créez le premier compte depuis l’écran d’inscription, confirmez son adresse, puis promouvez-le une seule fois dans l’éditeur SQL Supabase en remplaçant son adresse :

   ```sql
   update public.users
   set role = 'superadmin', actif = true
   where id = (select id from auth.users where email = lower('superadmin@exemple.com'))
     and not exists (select 1 from public.users where role = 'superadmin');
   ```

   Vérifiez que la requête a modifié exactement une ligne. Les inscriptions ordinaires restent inactives jusqu’à ce qu’un administrateur leur attribue un rôle.

## Fonction de gestion des comptes

La création et la suppression des comptes passent par une fonction Edge qui vérifie le rôle de l’appelant et utilise la clé serveur uniquement côté Supabase :

```sh
supabase functions deploy manage-users
supabase secrets set APP_URL=https://votre-domaine.example
```

Supabase fournit automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` à la fonction. Ne les ajoutez pas au dépôt. Ajoutez aussi l’URL de l’application aux URL de redirection autorisées pour les invitations et la réinitialisation des mots de passe.

## Rôles

- **SuperAdmin** : crée et active les comptes administrateurs depuis la console SuperAdmin.
- **Administrateur** : gère les collègues, attribue les rôles métier et pilote les modules autorisés.
- **Chauffeur** : accès au profil, aux messages et aux notifications; aucun accès à la caisse.
- **Chargeur** : accès aux produits, au stock, aux réceptions et à l’inventaire.
- **Caisse** : ventes, factures, devis, règlements et caisse.
- **Gestionnaire de stock** : produits, stocks, inventaires, entrées et fournisseurs.

Les rôles et permissions sont contrôlés par les politiques RLS de la migration, pas uniquement par l’interface.

## Lancement local

Servez le dossier avec un serveur HTTP local, puis ouvrez son URL dans le navigateur. L’authentification et la synchronisation nécessitent un projet Supabase configuré.

## Données existantes

Les données de l’ancien service ne sont pas transférées automatiquement. Les comptes doivent être recréés ou invités dans Supabase; les mots de passe existants ne sont pas exportables. Sauvegardez les données opérationnelles et planifiez leur import dans les tables Supabase avant de mettre l’application en production.