Sprint 0 — Cadrage du projet

Objectif : rédiger un mini cahier des charges et définir les fondations.

💡 Aucun code aujourd'hui. Une bonne conception vous fera gagner beaucoup de temps ensuite.

1. Définition du besoin

Je reformule le besoin.

Développer une application web locale permettant de gérer efficacement une recherche d'emploi, de centraliser les candidatures, de suivre leur évolution, de gérer les entreprises et les contacts, de planifier les relances et d'obtenir des statistiques.

Le projet sera offline-first : toutes les données seront stockées localement.

2. Les utilisateurs

Pour la première version, un seul utilisateur :

Vous.

Il n'y aura donc pas de connexion, ni de gestion des comptes. Cela simplifie énormément le projet. Nous pourrons toujours ajouter une authentification plus tard si vous souhaitez l'héberger.

3. Les fonctionnalités (MVP)

Je propose de commencer avec ce périmètre :

Tableau de bord
Nombre total de candidatures
Répartition par statut
Relances à faire
Dernières candidatures
Candidatures
Ajouter
Modifier
Supprimer
Consulter
Rechercher
Filtrer
Entreprises
Fiche entreprise
Coordonnées
Site web
Notes
Contacts
Nom
Fonction
Email
Téléphone
Documents
CV
Lettre de motivation
Offre d'emploi (PDF)
Statistiques
Nombre de candidatures par mois
Taux de réponse
Répartition par source (France Travail, LinkedIn, Welcome to the Jungle, candidature spontanée...)
4. Les statuts

Je vous propose un workflow simple et clair :

Brouillon
    ↓
À envoyer
    ↓
Envoyée
    ↓
En attente
    ↓
Entretien
    ↓
Relance
    ↓
Offre reçue

Les statuts finaux :

Refusée
Acceptée
Abandonnée

Ainsi, une candidature ne peut pas être à la fois "En attente" et "Refusée".

5. Les écrans

Je vois cette première version avec une navigation latérale.

+------------------------------------------------------+
| JobTracker                                            |
+-------------------+----------------------------------+
|                   |                                  |
| Tableau de bord   |                                  |
| Candidatures      |          Contenu                 |
| Entreprises       |                                  |
| Contacts          |                                  |
| Statistiques      |                                  |
| Paramètres        |                                  |
|                   |                                  |
+-------------------+----------------------------------+
6. Les technologies

Je vous propose :

Backend
NestJS
Base de données
SQLite
ORM
Prisma
Frontend
React
TypeScript
Vite
UI
Bootstrap 5
Icônes
React Icons
Graphiques
Chart.js

Cette stack est moderne, très répandue et suffisamment légère pour un projet local.

7. Une petite amélioration

J'aimerais que cette application soit plus qu'un simple tableau de suivi.

Chaque candidature pourrait avoir un journal d'événements :

05/08
✓ Candidature créée

05/08
✓ CV ajouté

07/08
✓ Mail envoyé

15/08
✓ Relance effectuée

18/08
✓ Convocation à un entretien

Cela vous évitera de perdre l'historique de vos échanges.

Notre première décision d'architecture

Avant de créer le projet, il y a une décision importante à prendre.

Option A : Frontend et Backend séparés (celle que je recommande)
jobtracker/
│
├── backend/
│
└── frontend/

Le frontend React communique avec le backend NestJS via une API REST.

Avantages :

architecture professionnelle ;
frontend réutilisable ;
possibilité de transformer facilement l'application en version hébergée ;
excellente expérience pour votre portfolio.
Option B : NestJS qui sert aussi les fichiers du frontend

Un seul projet.

Avantages :

plus simple au début.

Inconvénients :

moins flexible ;
moins représentatif d'une architecture moderne.
Ma recommandation

Je vous conseille l'option A (deux projets séparés). Elle demande un peu plus de mise en place au départ, mais elle vous fera travailler avec une architecture que l'on rencontre très souvent en entreprise.