import { PDFDocument } from "pdf-lib";

import { getEnv } from "@/lib/env";
import {
  AppError,
  badRequest,
  payloadTooLarge,
  unsupportedMediaType,
} from "@/server/errors";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

export type PdfValidationResult = {
  pageCount: number;
  mimeType: "application/pdf";
};

export type PdfLimits = {
  maxBytes: number;
  maxPages: number;
};

function hasPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.byteLength) {
    return false;
  }
  return PDF_MAGIC.every((value, index) => bytes[index] === value);
}

function looksLikePdf(filename: string, mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  const pdfMime =
    normalized === "application/pdf" ||
    normalized === "application/x-pdf" ||
    normalized === "";
  return pdfMime && filename.toLowerCase().endsWith(".pdf");
}

export async function validatePdfUpload(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  limits: PdfLimits = {
    maxBytes: getEnv().MAX_UPLOAD_BYTES,
    maxPages: getEnv().MAX_UPLOAD_PAGES,
  },
): Promise<PdfValidationResult> {
  if (bytes.byteLength > limits.maxBytes) {
    throw payloadTooLarge("File exceeds the maximum upload size");
  }

  if (!looksLikePdf(filename, mimeType) || !hasPdfMagic(bytes)) {
    throw unsupportedMediaType("Only PDF uploads are supported");
  }

  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const pageCount = pdf.getPageCount();
    if (pageCount < 1) {
      throw badRequest("PDF could not be read");
    }
    if (pageCount > limits.maxPages) {
      throw payloadTooLarge("PDF exceeds the maximum page count");
    }
    return { pageCount, mimeType: "application/pdf" };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw badRequest("PDF could not be read");
  }
}
