import { MetaApiError } from "./types";

export { MetaApiError };

const META_API_VERSION = "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const callCounts = new Map<string, { count: number; resetAt: number }>();
const MAX_CALLS_PER_HOUR = 200;

function checkRateLimit(accountId: string): void {
  const now = Date.now();
  const entry = callCounts.get(accountId);
  if (!entry || now > entry.resetAt) {
    callCounts.set(accountId, { count: 1, resetAt: now + 3600_000 });
    return;
  }
  if (entry.count >= MAX_CALLS_PER_HOUR) {
    throw new MetaApiError("Rate limit reached for this ad account", 17);
  }
  entry.count++;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function metaFetch<T>(
  path: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
    accountId?: string;
  },
): Promise<T> {
  const token = process.env.META_SYSTEM_TOKEN;
  if (!token) throw new Error("META_SYSTEM_TOKEN is not configured");

  if (options?.accountId) {
    checkRateLimit(options.accountId);
  }

  const url = new URL(`${META_BASE_URL}${path}`);
  url.searchParams.set("access_token", token);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions: RequestInit = {
    method: options?.method || "GET",
  };

  if (options?.body) {
    fetchOptions.method = fetchOptions.method === "GET" ? "POST" : fetchOptions.method;
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  let lastError: MetaApiError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    if (!response.ok || data.error) {
      const err = data.error;
      lastError = new MetaApiError(
        err?.message || "Unknown Meta API error",
        err?.code || response.status,
        err?.error_subcode,
        err?.fbtrace_id,
      );

      if (err?.code === 17 || err?.code === 2) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }

      throw lastError;
    }

    return data as T;
  }

  throw lastError || new MetaApiError("Max retries exceeded", 17);
}

export function mapMetaErrorToMessage(code: number): string {
  switch (code) {
    case 17:
      return "Meta API rate limit reached. Please try again later.";
    case 2:
      return "Temporary Meta API error. Please try again.";
    case 190:
      return "Meta connection expired. Please reconnect your ad account.";
    case 100:
      return "Invalid campaign parameters. Please check your input.";
    case 10:
      return "Missing Meta API permission. Contact admin.";
    default:
      return "An error occurred with Meta API. Please try again.";
  }
}
