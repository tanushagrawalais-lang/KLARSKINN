import { getUnderstandingForCurrentUser } from "@/server/services/understanding-service";
import { handleApi } from "@/server/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return handleApi(async () => {
    const { id } = await context.params;
    const understanding = await getUnderstandingForCurrentUser(id);
    return Response.json(understanding);
  });
}
