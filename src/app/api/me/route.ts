import { readSessionToken } from "@/lib/auth/cookies";
import { getSessionUser } from "@/server/services/auth-service";
import { handleApi } from "@/server/errors";

export async function GET() {
  return handleApi(async () => {
    const user = await getSessionUser(await readSessionToken());
    if (!user) {
      return Response.json({
        authenticated: false,
        user: null,
        profileCompleted: false,
      });
    }

    return Response.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      profileCompleted: user.profileCompleted,
    });
  });
}
