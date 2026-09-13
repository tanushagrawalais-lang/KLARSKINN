"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const interests = form.getAll("interests");
    const learningPreferences = form.getAll("learningPreferences");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        explanationStyle: form.get("explanationStyle"),
        detailPreference: form.get("detailPreference"),
        learningPreferences,
        interests,
      }),
    });
    const payload = (await response.json()) as { error?: { message: string } };
    if (!response.ok) {
      setError(payload.error?.message ?? "Could not save profile");
      return;
    }
    router.push("/companion");
    router.refresh();
  }

  return (
    <main>
      <h1>Learning profile</h1>
      <form onSubmit={onSubmit}>
        <label>
          Explanation style
          <select name="explanationStyle" defaultValue="structured" required>
            <option value="concise">Concise</option>
            <option value="structured">Structured</option>
            <option value="conversational">Conversational</option>
            <option value="socratic">Socratic</option>
          </select>
        </label>
        <label>
          Detail
          <select name="detailPreference" defaultValue="standard" required>
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="thorough">Thorough</option>
          </select>
        </label>
        <fieldset>
          <legend>How you learn</legend>
          <label>
            <input type="checkbox" name="learningPreferences" value="text" defaultChecked />
            Text
          </label>
          <label>
            <input type="checkbox" name="learningPreferences" value="diagram-descriptions" />
            Diagram descriptions
          </label>
          <label>
            <input type="checkbox" name="learningPreferences" value="worked-examples" />
            Worked examples
          </label>
        </fieldset>
        <fieldset>
          <legend>Interests (optional analogies)</legend>
          <label>
            <input type="checkbox" name="interests" value="motorsports" />
            Motorsports
          </label>
          <label>
            <input type="checkbox" name="interests" value="music" />
            Music
          </label>
          <label>
            <input type="checkbox" name="interests" value="gaming" />
            Gaming
          </label>
        </fieldset>
        <button type="submit">Save profile</button>
      </form>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
