import { env } from "~/lib/env";

export interface LogEntry {
  level: "info" | "error" | "warn";
  requestId: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  accountId?: string;
  familyId?: string;
  errorCode?: string;
  message: string;
}

function sanitize(entry: LogEntry): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    ...entry,
  };
}

export function log(entry: LogEntry) {
  if (env.NODE_ENV === "test" && entry.level === "info") return;
  const output = sanitize(entry);
  const payload = JSON.stringify(output);
  if (entry.level === "error") {
    console.error(payload);
  } else if (entry.level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}
