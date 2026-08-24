import { describe, expect, it } from "vitest";

import { getAblyApiKey, getUpstashEnvironment } from "./environment";

describe("online service environment", () => {
  it("accepts the Upstash and Vercel Redis variable conventions", () => {
    expect(getUpstashEnvironment({
      KV_REST_API_URL: " https://vercel-redis.example ",
      KV_REST_API_TOKEN: " vercel-token ",
    })).toEqual({ url: "https://vercel-redis.example", token: "vercel-token" });

    expect(getUpstashEnvironment({
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
      KV_REST_API_URL: "https://fallback.example",
      KV_REST_API_TOKEN: "fallback-token",
    })).toEqual({ url: "https://upstash.example", token: "upstash-token" });
  });

  it("accepts the existing Ably key spelling while preferring the canonical name", () => {
    expect(getAblyApiKey({ ABLY_API_Key: " existing-key " })).toBe("existing-key");
    expect(getAblyApiKey({ ABLY_API_KEY: "canonical", ABLY_API_Key: "fallback" })).toBe("canonical");
  });
});
