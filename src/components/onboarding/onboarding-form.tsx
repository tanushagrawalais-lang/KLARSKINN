"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiErrorMessage, parseJson } from "@/lib/api/client";
import {
  DETAIL_PREFERENCES,
  EXPLANATION_STYLES,
  INTERESTS,
  LEARNING_PREFERENCES,
} from "@/lib/ui/profile-copy";
import { ErrorNote, PrimaryButton } from "@/components/forms";

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const interests = form.getAll("interests");
    const learningPreferences = form.getAll("learningPreferences");
    try {
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
      const payload = await parseJson<{ error?: { message: string } }>(response);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "Could not save profile"));
        return;
      }
      router.push("/companion");
      router.refresh();
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-10" onSubmit={onSubmit}>
      <fieldset className="space-y-3">
        <legend className="font-serif text-2xl text-forest">How should explanations sound?</legend>
        <p className="text-sm text-ink-soft">Pick one style. You can change this later by completing the profile again.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {EXPLANATION_STYLES.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-sm border border-ink/10 bg-paper-3 p-4 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/30"
            >
              <input
                className="mt-1 accent-forest"
                type="radio"
                name="explanationStyle"
                value={option.value}
                defaultChecked={option.value === "structured"}
                required
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="text-sm text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-2xl text-forest">How much detail?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {DETAIL_PREFERENCES.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-sm border border-ink/10 bg-paper-3 p-4 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/30"
            >
              <input
                className="mt-1 accent-forest"
                type="radio"
                name="detailPreference"
                value={option.value}
                defaultChecked={option.value === "standard"}
                required
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="text-sm text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-2xl text-forest">How you learn</legend>
        <p className="text-sm text-ink-soft">Choose at least one. These shape wording, not extra study tools.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {LEARNING_PREFERENCES.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-sm border border-ink/10 bg-paper-3 p-4 has-[:checked]:border-gold has-[:checked]:bg-gold-soft/30"
            >
              <input
                className="mt-1 accent-forest"
                type="checkbox"
                name="learningPreferences"
                value={option.value}
                defaultChecked={option.value === "text"}
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="text-sm text-ink-soft">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-serif text-2xl text-forest">Interests for analogies</legend>
        <p className="text-sm text-ink-soft">Optional. Analogies only appear when they fit the material.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {INTERESTS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm border border-ink/10 bg-paper-3 px-3 py-2 text-sm has-[:checked]:border-gold"
            >
              <input className="accent-forest" type="checkbox" name="interests" value={option.value} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <PrimaryButton type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving profile…" : "Save learning profile"}
        </PrimaryButton>
        <ErrorNote message={error} />
      </div>
    </form>
  );
}
