export type AppEnv = "production" | "staging" | "development";

/**
 * Which copy of Gbam this is. Set NEXT_PUBLIC_APP_ENV=staging on the staging website. The
 * NEXT_PUBLIC_ value is baked into the site when it's built, so it works in browsers too.
 */
export function appEnv(): AppEnv {
  if (process.env.NEXT_PUBLIC_APP_ENV === "staging") {
    return "staging";
  }
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  return "development";
}

export function isStaging(): boolean {
  return appEnv() === "staging";
}
