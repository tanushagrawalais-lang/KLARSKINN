import { requireCompletedProfile } from "@/server/auth";
import { handleApi } from "@/server/errors";

export async function GET() {
  return handleApi(async () => {
    const user = await requireCompletedProfile();
    return Response.json({ ok: true, userId: user.id });
  });
}
