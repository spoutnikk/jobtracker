# Sprint 8 — Gestion des comptes utilisateurs

## Objectif

Permettre à chaque utilisateur de gérer son propre compte JobTracker de manière autonome et sécurisée, depuis la création du compte jusqu'à sa suppression.

## Fonctionnalités livrées

### 8.1 — Création de compte backend

- création d'un utilisateur avec prénom, nom, email et mot de passe ;
- normalisation de l'adresse email ;
- hash du mot de passe avec Argon2 ;
- création atomique de l'utilisateur et de sa session ;
- gestion du conflit d'adresse email déjà utilisée ;
- validation des données entrantes.

### 8.2 — Inscription frontend

- page de création de compte ;
- validation locale de la confirmation du mot de passe ;
- authentification immédiate après inscription ;
- synchronisation du cache d'authentification ;
- redirection vers l'espace privé ;
- gestion des erreurs et de l'état de soumission.

### 8.3 — Profil utilisateur

- route protégée `/profile` ;
- consultation du prénom, du nom et de l'adresse email ;
- modification du profil via `PATCH /auth/me` ;
- synchronisation immédiate du cache `["auth", "me"]` ;
- gestion du conflit d'adresse email déjà utilisée.

### 8.4 — Changement de mot de passe

- vérification du mot de passe actuel ;
- validation du nouveau mot de passe ;
- mise à jour du hash Argon2 ;
- conservation de la session courante ;
- révocation des autres sessions après changement de mot de passe ;
- formulaire dédié dans la page Profil.

### 8.5 — Gestion des sessions

- révocation explicite des autres sessions via `POST /auth/sessions/others` ;
- conservation de la session utilisée pour effectuer l'opération ;
- confirmation côté interface ;
- feedback de succès, d'erreur et état pending.

### 8.6 — Suppression du compte

- suppression protégée par le mot de passe actuel ;
- suppression transactionnelle des données appartenant à l'utilisateur ;
- suppression des documents en base avant suppression physique des fichiers ;
- nettoyage physique des fichiers après validation de la transaction ;
- suppression des sessions associées au compte ;
- effacement du cookie de session ;
- purge du cache frontend et redirection vers `/login`.

## API d'authentification

| Méthode | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Créer un compte et ouvrir une session |
| `POST` | `/auth/login` | Ouvrir une session |
| `POST` | `/auth/logout` | Fermer la session courante |
| `GET` | `/auth/me` | Lire le profil courant |
| `PATCH` | `/auth/me` | Modifier le profil courant |
| `PATCH` | `/auth/me/password` | Modifier le mot de passe |
| `POST` | `/auth/sessions/others` | Révoquer les autres sessions |
| `DELETE` | `/auth/me` | Supprimer définitivement le compte |

## Principes de sécurité

- les mots de passe ne sont jamais stockés en clair ;
- les mots de passe sont hashés avec Argon2 ;
- les tokens de session sont opaques et seuls leurs hashes sont stockés en base ;
- les cookies de session sont `HttpOnly` ;
- les routes métier sont protégées par l'authentification ;
- les données métier sont filtrées par utilisateur ;
- les opérations sensibles demandent une confirmation ou une nouvelle saisie du mot de passe ;
- la suppression du compte est irréversible.

## Validation

Le Sprint 8 a été développé par petites tranches isolées. Chaque tranche a suivi le même cycle :

1. modification limitée aux fichiers concernés ;
2. tests ciblés ;
3. lint et build ;
4. suite de tests complète ;
5. commit atomique ;
6. validation de la CI GitHub.

À l'issue du Sprint 8, la gestion des comptes utilisateurs est considérée comme terminée.
