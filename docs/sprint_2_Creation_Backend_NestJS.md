Sprint 2 — Création du backend NestJS

Maintenant nous allons créer le cœur de l'application : l'API.

Pourquoi commencer par le backend ?

Notre application aura cette logique :

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
SQLite

Le backend sera responsable de :

la logique métier ;
la sécurité plus tard ;
l'accès aux données ;
les règles de gestion ;
l'API consommée par React.