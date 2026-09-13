# KLARSINN backend architecture

Status: Phase 0 in progress after this document. Later phases are not started until instructed.

Intended stack:

- TypeScript (strict)
- Next.js (App Router)
- PostgreSQL
- Prisma ORM
- Gemini API behind an `AIProvider` interface (not implemented in Phase 0)
- Database-backed sessions, email/password only in v1
- Local disk behind a `StorageProvider` interface (single concrete provider)
- Zod for request, env, and AI-output validation
- In-process `JobQueue` (replaceable without changing business logic)

Product remains one flow:

Academic material → deep understanding → user intent → personalized explanation

Out of scope for all phases: quizzes, flashcards, calendars, assignment tracking, LMS, social features, generic productivity tools, unrelated AI agents.

---

## 1. Proposed folder structure

```text
/
├── README.md
├── ARCHITECTURE.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── .env.example
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── health/
│   │   │       └── route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx                 # placeholder only until UI phases
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── types.ts             # AIProvider + DTOs
│   │   │   └── schemas.ts           # Zod (later phases)
│   │   ├── auth/                    # Phase 1
│   │   ├── db/
│   │   │   └── prisma.ts
│   │   ├── documents/               # Phase 2+
│   │   ├── env.ts
│   │   ├── explanations/            # Phase 4
│   │   ├── jobs/
│   │   │   ├── types.ts
│   │   │   └── memory.ts            # InMemoryJobQueue only
│   │   ├── logger.ts
│   │   ├── storage/
│   │   │   ├── types.ts
│   │   │   └── local.ts             # LocalStorageProvider only
│   │   └── rate-limit/              # Phase 5
│   └── server/
│       ├── authz.ts                 # ownership → 404 (used from Phase 1)
│       ├── errors.ts
│       └── services/                # domain services; implemented in later phases
│           ├── profile-service.ts
│           ├── document-service.ts
│           ├── understanding-service.ts
│           ├── intent-service.ts
│           └── explanation-service.ts
└── uploads/                         # local storage; gitignored
```

Rules:

- Client code never imports `lib/ai`, `lib/storage`, Prisma, or env secrets.
- Route handlers stay thin: parse → authorize → service.
- All Gemini/SDK calls stay inside a future `GeminiProvider` module. Application code depends on `AIProvider` only.
- Do not add extra storage backends or queue backends in this repo until required.

---

## 2. Architecture diagram

```text
Browser
  │  HTTPS
  ▼
Next.js App Router
  └── Route handlers
        ├── session cookie (httpOnly, secure, sameSite)   [Phase 1]
        ├── Zod validation
        ├── rate limiter (AI + upload)                    [Phase 5]
        └── domain services
              ├── Prisma ──────────────► PostgreSQL
              ├── StorageProvider ─────► LocalStorageProvider (disk)
              ├── JobQueue ────────────► InMemoryJobQueue
              └── AIProvider ──────────► GeminiProvider [Phase 3+]

Upload / understand (async; never generates the explanation):

  UPLOAD → VALIDATE → STORE → EXTRACT (pages)
        → UNDERSTAND (versioned) → STRUCTURE → PERSIST → READY

Provenance:

  Document → DocumentPage → SourceSpan → Concept
                                       → ExplanationClaim

Explanation (separate HTTP request, document READY):

  USER INTENT + LEARNER PROFILE + DocumentUnderstanding (active version)
        → generateExplanation()
```

HTTP upload returns quickly with `{ documentId, status }`.

HTTP explain is allowed only when the document has a READY understanding. It does not re-run full understanding unless a new version is explicitly processed.

---

## 3. Database entity model

### Modeling rules

Relational tables for:

- authorization and ownership
- lifecycle (documents, understandings, sessions)
- relationships between concepts
- page-level source references
- queryable concepts and claims

JSON fields for:

- variable AI extras (section lists, relation lists if not queried independently, model usage)
- questionnaire lists (`modalities`)
- claim/concept metadata that is not worth its own table

Do **not** create a table per AI output field. No separate tables for confusion notes, formula latex, visual descriptions, or similar.

Do **not** add Auth.js `Account` / `VerificationToken` tables until Google OAuth is actually required.

### Provenance (required)

The system must answer: **which page(s) of the uploaded document support this concept or claim?**

```text
Document
  └── DocumentPage          (extracted page text / optional page image ref)
        └── SourceSpan      (excerpt on that page)
              ├── ConceptSourceSpan → Concept
              └── ExplanationClaim
```

### Understanding versions (required)

Each AI structured understanding is a `DocumentUnderstanding` row:

- `documentId`
- `schemaVersion` (prompt/schema contract, e.g. `understanding.v1`)
- `modelProvider`, `modelName`
- `status` (`PROCESSING` | `READY` | `FAILED`)
- `createdAt` (and `completedAt` when finished)

A document may have multiple understanding rows over time. `Document.activeUnderstandingId` points at the version the companion should use. Failed or superseded versions remain for audit.

### Entities

```text
User
  id                    String   @id @default(cuid())
  email                 String   @unique
  passwordHash          String
  name                  String?
  createdAt             DateTime
  updatedAt             DateTime
  lastSignedInAt        DateTime?
  deletedAt             DateTime?

Session
  id                    String   @id
  sessionToken          String   @unique
  userId                String
  expiresAt             DateTime
  createdAt             DateTime

LearnerProfile
  id                    String   @id
  userId                String   @unique
  explanationStyle      ExplanationStyle
  detailLevel           DetailLevel
  modalities            Json                 # string[]
  interests             String[]
  subjectContext        String?
  additionalNotes       String?
  completedAt           DateTime?
  createdAt             DateTime
  updatedAt             DateTime

Document
  id                    String   @id
  userId                String
  title                 String
  originalFilename      String
  mimeType              String
  byteSize              Int
  pageCount             Int?
  documentType          DocumentType
  storageKey            String               # opaque; not a public URL
  status                DocumentStatus       # upload pipeline
  activeUnderstandingId String?              # FK to DocumentUnderstanding
  processingStartedAt   DateTime?
  processingFinishedAt  DateTime?
  failureCode           String?
  failureMessage        String?              # safe, user-facing
  contentHash           String?
  createdAt             DateTime
  updatedAt             DateTime

DocumentPage
  id                    String   @id
  documentId            String
  pageNumber            Int                  # 1-based
  textContent           String?              # extracted text for this page
  storageKey            String?              # optional rendered page / figure blob
  metadata              Json?                # variable extract hints only
  @@unique(documentId, pageNumber)

DocumentUnderstanding
  id                    String   @id
  documentId            String
  schemaVersion         String               # e.g. understanding.v1
  modelProvider         String
  modelName             String
  status                UnderstandingStatus
  failureCode           String?
  modelMetadata         Json?                # tokens, latency; never raw doc text
  structuredExtras      Json?                # importantSections, relations[]
  createdAt             DateTime
  completedAt           DateTime?

Concept
  id                    String   @id
  understandingId       String
  documentId            String               # denormalized for ownership queries
  name                  String
  kind                  ConceptKind
  summary               String
  importance            Int                  # 1–5
  sortOrder             Int
  metadata              Json?                # confusionNote, formula, visual notes

ConceptSourceSpan
  conceptId             String
  sourceSpanId          String
  @@id(conceptId, sourceSpanId)

SourceSpan
  id                    String   @id
  documentId            String
  pageId                String               # DocumentPage
  heading               String?
  excerpt               String
  startOffset           Int?
  endOffset             Int?

UserIntent
  id                    String   @id
  userId                String
  documentId            String
  understandingId       String               # version the user acted on
  intentType            IntentType
  prompt                String
  targetConceptId       String?
  targetSection         String?
  createdAt             DateTime

Explanation
  id                    String   @id
  userId                String
  documentId            String
  understandingId       String
  intentId              String
  content               String
  personalizationNote   String?              # or "none"
  usedInterest          String?
  conceptsUsed          Json                 # string[] concept ids/names
  modelProvider         String
  modelName             String
  modelMetadata         Json?
  createdAt             DateTime

ExplanationClaim
  id                    String   @id
  explanationId         String
  claimText             String
  grounding             GroundingKind        # supported | explanatory_addition | analogy
  conceptId             String?
  sourceSpanId          String?              # → page via SourceSpan.pageId
```

Page support query:

```text
Concept pages:
  Concept → ConceptSourceSpan → SourceSpan → DocumentPage.pageNumber

Claim pages:
  ExplanationClaim → SourceSpan → DocumentPage.pageNumber
```

`supported` claims SHOULD carry a `sourceSpanId` when the material has pages. Persistence in later phases rejects `grounding=supported` with neither span nor page.

### Enums

```text
ExplanationStyle      concise | structured | conversational | socratic
DetailLevel           brief | standard | thorough
DocumentType          pdf | text | markdown | image
DocumentStatus        UPLOADED | VALIDATING | PROCESSING | READY | FAILED
UnderstandingStatus   PROCESSING | READY | FAILED
ConceptKind           concept | definition | formula | example | section | visual | confusion
IntentType            explain_concept | explain_section | explain_whole | simplify | analogy | clarify_confusion | custom
GroundingKind         supported | explanatory_addition | analogy
```

Concept-to-concept relations live in `DocumentUnderstanding.structuredExtras.relations` (JSON). They are not a first-class query surface in v1.

### Indexes

- `Session(userId)`
- `Document(userId, createdAt)`
- `Document(userId, status)`
- `DocumentPage(documentId, pageNumber)` unique
- `DocumentUnderstanding(documentId, createdAt)`
- `Concept(understandingId, sortOrder)`
- `SourceSpan(pageId)`
- `UserIntent(userId, documentId, createdAt)`
- `Explanation(userId, documentId, createdAt)`

Foreign keys cascade with the owning document/user tree.

---

## 4. API endpoint list

`GET /api/health` is public.

All other `/api/*` require a valid session (Phase 1+).

For every user-owned resource:

1. Verify session
2. Load the resource scoped to `session.userId`
3. If missing **or** not owned → **404** (no existence oracle)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness; no secrets |
| `POST` | `/api/auth/sign-up` | Create account (Phase 1) |
| `POST` | `/api/auth/sign-in` | Create session (Phase 1) |
| `POST` | `/api/auth/sign-out` | Destroy session (Phase 1) |
| `GET` | `/api/me` | Current user + profile completion |
| `GET` | `/api/profile` | Learner profile |
| `PUT` | `/api/profile` | Questionnaire upsert |
| `POST` | `/api/documents` | Upload; enqueue processing; `{ id, status }` |
| `GET` | `/api/documents` | Current user’s documents |
| `GET` | `/api/documents/:id` | Metadata + pipeline status |
| `GET` | `/api/documents/:id/pages` | Page index (numbers, not full private text to logs) |
| `GET` | `/api/documents/:id/understanding` | Active understanding when READY; else 409 |
| `DELETE` | `/api/documents/:id` | Delete + storage cleanup |
| `GET` | `/api/documents/:id/intent-options` | `generateIntentOptions()` |
| `POST` | `/api/intents` | Persist intent against a READY understanding |
| `POST` | `/api/explanations` | Generate + persist explanation |
| `GET` | `/api/explanations/:id` | Owner only |
| `GET` | `/api/documents/:id/explanations` | List for a document |

No public URLs for original files. Storage keys never leave the server.

---

## 5. AI service interface

```ts
export interface AIProvider {
  readonly id: string;
  readonly modelName: string;
  analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult>;
  generateIntentOptions(input: GenerateIntentOptionsInput): Promise<GenerateIntentOptionsResult>;
  generateExplanation(input: GenerateExplanationInput): Promise<GenerateExplanationResult>;
}
```

`analyzeDocument` input is **page-addressable**: each page has `pageNumber` and extracted `text`. Output concepts/spans must include `pageNumber` (and excerpt) so persistence can attach `SourceSpan.pageId`.

`generateExplanation` claims include `grounding` plus optional `pageNumber` / `sourceExcerpt`.

Provider wiring:

```text
createAIProvider(env) → GeminiProvider   # only implementation planned
Application services talk to AIProvider, never to the Gemini SDK.
```

Gemini-specific SDK, prompts, and JSON MIME mode stay in `GeminiProvider` (Phase 3). Not implemented in Phase 0.

Grounding:

1. `supported` — from the uploaded pages; store span → page
2. `explanatory_addition` — pedagogy, not lecture fact
3. `analogy` — optional; only if it helps; never as source fact

Personalization affects style and optional analogy, never factual content. Do not force an analogy into every explanation.

---

## 6. Document-processing pipeline

### Document statuses

```text
UPLOADED     metadata + object stored
VALIDATING   type, size, page limits
PROCESSING   extract pages + AI understand + persist
READY        active DocumentUnderstanding is READY
FAILED       failureCode + safe message; original retained
```

### Understanding statuses

```text
PROCESSING   this schemaVersion/model run is in flight
READY        concepts + spans committed
FAILED       this version failed; document may remain FAILED
```

### Stages

```text
1. UPLOAD (HTTP) — store via StorageProvider, enqueue JobQueue, return immediately
2. VALIDATE — MIME allowlist, MAX_UPLOAD_BYTES, MAX_UPLOAD_PAGES
3. EXTRACT — one DocumentPage per page; never call generateExplanation
4. UNDERSTAND — insert DocumentUnderstanding (schemaVersion, model, PROCESSING)
                AIProvider.analyzeDocument(pages)
                Zod-validate
5. STRUCTURE + PERSIST — SourceSpan (pageId), Concept, ConceptSourceSpan
                         structuredExtras JSON for sections/relations
                         understanding READY; document.activeUnderstandingId; document READY
6. READY FOR USER — poll document; then intent + explanation
```

Retries: bounded attempts for 429/5xx/timeouts. Invalid model JSON: one repair attempt, then understanding FAILED.

Worker logs `documentId`, `understandingId`, `durationMs`, `status` — never file bytes or full page text.

---

## 7. Authentication strategy

v1: **email + password** and **database `Session` rows**.

- Password hashed with argon2 (or bcrypt if argon2 is impractical)
- Session cookie: httpOnly, secure in production, sameSite=lax
- Revocation = delete session row (no JWT-only v1)
- Sign-up / sign-in / sign-out only — no unused OAuth adapter, no `Account` table
- Google OAuth may be added later; it is not built now

Companion and document APIs (Phase 1+): valid session. Completed profile required except `/api/me` and `/api/profile` (`403 PROFILE_INCOMPLETE`).

Auth is **not** implemented in Phase 0.

---

## 8. Security model

| Control | Approach |
| --- | --- |
| Authentication | Database session on protected routes (Phase 1) |
| Authorization | Session + ownership; else 404 |
| IDOR | cuid ids; no enumeration |
| API keys | Server env only (`GEMINI_API_KEY` later) |
| Validation | Zod; upload type sniff + MIME allowlist |
| Upload limits | `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_PAGES` |
| Storage | Opaque keys; files not under `/public` |
| Errors | `AppError`; no stacks to clients |
| Logging | ids, durations, error codes — not passwords, keys, document contents, or profile dumps |
| Rate limit | Abstraction on AI + upload (Phase 5) |

---

## 9. Background-job strategy

```ts
export type ProcessDocumentJob = {
  name: "process-document";
  documentId: string;
  userId: string;
};

export interface JobQueue {
  enqueue(job: ProcessDocumentJob): Promise<void>;
  start(): void;
}
```

Hackathon: **`InMemoryJobQueue` only**. No Redis, BullMQ, or extra brokers.

- FIFO in the Next.js server process
- Bounded concurrency from env
- Document/understanding **status lives in PostgreSQL**
- Boot reconciler (later phase) resets stuck `PROCESSING`/`VALIDATING` rows

Replacement later: new `JobQueue` implementation + factory. Services keep calling `enqueue`.

HTTP never calls `analyzeDocument` on the request thread.

---

## 10. Environment variables

Validated with Zod in `src/lib/env.ts`. `.env.example` documents names.

Phase 0 requires values needed to boot the app. Auth and Gemini secrets become required when those phases land.

```text
NODE_ENV                    development | production | test
APP_URL                     http://127.0.0.1:43147
DATABASE_URL                postgresql://...

# Phase 1
AUTH_SECRET                 optional until auth is implemented

# Phase 3
AI_PROVIDER                 gemini
GEMINI_API_KEY              optional until Gemini is implemented
GEMINI_MODEL                optional until Gemini is implemented

STORAGE_PROVIDER            local
LOCAL_STORAGE_DIR           ./uploads

MAX_UPLOAD_BYTES            20971520
MAX_UPLOAD_PAGES            50
UNDERSTANDING_SCHEMA_VERSION understanding.v1

DOCUMENT_JOB_CONCURRENCY    1
DOCUMENT_JOB_MAX_ATTEMPTS   3

AI_RATE_LIMIT_PER_MINUTE    6
UPLOAD_RATE_LIMIT_PER_HOUR  10
```

No `NEXT_PUBLIC_` secrets. Do not list unused S3 credentials until a second storage provider exists.

---

## 11. Implementation phases

### Phase 0 — Scaffold (this implementation slice)

- Next.js App Router + TypeScript + ESLint (strict)
- Prisma configured with the schema in section 3
- Zod env validation
- Domain/service folder structure
- Prisma client connection module
- `AIProvider`, `StorageProvider`, `JobQueue` interfaces
- `LocalStorageProvider` and `InMemoryJobQueue` as the sole concrete classes (no processing yet)
- Structured logger
- API error primitives
- `GET /api/health`
- `.env.example` + README
- No authentication, no Gemini, no document processing, no product UI screens

### Phase 1 — Auth + profile

- Sign-up / sign-in / sign-out + database sessions
- Learner-profile questionnaire
- Ownership 404 helper on protected resources

### Phase 2 — Documents + storage + jobs

- Upload API, `LocalStorageProvider` usage, `DocumentPage` extract
- Status machine + in-process worker
- No explanation generation

### Phase 3 — Understanding + GeminiProvider

- `GeminiProvider` behind `AIProvider`
- Versioned `DocumentUnderstanding`
- Persist concepts + page-level `SourceSpan`s

### Phase 4 — Intent + explanation

- Intent API
- `generateExplanation` with grounding + personalization
- Claims linked to spans/pages

### Phase 5 — Hardening

- Rate limits, retry/reconcile, delete/cleanup, AI duration logs

---

## Inspection record

Inspected 2026-09-13: empty repository (initializer commit only), then architecture-only commit. Phase 0 is the first application code.
