import path from "path";

/**
 * Resolves the app's writable storage directory.
 *
 * Order:
 *  1. DATA_DIR env override (recommended for hosted deployments)
 *  2. /tmp/escrow-data on Vercel (only writable location on serverless)
 *  3. ./data for local/self-hosted runs
 *
 * NOTE: on serverless platforms /tmp is per-instance and wiped on cold
 * starts — data is NOT durable there. For a persistent deployment, host on
 * a platform with a persistent disk or migrate to a hosted database.
 */
export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.VERCEL) return "/tmp/escrow-data";
  return path.join(process.cwd(), "data");
}
