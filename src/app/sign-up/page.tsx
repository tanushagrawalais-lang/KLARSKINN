import Link from "next/link";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { BrandMark } from "@/components/brand";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-6 lg:px-12">
        <BrandMark />
      </header>
      <main className="flex flex-1 items-start justify-center px-6 py-10">
        <div className="w-full">
          <SignUpForm />
          <p className="mx-auto mt-6 max-w-md text-center text-sm text-ink-soft">
            <Link href="/" className="underline decoration-gold/70 underline-offset-4">
              Back to KLARSINN
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
