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
