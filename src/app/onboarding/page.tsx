import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { BrandMark } from "@/components/brand";
import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser } from "@/server/services/auth-service";

export default async function OnboardingPage() {
  const user = await getSessionUser(await readSessionToken());
  if (!user) {
    redirect("/sign-in");
  }
  if (user.profileCompleted) {
    redirect("/companion");
  }

  return (
    <div className="min-h-screen">
      <header className="px-6 py-6 lg:px-12">
        <BrandMark href="/" />
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20">
        <p className="text-xs uppercase tracking-[0.28em] text-gold">Learning profile</p>
        <h1 className="mt-3 font-serif text-4xl text-forest">Tell the companion how to teach you</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          These answers personalize explanations of your own PDFs. They do not unlock quizzes,
          flashcards, or chat.
        </p>
        <div className="mt-10">
          <OnboardingForm />
        </div>
      </main>
    </div>
  );
}
