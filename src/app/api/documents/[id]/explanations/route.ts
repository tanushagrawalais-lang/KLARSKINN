import { listExplanationsForCurrentUser } from "@/server/services/explanation-service";
import { handleApi } from "@/server/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return handleApi(async () => {
    const { id } = await context.params;
    const explanations = await listExplanationsForCurrentUser(id);
    return Response.json({ explanations });
  });
}
