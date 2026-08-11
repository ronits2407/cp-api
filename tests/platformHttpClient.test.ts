import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../src/cache";
import { configure, resetConfig } from "../src/config";
import { CodeChef } from "../src/platforms/codechef";
import { LeetCode } from "../src/platforms/leetcode";
import { Health } from "../src/unified/health";
import { HttpClient } from "../src/utils/httpClient";
import {
  getPlatformHttpClient,
  resetPlatformHttpClients,
} from "../src/utils/platformHttpClient";
import { RateLimitError } from "../src/utils/rateLimiter";

let server: Server | undefined;

async function listen(
  handler: Parameters<typeof createServer>[0],
): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

beforeEach(() => {
  resetPlatformHttpClients();
  resetConfig();
  clearCache();
});

afterEach(async () => {
  vi.restoreAllMocks();
  resetPlatformHttpClients();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  server = undefined;
});

describe("platform HTTP clients", () => {
  it("applies the configured limiter to platform requests", async () => {
    let requests = 0;
    const origin = await listen((_request, response) => {
      requests++;
      response.setHeader("Content-Type", "application/json");
      response.end('{"ok":true}');
    });
    configure({
      rateLimit: {
        enabled: true,
        onRateLimit: "throw",
        platforms: { codeforces: { requestsPerSecond: 0.01, burst: 1 } },
      },
      http: { maxRetries: 0 },
    });

    const client = getPlatformHttpClient("codeforces");
    await client.get(`${origin}/first`);
    await expect(client.get(`${origin}/second`)).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(requests).toBe(1);
  });

  it("rebuilds a platform client after configuration changes", () => {
    const original = getPlatformHttpClient("atcoder");
    configure({ http: { timeout: 1234 } });
    expect(getPlatformHttpClient("atcoder")).not.toBe(original);
  });

  it("retries transient responses through the shared HTTP client", async () => {
    let requests = 0;
    const origin = await listen((_request, response) => {
      requests++;
      if (requests === 1) {
        response.statusCode = 503;
        response.end("busy");
        return;
      }
      response.setHeader("Content-Type", "application/json");
      response.end('{"ok":true}');
    });
    configure({
      rateLimit: { enabled: false },
      http: { maxRetries: 1, retryDelay: 1 },
    });

    await expect(
      getPlatformHttpClient("atcoder").get(`${origin}/retry`),
    ).resolves.toEqual({ ok: true });
    expect(requests).toBe(2);
  });

  it("routes CodeChef API calls through the shared client", async () => {
    configure({ cache: { enabled: false }, rateLimit: { enabled: false } });
    const get = vi.spyOn(HttpClient.prototype, "get").mockResolvedValue({
      future_contests: [
        {
          contest_code: "START100",
          contest_name: "Starters 100",
          contest_start_date_iso: "2026-08-12T10:00:00.000Z",
          contest_end_date_iso: "2026-08-12T12:00:00.000Z",
          distinct_users: 0,
        },
      ],
      present_contests: [],
      past_contests: [],
    });

    const contests = await new CodeChef().getUpcomingContests();

    expect(get).toHaveBeenCalledWith(
      "https://www.codechef.com/api/list/contests/all",
    );
    expect(contests[0]).toMatchObject({
      platform: "CODECHEF",
      id: "START100",
    });
  });

  it("routes LeetCode GraphQL calls through the shared client", async () => {
    configure({ cache: { enabled: false }, rateLimit: { enabled: false } });
    const post = vi.spyOn(HttpClient.prototype, "post").mockResolvedValue({
      data: {
        upcomingContests: [
          {
            title: "Weekly Contest 500",
            titleSlug: "weekly-contest-500",
            startTime: 1_786_531_200,
            duration: 5_400,
          },
        ],
      },
    });

    const contests = await new LeetCode().getUpcomingContests();

    expect(post).toHaveBeenCalledWith(
      "https://leetcode.com/graphql",
      expect.objectContaining({ query: expect.any(String), variables: {} }),
      { "Content-Type": "application/json" },
    );
    expect(contests[0]).toMatchObject({
      platform: "LEETCODE",
      id: "weekly-contest-500",
    });
  });

  it("routes the CodeChef health probe through the shared client", async () => {
    configure({ rateLimit: { enabled: false } });
    const get = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValue({ status: "success" });

    await expect(new Health().check("CODECHEF")).resolves.toMatchObject([
      { platform: "CODECHEF", reachable: true },
    ]);
    expect(get).toHaveBeenCalledWith(
      "https://www.codechef.com/api/list/contests/all",
      undefined,
      { "Cache-Control": "no-cache" },
      { timeout: 8_000 },
    );
  });

  it("routes the LeetCode health probe through the shared client", async () => {
    configure({ rateLimit: { enabled: false } });
    const post = vi
      .spyOn(HttpClient.prototype, "post")
      .mockResolvedValue({ data: { __typename: "Query" } });

    await expect(new Health().check("LEETCODE")).resolves.toMatchObject([
      { platform: "LEETCODE", reachable: true },
    ]);
    expect(post).toHaveBeenCalledWith(
      "https://leetcode.com/graphql",
      { query: "{ __typename }" },
      { "Content-Type": "application/json" },
      { timeout: 8_000 },
    );
  });
});
