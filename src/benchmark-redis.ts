import Redis from "ioredis";

async function runBenchmark() {
  const redis = new Redis(process.env.REDIS_URL as string);
  const keys = ["test_v1", "test_v2", "test_v3"];

  // Setup
  await Promise.all(keys.map((k) => redis.set(k, "1234567890")));

  console.log("--- Starting Benchmark (Remote Redis) ---");

  // Sequential
  const startSeq = Date.now();
  for (const k of keys) {
    await redis.get(k);
  }
  console.log(`Sequential get (x3) took: ${Date.now() - startSeq}ms`);

  // MGET
  const startMget = Date.now();
  await redis.mget(...keys);
  console.log(`Batched mget (x3) took: ${Date.now() - startMget}ms`);

  redis.disconnect();
}

runBenchmark().catch(console.error);
