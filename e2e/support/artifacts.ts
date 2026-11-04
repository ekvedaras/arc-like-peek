import type { Page, TestInfo } from "@playwright/test";

export async function captureScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<string> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
  return path;
}
