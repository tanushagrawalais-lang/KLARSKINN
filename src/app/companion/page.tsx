import { redirect } from "next/navigation";

import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser } from "@/server/services/auth-service";

export default async function CompanionPlaceholderPage() {
  const user = await getSessionUser(await readSessionToken());
  if (!user) {
    redirect("/sign-in");
  }
  if (!user.profileCompleted) {
    redirect("/onboarding");
  }

  return (
    <main>
      <h1>Companion</h1>
      <p>The learning companion is not available in Phase 1.</p>
    </main>
  );
}
