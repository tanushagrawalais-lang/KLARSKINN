import { writeSessionCookie } from "@/lib/auth/cookies";
import { registerAccount } from "@/server/services/auth-service";
import { assertSameOrigin, clientSubject } from "@/server/http";
import { handleApi } from "@/server/errors";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const body: unknown = await request.json().catch(() => null);
    const result = await registerAccount(body, clientSubject(request));
    await writeSessionCookie(result.session.sessionToken, result.session.expiresAt);

    return Response.json({
      user: result.user,
      profileCompleted: result.profileCompleted,
    });
  });
}
