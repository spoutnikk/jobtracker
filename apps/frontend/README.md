# JobTracker — Frontend

Interface React + Vite de JobTracker.

La documentation générale du projet, les instructions d'installation, Docker, les commandes de validation et l'architecture du monorepo sont décrites dans le [`README.md`](../../README.md) à la racine.

## Rôle

Le frontend fournit notamment :

- inscription et connexion ;
- profil utilisateur ;
- changement de mot de passe ;
- gestion des sessions ;
- suppression du compte ;
- entreprises ;
- offres d'emploi ;
- candidatures ;
- calendrier ;
- tableau de bord ;
- documents.

## Configuration

Une configuration d'exemple est disponible dans `.env.example` :

```dotenv
VITE_API_URL=http://localhost:3000
```

## Commandes utiles

Depuis la racine du dépôt :

```bash
pnpm --filter @jobtracker/frontend lint
pnpm --filter @jobtracker/frontend build
pnpm --filter @jobtracker/frontend test
```
