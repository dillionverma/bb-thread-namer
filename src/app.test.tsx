import { expect, it } from "vitest";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
it("keeps naming settings without a thread toolbar button", async () => {
  const app = await loadPluginApp(() => import("./app"));
  expect(app.threadHeaderActions).toHaveLength(0);
  expect(app.settingsSections).toHaveLength(1);
});
