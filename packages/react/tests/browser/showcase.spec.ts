import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("clipboard failure keeps an accessible manual-copy fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () => Promise.reject(new Error("Clipboard unavailable")),
      },
    });
  });
  await page.goto("/");
  const card = page.locator("#account-card");
  await card.getByRole("button", { name: "Code", exact: true }).click();
  await card.getByRole("button", { name: "Copy code" }).click();
  await expect(card.getByRole("status")).toHaveText(
    "Select the code to copy manually.",
  );
  await expect(card.locator("pre")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("mobile navigation follows the current section and keyboard skip reaches content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.locator("#get-started").scrollIntoViewIfNeeded();
  const current = page
    .getByRole("navigation")
    .getByRole("link", { name: "Get started" });
  await expect(current).toHaveAttribute("aria-current", "location");
  await expect(current).toBeInViewport();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("card controls update the live example and its copyable source", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const card = page.locator("#account-card");
  await card
    .getByRole("combobox", { name: "Currency", exact: true })
    .selectOption("USD");
  await expect(card.locator("#accounts")).toContainText("US dollar");
  await card.getByRole("checkbox", { name: "Hide balance" }).check();
  await expect(
    card.getByLabel("Available balance hidden", { exact: true }),
  ).toBeVisible();
  await card.getByRole("checkbox", { name: "Show footer" }).uncheck();
  await expect(card.locator(".wise-card-footer")).toHaveCount(0);
  await card.getByRole("button", { name: "Show account details" }).click();
  await expect(card.locator("#accounts")).toContainText("000123456789");
  await card.getByRole("button", { name: "Code", exact: true }).click();
  const source = await card.locator("pre").innerText();
  expect(source).toContain('currency: "USD"');
  expect(source).toContain("masked={false}");
  expect(source).toContain("hideBalance={true}");
  await card.getByRole("button", { name: "Copy code" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, "\n")).toBe(source);
  await card.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    card.getByRole("checkbox", { name: "Hide balance" }),
  ).toBeChecked();
  await card
    .getByRole("combobox", { name: "State", exact: true })
    .selectOption("loading");
  await expect(card.locator(".wise-card")).toHaveAttribute("aria-busy", "true");
  await expect(card.getByRole("status")).toContainText("Loading account");
  await card
    .getByRole("combobox", { name: "State", exact: true })
    .selectOption("error");
  await expect(card.getByRole("alert")).toContainText("Unable to load");
  await expect(card.locator(".wise-balance")).toHaveCount(0);
});

test("standalone details switch receiving formats and retain masking", async ({
  page,
}) => {
  await page.goto("/");
  const details = page.locator("#account-details");
  await expect(details.locator(".wise-details")).not.toContainText("BE00");
  await details.getByRole("button", { name: "Reveal fields" }).click();
  await expect(details.locator(".wise-details")).toContainText(
    "BE00 0000 0000 0000",
  );
  await details.getByLabel("Receiving option").selectOption("GBP");
  await expect(details.locator(".wise-details")).toContainText("04-00-00");
  await details.getByRole("button", { name: "Mask fields" }).click();
  await expect(details.locator(".wise-details")).not.toContainText("12345678");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("balance supports locales, masking, invalid input, and recovery", async ({
  page,
}) => {
  await page.goto("/");
  const balance = page.locator("#balance");
  await balance
    .getByRole("combobox", { name: "Currency", exact: true })
    .selectOption("EUR");
  await balance
    .getByRole("combobox", { name: "Locale", exact: true })
    .selectOption("de-DE");
  await balance.getByLabel("Amount", { exact: true }).fill("1234.56");
  await expect(balance.locator(".wise-balance-value")).toHaveText("1.234,56 €");
  await expect(
    balance.getByLabel("Formatted amount", { exact: true }),
  ).toHaveText("1.234,56 €");
  await balance.getByRole("checkbox", { name: "Mask amount" }).check();
  await expect(
    balance.getByLabel("Available balance hidden", { exact: true }),
  ).toBeVisible();
  await balance.getByRole("checkbox", { name: "Mask amount" }).uncheck();
  await balance.getByLabel("Amount", { exact: true }).fill("not a number");
  await expect(balance.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    balance.getByLabel("Available balance unavailable", { exact: true }),
  ).toBeVisible();
  await balance
    .getByLabel("Amount", { exact: true })
    .fill("9007199254740993.01");
  await expect(balance.locator(".wise-balance-value")).toHaveText(
    "9.007.199.254.740.993,01 €",
  );
  await expect(balance.getByLabel("Amount", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "false",
  );
});

test("navigation, install copy, and all source views work without browser errors", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Balance" })
    .click();
  await expect(page).toHaveURL(/#balance$/);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Balance" }),
  ).toHaveAttribute("aria-current", "location");
  for (const id of ["account-card", "account-details", "balance"]) {
    await page
      .locator(`#${id}`)
      .getByRole("button", { name: "Code", exact: true })
      .click();
  }
  await page.locator(".states-code summary").click();
  await page.getByRole("button", { name: "Copy install command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "npm install @mmzaini/wise-react",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 768, 1024, 1440]) {
  test(`showcase fits at ${width}px with previews and code`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await page.getByRole("button", { name: "Show account details" }).click();
    await page.getByRole("button", { name: "Reveal fields" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/showcase-${width}.png`,
      fullPage: true,
    });
    for (const id of ["account-card", "account-details", "balance"]) {
      await page
        .locator(`#${id}`)
        .getByRole("button", { name: "Code", exact: true })
        .click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
