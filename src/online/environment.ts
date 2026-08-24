export type OnlineEnvironment = Readonly<Record<string, string | undefined>>;

export function getUpstashEnvironment(environment: OnlineEnvironment = process.env): {
  url: string | undefined;
  token: string | undefined;
} {
  return {
    url: firstConfigured(
      environment.UPSTASH_REDIS_REST_URL,
      environment.KV_REST_API_URL,
    ),
    token: firstConfigured(
      environment.UPSTASH_REDIS_REST_TOKEN,
      environment.KV_REST_API_TOKEN,
    ),
  };
}

export function getAblyApiKey(environment: OnlineEnvironment = process.env): string | undefined {
  return firstConfigured(environment.ABLY_API_KEY, environment.ABLY_API_Key);
}

function firstConfigured(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}
