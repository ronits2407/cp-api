import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, clearCache, getCacheSize } from "../src/cache";
import { configure, resetConfig } from "../src/config";

beforeEach(() => {
  resetConfig();
  clearCache();
});

describe("cache", () => {
  it("coalesces concurrent fetches and caches the result", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    const [first, second] = await Promise.all([
      cachedFetch("cf:test", fetcher),
      cachedFetch("cf:test", fetcher),
    ]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache failed fetches", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce("ok");
    await expect(cachedFetch("cf:failure", fetcher)).rejects.toThrow("failed");
    await expect(cachedFetch("cf:failure", fetcher)).resolves.toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("applies configured capacity", async () => {
    configure({ cache: { maxSize: 2 } });
    await cachedFetch("cf:1", async () => 1);
    await cachedFetch("cf:2", async () => 2);
    await cachedFetch("cf:3", async () => 3);
    expect(getCacheSize()).toBe(2);
  });
});
