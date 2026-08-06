Sprint 1 — Finaliser l'environnement
✅ Monorepo pnpm
✅ Husky
✅ Commitlint
✅ Prettier
⏳ lint-staged
⏳ React + Vite
Sprint 2 — Frontend

Création de apps/frontend :

pnpm create vite apps/frontend --template react-ts

Puis :

cd apps/frontend
pnpm install

Ensuite, nous vérifierons que le workspace détecte bien les deux applications.

Sprint 3 — Communication Frontend ↔ Backend

Créer un premier écran React qui appelle :

GET /health

sur l'API NestJS.

Cela permettra de valider que tout est correctement connecté.

Sprint 4 — Les premiers modules métier

Nous créerons progressivement :

Auth
Users
Companies
Applications
Dashboard
Documents

avec une architecture propre dès le départ.

Une amélioration que je te propose

Au fil de nos échanges, j'ai remarqué que tu souhaites construire ce projet sérieusement, comme un véritable projet professionnel.

Je te propose donc que nous travaillions comme dans une équipe de développement :

une roadmap claire ;
des sprints avec des objectifs limités ;
un commit Git à la fin de chaque sprint ;
des revues de code et des explications lorsque c'est utile.

Cela permettra d'avoir un historique Git propre et de mieux valoriser le projet.
