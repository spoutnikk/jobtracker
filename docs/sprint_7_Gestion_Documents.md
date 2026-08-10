Sprint 7 — Gestion des documents

L'objectif de ce sprint est de permettre à JobTracker de gérer les documents liés à la recherche d'emploi.

Architecture

Les fichiers sont stockés localement sur le disque.

Les métadonnées sont stockées dans PostgreSQL via Prisma.

Architecture utilisée :

React
  |
  | multipart/form-data
  |
  v
NestJS
  |
  +-- métadonnées -> Prisma -> PostgreSQL
  |
  +-- fichiers -> apps/backend/uploads/

Le dossier uploads n'est pas versionné par Git.

Modèle de données

Un modèle Document a été ajouté au schéma Prisma.

Un document contient notamment :

un nom ;
le nom original du fichier ;
le type MIME ;
la taille ;
le chemin du fichier ;
un type de document ;
une date de création ;
une date de modification ;
une candidature associée facultative.

Les types disponibles sont :

CV ;
COVER_LETTER ;
JOB_OFFER ;
OTHER.

La relation entre un document et une candidature est facultative.

Lorsqu'une candidature est supprimée, l'association avec le document est supprimée mais le document est conservé.

Backend

Un module NestJS documents a été créé.

Les endpoints disponibles sont :

POST /documents
GET /documents
GET /documents/:id
GET /documents/:id/download
DELETE /documents/:id

POST /documents utilise multipart/form-data.

Le fichier est enregistré dans :

apps/backend/uploads/

Les métadonnées sont enregistrées dans PostgreSQL.

Sécurité et validation

Les formats autorisés sont :

PDF ;
DOC ;
DOCX ;
ODT ;
TXT.

Les fichiers non autorisés sont rejetés.

La taille maximale d'un fichier est de 10 Mo.

Un upload sans fichier retourne une erreur HTTP 400.

Un fichier trop volumineux retourne une erreur HTTP 413.

Un type de document invalide retourne une erreur HTTP 400.

Suppression

La suppression d'un document supprime :

le fichier physique ;
l'enregistrement PostgreSQL.

Si le fichier physique a déjà disparu, l'enregistrement PostgreSQL peut tout de même être supprimé.

Les autres erreurs du système de fichiers sont propagées.

Frontend

Une page /documents a été créée.

Elle permet de :

afficher les documents ;
téléverser un document ;
choisir son type ;
associer facultativement le document à une candidature ;
télécharger un document ;
supprimer un document.

Après création ou suppression, la liste est automatiquement rafraîchie avec TanStack Query.

Les documents associés à une candidature affichent :

le titre de l'offre ;
le nom de l'entreprise.

Navigation

Un accès Documents a été ajouté à la navigation principale de JobTracker.

Tests

Les services et contrôleurs du module Documents sont couverts par des tests Jest.

Les tests vérifient notamment :

la création d'un document ;
la liste des documents ;
la récupération d'un document ;
le cas 404 ;
la suppression ;
la suppression lorsque le fichier physique est déjà absent ;
le téléchargement ;
le rejet d'un upload sans fichier.

À la fin du sprint :

12 suites de tests passent ;
57 tests passent ;
aucun test n'échoue.

Validation du sprint

Le backend compile correctement.

Le frontend compile correctement.

Les tests backend passent.

L'upload local fonctionne.

Les métadonnées sont enregistrées dans PostgreSQL.

Le téléchargement fonctionne.

La suppression synchronisée fonctionne.

L'association facultative entre document et candidature fonctionne.

Le Sprint 7 — Gestion des documents est terminé dans sa première version fonctionnelle.
