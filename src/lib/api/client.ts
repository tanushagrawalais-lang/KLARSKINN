export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function apiErrorMessage(payload: ApiErrorBody, fallback: string): string {
  return payload.error?.message ?? fallback;
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: string,
): Promise<T> {
  const response = await fetch(input, init);
  const payload = await parseJson<T & ApiErrorBody>(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, fallback));
  }
  return payload;
}
