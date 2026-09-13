import { clearSessionCookie, readSessionToken } from "@/lib/auth/cookies";
import { endSession } from "@/server/services/auth-service";
import { assertSameOrigin } from "@/server/http";
import { handleApi } from "@/server/errors";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const token = await readSessionToken();
    await endSession(token);
    await clearSessionCookie();
    return Response.json({ ok: true });
  });
}
