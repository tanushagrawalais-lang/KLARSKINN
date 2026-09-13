# KLARSINN

Premium AI learning companion: upload academic material, wait until the system has a versioned, page-grounded understanding of it, then request a personalized explanation.

This repository is on **Phase 0** (scaffold only). Authentication, Gemini, document processing, and product UI are not implemented yet.

Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Run locally

Requirements:

- Node.js 22+
- PostgreSQL (needed for Prisma migrate in later phases; `/api/health` does not need a live database)

```bash
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

The app listens on [http://127.0.0.1:43147](http://127.0.0.1:43147).

Health check: `GET /api/health`

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server on port 43147 |
| `npm run typecheck` | Strict `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npx prisma generate` | Generate Prisma Client from `prisma/schema.prisma` |

Do not run migrations until a PostgreSQL instance is available and Phase 1+ needs it.

## Phase 0 contents

- Next.js App Router + strict TypeScript + ESLint
- Prisma schema (users, sessions, profiles, documents, pages, versioned understandings, intents, explanations)
- Zod environment validation
- `AIProvider`, `StorageProvider`, and `JobQueue` interfaces
- `LocalStorageProvider` and `InMemoryJobQueue` (not wired to upload/processing yet)
- Structured logger and `AppError` primitives
- Domain/service folder layout
