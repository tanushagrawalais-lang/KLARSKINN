export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly expose: boolean;

  constructor(params: {
    code: AppErrorCode;
    message: string;
    status: number;
    expose?: boolean;
  }) {
    super(params.message);
    this.name = "AppError";
    this.code = params.code;
    this.status = params.status;
    this.expose = params.expose ?? params.status < 500;
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError({
    code: "NOT_FOUND",
    message,
    status: 404,
  });
}

export function badRequest(message: string): AppError {
  return new AppError({
    code: "BAD_REQUEST",
    message,
    status: 400,
  });
}

export function unauthorized(message = "Authentication required"): AppError {
  return new AppError({
    code: "UNAUTHORIZED",
    message,
    status: 401,
  });
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError({
    code: "FORBIDDEN",
    message,
    status: 403,
  });
}

export function conflict(message: string): AppError {
  return new AppError({
    code: "CONFLICT",
    message,
    status: 409,
  });
}

export function tooManyRequests(retryAfterSeconds?: number): AppError {
  return new AppError({
    code: "RATE_LIMITED",
    message: retryAfterSeconds
      ? `Too many attempts. Retry in ${retryAfterSeconds} seconds.`
      : "Too many attempts. Try again later.",
    status: 429,
  });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.expose ? error.message : "Request failed",
        },
      },
      { status: error.status },
    );
  }

  return Response.json(
    {
      error: {
        code: "INTERNAL",
        message: "Internal server error",
      },
    },
    { status: 500 },
  );
}

export async function handleApi(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      return toErrorResponse(error);
    }

    const { logger } = await import("@/lib/logger");
    logger.error("api.unhandled", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return toErrorResponse(error);
  }
}
