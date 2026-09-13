import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined ? undefined : value;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://127.0.0.1:43147"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://klarsinn:klarsinn@127.0.0.1:5432/klarsinn?schema=public"),
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AI_PROVIDER: z.enum(["gemini"]).default("gemini"),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_PROVIDER: z.enum(["supabase", "local"]).default("supabase"),
  LOCAL_STORAGE_DIR: z.string().min(1).default("./uploads"),
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("study-materials"),
  DIRECT_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  MAX_UPLOAD_PAGES: z.coerce.number().int().positive().default(50),
  UNDERSTANDING_SCHEMA_VERSION: z.string().min(1).default("understanding.v1"),
  DOCUMENT_JOB_CONCURRENCY: z.coerce.number().int().positive().default(1),
  DOCUMENT_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(6),
  UPLOAD_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function resetEnvCache(): void {
  cached = undefined;
}

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }

  cached = parsed.data;
  return cached;
}
