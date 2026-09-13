const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|api[_-]?key|cookie|hash)/i;

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, "[redacted]"];
        }
        return [key, sanitizeValue(nested)];
      },
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...((sanitizeValue(fields) as LogFields) ?? {}),
  };

  const serialized = JSON.stringify(line);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
