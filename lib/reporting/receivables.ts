/**
 * Client-safe constants shared between the receivables report's server
 * query (app/(app)/reports/receivables-queries.ts) and its client filter
 * bar -- kept out of receivables-queries.ts itself so a "use client"
 * component importing just this type/labels doesn't pull that file's
 * `server-only` Supabase import into the browser bundle.
 */
export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export const agingBucketLabels: Record<AgingBucket, string> = {
  current: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};
