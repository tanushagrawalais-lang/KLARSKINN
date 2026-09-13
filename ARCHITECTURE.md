# KLARSINN backend architecture

Status: design only. Do not treat this document as implemented code.

Intended stack (greenfield; repository is empty):

- TypeScript
- Next.js (App Router)
- PostgreSQL
- Prisma ORM
- Gemini API behind an `AIProvider` interface
- NextAuth.js (Auth.js) with credentials + optional OAuth later
- Object storage behind a `StorageProvider` interface
- Zod for request and AI-output validation
- In-process job queue first, with a replaceable `JobQueue` interface

---

## 1. Proposed folder structure

```text
/
├── README.md
├── ARCHITECTURE.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   ├── (app)/
│   │   │   ├── onboarding/          # learner profile questionnaire
│   │   │   └── companion/           # main AI companion
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── me/
│   │   │   ├── profile/
│   │   │   ├── documents/
│   │   │   ├── intents/
│   │   │   └── explanations/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/                  # companion UI only
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── config.ts
│   │   │   ├── password.ts
│   │   │   └── session.ts
│   │   ├── db/
│   │   │   └── prisma.ts
│   │   ├── env.ts                   # Zod-parsed server env
│   │   ├── logger.ts
│   │   ├── rate-limit/
│   │   │   ├── types.ts
│   │   │   └── memory.ts
│   │   ├── storage/
│   │   │   ├── types.ts
│   │   │   └── local.ts             # later: s3.ts
│   │   ├── jobs/
│   │   │   ├── types.ts
│   │   │   ├── memory.ts
│   │   │   └── handlers/
│   │   │       └── process-document.ts
│   │   ├── documents/
│   │   │   ├── upload.ts
│   │   │   ├── validate.ts
│   │   │   └── extract.ts           # text/pages; not explanation
│   │   ├── ai/
│   │   │   ├── types.ts
│   │   │   ├── schemas.ts           # Zod schemas for model JSON
│   │   │   ├── provider.ts          # AIProvider interface
│   │   │   ├── gemini.ts
│   │   │   └── index.ts             # factory from env
│   │   └── explanations/
│   │       └── grounding.ts
│   └── server/
│       ├── authz.ts                 # ownership checks
│       ├── errors.ts
│       └── services/
│           ├── profile-service.ts
│           ├── document-service.ts
│           ├── intent-service.ts
│           └── explanation-service.ts
└── uploads/                         # local storage; gitignored
```

Rules:

- Client components never import `lib/ai`, `lib/storage`, Prisma, or env secrets.
- Route handlers are thin: parse → authorize → call a service.
- Gemini SDK lives only in `lib/ai/gemini.ts`.

---

## 2. Architecture diagram

```text
Browser
  │  HTTPS
  ▼
Next.js App Router
  ├── Pages: sign-in / sign-up / onboarding / companion
  └── Route handlers (auth required except public auth routes)
        │
        ├── Auth.js session cookie (httpOnly, secure, sameSite)
        ├── Zod request validation
        ├── Rate limiter (AI + upload endpoints)
        └── Domain services
              │
              ├── Prisma ──────────────► PostgreSQL
              ├── StorageProvider ─────► local disk / later object store
              ├── JobQueue ────────────► process-document worker
              └── AIProvider ──────────► Gemini (replaceable)

Document pipeline (async; not the explanation):

  UPLOAD → VALIDATE → STORE → EXTRACT → UNDERSTAND → STRUCTURE → PERSIST → READY

Explanation path (separate request, after READY):

  USER INTENT
    + LEARNER PROFILE
    + STRUCTURED DOCUMENT UNDERSTANDING
    ────────────────────────────────────► generateExplanation()
                                          grounded, cited, personalized
```

Separation of concerns:

```text
HTTP request (upload)
  must return quickly with documentId + status=UPLOADED|VALIDATING|PROCESSING

HTTP request (explain)
  only allowed when document.status = READY
  never re-runs full document understanding unless the document changed
```

---

## 3. Database entity model

### Principles

- One user owns all learning data. No sharing tables.
- Document understanding is relational, not a single giant summary blob.
- JSON is used only for genuinely variable payloads (e.g. model usage metadata, modality lists).
- Explanations store both rendered text and structured grounding so claims can be audited.

### Entities

```text
User
  id                    String   @id @default(cuid())
  email                 String   @unique
  emailVerifiedAt       DateTime?
  passwordHash          String?            # null if future OAuth-only
  name                  String?
  createdAt             DateTime
  updatedAt             DateTime
  lastSignedInAt        DateTime?
  deletedAt             DateTime?          # soft delete

Account                    # Auth.js OAuth adapter (unused until OAuth enabled)
  id, userId, provider, providerAccountId, ...

Session                    # database sessions (Auth.js)
  id, sessionToken, userId, expires

VerificationToken          # Auth.js

LearnerProfile
  id                    String   @id
  userId                String   @unique
  explanationStyle      ExplanationStyle   # concise | structured | conversational | socratic
  detailLevel           DetailLevel        # brief | standard | thorough
  modalities            Json               # string[] e.g. ["text","diagram-descriptions","worked-examples"]
  interests             String[]           # or related table if we need labels later
  subjectContext        String?            # course / subject if provided
  additionalNotes       String?            # short free text from questionnaire
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
  documentType          DocumentType       # pdf | text | markdown | image
  storageKey            String             # opaque storage reference, not a public URL
  status                DocumentStatus     # UPLOADED | VALIDATING | PROCESSING | READY | FAILED
  processingStartedAt   DateTime?
  processingFinishedAt  DateTime?
  failureCode           String?            # machine-stable, not raw stack
  failureMessage        String?            # safe user-facing
  contentHash           String?            # optional dedupe per user
  createdAt             DateTime
  updatedAt             DateTime

DocumentAsset              # extracted pages / images, not the explanation
  id, documentId
  kind                  AssetKind          # page-text | page-image | figure
  pageNumber            Int?
  storageKey            String?
  textContent           String?            # extracted text for that page/region
  sortOrder             Int

Concept
  id, documentId
  name                  String
  kind                  ConceptKind        # concept | definition | formula | example | section | visual | confusion
  summary               String
  importance            Int                # 1–5
  pageStart             Int?
  pageEnd               Int?
  sourceExcerpt         String?            # short quote from material
  confusionNote         String?            # potential confusion point
  sortOrder             Int

ConceptRelation
  id, documentId
  fromConceptId         String
  toConceptId           String
  relationType          RelationType       # defines | depends-on | example-of | contrasts | part-of | related
  note                  String?

SourceSpan                 # reusable citation unit
  id, documentId
  pageNumber            Int?
  heading               String?
  excerpt               String             # short, stored for grounding
  startOffset           Int?
  endOffset             Int?

ConceptSource
  conceptId, sourceSpanId

UserIntent
  id
  userId
  documentId
  intentType            IntentType
    # explain-concept | explain-section | explain-whole
    # simplify | analogy | clarify-confusion | custom
  prompt                String             # user-specified request
  targetConceptId       String?
  targetSection         String?
  createdAt             DateTime

Explanation
  id
  userId
  documentId
  intentId              String
  content               String             # final learner-facing explanation
  personalizationNote   String?            # how profile was used (or "none")
  usedInterest          String?            # which interest, if any
  modelProvider         String
  modelName             String
  modelMetadata         Json               # tokens, latency; never raw prompts with PII dump
  createdAt             DateTime

ExplanationClaim           # grounding rows
  id, explanationId
  claimText             String
  grounding             GroundingKind      # supported | explanatory-addition | analogy
  conceptId             String?
  sourceSpanId          String?

ExplanationConcept         # concepts used
  explanationId, conceptId
```

### Enums

```text
ExplanationStyle   concise | structured | conversational | socratic
DetailLevel        brief | standard | thorough
DocumentType       pdf | text | markdown | image
DocumentStatus     UPLOADED | VALIDATING | PROCESSING | READY | FAILED
AssetKind          page-text | page-image | figure
ConceptKind        concept | definition | formula | example | section | visual | confusion
RelationType       defines | depends_on | example_of | contrasts | part_of | related
IntentType         explain_concept | explain_section | explain_whole | simplify | analogy | clarify_confusion | custom
GroundingKind      supported | explanatory_addition | analogy
```

### Indexes and constraints

- `Document(userId, createdAt)`
- `Document(userId, status)`
- `Concept(documentId, sortOrder)`
- `UserIntent(userId, documentId, createdAt)`
- `Explanation(userId, documentId, createdAt)`
- Foreign keys with `onDelete: Cascade` for user-owned trees
- Unique `(fromConceptId, toConceptId, relationType)` optional

`LearnerProfile.interests` starts as `String[]`. If interest taxonomy grows, extract `Interest` + join table in a later phase. Do not over-normalize the questionnaire now.

---

## 4. API endpoint list

All `/api/*` except auth sign-in/sign-up and health are session-authenticated.

Authorization: the resource’s `userId` must equal the session user. Missing and non-owned IDs both return `404` (no enumeration).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness; no secrets |
| `POST` | `/api/auth/sign-up` | Create account (email + password) |
| `POST` | `/api/auth/[...nextauth]` | Auth.js handlers (sign-in, sign-out, session) |
| `GET` | `/api/me` | Current user + profile completion flag |
| `GET` | `/api/profile` | Learner profile |
| `PUT` | `/api/profile` | Create/update profile (questionnaire) |
| `POST` | `/api/documents` | Upload (multipart). Validates type/size. Stores. Enqueues processing. Returns `{ id, status }` |
| `GET` | `/api/documents` | List current user’s documents (id, title, status, timestamps; no storage keys) |
| `GET` | `/api/documents/:id` | Document metadata + status + safe failure message |
| `GET` | `/api/documents/:id/understanding` | Structured understanding when `READY`; else `409` |
| `DELETE` | `/api/documents/:id` | Soft-delete or hard-delete + storage cleanup |
| `GET` | `/api/documents/:id/intent-options` | Suggested intents from understanding (`generateIntentOptions`) |
| `POST` | `/api/intents` | Persist user intent for a READY document |
| `POST` | `/api/explanations` | Generate + persist explanation from intent + profile + understanding |
| `GET` | `/api/explanations/:id` | Fetch one explanation (owner only) |
| `GET` | `/api/documents/:id/explanations` | List explanations for a document |

Request/response contracts (Zod):

**POST `/api/documents`**

- Input: file, optional title
- Output: `{ id, status, title, createdAt }`
- Errors: `415` unsupported type, `413` too large, `401`

**POST `/api/explanations`**

- Input: `{ intentId }` or `{ documentId, intentType, prompt, targetConceptId? }`
- Output: `{ id, content, claims[], conceptsUsed[], personalizationNote, createdAt }`
- Errors: `409` document not READY, `429` rate limited, `404`

No public file-serving URLs for originals. If the UI needs a filename, it comes from metadata.

---

## 5. AI service interface

```ts
// lib/ai/types.ts

export type AnalyzeDocumentInput = {
  documentId: string;
  title: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    hasVisual?: boolean;
  }>;
};

export type AnalyzeDocumentResult = {
  concepts: Array<{
    name: string;
    kind: ConceptKind;
    summary: string;
    importance: number; // 1-5
    pageStart?: number;
    pageEnd?: number;
    sourceExcerpt?: string;
    confusionNote?: string;
  }>;
  relations: Array<{
    fromName: string;
    toName: string;
    relationType: RelationType;
    note?: string;
  }>;
  importantSections: Array<{
    heading?: string;
    pageNumber?: number;
    excerpt: string;
    whyItMatters: string;
  }>;
};

export type GenerateIntentOptionsInput = {
  documentTitle: string;
  concepts: Array<{ name: string; kind: ConceptKind; importance: number }>;
  importantSections: Array<{ heading?: string; excerpt: string }>;
};

export type GenerateIntentOptionsResult = {
  options: Array<{
    intentType: IntentType;
    label: string;
    prompt: string;
    targetConceptName?: string;
    targetSection?: string;
  }>;
};

export type GroundingKind = "supported" | "explanatory_addition" | "analogy";

export type GenerateExplanationInput = {
  intent: {
    intentType: IntentType;
    prompt: string;
  };
  profile: {
    explanationStyle: ExplanationStyle;
    detailLevel: DetailLevel;
    modalities: string[];
    interests: string[];
    subjectContext?: string;
  };
  understanding: AnalyzeDocumentResult;
};

export type GenerateExplanationResult = {
  content: string;
  personalizationNote: string; // "none" if profile style-only
  usedInterest?: string;
  claims: Array<{
    claimText: string;
    grounding: GroundingKind;
    sourceExcerpt?: string;
    pageNumber?: number;
    conceptName?: string;
  }>;
  conceptsUsed: string[];
};

export interface AIProvider {
  readonly id: string;
  readonly modelName: string;
  analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentResult>;
  generateIntentOptions(input: GenerateIntentOptionsInput): Promise<GenerateIntentOptionsResult>;
  generateExplanation(input: GenerateExplanationInput): Promise<GenerateExplanationResult>;
}
```

Provider wiring:

```text
createAIProvider(env) → GeminiProvider | (future)

GeminiProvider
  - uses @google/generative-ai (or official SDK current at implementation time)
  - responseMimeType JSON
  - validates with Zod schemas in lib/ai/schemas.ts
  - retries transient 429/5xx with bounded backoff
  - maps validation failure to a typed AIError (retryable | invalid_output | upstream)
```

Grounding rules encoded in the explanation schema and prompt:

1. `supported` — claim must include a source excerpt/page when available
2. `explanatory_addition` — pedagogical glue, labeled in stored claims
3. `analogy` — optional; only if it improves comprehension; never as a source fact

The model must not emit a claim as `supported` without a source pointer. Persistence rejects that shape.

Personalization rules:

- Style and detail always apply
- Interests apply only when the provider sets `usedInterest` and `grounding: analogy` (or an explicit analogy sentence)
- Forcing an analogy on every explanation is a bug

---

## 6. Document-processing pipeline

### States

```text
UPLOADED     file accepted, metadata row exists, object stored
VALIDATING   MIME, size, page limits, basic parse
PROCESSING   extract + AI analyze + structure persist
READY        understanding rows committed
FAILED       failureCode + safe failureMessage; original retained for retry
```

### Stages

```text
1. UPLOAD (HTTP)
   - Authn
   - Rate limit
   - Multipart parse
   - Create Document status=UPLOADED
   - Write bytes via StorageProvider
   - Enqueue job { type: "process-document", documentId, userId }
   - Return 202-equivalent JSON immediately

2. VALIDATE (worker)
   - status=VALIDATING
   - Allowlist: application/pdf, text/plain, text/markdown, image/png, image/jpeg
   - Max size: 20 MB (env)
   - Max pages: 50 (env) for v1
   - Reject encrypted/unreadable PDFs with failureCode=UNREADABLE

3. EXTRACT
   - PDF → page text (+ page count)
   - Images → later vision path in GeminiProvider.analyzeDocument
   - Persist DocumentAsset rows
   - Do not call generateExplanation

4. UNDERSTAND
   - AIProvider.analyzeDocument(pages)
   - Zod-parse output
   - Retry invalid JSON once with a repair prompt; then FAILED INVALID_MODEL_OUTPUT

5. STRUCTURE + PERSIST
   - Transaction:
       delete previous understanding for document (if retry)
       insert Concept, ConceptRelation, SourceSpan, ConceptSource
       set pageCount, status=READY, processingFinishedAt
   - On error: status=FAILED, processingFinishedAt, failureCode

6. READY FOR USER
   - Companion UI polls GET /api/documents/:id
   - When READY, fetch understanding + intent-options
```

Timing: the upload HTTP handler must not wait for Gemini. Processing duration is logged on the worker (`documentId`, `durationMs`, `status`), never file bytes.

Retries:

- Worker: 3 attempts for retryable errors (timeout, 429, 5xx)
- Non-retryable: unsupported type, oversize, empty extract
- User-triggered reprocess: `POST /api/documents/:id/reprocess` can be added in phase 3 if needed; not required for the first slice

---

## 7. Authentication strategy

**Choice:** Auth.js (NextAuth v5) with **Credentials** (email + password) as the v1 path, using **database sessions** in PostgreSQL.

Why:

- Server-side session cookie, not a client-held API key
- Adapter tables align with Prisma
- OAuth (`Account`) can be enabled later without changing User/LearnerProfile

Password handling:

- Argon2id or bcrypt (prefer argon2) via `lib/auth/password.ts`
- Never log email+password together; never log password or hash
- Generic sign-in error: “Invalid email or password”
- Sign-up: email normalize (trim, lowercase), password min length 12, Zod

Session:

- `httpOnly`, `secure` in production, `sameSite=lax`
- Server `auth()` in every protected route and server component
- JWT-only sessions are not used for v1 so revocation is a row delete

Account lifecycle:

- Create: sign-up → session → redirect onboarding if no `LearnerProfile.completedAt`
- Update: email change deferred; password change later
- Delete: `deletedAt`; cascade or anonymize learning data in a dedicated service method
- Sign-out: destroy session row

Companion and document APIs require both a valid session and a completed profile (`403 PROFILE_INCOMPLETE`) except `GET/PUT /api/profile` and `GET /api/me`.

---

## 8. Security model

| Control | Approach |
| --- | --- |
| Authentication | Session required on protected routes |
| Authorization | Load by `id` **and** `userId`; else 404 |
| IDOR | No sequential public IDs (cuid); no existence oracle |
| API keys | `GEMINI_API_KEY` only on server; parsed in `lib/env.ts` |
| Client secrets | None in `NEXT_PUBLIC_*` except harmless public app URL |
| Validation | Zod on all bodies; file type from sniff + MIME, not extension alone |
| Upload size | Enforced before full buffer when possible; hard cap in env |
| Storage | Opaque keys; no directory listing; files not under `/public` |
| Errors | Typed `AppError`; no stack traces to client |
| Logging | `requestId`, `userId`, `documentId`, `durationMs`, error code — not contents, not profile interests dumps, not keys |
| AI rate limit | Per-user token bucket on `/api/explanations` and analyze jobs |
| Upload rate limit | Per-user cap (e.g. 10/hour) |
| CSRF | Same-site cookie + Auth.js defaults; mutations from same origin |
| Multi-tenancy | Strict userId scoping; no shared documents |

Treat uploads and profiles as private academic data. Background jobs receive `userId` and re-check ownership before processing.

---

## 9. Background-job strategy

**Interface first**, in-process implementation for the hackathon slice.

```ts
export type JobName = "process-document";

export type ProcessDocumentJob = {
  name: "process-document";
  documentId: string;
  userId: string;
};

export interface JobQueue {
  enqueue(job: ProcessDocumentJob): Promise<void>;
  start(): void; // worker loop
}
```

**v1 `InMemoryJobQueue`**

- Async FIFO in the Next.js server process
- Bounded concurrency (1–2 document jobs)
- Persist status in PostgreSQL so UI does not depend on in-memory job state
- On process restart: a boot reconcilersets `PROCESSING`/`VALIDATING` older than N minutes back to retry or FAILED, and re-enqueues `UPLOADED` rows

**Later replacement (same interface)**

- pg-boss, or a dedicated worker process, or a cloud queue
- No call sites change except `createJobQueue(env)`

The HTTP thread never calls `analyzeDocument` directly.

---

## 10. Environment variables

Server-only (Zod in `lib/env.ts`). `.env.example` lists names, not values.

```text
# App
NODE_ENV                  development | production | test
APP_URL                   http://localhost:43147

# Database
DATABASE_URL              postgresql://...

# Auth
AUTH_SECRET               random 32+ bytes
AUTH_URL                  same as APP_URL for v1

# AI
AI_PROVIDER               gemini
GEMINI_API_KEY            server-only
GEMINI_MODEL              e.g. gemini-2.0-flash
                  # exact model string chosen at implementation time

# Storage
STORAGE_PROVIDER          local
LOCAL_STORAGE_DIR         ./uploads
# later:
# S3_BUCKET
# S3_REGION
# S3_ACCESS_KEY_ID
# S3_SECRET_ACCESS_KEY

# Uploads
MAX_UPLOAD_BYTES          20971520
MAX_UPLOAD_PAGES          50

# Jobs
DOCUMENT_JOB_CONCURRENCY  1
DOCUMENT_JOB_MAX_ATTEMPTS 3

# Rate limits
AI_RATE_LIMIT_PER_MINUTE  6
UPLOAD_RATE_LIMIT_PER_HOUR 10
```

Never expose `GEMINI_API_KEY`, `AUTH_SECRET`, `DATABASE_URL`, or storage credentials to the client.

---

## 11. Implementation phases

Do not start these until instructed.

### Phase 0 — Scaffold

- Next.js + TypeScript + Tailwind + shadcn/ui
- Prisma + PostgreSQL schema from section 3
- `lib/env.ts`, logger, error types
- `.env.example`, README run instructions

### Phase 1 — Auth + profile

- Sign-up / sign-in / session
- Learner-profile questionnaire
- Gate companion behind completed profile
- Auth failure logging (no secrets)

### Phase 2 — Documents + storage + jobs

- Upload API, validation, local storage
- Status machine
- Extract text/pages
- Worker loop
- Companion upload + status UI (empty, processing, failed, ready)

### Phase 3 — Understanding persistence + AI provider

- `AIProvider` + `GeminiProvider`
- `analyzeDocument` + Zod schemas
- Persist concepts/relations/spans
- `GET understanding` + intent options

### Phase 4 — Intent + explanation

- Intent API
- `generateExplanation` with grounding + personalization rules
- Persist Explanation + claims
- Companion: ask intent → show explanation with source/grounding distinction

### Phase 5 — Hardening

- Rate limits
- Retry/reconciliation
- Upload abuse checks
- Structured logs for AI duration/failures
- Delete document + storage cleanup

Out of scope for all phases: calendars, assignments, flashcards, social, LMS, extra agents.

---

## Inspection record

| Question | Finding |
| --- | --- |
| Current framework | None |
| Existing dependencies | None |
| Existing database | None |
| Existing authentication | None |
| Existing API routes | None |
| Existing environment configuration | None |
| Existing UI/frontend | None |

Greenfield. The design above is the source of truth until implementation is requested.
