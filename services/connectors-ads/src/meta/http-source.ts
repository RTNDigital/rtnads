import type {
  MetaRawSource,
  MetaAccount,
  MetaCampaign,
  MetaAdSet,
  MetaAd,
  MetaInsight,
} from "../types.js";

/**
 * Live Meta Graph API implementation of the MetaRawSource port (docs/07 §L1). The
 * same pure mapper (mapper.ts) consumes its output, so the fixture and live paths
 * are identical downstream.
 *
 * Credentials: the access token is passed in by the caller (loaded from the
 * secrets vault / env) and lives ONLY in this L1 boundary — it is never placed in
 * warehouse rows, MCP payloads, logs or prompts (docs/09 §2). `fetch` and `sleep`
 * are injectable so the connector is fully testable without a live account.
 */

export interface HttpMetaSourceOptions {
  accessToken: string;
  apiVersion?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
}

interface Page<T> {
  data: T[];
  paging?: { next?: string };
}

const CONVERSION_FIELDS = "spend,impressions,clicks,actions,action_values";

export class HttpMetaSource implements MetaRawSource {
  private readonly token: string;
  private readonly version: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(opts: HttpMetaSourceOptions) {
    if (!opts.accessToken) throw new Error("Meta access token is required");
    this.token = opts.accessToken;
    this.version = opts.apiVersion ?? "v21.0";
    this.base = opts.baseUrl ?? "https://graph.facebook.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
  }

  private acct(id: string): string {
    return id.startsWith("act_") ? id : `act_${id}`;
  }

  /** GET a URL with bounded retry on 429 / 5xx (exponential backoff). */
  private async getUrl(url: string): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(url);
      if (res.ok) return res.json();
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= this.maxRetries) {
        throw new Error(`Meta API ${res.status} for ${redact(url)}`);
      }
      await this.sleep(this.baseDelayMs * 2 ** attempt);
      attempt++;
    }
  }

  private url(path: string, params: Record<string, string>): string {
    const u = new URL(`${this.base}/${this.version}/${path}`);
    u.searchParams.set("access_token", this.token);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  /** Follow `paging.next` until exhausted, accumulating `data`. */
  private async getAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = this.url(path, { limit: "200", ...params });
    while (url) {
      const page = (await this.getUrl(url)) as Page<T>;
      out.push(...(page.data ?? []));
      url = page.paging?.next;
    }
    return out;
  }

  async fetchAccount(accountExternalId: string): Promise<MetaAccount> {
    const acct = this.acct(accountExternalId);
    const raw = (await this.getUrl(
      this.url(acct, { fields: "name,currency,timezone_name,account_status" }),
    )) as Omit<MetaAccount, "id"> & { id?: string };
    return { id: raw.id ?? acct, name: raw.name, currency: raw.currency, timezone_name: raw.timezone_name, account_status: raw.account_status };
  }

  fetchCampaigns(accountExternalId: string): Promise<MetaCampaign[]> {
    return this.getAll<MetaCampaign>(`${this.acct(accountExternalId)}/campaigns`, { fields: "name,objective,effective_status" });
  }

  fetchAdSets(accountExternalId: string): Promise<MetaAdSet[]> {
    return this.getAll<MetaAdSet>(`${this.acct(accountExternalId)}/adsets`, { fields: "campaign_id,name,effective_status,daily_budget,lifetime_budget" });
  }

  async fetchAds(accountExternalId: string): Promise<MetaAd[]> {
    const rows = await this.getAll<MetaAd & { creative?: { id: string } }>(
      `${this.acct(accountExternalId)}/ads`,
      { fields: "adset_id,name,effective_status,creative{id}" },
    );
    return rows;
  }

  fetchInsights(accountExternalId: string, window: { start: string; end: string }): Promise<MetaInsight[]> {
    return this.getAll<MetaInsight>(`${this.acct(accountExternalId)}/insights`, {
      level: "ad",
      fields: CONVERSION_FIELDS,
      time_range: JSON.stringify({ since: window.start, until: window.end }),
      time_increment: "1",
    });
  }
}

/** Strip the access token from a URL before it appears in any error/log. */
function redact(url: string): string {
  return url.replace(/access_token=[^&]+/, "access_token=REDACTED");
}
