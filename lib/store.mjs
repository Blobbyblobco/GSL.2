// Storage backed by Upstash Redis's REST API (added to a Vercel project from Storage → Upstash).
// No client library: each call is one HTTPS request with a JSON command array.

const PREFIX = 'gsl:';

/** Build a store from env vars, or return null when Redis isn't connected yet. */
export function redisFromEnv(env = process.env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  async function command(...args) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Redis ${args[0]} failed: ${data.error || res.status}`);
    return data.result;
  }

  return {
    async get(key) {
      const raw = await command('GET', PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    },
    async set(key, value) {
      await command('SET', PREFIX + key, JSON.stringify(value));
    },
    /** Add to the front of a list, keeping only the newest `max` items. */
    async push(key, value, max) {
      await command('LPUSH', PREFIX + key, JSON.stringify(value));
      await command('LTRIM', PREFIX + key, 0, max - 1);
    },
    async list(key, count) {
      const items = await command('LRANGE', PREFIX + key, 0, count - 1);
      return (items || []).map((s) => JSON.parse(s));
    },
  };
}
