"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const payload = (await response.json()) as {
      error?: { message: string };
      profileCompleted?: boolean;
    };
    if (!response.ok) {
      setError(payload.error?.message ?? "Sign in failed");
      return;
    }
    router.push(payload.profileCompleted ? "/companion" : "/onboarding");
    router.refresh();
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit">Sign in</button>
      </form>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
