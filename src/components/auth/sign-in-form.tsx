"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiErrorMessage, parseJson } from "@/lib/api/client";
import { AuthCard, ErrorNote, Field, PrimaryButton, TextInput } from "@/components/forms";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const payload = await parseJson<{
        error?: { message: string };
        profileCompleted?: boolean;
      }>(response);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Sign in failed"));
        return;
      }
      router.push(payload.profileCompleted ? "/companion" : "/onboarding");
      router.refresh();
    } catch {
      setError("Could not reach KLARSINN. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      kicker="Account"
      title="Sign in"
      footer={
        <>
          New here?{" "}
          <Link className="text-forest underline decoration-gold/70 underline-offset-4" href="/sign-up">
            Create an account
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <TextInput name="password" type="password" autoComplete="current-password" required />
        </Field>
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </PrimaryButton>
        <ErrorNote message={error} />
      </form>
    </AuthCard>
  );
}
