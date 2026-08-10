Sprint 5 — Relances et calendrier

L'objectif de ce sprint est de permettre à JobTracker de suivre les prochaines actions importantes liées aux candidatures.

Le sprint introduit deux types d'événements :

les relances ;
les entretiens.

Les candidatures possédaient déjà dans le modèle de données les champs :

followUpAt ;
interviewAt.

Aucune modification du schéma Prisma n'a donc été nécessaire pour cette première version.

Backend

Deux endpoints spécialisés ont été ajoutés :

GET /applications/follow-ups
GET /applications/interviews

GET /applications/follow-ups retourne les candidatures possédant une date de relance à venir.

GET /applications/interviews retourne les candidatures possédant une date d'entretien à venir.

Les événements passés sont exclus.

Les résultats sont triés chronologiquement par date croissante.

Les offres d'emploi et les entreprises associées sont incluses dans les résultats afin de fournir au frontend toutes les informations nécessaires à l'affichage.

Frontend

La couche API frontend expose maintenant :

getFollowUps()
getInterviews()

Une nouvelle page /calendar a été créée.

Elle comporte deux sections :

Relances à venir ;
Entretiens à venir.

Pour chaque événement, l'interface peut afficher :

le titre de l'offre ;
l'entreprise ;
la localisation ;
le type de contrat ;
le statut de la candidature ;
la date et l'heure de l'événement.

Les dates sont présentées dans un format français lisible.

Les événements prévus dans les trois prochains jours sont visuellement mis en évidence.

Gestion depuis les candidatures

Le formulaire de création d'une candidature permet déjà de renseigner :

une date de relance ;
une date d'entretien.

Le formulaire de modification permet maintenant également de modifier ces deux informations.

Après modification d'une candidature, les données TanStack Query relatives aux candidatures, aux relances et aux entretiens sont invalidées afin de maintenir les différentes vues synchronisées.

Tests

Les nouveaux comportements backend sont couverts par des tests Jest.

Les tests vérifient notamment :

la récupération des relances à venir ;
le filtrage à partir de la date courante ;
le tri chronologique des relances ;
la récupération des entretiens à venir ;
le filtrage à partir de la date courante ;
le tri chronologique des entretiens ;
la délégation correcte des nouveaux endpoints par le contrôleur.

À la fin du sprint :

8 suites de tests passent ;
40 tests passent ;
aucun test n'échoue.

Validation du sprint

Le backend compile correctement.

Le frontend compile correctement.

Les tests backend passent.

Les relances peuvent être créées ou modifiées depuis les candidatures et apparaissent dans le calendrier.

Les entretiens peuvent être créés ou modifiés depuis les candidatures et apparaissent dans le calendrier.

Le Sprint 5 — Relances et calendrier est terminé dans sa première version fonctionnelle.
