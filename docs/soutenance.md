# Guide de Soutenance — PFE Gestion d'Entreprise

> Ce document prépare la présentation orale et la démonstration live de l'application.

---

## 1. Plan de présentation (20–30 min)

### Introduction (3 min)
- **Contexte** : Les entreprises gèrent de nombreux outils disjoints — documents, tâches, RH, reporting. L'objectif est une plateforme unifiée.
- **Problématique** : Comment concevoir une application desktop professionnelle, multi-rôles, avec IA intégrée, en architecture 3-tiers ?
- **Réponse** : Plateforme Electron + React + Node.js + PostgreSQL, couche IA Gemini/Ollama.

### Architecture & Choix techniques (5 min)
1. Diagramme 3-tiers (voir `docs/architecture.md`)
2. Monorepo npm workspaces → `@pfe/api`, `@pfe/web`, `@pfe/desktop`, `@pfe/shared`
3. RBAC : 4 rôles, middleware `authGuard` + `requireRole` sur chaque route
4. Couche IA : interface `AIProvider` → bascule Gemini/Ollama sans toucher le code

**Points à insister en soutenance :**
- Séparation des préoccupations (chaque module isolé, testable)
- La couche d'abstraction IA est un vrai pattern de conception (Strategy)
- L'architecture est identique à celle d'un projet professionnel réel

### Démonstration live (15 min) — voir §3

### Tests & Qualité (2 min)
- 18 tests Vitest + Supertest (health, auth, RBAC, RH)
- Typecheck strict TypeScript sur toute la codebase
- Zod validation à chaque entrée API

### Conclusion (3 min)
- Bilan : 8 phases, ~2 mois, 5 modules complets + IA
- Perspectives : notifications temps-réel (WebSocket), mobile React Native, déploiement cloud

---

## 2. Questions fréquentes du jury — réponses préparées

### "Pourquoi Electron et pas une appli web ?"
> Electron permet un packaging `.exe` installable, un accès aux fichiers locaux sans serveur web exposé, et une expérience desktop native. La coque Electron est volontairement minimale (< 50 lignes) — 95% du code est du React standard, réutilisable en web.

### "Comment fonctionne la sécurité ?"
> Chaque requête API passe par `authGuard` qui vérifie et décode le JWT. Le rôle extrait du token est comparé aux rôles autorisés par `requireRole(...)`. Côté frontend, `AuthContext` masque les actions non autorisées. Les mots de passe sont hashés avec bcrypt (coût 12). Les tokens expirent en 7 jours.

### "L'IA est-elle vraiment intégrée ou juste affichée ?"
> L'IA est fonctionnelle. À l'upload d'un PDF, `pdf-parse` extrait le texte et l'envoie à Gemini (ou Ollama) en arrière-plan. Le résultat — résumé, catégorie suggérée, champs extraits, score de confiance — est stocké en base et affiché dans l'UI. Le générateur de contenu et les insights anomalies utilisent le même `AIProvider`.

### "Pourquoi Prisma et pas un ORM classique ?"
> Prisma génère des types TypeScript complets à partir du schéma — pas de désynchronisation entre la BDD et le code. Les requêtes sont type-safe, les erreurs sont détectées à la compilation. Le schéma sert de documentation vivante de la base.

### "Comment gérez-vous les migrations en production ?"
> `prisma migrate dev` est réservé au développement local. En production (et sur Neon serverless), j'utilise `prisma db execute --file migration.sql` qui évite le `pg_advisory_lock` qui cause des timeouts. Les migrations sont des fichiers SQL versionnés commités dans le dépôt.

### "Les tests couvrent quoi exactement ?"
> 4 suites : (1) santé de l'API, (2) authentification complète (login valide/invalide/incomplet + GET /me), (3) RBAC (vérification que les rôles bloquent correctement), (4) métier RH (CRUD, validation erreurs 400). Les tests frappent la vraie base Neon, pas des mocks — ils prouvent que toute la pile fonctionne.

### "Pourquoi pas Docker ?"
> Docker aurait alourdi la démo et la soutenance. L'objectif était un `.exe` installable sur Windows. La BDD Neon cloud remplace un conteneur PostgreSQL pour le dev et la démo. Un `docker-compose.yml` serait trivial à ajouter pour un déploiement serveur.

### "C'est quoi la différence entre MANAGER et ADMIN ?"
> ADMIN : accès total — CRUD utilisateurs, suppression de n'importe quelle ressource, configuration départements. MANAGER : gère des projets et des équipes mais ne peut pas créer/supprimer des utilisateurs. RH : accès complet au module RH (congés, présence, contrats) mais pas au Kanban projet. EMPLOYÉ : accès à ses propres tâches, ses congés, la GED.

---

## 3. Script de démonstration live

### Ordre recommandé (10–15 min)

**Étape 1 — Lancer l'app (30s)**
```bash
npm run dev
```
Montrer la fenêtre Electron qui s'ouvre, puis la page de login.

**Étape 2 — Login multi-rôles (1 min)**
1. Se connecter en `admin@pfe.local` / `admin123`
2. Montrer la sidebar complète (tous les modules)
3. Se déconnecter, se reconnecter en `employe@pfe.local`
4. Montrer que certains menus sont absents (Users, configuration)

**Étape 3 — Dashboard (2 min)**
1. Repasser en admin
2. Ouvrir le Dashboard → KPIs (documents, projets, employés, congés en attente)
3. Montrer les 4 graphiques (tâches par statut, docs par catégorie, présence du jour, congés/mois)
4. Montrer le panel "Insights & Anomalies" — tâches en retard, surcharges
5. Démontrer le Générateur IA : choisir "Offre d'emploi" → remplir → cliquer "Générer avec l'IA"

**Étape 4 — GED (2 min)**
1. Uploader un vrai PDF (contrat, facture)
2. Montrer la carte document dans la grille
3. Ouvrir l'accordion "Analyse IA" → si clé Gemini configurée, montrer résumé + champs extraits
4. Montrer le bouton "Analyser maintenant" si pas encore analysé

**Étape 5 — Tâches / Kanban (2 min)**
1. Ouvrir le projet "Refonte ERP v2"
2. Montrer les 4 colonnes avec tâches de couleurs différentes (priorités)
3. Drag-and-drop d'une tâche de TODO vers IN_PROGRESS
4. Ouvrir une tâche → modifier le statut, ajouter un commentaire

**Étape 6 — RH (2 min)**
1. Onglet Employés → fiche d'un employé → modifier le poste en direct
2. Voir le contrat CDI actif
3. Onglet Congés → demande en attente → cliquer Approuver
4. Onglet Présence → filtrer par mois → voir les statistiques

**Étape 7 — Tests (1 min)**
```bash
npm run test
```
Montrer les 18 tests qui passent en ~7 secondes.

---

## 4. Chiffres clés à citer

| Métrique | Valeur |
|---|---|
| Lignes de code | ~5 500 (hors node_modules, générés) |
| Modèles Prisma | 16 modèles, 8 enums |
| Endpoints API | ~45 routes |
| Tests | 18 tests d'intégration, 4 suites |
| Phases | 8 phases, 8 commits |
| Durée développement | ~2 mois |
| Modules | 5 (Auth, GED, Tâches, RH, Dashboard) + IA transversale |
| Rôles RBAC | 4 (Admin, RH, Manager, Employé) |
| Fournisseurs IA | 2 (Gemini, Ollama) via 1 interface |

---

## 5. Points de différenciation (ce qui distingue ce PFE)

1. **Architecture professionnelle réelle** — monorepo, 3-tiers strict, types partagés, RBAC middleware
2. **IA fonctionnelle** — pas une démonstration factice ; pipeline réel avec extraction PDF + LLM + stockage + UI
3. **Pattern Strategy pour l'IA** — `AIProvider` permet de changer de fournisseur IA sans modifier le code métier
4. **Application desktop packagée** — `.exe` installable, pas juste un site web
5. **Tests d'intégration** — 18 tests contre la vraie BDD, pas des mocks
6. **Kanban avec drag-and-drop réel** — réordonnancement transactionnel en base, positions persistées
7. **Seed de démonstration complet** — données réalistes prêtes à l'emploi pour la soutenance

---

## 6. Checklist avant la soutenance

- [ ] `npm run db:seed` → vérifier les données de démo en base
- [ ] `npm run test` → 18/18 passent
- [ ] `npm run dev` → app démarre sans erreur
- [ ] Avoir un vrai PDF à uploader pendant la démo
- [ ] Clé Gemini configurée (optionnel mais impressionnant)
- [ ] Compte admin + compte employé connus par cœur
- [ ] Prisma Studio ouvert sur un 2e écran (optionnel : montre la BDD en direct)
- [ ] `npm run package:exe` → installer le `.exe` sur l'ordi de présentation

---

## 7. Technologies à maîtriser pour les questions

| Technologie | Ce qu'il faut savoir expliquer |
|---|---|
| **JWT** | Payload signé (header.payload.signature), sans état serveur, expiration 7j, Bearer token |
| **Prisma** | ORM type-safe, schéma → types TS générés, migrations SQL versionnées |
| **React + TanStack Query** | Composants fonctionnels, hooks, staleTime, invalidateQueries |
| **Electron** | 2 processus (main + renderer), contextBridge pour la sécurité, IPC |
| **RBAC** | Rôles vs permissions, middleware chainé, vérification côté API ET côté UI |
| **Gemini API** | LLM as-a-service, prompt engineering, réponse JSON parsée |
