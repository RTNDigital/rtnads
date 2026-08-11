import { describe, it, expect } from "vitest";
import { HttpMetaSource } from "./http-source.js";
import { MetaConnector } from "./connector.js";
import { NormalizedSync } from "@rtnads/contracts";

/**
 * The live Meta source is tested with an INJECTED fetch — no network, no account.
 * Canned Graph responses prove pagination, retry, token redaction and that the
 * pure mapper yields a valid NormalizedSync from live-shaped payloads.
 */

type Handler = (url: string) => { status: number; body: unknown };

function fakeFetch(routes: Handler): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const { status, body } = routes(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

const noSleep = async () => {};

describe("HttpMetaSource", () => {
  it("never puts the access token in an error message", async () => {
    const src = new HttpMetaSource({
      accessToken: "SECRET_TOKEN",
      fetchImpl: fakeFetch(() => ({ status: 400, body: {} })),
      sleep: noSleep,
    });
    await expect(src.fetchAccount("act_1001")).rejects.toThrow(/REDACTED/);
    await expect(src.fetchAccount("act_1001")).rejects.not.toThrow(/SECRET_TOKEN/);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const src = new HttpMetaSource({
      accessToken: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch(() => {
        calls++;
        return calls < 3
          ? { status: 429, body: {} }
          : { status: 200, body: { id: "act_1001", name: "A", currency: "GBP" } };
      }),
    });
    const acct = await src.fetchAccount("act_1001");
    expect(acct.currency).toBe("GBP");
    expect(calls).toBe(3);
  });

  it("follows paging.next across pages", async () => {
    const src = new HttpMetaSource({
      accessToken: "t",
      sleep: noSleep,
      fetchImpl: fakeFetch((url) => {
        if (url.includes("/campaigns") && !url.includes("after=")) {
          return { status: 200, body: { data: [{ id: "c1", name: "C1" }], paging: { next: "https://graph.facebook.com/v21.0/act_1001/campaigns?after=CURSOR&access_token=t" } } };
        }
        return { status: 200, body: { data: [{ id: "c2", name: "C2" }] } };
      }),
    });
    const camps = await src.fetchCampaigns("act_1001");
    expect(camps.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("prefixes a bare account id with act_", async () => {
    let seen = "";
    const src = new HttpMetaSource({
      accessToken: "t", sleep: noSleep,
      fetchImpl: fakeFetch((url) => { seen = url; return { status: 200, body: { id: "act_1001", name: "A", currency: "GBP" } }; }),
    });
    await src.fetchAccount("1001");
    expect(seen).toContain("/act_1001?");
  });

  it("produces a valid NormalizedSync end-to-end from live-shaped payloads", async () => {
    const routes: Handler = (url) => {
      if (/\/act_1001\?/.test(url)) return { status: 200, body: { id: "act_1001", name: "RhinoUK", currency: "GBP", timezone_name: "Europe/London", account_status: 1 } };
      if (url.includes("/campaigns")) return { status: 200, body: { data: [{ id: "camp_2001", name: "Rhino-UK-Leads-Q3", objective: "OUTCOME_LEADS", effective_status: "ACTIVE" }] } };
      if (url.includes("/adsets")) return { status: 200, body: { data: [{ id: "adset_3001", campaign_id: "camp_2001", name: "A", effective_status: "ACTIVE", daily_budget: "5000" }] } };
      if (url.includes("/ads")) return { status: 200, body: { data: [{ id: "ad_4001", adset_id: "adset_3001", name: "Ad", effective_status: "ACTIVE", creative: { id: "cre_5001" } }] } };
      if (url.includes("/insights")) return { status: 200, body: { data: [{ level: "ad", ad_id: "ad_4001", adset_id: "adset_3001", campaign_id: "camp_2001", account_id: "act_1001", date_start: "2026-07-01", date_stop: "2026-07-01", spend: "42.10", impressions: "3120", clicks: "88", actions: [{ action_type: "lead", value: "3" }] }] } };
      return { status: 404, body: {} };
    };
    const source = new HttpMetaSource({ accessToken: "t", sleep: noSleep, fetchImpl: fakeFetch(routes) });
    const connector = new MetaConnector(source);
    const sync = await connector.pull({ client_id: "11111111-1111-1111-1111-111111111111", account_external_id: "act_1001", window: { start: "2026-07-01", end: "2026-07-01" } });

    expect(() => NormalizedSync.parse(sync)).not.toThrow();
    expect(sync.account.currency).toBe("GBP");
    expect(sync.campaigns).toHaveLength(1);
    expect(sync.ad_sets[0]).toMatchObject({ budget_minor: 5000, budget_type: "daily" });
    expect(sync.facts[0]).toMatchObject({ entity_type: "ad", spend_minor: 4210, conversions: 3 });
  });
});
