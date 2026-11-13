/**
 * Single ioredis connection factory for BullMQ, built from REDIS_URL.
 *
 * REDIS_URL is read once, at process start, from the environment — never hardcoded (NFR-1,
 * secrets.md). No other module constructs its own Redis connection.
 */
import IORedis, { type Redis } from "ioredis";

let sharedConnection: Redis | null = null;

/** Lazily creates (or returns) the shared ioredis connection used by all BullMQ queues/workers. */
export function getRedisConnection(): Redis {
  if (!sharedConnection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        "REDIS_URL is not set. Configure it in your environment (see backend/.env.example).",
      );
    }
    sharedConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ for blocking connections
    });
  }
  return sharedConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
