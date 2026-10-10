import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const c = await b.newContext();
const a = await c.newPage(),
  other = await c.newPage();
try {
  for (const p of [a, other]) {
    await p.goto(process.env.FIELDLINE_URL || "http://localhost:3100");
    await p.getByRole("heading", { name: "The spread" }).waitFor();
    await p
      .locator(".sidebar nav")
      .getByRole("button", { name: "Hours", exact: true })
      .click();
  }
  const input = (p) =>
    p.getByRole("spinbutton", { name: "Pump hours for 184 1", exact: true });
  await input(a).fill("820");
  await input(other).fill("830");
  await input(other).press("Tab");
  await a.waitForFunction(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("fieldline-v1-demo-fleet1", 1);
        req.onsuccess = () => {
          const db = req.result;
          const get = db
            .transaction("state")
            .objectStore("state")
            .get("snapshot");
          get.onsuccess = () => {
            resolve(
              Object.values(get.result.confirmed).some(
                (r) =>
                  r.kind === "reading" &&
                  r.pumpId === "pump:184" &&
                  r.pumpHours === 830,
              ),
            );
            db.close();
          };
        };
      }),
  );
  assert.equal(await input(a).inputValue(), "820");
  await input(a).press("Tab");
  await a.locator(".conflict-banner").waitFor();
  assert.equal(await input(a).inputValue(), "830");
  await a.getByRole("button", { name: "Settings", exact: true }).click();
  assert.ok(
    await a
      .locator(".queue-item")
      .filter({ hasText: "reading · conflict" })
      .isVisible(),
  );
  console.log(
    "PASS: a meter edited while another tab saves keeps the newer reading and retains the stale draft as an explicit conflict.",
  );
} finally {
  await b.close();
}
