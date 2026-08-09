/**
 * Meta write-path source (docs/07 §Connectors, docs/09 §2). The MUTATION twin of
 * http-source.ts: it reads the fields we may edit and POSTs edits to the Graph
 * API. Like the read source, the access token lives ONLY here at the L1 boundary
 * — it is redacted from every error string and never returned upward, placed in a
 * warehouse row, an MCP payload, a log, or a prompt. `fetch` and `sleep` are
 * injectable so the write path is fully testable without a live ad account.
 */

/** The subset of Graph fields the write path reads or edits, as raw strings. */
export type MetaFields = Record<string, string>;

/** Port abstracting Meta Graph API writes (live) or a fake (test). */
export interface MetaWriteSource {
  /** Fresh read of specific fields on /{external-id} (e.g. budget/status). */
  getFields(externalId: string, fields: string[]): Promise<MetaFields>;
  /**
   * POST an edit to /{external-id}. Callers pass ABSOLUTE target values so the
   * write is idempotent and safe to retry. Returns the raw platform response.
   */
  updateEntity(externalId: string, fields: MetaFields): Promise<Record<string, unknown>>;
}

export interface HttpMetaWriteSourceOptions {
  accessToken: string;
  apiVersion?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
}

export class HttpMetaWriteSource implements MetaWriteSource {
  private readonly token: string;
  private readonly version: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(opts: HttpMetaWriteSourceOptions) {
    if (!opts.accessToken) throw new Error("Meta access token is required");
    this.token = opts.accessToken;
    this.version = opts.apiVersion ?? "v21.0";
    this.base = opts.baseUrl ?? "https://graph.facebook.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
  }

  async getFields(externalId: string, fields: string[]): Promise<MetaFields> {
    const u = new URL(`${this.base}/${this.version}/${externalId}`);
    u.searchParams.set("access_token", this.token);
    u.searchParams.set("fields", fields.join(","));
    const raw = (await this.request("GET", u.toString())) as Record<string, unknown>;
    const out: MetaFields = {};
    for (const f of fields) {
      const v = raw[f];
      if (v != null) out[f] = String(v);
    }
    return out;
  }

  async updateEntity(externalId: string, fields: MetaFields): Promise<Record<string, unknown>> {
    const url = `${this.base}/${this.version}/${externalId}`;
    const body = new URLSearchParams({ access_token: this.token, ...fields });
    const res = (await this.request("POST", url, body)) as Record<string, unknown>;
    return res;
  }

  /**
   * Issue a request with bounded retry on 429 / 5xx (exponential backoff). Both
   * verbs are safe to retry: GET is a read, and every POST on this path carries
   * absolute values, so a retried edit converges rather than compounds.
   */
  private async request(method: "GET" | "POST", url: string, body?: URLSearchParams): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(
        url,
        method === "POST"
          ? { method, body, headers: { "content-type": "application/x-www-form-urlencoded" } }
          : { method },
      );
      if (res.ok) return res.json();
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= this.maxRetries) {
        throw new Error(`Meta API ${res.status} for ${method} ${redact(url)}`);
      }
      await this.sleep(this.baseDelayMs * 2 ** attempt);
      attempt++;
    }
  }
}

/** Strip the access token from a URL before it appears in any error/log. */
function redact(url: string): string {
  return url.replace(/access_token=[^&]+/, "access_token=REDACTED");
}
