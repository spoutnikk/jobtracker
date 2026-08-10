Sprint 4 — Gestion des entreprises

L'objectif de ce sprint est de permettre à JobTracker de gérer les entreprises liées aux offres d'emploi et aux candidatures.

La logique mise en place est :

React (Frontend)
       |
       | HTTP / REST API
       |
       ↓
NestJS (Backend)
       |
       |
       ↓
Prisma ORM
       |
       |
       ↓
PostgreSQL

Le sprint permet maintenant de :

créer une entreprise ;
consulter la liste des entreprises ;
consulter une entreprise ;
modifier une entreprise ;
supprimer une entreprise lorsqu'elle ne possède aucune offre d'emploi.

Backend

Le backend expose les opérations CRUD nécessaires à la gestion des entreprises.

Une entreprise contient notamment :

un nom ;
un site web ;
une ville ;
une liste d'offres d'emploi associées.

Les ressources inexistantes retournent une erreur HTTP 404.

Une entreprise possédant encore une ou plusieurs offres d'emploi ne peut pas être supprimée.

Dans ce cas, l'API retourne une erreur HTTP 409 Conflict.

Frontend

Une page /companies a été créée avec React.

Elle permet de :

afficher les entreprises ;
afficher le nombre d'offres associées ;
créer une entreprise ;
modifier une entreprise ;
supprimer une entreprise après confirmation.

Lorsqu'une entreprise possède encore une offre d'emploi, la suppression est refusée et un message d'erreur est affiché uniquement sur l'entreprise concernée.

TanStack Query est utilisé pour récupérer les données et gérer les mutations.

Après une création, une modification ou une suppression, la liste des entreprises est automatiquement rafraîchie.

Navigation

La navigation principale permet maintenant d'accéder à :

Accueil ;
Candidatures ;
Entreprises.

Tests

Les services et contrôleurs principaux du backend sont couverts par des tests unitaires Jest.

Les règles métier de suppression sont testées :

suppression autorisée sans offre ;
404 pour une entreprise inexistante ;
409 pour une entreprise possédant encore des offres.

Validation du sprint

Le backend compile correctement.

Le frontend compile correctement.

Les tests backend passent.

Le CRUD des entreprises fonctionne de bout en bout entre React, NestJS, Prisma et PostgreSQL.

Le Sprint 4 — Gestion des entreprises est terminé dans sa première version fonctionnelle.
