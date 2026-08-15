# JobTracker

JobTracker est une application web de suivi de recherche d'emploi. Elle permet de centraliser les entreprises, les offres, les candidatures, les relances, les entretiens, les documents et les statistiques associées à une recherche d'emploi.

Le projet est organisé en monorepo `pnpm` avec un backend NestJS et un frontend React + Vite.

## Fonctionnalités

- gestion des comptes utilisateurs ;
- authentification par session ;
- inscription, connexion et déconnexion ;
- consultation et modification du profil ;
- changement de mot de passe ;
- révocation des autres sessions ;
- suppression complète du compte ;
- gestion des entreprises ;
- gestion des offres d'emploi ;
- gestion des candidatures ;
- suivi des relances et entretiens ;
- calendrier ;
- tableau de bord et statistiques ;
- gestion des documents ;
- journal d'événements des candidatures.

## Architecture

```text
jobtracker/
├── apps/
│   ├── backend/       # API NestJS
│   └── frontend/      # React + Vite
├── docs/              # documentation fonctionnelle et technique
├── .husky/            # hooks Git
├── compose.yaml       # stack Docker complète
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

### Backend

Le backend repose notamment sur :

- NestJS ;
- Prisma ;
- PostgreSQL ;
- Argon2 pour les mots de passe ;
- sessions persistées en base ;
- validation des DTO avec `class-validator`.

### Frontend

Le frontend repose notamment sur :

- React ;
- Vite ;
- TypeScript ;
- React Router ;
- TanStack Query ;
- Axios ;
- Tailwind CSS.

## Prérequis

- Node.js ;
- `pnpm` 11.20.0 ;
- Docker et Docker Compose pour l'exécution conteneurisée.

Le gestionnaire de paquets attendu est déclaré dans `package.json` :

```text
pnpm@11.20.0
```

## Installation

Depuis la racine du dépôt :

```bash
pnpm install
```

Les hooks Git Husky sont installés par le script `prepare`.

## Démarrage avec Docker Compose

Une configuration d'environnement d'exemple est fournie à la racine :

```bash
cp .env.example .env
```

Puis démarrer la stack :

```bash
docker compose up --build
```

La stack comprend :

- PostgreSQL 17 ;
- un service de migration Prisma ;
- le backend ;
- le frontend.

Avec les valeurs par défaut de `.env.example` :

- frontend : `http://localhost:8080`
- backend : `http://localhost:3000`
- PostgreSQL : `localhost:5432`

Les migrations Prisma sont appliquées par le service `migrate` avant le démarrage du backend.

Pour arrêter la stack :

```bash
docker compose down
```

Pour supprimer également le volume PostgreSQL :

```bash
docker compose down -v
```

## Variables d'environnement

### Stack Docker

Le fichier `.env.example` définit :

```dotenv
POSTGRES_DB=jobtracker
POSTGRES_USER=jobtracker
POSTGRES_PASSWORD=jobtracker_dev
POSTGRES_PORT=5432

BACKEND_PORT=3000
FRONTEND_PORT=8080

AUTH_SESSION_TTL_SECONDS=604800
```

### Frontend Vite

`apps/frontend/.env.example` expose :

```dotenv
VITE_API_URL=http://localhost:3000
```

En développement local, cette variable peut être omise : le frontend utilise alors `http://localhost:3000`.

## Développement local

Le monorepo expose les commandes racine suivantes :

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm format
pnpm format:check
```

`pnpm dev` exécute les scripts `dev` disponibles dans les workspaces en parallèle.

Pour cibler une application :

```bash
pnpm --filter backend <commande>
pnpm --filter @jobtracker/frontend <commande>
```

## Qualité et tests

Le dépôt utilise :

- ESLint ;
- Prettier ;
- Jest côté backend ;
- Vitest côté frontend ;
- Husky ;
- lint-staged ;
- Commitlint avec Conventional Commits.

Validation générale :

```bash
pnpm lint
pnpm build
pnpm test
pnpm format:check
```

Les commits sont vérifiés par les hooks Git et la CI GitHub.

## Documentation

La documentation détaillée se trouve dans `docs/`.

Documents principaux :

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/sprint_0_Cadrage.md`
- `docs/sprint_1_Initialisation.md`
- `docs/sprint_2_Creation_Backend_NestJS.md`
- `docs/sprint_3_Gestion_Candidatures.md`
- `docs/sprint_4_Gestion_Entreprises.md`
- `docs/sprint_5_Relances_Calendrier.md`
- `docs/sprint_6_Tableau_Bord_Statistiques.md`
- `docs/sprint_7_Gestion_Documents.md`
- `docs/sprint_8_Gestion_Comptes_Utilisateurs.md`

La roadmap indique les sprints actuellement terminés.

## Workflow de développement

Les évolutions sont volontairement réalisées par petites tranches isolées :

1. modification d'un périmètre restreint ;
2. tests ciblés ;
3. validation complète ;
4. commit atomique ;
5. push ;
6. validation de la CI GitHub.

Cette méthode limite les régressions et maintient un historique Git lisible.
