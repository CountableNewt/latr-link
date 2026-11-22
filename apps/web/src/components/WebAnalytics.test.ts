import { expect, test } from "bun:test";
import { Analytics } from "@vercel/analytics/next";
import { WebAnalytics } from "./WebAnalytics";

test("analytics mounts only for the resolved production environment", () => {
  for (const appEnv of ["dev", "test", "local", "preview", ""]) {
    expect(WebAnalytics({ appEnv, deploymentEnv: "production" })).toBeNull();
  }
  for (const deploymentEnv of [undefined, "development", "preview"]) {
    expect(WebAnalytics({ appEnv: "prod", deploymentEnv })).toBeNull();
  }
  expect(WebAnalytics({ appEnv: "prod", deploymentEnv: "production" })?.type).toBe(Analytics);
});
