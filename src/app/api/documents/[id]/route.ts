import {
  deleteDocumentForCurrentUser,
  getDocumentForCurrentUser,
} from "@/server/services/document-service";
import { assertSameOrigin } from "@/server/http";
import { handleApi } from "@/server/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return handleApi(async () => {
    const { id } = await context.params;
    const document = await getDocumentForCurrentUser(id);
    return Response.json(document);
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    await deleteDocumentForCurrentUser(id);
    return Response.json({ ok: true });
  });
}
