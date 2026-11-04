import type { Locator } from "@playwright/test";

export async function shiftClick(target: Locator): Promise<void> {
  await target.click({ modifiers: ["Shift"] });
}
