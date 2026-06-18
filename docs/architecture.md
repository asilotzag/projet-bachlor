# Architecture — Plateforme de Gestion d'Entreprise

## Vue d'ensemble (3-tiers)

```
╔═══════════════════════════════════════════════════════════════╗
║  COUCHE PRÉSENTATION                                          ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │  Electron (coque desktop)                               │  ║
║  │  ┌───────────────────────────────────────────────────┐  │  ║
║  │  │  React + TypeScript + Vite + Tailwind CSS v4      │  │  ║
║  │  │                                                   │  │  ║
║  │  │  Pages : Login · Dashboard · GED · Tâches         │  │  ║
║  │  │          RH · Utilisateurs                        │  │  ║
║  │  │                                                   │  │  ║
║  │  │  State : TanStack Query (cache serveur)           │  │  ║
║  │  │  Auth  : AuthContext + JWT dans localStorage      │  │  ║
║  │  │  Libs  : @dnd-kit · recharts · lucide-react       │  │  ║
║  │  └───────────────────────────────────────────────────┘  │  ║
║  │  main.ts (fenêtre) · preload.ts (pont IPC sécurisé)     │  ║
║  └─────────────────────────────────────────────────────────┘  ║
║                          │ HTTP REST + JSON                   ║
║                          │ (axios + intercepteur Bearer JWT)  ║
╠══════════════════════════╪════════════════════════════════════╣
║  COUCHE MÉTIER           │                                    ║
║                          ▼                                    ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  Express API (Node.js + TypeScript)  :4000           │    ║
║  │                                                      │    ║
║  │  Middleware       authGuard (JWT verify)             │    ║
║  │                   requireRole(...roles) (RBAC)       │    ║
║  │                   errorHandler global                │    ║
║  │                                                      │    ║
║  │  Modules          /api/auth        login · me        │    ║
║  │                   /api/users       CRUD (Admin)      │    ║
║  │                   /api/documents   upload · GED      │    ║
║  │                   /api/categories  CRUD              │    ║
║  │                   /api/tags        CRUD              │    ║
║  │                   /api/projects    CRUD projets      │    ║
║  │                   /api/tasks       Kanban + reorder  │    ║
║  │                   /api/hr          RH complet        │    ║
║  │                   /api/dashboard   stats agrégées    │    ║
║  │                   /api/ai          generate·insights │    ║
║  │                                                      │    ║
║  │  Service IA   ┌──────────────────────────────────┐   │    ║
║  │               │  <<interface>> AIProvider        │   │    ║
║  │               │  + analyzeDocument(text,name)    │   │    ║
║  │               │  + generate(prompt)              │   │    ║
║  │               └─────────┬────────────┬───────────┘   │    ║
║  │                         │            │               │    ║
║  │                GeminiProvider   OllamaProvider       │    ║
║  │                (AI_PROVIDER=    (AI_PROVIDER=        │    ║
║  │                 gemini, défaut)  ollama, offline)     │    ║
║  └──────────────────────────────────────────────────────┘    ║
║                          │ Prisma ORM                         ║
╠══════════════════════════╪════════════════════════════════════╣
║  COUCHE DONNÉES          │                                    ║
║                          ▼                                    ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  PostgreSQL (Neon cloud en dev · local en prod)      │    ║
║  │  16 modèles · 8 enums · migrations versionnées       │    ║
║  └──────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Diagramme de packages (monorepo)

```
Asmae_pfe/                         (npm workspaces root)
├─ packages/
│  └─ shared/                      @pfe/shared
│     └─ index.ts                  Role · PublicUser · HealthResponse
│
├─ apps/
│  ├─ api/                         @pfe/api  (Node.js + Express)
│  │  ├─ src/
│  │  │  ├─ app.ts                 Instance Express (importable par les tests)
│  │  │  ├─ index.ts               Point d'entrée — app.listen()
│  │  │  ├─ prisma.ts              Singleton PrismaClient
│  │  │  ├─ middleware/
│  │  │  │  └─ auth.ts             authGuard · requireRole
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/               login · register · me
│  │  │  │  ├─ users/              CRUD utilisateurs
│  │  │  │  ├─ documents/          upload · versioning · analyse
│  │  │  │  ├─ categories/         CRUD catégories GED
│  │  │  │  ├─ tags/               CRUD tags
│  │  │  │  ├─ projects/           CRUD projets + membres
│  │  │  │  ├─ tasks/              CRUD tâches + reorder Kanban + commentaires
│  │  │  │  ├─ hr/                 dept · employés · contrats · congés · présence
│  │  │  │  ├─ dashboard/          stats agrégées toutes tables
│  │  │  │  └─ ai/                 generate · insights/anomalies
│  │  │  └─ services/ai/
│  │  │     ├─ AIProvider.ts       Interface commune
│  │  │     ├─ GeminiProvider.ts   Implémentation Gemini
│  │  │     ├─ OllamaProvider.ts   Implémentation Ollama
│  │  │     ├─ index.ts            getAIProvider() factory
│  │  │     ├─ textExtractor.ts    Extraction texte PDF (pdf-parse)
│  │  │     └─ analyzeDocument.ts  Pipeline fire-and-forget post-upload
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma          16 modèles
│  │  │  ├─ migrations/            SQL versionnées
│  │  │  └─ seed.ts                Données de démonstration complètes
│  │  └─ src/__tests__/            18 tests Vitest + Supertest
│  │
│  ├─ web/                         @pfe/web  (React + Vite)
│  │  └─ src/
│  │     ├─ pages/                 LoginPage · DashboardPage · GEDPage
│  │     │                         TasksPage · HRPage · UsersPage · PlaceholderPage
│  │     ├─ components/
│  │     │  ├─ layout/             AppLayout · Sidebar · TopBar
│  │     │  ├─ ged/                DocumentCard · AiAnalysisPanel · modales
│  │     │  └─ tasks/              KanbanBoard · TaskDetailModal · AddTaskModal
│  │     ├─ contexts/
│  │     │  └─ AuthContext.tsx     JWT store · login · logout · useAuth
│  │     └─ lib/
│  │        └─ api.ts              Instance axios avec intercepteur Authorization
│  │
│  └─ desktop/                     @pfe/desktop  (Electron)
│     └─ src/
│        ├─ main.ts                Processus principal · BrowserWindow · IPC
│        └─ preload.ts             contextBridge (API desktop → renderer)
```

---

## Flux d'authentification (JWT + RBAC)

```
Client (React)            API Express               PostgreSQL
     │                        │                          │
     │  POST /api/auth/login   │                          │
     │  {email, password}      │                          │
     │────────────────────────►│                          │
     │                         │  findUser(email)         │
     │                         │─────────────────────────►│
     │                         │◄─────────────────────────│
     │                         │  bcrypt.compare(hash)    │
     │                         │  signJWT({userId,role})  │
     │◄────────────────────────│                          │
     │  {token, user}          │                          │
     │                         │                          │
     │  GET /api/hr/employees  │                          │
     │  Authorization: Bearer  │                          │
     │────────────────────────►│                          │
     │                         │  authGuard: verify JWT   │
     │                         │  requireRole(ADMIN, RH)  │
     │                         │  → req.user = {userId, role}
     │                         │  findMany(employees)     │
     │                         │─────────────────────────►│
     │◄────────────────────────│◄─────────────────────────│
     │  [{id, position, ...}]  │                          │
```

---

## Pipeline IA — Analyse de documents

```
Client                    API                      IA (Gemini/Ollama)   BDD
  │                        │                               │              │
  │  POST /api/documents   │                               │              │
  │  (multipart/PDF)       │                               │              │
  │───────────────────────►│                               │              │
  │                        │  1. Multer → disque           │              │
  │                        │  2. INSERT Document           │              │
  │◄───────────────────────│──────────────────────────────►│              │
  │  201 {document}        │     (fire-and-forget)         │              │
  │                        │  3. pdf-parse → texte         │              │
  │                        │  4. AIProvider.analyze(text)  │              │
  │                        │───────────────────────────────►              │
  │                        │◄───────────────────────────────              │
  │                        │  {summary, category,          │              │
  │                        │   extractedFields, confidence}│              │
  │                        │  5. UPSERT AiAnalysis ────────────────────►  │
  │                        │                               │              │
  │  GET /api/documents/:id│                               │              │
  │  (+ include aiAnalysis)│                               │              │
  │───────────────────────►│──────────────────────────────────────────►   │
  │◄───────────────────────│◄──────────────────────────────────────────   │
  │  {doc + aiAnalysis}    │                               │              │
```

---

## Modèle de données — relations clés

```
Role ──────────────────────── User
 (ADMIN/RH/MANAGER/EMPLOYE)    │
                               ├── Document ──── AiAnalysis
                               │    └── DocumentVersion
                               │    └── DocumentTag ── Tag
                               │
                               ├── Employee ──── Department
                               │    ├── Contract
                               │    ├── LeaveRequest
                               │    └── Attendance
                               │
                               ├── Project (manager) ── ProjectMember
                               │    └── Task ──── Comment
                               │         └── Task (assignee → User)
                               │
                               └── (autres relations : créateur tâches,
                                    approbateur congés, uploader versions)
```

---

## Décisions techniques clés

| Problème | Solution choisie | Alternative écartée |
|---|---|---|
| `prisma migrate dev` timeout (Neon advisory lock) | `prisma db execute --file migration.sql` | migrate deploy (aussi bloqué) |
| Packaging desktop | Electron + electron-builder NSIS | Tauri (Rust, courbe d'apprentissage) |
| IA gratuite & remplaçable | Interface `AIProvider` + Gemini free tier | OpenAI payant ; API fixe non remplaçable |
| Analyse IA non bloquante | Fire-and-forget async post-upload | Attendre l'analyse (ralentit l'UX) |
| Drag-and-drop Kanban | @dnd-kit (accessible, headless) | react-beautiful-dnd (déprécié) |
| Cache requêtes frontend | TanStack Query staleTime + invalidation | Redux (trop verbeux pour du server state) |
