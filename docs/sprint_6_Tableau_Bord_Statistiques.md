Sprint 6 — Tableau de bord et statistiques

L'objectif de ce sprint est de fournir une vue synthétique de l'activité de recherche d'emploi dans JobTracker.

Le tableau de bord centralise les principaux indicateurs liés aux candidatures, aux entreprises, aux offres d'emploi, aux relances et aux entretiens.

Backend

Un nouveau module NestJS dashboard a été créé.

Il expose l'endpoint :

GET /dashboard/stats

Cet endpoint agrège les données nécessaires au tableau de bord afin d'éviter de multiplier les requêtes HTTP depuis le frontend.

Les statistiques disponibles sont :

nombre total de candidatures ;
nombre total d'entreprises ;
nombre total d'offres d'emploi ;
nombre de relances à venir ;
nombre d'entretiens à venir ;
nombre de candidatures créées durant les 30 derniers jours ;
taux d'entretien ;
répartition des candidatures par statut.

Les agrégations sont réalisées avec Prisma.

Les relances et entretiens à venir sont calculés à partir de la date courante.

Le taux d'entretien correspond à la proportion de candidatures possédant une date d'entretien par rapport au nombre total de candidatures.

Lorsque aucune candidature n'existe, le taux d'entretien est égal à zéro.

Répartition par statut

La répartition couvre tous les statuts disponibles :

DRAFT ;
APPLIED ;
FOLLOW_UP ;
INTERVIEW ;
ACCEPTED ;
REJECTED.

Les statuts ne possédant actuellement aucune candidature sont également retournés avec une valeur égale à zéro.

Cette approche permet au frontend de toujours disposer d'une structure complète et stable.

Frontend

Une couche API dédiée au dashboard a été créée.

Elle récupère les statistiques via :

GET /dashboard/stats

Une nouvelle page est disponible à l'adresse :

/dashboard

Elle affiche les principaux indicateurs sous forme de cartes :

Candidatures ;
Entreprises ;
Offres ;
Relances à venir ;
Entretiens à venir ;
Candidatures sur 30 jours ;
Taux d'entretien.

Une section supplémentaire affiche la répartition complète des candidatures par statut.

Le tableau de bord utilise TanStack Query pour récupérer et gérer les données provenant du backend.

Navigation

Un accès Tableau de bord a été ajouté à la navigation principale de JobTracker.

Tests

Le service Dashboard est couvert par des tests Jest.

Les tests vérifient notamment :

les agrégations Prisma ;
le nombre total de candidatures ;
le nombre d'entreprises ;
le nombre d'offres ;
les relances et entretiens à venir ;
les candidatures récentes ;
le calcul du taux d'entretien ;
la répartition des candidatures par statut.

Le contrôleur Dashboard est également testé afin de vérifier la délégation vers le service.

Validation du sprint

Le backend compile correctement.

Le frontend compile correctement.

Les tests backend passent.

L'endpoint GET /dashboard/stats fonctionne avec PostgreSQL.

Le tableau de bord React récupère et affiche correctement les statistiques.

La répartition des statuts inclut également les statuts dont le nombre de candidatures est nul.

Le Sprint 6 — Tableau de bord et statistiques est terminé dans sa première version fonctionnelle.
