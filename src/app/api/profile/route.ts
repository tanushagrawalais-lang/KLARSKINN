import { getProfileForUser, updateProfileForUser } from "@/server/services/profile-service";
import { requireUserId } from "@/server/auth";
import { assertSameOrigin } from "@/server/http";
import { handleApi } from "@/server/errors";

export async function GET() {
  return handleApi(async () => {
    const userId = await requireUserId();
    const profile = await getProfileForUser(userId);
    return Response.json(profile);
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const userId = await requireUserId();
    const body: unknown = await request.json().catch(() => null);
    const profile = await updateProfileForUser(userId, body);
    return Response.json(profile);
  });
}
