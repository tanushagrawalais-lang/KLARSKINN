import Link from "next/link";

import { BrandMark } from "@/components/brand";
import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser } from "@/server/services/auth-service";

export default async function HomePage() {
  const user = await getSessionUser(await readSessionToken());
  const nextHref = user ? (user.profileCompleted ? "/companion" : "/onboarding") : "/sign-up";

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-6 lg:px-12">
        <BrandMark />
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <Link
              className="rounded-sm bg-forest px-4 py-2 font-semibold text-paper"
              href={nextHref}
            >
              Open companion
            </Link>
          ) : (
            <>
              <Link className="text-ink-soft hover:text-ink" href="/sign-in">
                Sign in
              </Link>
              <Link className="rounded-sm bg-forest px-4 py-2 font-semibold text-paper" href="/sign-up">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:px-12 lg:pt-16">
        <section>
          <p className="text-xs uppercase tracking-[0.32em] text-gold">Private study companion</p>
          <h1 className="mt-5 max-w-xl font-serif text-5xl leading-[1.1] text-forest sm:text-6xl">
            Understand the pages. Then ask for the explanation.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">
            KLARSINN reads an academic PDF, builds a versioned understanding grounded in those pages,
            and writes a personalized explanation for the question you actually have.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="rounded-sm bg-forest px-5 py-3 text-sm font-semibold text-paper" href={nextHref}>
              {user ? "Continue" : "Begin with an account"}
            </Link>
            {!user ? (
              <Link
                className="rounded-sm border border-ink/15 px-5 py-3 text-sm font-medium text-ink"
                href="/sign-in"
              >
                I already have an account
              </Link>
            ) : null}
          </div>
        </section>

        <ol className="space-y-4 self-start rounded-sm border border-ink/10 bg-paper-3 p-6 shadow-lift">
          {[
            { step: "01", title: "Sign in", copy: "Email and password. Sessions stay on the server." },
            { step: "02", title: "Learning profile", copy: "Style, detail, and how you prefer explanations." },
            { step: "03", title: "Upload a PDF", copy: "Up to 20 MB and 50 pages. Private storage only." },
            { step: "04", title: "Wait for understanding", copy: "Concepts are tied to source pages before anything is explained." },
            { step: "05", title: "Choose an intent", copy: "Ask for a concept, a section, a simplification, or a custom question." },
            { step: "06", title: "Read with receipts", copy: "The explanation cites the pages that support it." },
          ].map((item) => (
            <li key={item.step} className="grid grid-cols-[3rem_1fr] gap-3 border-b border-ink/10 pb-4 last:border-0 last:pb-0">
              <span className="font-serif text-xl text-gold">{item.step}</span>
              <span>
                <span className="block font-medium text-ink">{item.title}</span>
                <span className="text-sm text-ink-soft">{item.copy}</span>
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
