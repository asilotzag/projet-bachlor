# Gestion d'Entreprise — Application Desktop avec IA

> **Projet de Fin d'Études** · Application desktop professionnelle centralisant la gestion documentaire, les projets, les ressources humaines et un tableau de bord intelligent, avec une couche IA intégrée.

---

## Aperçu

| Module | Fonctionnalités |
|---|---|
| **Auth & RBAC** | Login JWT, 4 rôles (Admin / RH / Manager / Employé), permissions par route et par UI |
| **GED** | Upload (PDF, images), catégories, tags, versioning, recherche, prévisualisation |
| **IA — Analyse docs** | Extraction automatique : résumé, catégorie, champs clés (montant, date…) via Gemini/Ollama |
| **Tâches & Projets** | Kanban drag-and-drop (4 colonnes), priorités, assignation, échéances, commentaires |
| **Ressources Humaines** | Employés, départements, contrats, workflow de congés, présence journalière |
| **Dashboard** | KPIs, 4 graphiques (recharts), insights & anomalies IA, générateur de contenu IA |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DESKTOP — Electron (coque minimale)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  RENDERER — React + TypeScript + Vite + Tailwind CSS   │ │
│  │  TanStack Query · React Router · @dnd-kit · recharts   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP REST (axios)
┌─────────────────────────▼───────────────────────────────────┐
│  API — Node.js + Express + TypeScript                        │
│  Auth JWT · RBAC · Zod validation · Multer upload            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Couche IA  →  GeminiProvider  |  OllamaProvider     │   │
│  │  Interface AIProvider (generate · analyzeDocument)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │ Prisma ORM
┌─────────────────────────▼───────────────────────────────────┐
│  PostgreSQL (Neon cloud en dev · local en prod)              │
│  16 modèles · 8 enums · migrations versionnées              │
└─────────────────────────────────────────────────────────────┘
```

### Structure du monorepo (npm workspaces)

```
Asmae_pfe/
├─ apps/
│  ├─ api/              Node.js + Express + Prisma
│  │  ├─ src/
│  │  │  ├─ modules/    auth · users · documents · categories · tags
│  │  │  │              projects · tasks · hr · dashboard · ai
│  │  │  ├─ middleware/ auth.ts (authGuard + requireRole)
│  │  │  └─ services/ai/ AIProvider · GeminiProvider · OllamaProvider
│  │  └─ prisma/        schema.prisma · migrations · seed.ts
│  ├─ web/              React + Vite (renderer Electron)
│  │  └─ src/
│  │     ├─ pages/      LoginPage · DashboardPage · GEDPage
│  │     │              TasksPage · HRPage · UsersPage
│  │     ├─ components/ layout · ged · tasks · dashboard
│  │     ├─ contexts/   AuthContext (JWT + RBAC côté UI)
│  │     └─ lib/        api.ts (axios + intercepteur JWT)
│  └─ desktop/          Electron main.ts + preload.ts
└─ packages/
   └─ shared/           Types TypeScript partagés (Role, PublicUser…)
```

---

## Stack technique

| Couche | Technologies |
|---|---|
| Desktop | Electron 33 + electron-builder (packaging NSIS Windows) |
| Frontend | React 18 · TypeScript · Vite 6 · Tailwind CSS v4 |
| Data/State | TanStack Query v5 · React Router v7 · axios |
| Graphiques | recharts |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Backend | Node.js · Express 4 · TypeScript · Zod · Multer |
| ORM | Prisma 6 · PostgreSQL |
| Auth | JWT (jsonwebtoken) · bcrypt · RBAC middleware |
| IA | Google Gemini (free tier) · Ollama (local) derrière `AIProvider` |
| OCR | pdf-parse (extraction texte PDF) |
| Tests | Vitest 4 · Supertest (18 tests d'intégration) |

---

## Prérequis

- **Node.js ≥ 20** (testé sur Node 22)
- **PostgreSQL** : base [Neon](https://neon.tech) gratuite (cloud) ou instance locale

---

## Installation

```bash
# 1. Cloner et installer toutes les dépendances (workspaces)
git clone <repo>
cd Asmae_pfe
npm install

# 2. Configurer l'environnement API
cp apps/api/.env.example apps/api/.env
# Éditer apps/api/.env : renseigner DATABASE_URL (Neon) et JWT_SECRET

# 3. Initialiser la base de données
npm run db:generate   # génère le client Prisma
npm run db:migrate    # applique les migrations
npm run db:seed       # insère les données de démonstration
```

---

## Lancer l'application

```bash
# Tout en une commande (API + Web + Electron)
npm run dev
```

| Service | Commande individuelle | URL |
|---|---|---|
| API | `npm run dev:api` | http://localhost:4000/health |
| Web (navigateur) | `npm run dev:web` | http://localhost:5173 |
| Desktop (Electron) | `npm run dev:desktop` | fenêtre native |

---

## Comptes de démonstration (après `npm run db:seed`)

| Email | Mot de passe | Rôle | Accès |
|---|---|---|---|
| `admin@pfe.local` | `admin123` | ADMIN | Tout (CRUD utilisateurs, departments, approbations) |
| `rh@pfe.local` | `rh123456` | RH | RH complet, dashboard, congés, présence |
| `manager@pfe.local` | `manager1` | MANAGER | Projets, tâches, dashboard |
| `employe@pfe.local` | `employe1` | EMPLOYÉ | Ses tâches, ses congés, GED |

---

## Scripts disponibles

```bash
# Développement
npm run dev               # Lance tout (API + Web + Electron)
npm run dev:api           # API seule
npm run dev:web           # Frontend seul (navigateur)

# Base de données
npm run db:generate       # Génère le client Prisma après changement de schéma
npm run db:migrate        # Applique les migrations (deploy, sans advisory lock)
npm run db:seed           # Insère les données de démonstration
npm run db:studio         # Prisma Studio (UI exploration BDD)

# Tests
npm run test              # Vitest + Supertest (18 tests, ~7s)

# Production
npm run build             # Compile web + api + desktop
npm run package:exe       # Build + génère l'installeur Windows (.exe via NSIS)
```

---

## Activer l'IA Gemini

1. Obtenir une clé gratuite sur [Google AI Studio](https://aistudio.google.com)
2. Dans `apps/api/.env`, ajouter :
   ```
   GEMINI_API_KEY=votre_clé_ici
   AI_PROVIDER=gemini
   ```
3. Redémarrer l'API — l'analyse de documents et le générateur de contenu deviennent actifs.

> Sans clé, l'analyse est silencieusement ignorée. Le générateur retourne un message d'erreur 503.  
> Alternative offline : [Ollama](https://ollama.ai) local → `AI_PROVIDER=ollama`

---

## Modèle de données — entités principales

```
User (id, email, passwordHash, fullName, roleId)
  ├── Document      (title, filename, mimeType, size, categoryId, uploadedById)
  │    └── AiAnalysis  (summary, suggestedCategory, extractedFields, confidence)
  ├── Employee      (position, departmentId, hireDate)
  │    ├── Contract     (type CDI/CDD/…, startDate, salary, isActive)
  │    ├── LeaveRequest (type, startDate, endDate, status EN_ATTENTE→APPROUVE/REFUSE)
  │    └── Attendance   (date, status PRESENT/ABSENT/RETARD, checkIn, checkOut)
  └── Task          (title, status TODO→DONE, priority, position, projectId)
       └── Comment      (content, authorId)

Project (name, managerId, status ACTIVE/…)
  └── ProjectMember (userId, joinedAt)
```

---

## Endpoints API — résumé

| Groupe | Routes clés |
|---|---|
| Auth | `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/register` |
| Users | `GET /api/users` · `POST` · `PUT /:id` · `DELETE /:id` _(Admin)_ |
| Documents | `GET /api/documents` · `POST` (multipart) · `GET /:id/versions` · `POST /:id/analyze` |
| Catégories | `GET /api/categories` · `POST` · `PUT /:id` · `DELETE /:id` |
| Tags | `GET /api/tags` · `POST` · `DELETE /:id` |
| Projets | `GET /api/projects` · `POST` · `GET /:id` · `PUT /:id` · `DELETE /:id` |
| Tâches | `GET /api/tasks?projectId=` · `POST` · `PUT /:id` · `POST /reorder` |
| RH — Dept. | `GET /api/hr/departments` · `POST` · `PUT /:id` · `DELETE /:id` |
| RH — Emp. | `GET /api/hr/employees` · `POST` · `PUT /:id` · `GET /:id/contracts` · `POST /:id/contracts` |
| RH — Congés | `GET /api/hr/leaves` · `POST` · `PUT /:id` (approbation) |
| RH — Présence | `GET /api/hr/attendance?month=YYYY-MM` · `POST` (upsert) |
| Dashboard | `GET /api/dashboard/stats` |
| IA | `POST /api/ai/generate` · `GET /api/ai/insights` |

---

## Tests

```bash
npm run test
```

```
 Test Files  4 passed (4)
      Tests  18 passed (18)
   Duration  ~7s
```

| Fichier | Ce qui est testé |
|---|---|
| `health.test.ts` | Route de santé : format et statut |
| `auth.test.ts` | Login (valide/invalide/champs manquants), `GET /me` |
| `rbac.test.ts` | Accès Admin vs Employé, routes protégées par rôle |
| `hr.test.ts` | CRUD département, validation congés, erreurs métier |

---

## Packaging Windows

```bash
npm run package:exe
```

Génère `apps/desktop/dist-electron/Gestion Entreprise Setup.exe`.  
L'installeur NSIS permet de choisir le répertoire d'installation et crée un raccourci bureau.

> **Note :** Le fichier `.exe` embarque uniquement le frontend compilé.  
> L'API Node.js doit être déployée séparément (serveur, VPS, ou même `localhost` si usage mono-poste).

---

## Décisions d'architecture notables

| Décision | Justification |
|---|---|
| Monorepo npm workspaces | Types partagés (`@pfe/shared`), un seul `npm install`, scripts centralisés |
| Electron = coque minimale | L'effort dev est dans React ; Electron gère juste la fenêtre et le packaging `.exe` |
| `prisma db execute` (pas `migrate dev`) | Évite le `pg_advisory_lock` timeout sur Neon serverless |
| `AIProvider` interface | Bascule Gemini ↔ Ollama sans modifier le code applicatif (1 variable `.env`) |
| Analyse IA fire-and-forget | L'upload répond immédiatement ; l'analyse s'exécute en arrière-plan sans bloquer |
| TanStack Query | Cache serveur automatique, invalidation ciblée, états loading/error déclaratifs |

---

## Phases de développement

| Phase | Contenu | Commit |
|---|---|---|
| 0 | Monorepo, scaffolds Electron + React + Express + Prisma | `87699c5` |
| 1 | Auth JWT, RBAC 4 rôles, gestion utilisateurs | `7083a49` |
| 2 | GED : upload, versioning, catégories, tags, prévisualisation | `823b2d6` |
| 3 | IA : couche AIProvider, Gemini/Ollama, analyse documents | `efa0bcc` |
| 4 | Tâches & Projets : Kanban drag-and-drop, commentaires | `3c301fe` |
| 5 | Ressources Humaines : employés, contrats, congés, présence | `11b977f` |
| 6 | Dashboard : KPIs, graphiques recharts, insights IA, générateur | `11b977f` |
| 7 | Tests Vitest/Supertest, seed enrichi, build optimisé, packaging | `30fb886` |
| 8 | Documentation, diagrams, README, guide soutenance | _(ce commit)_ |
