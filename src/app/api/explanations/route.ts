import { generateExplanationForCurrentUser } from "@/server/services/explanation-service";
import { assertSameOrigin } from "@/server/http";
import { handleApi } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const body: unknown = await request.json().catch(() => null);
    const explanation = await generateExplanationForCurrentUser(body);
    return Response.json(explanation, { status: 201 });
  });
}
