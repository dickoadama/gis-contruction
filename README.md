# GIS — Gestion intégrée de stock

Application web de gestion de ventes, factures, devis, caisse et stocks de matériaux de construction.

## Utilisation locale

L’application utilise Firebase Authentication, Cloud Firestore et des fonctions callable. Servez le dossier avec un serveur HTTP local; l’ouverture directe de `index.html` (`file://`) ne permet pas l’authentification Firebase.

## Configuration Firebase

1. Utilisez un projet Firebase que vous administrez et activez **Authentication > E-mail/Mot de passe** ainsi que Firestore.
2. Dans les paramètres Authentication, configurez une politique de mot de passe d’au moins 12 caractères et autorisez le domaine où l’application sera hébergée.
3. Remplacez la configuration Web dans `js/data_v2.js` par celle de votre projet. La clé API Web Firebase est publique; restreignez-la aux domaines et API nécessaires. Ne placez jamais de clé de compte de service dans ce dépôt.
4. Installez la CLI Firebase et connectez-vous, puis configurez le secret de bootstrap sans l’ajouter au dépôt :

   ```sh
   firebase login
   firebase functions:secrets:set GIS_BOOTSTRAP_TOKEN --project <PROJECT_ID>
   ```

   Utilisez une valeur aléatoire forte et gardez-la hors du code source. Après le déploiement, publiez les fonctions et les règles :

   ```sh
   firebase deploy --project <PROJECT_ID> --only firestore:rules,functions
   ```

5. Servez l’application sur un domaine autorisé, ouvrez **Premier démarrage : créer l’administrateur**, puis saisissez le secret, l’adresse e-mail et un mot de passe d’au moins 12 caractères. Le bootstrap ne fonctionne qu’une fois par projet Firestore.
6. Après la création du SuperAdmin, supprimez ou faites tourner le secret `GIS_BOOTSTRAP_TOKEN` dans Firebase Secret Manager.

## Données existantes

Le bootstrap refuse de s’exécuter si la collection `users` contient déjà des comptes. Aucun mot de passe ou compte de l’ancienne authentification locale n’est migré. Sauvegardez vos données et utilisez de préférence un projet Firebase neuf; toute migration de données doit être planifiée et vérifiée avant le déploiement des règles.

Les règles Firestore protègent les accès par rôle. Ne remplacez pas ces règles par des règles publiques. Le client ne peut pas créer ou modifier directement les profils utilisateurs; ces opérations passent par les fonctions backend.

## Fonctions backend

Depuis le dossier `functions`, installez les dépendances et exécutez la vérification syntaxique :

```sh
npm ci
npm run lint
```

Le runtime des fonctions est Node.js 22.
