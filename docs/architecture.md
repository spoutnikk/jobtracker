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
