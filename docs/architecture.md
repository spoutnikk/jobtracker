React + Vite + NestJS est un stack moderne, rapide et très apprécié en entreprise. Il est aussi plus léger qu'Angular et offre une excellente expérience de développement.

Je te propose une architecture cible

À terme, ton dépôt ressemblera à ceci :

jobtracker/
│
├── apps/
│ ├── backend/ # API NestJS
│ └── frontend/ # React + Vite
│
├── packages/
│ ├── ui/ # Composants partagés (plus tard)
│ ├── types/ # Types TypeScript partagés
│ └── config/ # Config ESLint, TS, etc.
│
├── docs/
│
├── .husky/
├── package.json
├── pnpm-workspace.yaml
└── README.md

Cette structure est évolutive et te permettra de partager facilement du code entre le frontend et le backend.

Après ça, j'aimerais faire une petite évolution d'architecture

Au lieu de développer directement les fonctionnalités, je te propose d'installer dès le début quelques briques qui vont nous faire gagner beaucoup de temps :

Backend
Prisma ORM
PostgreSQL (via Docker Compose)
Variables d'environnement (@nestjs/config)
Validation (class-validator)
Logger
Swagger
Frontend
React Router
TanStack Query
Axios
Tailwind CSS
shadcn/ui

Pourquoi ces choix ?

TanStack Query simplifie énormément les appels API et la gestion du cache.
Tailwind CSS est aujourd'hui très utilisé et accélère le développement d'interfaces.
shadcn/ui fournit des composants modernes, accessibles et très personnalisables, sans imposer un framework visuel rigide.

Une fois le frontend créé, nous allons poser une architecture propre dès le départ.

apps/frontend/src/
│
├── api/ # Appels HTTP
├── assets/
├── components/ # Composants réutilisables
├── features/ # Fonctionnalités métier
├── hooks/
├── layouts/
├── pages/
├── routes/
├── services/
├── styles/
├── types/
├── utils/
└── main.tsx

Cette organisation reste simple au début mais s'adapte très bien lorsque le projet grandit.
