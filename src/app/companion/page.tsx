import { redirect } from "next/navigation";

import { CompanionStudio } from "@/components/companion/companion-studio";
import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser } from "@/server/services/auth-service";

export default async function CompanionPage() {
  const user = await getSessionUser(await readSessionToken());
  if (!user) {
    redirect("/sign-in");
  }
  if (!user.profileCompleted) {
    redirect("/onboarding");
  }

  return <CompanionStudio email={user.email} />;
}
