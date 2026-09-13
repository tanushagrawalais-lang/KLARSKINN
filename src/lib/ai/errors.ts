export class AIProviderError extends Error {
  readonly code: "invalid_output" | "upstream" | "rate_limited" | "not_implemented";
  readonly retryable: boolean;

  constructor(params: {
    code: "invalid_output" | "upstream" | "rate_limited" | "not_implemented";
    message: string;
    retryable: boolean;
  }) {
    super(params.message);
    this.name = "AIProviderError";
    this.code = params.code;
    this.retryable = params.retryable;
  }
}
