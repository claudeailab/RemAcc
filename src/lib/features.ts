import { getSetting } from "./encryption";

export const FEATURE_KEYS = ["users", "payments", "m365", "email", "ai", "subscriptions"] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];
export type Features = Record<FeatureKey, boolean>;

export async function getFeatures(): Promise<Features> {
  const values = await Promise.all(FEATURE_KEYS.map(k => getSetting(`feature_${k}`)));
  return Object.fromEntries(
    FEATURE_KEYS.map((k, i) => [k, values[i] !== "false"])
  ) as Features;
}
