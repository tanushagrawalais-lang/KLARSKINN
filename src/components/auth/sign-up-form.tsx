"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiErrorMessage, parseJson } from "@/lib/api/client";
import { AuthCard, ErrorNote, Field, PrimaryButton, TextInput } from "@/components/forms";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const payload = await parseJson<{ error?: { message: string } }>(response);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Registration failed"));
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Could not reach KLARSINN. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      kicker="Begin"
      title="Create account"
      footer={
        <>
          Already registered?{" "}
          <Link className="text-forest underline decoration-gold/70 underline-offset-4" href="/sign-in">
            Sign in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Password"
          hint="At least 12 characters, with a letter and a number."
        >
          <TextInput
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>
        <PrimaryButton type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </PrimaryButton>
        <ErrorNote message={error} />
      </form>
    </AuthCard>
  );
}
