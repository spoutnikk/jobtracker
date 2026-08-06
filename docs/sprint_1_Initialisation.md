Sprint 1 - Initialisation du projet

Aujourd'hui, notre objectif est simplement de disposer d'un projet qui démarre.

À la fin de ce sprint, nous aurons :

jobtracker/
│
├── backend/      ← NestJS
│
├── frontend/     ← React
│
├── docs/
│
├── .gitignore
│
├── README.md
│
└── package.json  ← (optionnel, pour gérer les deux projets)

Aucune fonctionnalité métier, uniquement les fondations.

Étape 1 : Vérifier les prérequis

| Outil   | Version | État |
| ------- | ------- | ---- |
| Node.js | 20.11.0 | ✅ OK |
| npm     | 10.2.4  | ✅ OK |
| Git     | 2.43.0  | ✅ OK |
| npx     | 10.2.4  | ✅ OK |

Étape 2 : Choisir l'IDE

Je recommande VS Code avec les extensions suivantes :

ESLint
Prettier
Prisma
GitLens
Error Lens
DotENV
Thunder Client (pour tester l'API)
React Developer Tools (extension du navigateur)

Étape 3 : Installer les outils (si nécessaire)

Nous utiliserons :

NestJS CLI
Vite
Prisma

Notre façon de travailler

Je souhaite aussi que nous adoptions quelques bonnes pratiques dès le départ :

Git dès le premier jour

Chaque fonctionnalité sera développée sur une branche dédiée si nécessaire, avec des commits clairs.

Par exemple :

feat: création du module candidature

ou

fix: correction du filtre par statut

Qualité de code

Nous mettrons en place :

ESLint
Prettier
TypeScript en mode strict


Avant d'écrire du code : deux choix importants

Je vais vous faire une proposition qui nous fera gagner du temps sur la durée.

1. Utiliser pnpm au lieu de npm

Aujourd'hui, de nombreuses équipes TypeScript utilisent pnpm.

Pourquoi ?

installation plus rapide ;
moins d'espace disque ;
meilleure gestion des dépendances ;
très utilisé avec NestJS et React.

Ce n'est pas obligatoire, mais je le recommande.

2. Utiliser un monorepo

Au lieu de créer simplement :

backend/
frontend/

Je vous propose :

jobtracker/

apps/
   backend/
   frontend/

packages/

docs/

package.json

pnpm-workspace.yaml

.gitignore
Pourquoi ?

Plus tard, nous pourrons partager facilement :

les types TypeScript ;
les modèles ;
les utilitaires ;
les constantes.

Par exemple :

packages/shared/

Status.ts

Candidate.ts

Company.ts

Le backend et le frontend utiliseront exactement les mêmes types, ce qui évite les incohérences.

C'est une approche très utilisée dans les projets modernes.

Ce que nous allons construire

Je souhaite que ce projet soit digne d'un portfolio.

Voici ce que nous viserons :

JobTracker
│
├── Dashboard
│
├── Candidatures
│
├── Entreprises
│
├── Contacts RH
│
├── Documents
│
├── Calendrier
│
├── Statistiques
│
└── Paramètres

Avec :

mode sombre 🌙
recherche instantanée
tableaux filtrables
glisser-déposer des documents
graphiques
responsive
API REST documentée (Swagger)
qualité de code (ESLint, Prettier, Husky)
tests sur les parties importantes