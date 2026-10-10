import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
const base = process.env.FIELDLINE_URL || "http://localhost:3100";
const output =
  process.env.FIELDLINE_TEST_OUTPUT || "/tmp/fieldline-verification";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Chicago",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nav = async (name) =>
  page
    .locator(".sidebar nav")
    .getByRole("button", { name, exact: true })
    .click();
const snapshot = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("fieldline-v1-demo-fleet1", 1);
        req.onsuccess = () => {
          const db = req.result;
          const get = db
            .transaction("state")
            .objectStore("state")
            .get("snapshot");
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(50);
  }
  throw Error("State did not settle");
};
const open = async (number) =>
  page
    .locator(".directory button")
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${number}$`) }),
    })
    .click();
const close = () =>
  page.getByRole("button", { name: "Close dialog", exact: true }).click();
try {
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.goto(base);
  await page.getByRole("heading", { name: "The spread" }).waitFor();
  assert.equal(await page.locator(".roster-row").count(), 18);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await nav("Hours");
  assert.equal(await page.locator(".hours-row").count(), 22);
  const pump = page.getByRole("spinbutton", {
    name: "Pump hours for 184 1",
    exact: true,
  });
  const deck = page.getByRole("spinbutton", {
    name: "Deck hours for 184 1",
    exact: true,
  });
  await pump.fill("800");
  await pump.press("Tab");
  await deck.fill("700");
  await deck.press("Tab");
  await wait(async () =>
    Object.values((await snapshot()).confirmed).some(
      (r) =>
        r.kind === "reading" &&
        r.pumpId === "pump:184" &&
        r.pumpHours === 800 &&
        r.deckHours === 700,
    ),
  );
  await page
    .getByRole("button", { name: "Finalize sheet", exact: true })
    .click();
  await wait(async () => await pump.isDisabled());
  await page.getByRole("button", { name: "Reopen sheet", exact: true }).click();
  await wait(async () => !(await pump.isDisabled()));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause demo sync", exact: true })
    .click();
  await close();
  await pump.fill("810");
  await pump.press("Tab");
  await wait(async () => (await snapshot()).commands.length === 1);
  await page.reload();
  await page.getByRole("heading", { name: "The spread" }).waitFor();
  await nav("Hours");
  assert.equal(await pump.inputValue(), "810");
  await wait(async () => (await snapshot()).commands.length === 0);
  await nav("Spread");
  await open("184");
  await page
    .getByRole("button", { name: "Start spot check", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enter results", exact: true })
    .waitFor();
  const before = Object.values((await snapshot()).confirmed).find(
    (r) => r.kind === "issue" && r.pumpId === "pump:184" && !r.resolvedAt,
  );
  assert.ok(before.downAt);
  await page
    .getByRole("button", { name: "Enter results", exact: true })
    .click();
  await page
    .getByLabel("Hole 3 condition", { exact: true })
    .selectOption("BAD");
  await page.getByLabel("Hole 3 part", { exact: true }).selectOption("VALVE");
  await page.getByRole("button", { name: "Save results", exact: true }).click();
  await page
    .getByRole("button", { name: "Convert to failure", exact: true })
    .click();
  await wait(async () => {
    const r = (await snapshot()).confirmed[before.id];
    return r.type === "problem" && r.findings[0]?.condition === "BAD";
  });
  assert.equal((await snapshot()).confirmed[before.id].downAt, before.downAt);
  await page.getByRole("button", { name: "Report issue", exact: true }).click();
  await page.getByLabel("Component", { exact: true }).selectOption("D-RINGS");
  await page.getByRole("button", { name: "Report issue", exact: true }).click();
  await wait(
    async () =>
      Object.values((await snapshot()).confirmed).filter(
        (r) => r.kind === "issue" && r.pumpId === "pump:184" && !r.resolvedAt,
      ).length === 2,
  );
  await page
    .getByRole("button", { name: "Back running", exact: true })
    .first()
    .click();
  await wait(
    async () =>
      Object.values((await snapshot()).confirmed).filter(
        (r) => r.kind === "issue" && r.pumpId === "pump:184" && !r.resolvedAt,
      ).length === 1,
  );
  await page.getByRole("button", { name: "Move / swap", exact: true }).click();
  await page
    .getByLabel("Replacement pump (optional swap)", { exact: true })
    .selectOption("pump:209");
  await page
    .getByLabel("Why was this pump pulled?", { exact: true })
    .fill("Packing leak — pull for shop");
  await page
    .getByRole("button", { name: "Confirm movement", exact: true })
    .click();
  await wait(
    async () => (await snapshot()).confirmed["station:1"].pumpId === "pump:209",
  );
  await page
    .getByRole("button", { name: "Record completed service", exact: true })
    .click();
  await page
    .getByLabel("Completed work notes", { exact: true })
    .fill("Changed packing H3; pressure tested");
  await page
    .getByRole("button", { name: "Save completed service", exact: true })
    .click();
  await wait(async () =>
    Object.values((await snapshot()).confirmed).some(
      (r) =>
        r.kind === "service" &&
        r.pumpId === "pump:184" &&
        r.notes.includes("pressure tested"),
    ),
  );
  await page.getByRole("button", { name: /Show permanent history/ }).click();
  assert.match(
    await page.locator(".timeline").innerText(),
    /Station 1 → Standby/,
  );
  assert.match(
    await page.locator(".timeline").innerText(),
    /Pump 810 \/ Deck 700/,
  );
  await close();
  await nav("Work");
  await page
    .getByRole("button", { name: "Mechanics · read-only", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Manage issue", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .locator(".work-item input,.work-item select,.work-item textarea")
      .count(),
    0,
  );
  await nav("Records");
  await page.getByLabel("Operational date", { exact: true }).fill("2026-10-01");
  await page
    .getByLabel("Outgoing shift notes", { exact: true })
    .fill("Pump 184 pulled; watch H3");
  await page
    .getByRole("button", { name: "Capture live handoff", exact: true })
    .click();
  await wait(async () =>
    Object.values((await snapshot()).confirmed).some(
      (r) => r.kind === "handoff",
    ),
  );
  const handoff = Object.values((await snapshot()).confirmed).find(
    (r) => r.kind === "handoff",
  );
  assert.equal(handoff.date, "2026-10-10");
  assert.equal(handoff.shift, "day");
  await page.getByLabel("Operational date", { exact: true }).fill("2026-10-10");
  for (const value of ["hours", "down", "handoff", "spread", "history"]) {
    await page.getByLabel("Report", { exact: true }).selectOption(value);
    assert.ok(await page.locator(".report-section").isVisible());
  }
  await page.getByLabel("Report", { exact: true }).selectOption("handoff");
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  assert.equal(await page.locator(".handoff-composer").isVisible(), false);
  await page.pdf({
    path: `${output}/handoff.pdf`,
    format: "Letter",
    landscape: true,
  });
  await page.emulateMedia({ media: "screen" });
  await nav("Spread");
  const tab = await context.newPage();
  await tab.goto(base);
  await tab.getByRole("heading", { name: "The spread" }).waitFor();
  await open("209");
  await page
    .getByRole("button", { name: "Edit pump attributes", exact: true })
    .click();
  await page
    .getByLabel("Control software", { exact: true })
    .selectOption("MDT");
  await page
    .getByRole("button", { name: "Save attributes", exact: true })
    .click();
  await wait(async () => (await snapshot()).commands.length === 0);
  await tab
    .locator(".directory button")
    .filter({ has: tab.locator("strong", { hasText: /^209$/ }) })
    .click();
  await tab
    .getByRole("button", { name: "Edit pump attributes", exact: true })
    .click();
  await tab.getByLabel("Control software", { exact: true }).waitFor();
  assert.equal(
    await tab.getByLabel("Control software", { exact: true }).inputValue(),
    "MDT",
  );
  await tab.close();
  await close();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause demo sync", exact: true })
    .click();
  await close();
  await open("209");
  await page
    .getByRole("button", { name: "Edit pump attributes", exact: true })
    .click();
  await page
    .getByLabel("Control software", { exact: true })
    .selectOption("ERAD");
  await page
    .getByRole("button", { name: "Save attributes", exact: true })
    .click();
  await close();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Simulate newer server revision",
      exact: true,
    })
    .click();
  await page.locator(".queue-item").filter({ hasText: "conflict" }).waitFor();
  assert.equal((await snapshot()).commands[0].status, "conflict");
  await close();
  assert.ok(await page.locator(".conflict-banner").isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: false });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Hours", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await page.screenshot({
    path: `${output}/mobile-hours.png`,
    fullPage: false,
  });
  if (process.env.FIELDLINE_PRODUCTION === "1") {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.getByRole("heading", { name: "The spread" }).waitFor();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "The spread" }).waitFor();
    assert.ok(await page.evaluate(() => navigator.serviceWorker.controller));
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "Hours", exact: true })
      .click();
    const standby = page.getByRole("spinbutton", {
      name: "Pump hours for 222 standby",
      exact: true,
    });
    await standby.fill("1234");
    await standby.press("Tab");
    await wait(async () =>
      Object.values((await snapshot()).confirmed).some(
        (r) =>
          r.kind === "reading" &&
          r.pumpId === "pump:222" &&
          r.pumpHours === 1234,
      ),
    );
    await page.reload();
    await page.getByRole("heading", { name: "The spread" }).waitFor();
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "Hours", exact: true })
      .click();
    assert.equal(await standby.inputValue(), "1234");
    await context.setOffline(false);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 18-station demo, hours/finalize/reopen, IndexedDB restart, independent issues, spot lifecycle, swap/service, read-only mechanics, live handoff vs viewed date, all reports/print, cross-tab state, conflict retention, responsive phone" +
      (process.env.FIELDLINE_PRODUCTION === "1"
        ? ", offline production reload/edit/reload"
        : "") +
      ". No browser exceptions.",
  );
} catch (e) {
  console.error((await page.locator("body").innerText()).slice(-7000));
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw e;
} finally {
  await browser.close();
}
