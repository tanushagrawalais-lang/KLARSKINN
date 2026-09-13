import { z } from "zod";

export const explanationStyleSchema = z.enum([
  "concise",
  "structured",
  "conversational",
  "socratic",
]);

export const detailPreferenceSchema = z.enum(["brief", "standard", "thorough"]);

export const learningPreferenceSchema = z.enum([
  "text",
  "diagram-descriptions",
  "worked-examples",
]);

export const interestSchema = z.enum([
  "motorsports",
  "music",
  "cooking",
  "sports",
  "film",
  "nature",
  "architecture",
  "gaming",
  "literature",
  "travel",
]);

export const emailSchema = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Password does not meet requirements")
  .max(128, "Password does not meet requirements")
  .regex(/[A-Za-z]/, "Password does not meet requirements")
  .regex(/[0-9]/, "Password does not meet requirements");

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const profileUpdateSchema = z.object({
  explanationStyle: explanationStyleSchema,
  detailPreference: detailPreferenceSchema,
  learningPreferences: z.array(learningPreferenceSchema).min(1),
  interests: z.array(interestSchema).max(10),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
