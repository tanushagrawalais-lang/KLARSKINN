import { getIntentOptionsForCurrentUser } from "@/server/services/explanation-service";
import { handleApi } from "@/server/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return handleApi(async () => {
    const { id } = await context.params;
    const result = await getIntentOptionsForCurrentUser(id);
    return Response.json(result);
  });
}
