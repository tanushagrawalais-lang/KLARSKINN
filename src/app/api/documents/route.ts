import { uploadPdfForCurrentUser, listDocumentsForCurrentUser } from "@/server/services/document-service";
import { assertSameOrigin } from "@/server/http";
import { badRequest, handleApi } from "@/server/errors";

export const runtime = "nodejs";

export async function GET() {
  return handleApi(async () => {
    const documents = await listDocumentsForCurrentUser();
    return Response.json({ documents });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const form = await request.formData().catch(() => null);
    if (!form) {
      throw badRequest("Expected a multipart upload");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw badRequest("A PDF file is required");
    }

    const titleValue = form.get("title");
    const title = typeof titleValue === "string" ? titleValue : undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const document = await uploadPdfForCurrentUser({
      bytes,
      filename: file.name,
      mimeType: file.type,
      title,
    });

    return Response.json(
      {
        id: document.id,
        status: document.status,
        title: document.title,
        createdAt: document.createdAt,
      },
      { status: 201 },
    );
  });
}
