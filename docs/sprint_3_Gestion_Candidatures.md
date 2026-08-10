Sprint 3 — Gestion des candidatures

L'objectif de ce sprint est de rendre JobTracker réellement utilisable pour suivre les candidatures.

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

créer une candidature ;
consulter la liste des candidatures ;
consulter les informations liées à une candidature ;
modifier une candidature ;
supprimer une candidature.

Backend

Le backend expose les opérations CRUD nécessaires à la gestion des candidatures.

Les candidatures peuvent contenir notamment :

un statut ;
une offre d'emploi ;
une source ;
une date de candidature ;
des notes ;
un nom de contact ;
un email de contact ;
une date de relance ;
une date d'entretien.

Les statuts disponibles sont :

DRAFT ;
APPLIED ;
FOLLOW_UP ;
INTERVIEW ;
ACCEPTED ;
REJECTED.

La validation des données entrantes est assurée avec class-validator et class-transformer.

Les ressources inexistantes retournent une erreur HTTP 404.

Offres d'emploi

Un endpoint GET /job-offers a également été ajouté.

Il permet au frontend de récupérer les offres disponibles avec leur entreprise associée.

Le formulaire de candidature peut ainsi sélectionner une vraie offre d'emploi au lieu d'utiliser un identifiant codé en dur.

Frontend

Une page /applications a été créée avec React.

Elle permet de :

afficher les candidatures ;
créer une nouvelle candidature ;
sélectionner une offre d'emploi ;
modifier une candidature existante ;
supprimer une candidature après confirmation.

TanStack Query est utilisé pour récupérer les données et gérer les mutations.

Après une création, une modification ou une suppression, la liste des candidatures est automatiquement rafraîchie.

Une navigation commune permet d'accéder à :

Accueil ;
Candidatures.

Tests

Les services et contrôleurs principaux du backend sont couverts par des tests unitaires Jest.

À la fin du sprint :

6 suites de tests passent ;
20 tests passent ;
aucun test n'échoue.

Validation du sprint

Le backend compile correctement.

Le frontend compile correctement.

Les tests backend passent.

Le CRUD des candidatures fonctionne de bout en bout entre React, NestJS, Prisma et PostgreSQL.

Le Sprint 3 — Gestion des candidatures est terminé dans sa première version fonctionnelle.
