# JobTracker — Backend

API NestJS de JobTracker.

La documentation générale du projet, les instructions d'installation, Docker, les commandes de validation et l'architecture du monorepo sont décrites dans le [`README.md`](../../README.md) à la racine.

## Rôle

Le backend fournit notamment :

- authentification et sessions ;
- gestion du profil utilisateur ;
- entreprises ;
- offres d'emploi ;
- candidatures ;
- relances et entretiens ;
- tableau de bord ;
- documents ;
- journal d'événements ;
- endpoint de santé.

## Commandes utiles

Depuis la racine du dépôt :

```bash
pnpm --filter backend build
pnpm --filter backend lint
pnpm --filter backend test
pnpm --filter backend test:integration
pnpm --filter backend test:e2e
```

La base PostgreSQL et les migrations Prisma peuvent être gérées via la stack Docker décrite dans le README racine.
