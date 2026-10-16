import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test("refresh parsing cannot restore an old school after switch or logout", async ({
  page,
}) => {
  await page.goto("/");
  const outcomes = await page.evaluate(async () => {
    const { APIClient, readSession } = await import("/src/api.ts");
    const originalFetch = window.fetch;
    const outcomes = [];
    try {
      for (const school of [2, null]) {
        const session = (id: number) => ({
          access: `school-${id}`,
          refresh: `refresh-${id}`,
          user: {
            id: 1,
            username: "test",
            first_name: "",
            last_name: "",
            full_name: "test",
            role: "admin",
            must_change_password: false,
            is_platform_admin: false,
          },
          school: {
            id,
            name: `School ${id}`,
            slug: `school-${id}`,
            logo: null,
            is_active: true,
            appearance: {},
          },
          memberships: [],
        });
        const client = new APIClient(session(1));
        const callbacks: (number | null)[] = [];
        client.onSession = (value) => callbacks.push(value?.school?.id ?? null);
        let release!: (value: unknown) => void;
        let parsing!: () => void;
        const parseStarted = new Promise<void>((resolve) => {
          parsing = resolve;
        });
        window.fetch = async (input) => {
          if (String(input).includes("token/refresh"))
            return {
              ok: true,
              status: 200,
              json: () => {
                parsing();
                return new Promise((resolve) => {
                  release = resolve;
                });
              },
            } as Response;
          return new Response("{}", { status: 401 });
        };
        const request = client.request("students/").then(
          () => "resolved",
          (error) => error.name,
        );
        await parseStarted;
        client.replaceSession(school ? session(school) : null);
        release({
          access: "old-school-new-access",
          refresh: "old-school-new-refresh",
        });
        outcomes.push({
          result: await request,
          current: client.session?.school?.id ?? null,
          stored: readSession()?.school?.id ?? null,
          callbacks,
        });
      }
      return outcomes;
    } finally {
      window.fetch = originalFetch;
      sessionStorage.removeItem("school_workspace_session");
    }
  });
  expect(outcomes).toEqual([
    { result: "AbortError", current: 2, stored: 2, callbacks: [2] },
    { result: "AbortError", current: null, stored: null, callbacks: [null] },
  ]);
});

async function login(page: Page, username = "qa-admin") {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("QA-school-password-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (username === "qa-admin")
    await page
      .getByRole("button", { name: "School A School workspace School Admin" })
      .click();
}

test("school switch aborts a delayed response and clears forms and records", async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole("heading", { name: /Good / })).toBeVisible();
  let release: (() => void) | undefined;
  let delayed = false;
  await page.route("**/api/students/?page=1&search=*", async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.text();
      if (!delayed && response.ok() && body.includes("School A Student")) {
        delayed = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      await route
        .fulfill({
          status: response.status(),
          headers: response.headers(),
          body,
        })
        .catch(() => undefined);
    } catch {
      /* A canceled school request is the expected outcome in this test. */
    }
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Students", exact: true })
    .click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await page
    .getByLabel("Choose your school")
    .selectOption({ label: "School B" });
  release?.();
  await expect(page.getByRole("heading", { name: /Good / })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Students", exact: true })
    .click();
  await expect(
    page.getByText("School B Student 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("School A Student 1", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add Student", exact: true }).click();
  await page.getByLabel("Student name").fill("Unsaved School B form");
  await page
    .getByLabel("Choose your school")
    .selectOption({ label: "School A" });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Students", exact: true })
    .click();
  await expect(page.getByLabel("Student name")).toHaveCount(0);
  await expect(page.getByText("Unsaved School B form")).toHaveCount(0);
});

test("admin completes admission, attendance, marks, payment receipt and reports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add Student" }),
  ).toBeVisible();
  await page.getByLabel("Student name").fill("QA New Student");
  await page.getByLabel("Student ID", { exact: true }).fill("QA-NEW-001");
  await page.getByLabel("Father / guardian name").fill("QA Guardian");
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "Grade 8 · School A" });
  await page.getByLabel("Date of birth").fill("2012-03-01");
  await page.getByLabel("Contact number").fill("0701111111");
  await page.getByText("Additional details", { exact: true }).click();
  await page.getByLabel("Address", { exact: true }).fill("Kabul");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("QA New Student", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "Grade 8 · School A" });
  await page.getByRole("button", { name: "Mark all present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.locator(".save-state")).toContainText("Attendance saved");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Exams & results", exact: true })
    .click();
  await page.getByRole("button", { name: "Enter marks", exact: true }).click();
  await page.getByLabel("Subject", { exact: true }).selectOption("Mathematics");
  await page
    .getByLabel("Marks · School A Student 1", { exact: true })
    .fill("88");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("Saved");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Fees & payments", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Student", { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("dialog").getByLabel("Amount (AFN)").fill("100");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Receipt", exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".print-surface")).toContainText("School A");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate report", exact: true })
    .click();
  await expect(page.getByText("QA New Student", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toBe("qa-1-students.csv");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
});

test("teacher sees permitted actions and can publish homework", async ({
  page,
}) => {
  await login(page, "qa-teacher");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Fees & payments" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Exams & results", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Examination" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Homework", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Homework", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Teacher practice");
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "Grade 8 · School A" });
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Complete chapter one.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Teacher practice", { exact: true }),
  ).toBeVisible();
});

test("mobile Dari and Pashto layout is usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "qa-teacher");
  await page.getByLabel("Language").selectOption("fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page
    .getByRole("button", {
      name: "\u0641\u0647\u0631\u0633\u062a",
      exact: true,
    })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "حاضری", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "حاضری", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("School A Student 2", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".workspace-nav")
        .evaluate(
          (element) => element.getBoundingClientRect().left >= innerWidth,
        ),
    )
    .toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/teacher-dari-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("زبان").selectOption("ps");
  await expect(
    page.getByRole("heading", { name: "حاضري", exact: true }),
  ).toBeVisible();
});

test("platform provisions a school, appoints an admin, and records audit events", async ({
  page,
}) => {
  await login(page, "qa-platform");
  await page
    .getByRole("button", { name: "Create school", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("School name").fill("QA New School");
  await dialog.getByLabel("School address (slug)").fill("qa-new-school");
  await dialog.getByLabel("Administrator username").fill("qa-new-school-admin");
  await dialog.getByLabel("Temporary password").fill("QA-school-password-2026");
  await dialog
    .getByRole("button", { name: "Create school", exact: true })
    .click();
  await expect(page.getByText("QA New School", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "school created", exact: true }),
  ).toBeVisible();
});

test("guardians, report cards, promotion history and school branding work end to end", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Students", exact: true })
    .click();
  const studentRow = page
    .getByRole("row")
    .filter({ hasText: "School A Student 1" });
  await studentRow.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  await page.getByLabel("Guardian name").fill("QA Emergency Guardian");
  await page.getByLabel("Relationship").fill("Mother");
  await page.getByLabel("Phone number", { exact: true }).fill("0702222222");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    page.getByText("QA Emergency Guardian", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Report card", exact: true }).click();
  await expect(page.locator(".print-surface")).toContainText(
    "School A Student 1",
  );
  await expect(page.locator(".print-surface")).toContainText("88");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Classes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Promote students", exact: true })
    .click();
  await page
    .getByLabel("From class")
    .selectOption({ label: "Grade 8 · School A · 2026" });
  await page
    .getByLabel("To class")
    .selectOption({ label: "Grade 9 · School A · 2027" });
  await page.getByLabel("School A Student 1 S-001", { exact: true }).check();
  await page.getByRole("button", { name: "Confirm promotion" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "School A Student 1" }),
  ).toContainText("Grade 9 · School A");
  await page
    .getByRole("row")
    .filter({ hasText: "School A Student 1" })
    .getByRole("button", { name: "View", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Enrollment history");
  await expect(page.getByRole("dialog")).toContainText("2027");
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "School settings", exact: true })
    .click();
  await page.getByLabel("School logo").setInputFiles({
    name: "qa-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMw88sCAAGsAO8FS0hsAAAAAElFTkSuQmCC",
      "base64",
    ),
  });
  await page.getByLabel("Calendar", { exact: true }).selectOption("persian");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Saved successfully", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-brand img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".nav-brand img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBeTruthy();
});

test("class subjects, teacher accounts, timetable and announcements retain clear working flows", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Classes", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Class", exact: true }).click();
  await page.getByLabel("Class name").fill("QA Grade 10");
  await page.getByLabel("Grade", { exact: true }).fill("10");
  await page.getByLabel("Subjects", { exact: true }).fill("Mathematics");
  await page.getByRole("button", { name: "Add subject", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("QA Grade 10", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Teachers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Teacher", exact: true }).click();
  await page.getByLabel("Teacher name").fill("QA New Teacher");
  await page.getByLabel("Teacher ID", { exact: true }).fill("QA-T-NEW");
  await page.getByLabel("Phone number").fill("0703333333");
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page.getByLabel("QA Grade 10", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "QA New Teacher" })
    .getByRole("button", { name: "View", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("qa-new-teacher");
  await page
    .getByLabel("Temporary password", { exact: true })
    .fill("QA-school-password-2026");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "QA New Teacher" }),
  ).toContainText("Active");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Timetable", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage lessons", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Lesson", exact: true }).click();
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "QA Grade 10" });
  await page
    .getByLabel("Teacher", { exact: true })
    .selectOption({ label: "QA New Teacher" });
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "QA New Teacher" }),
  ).toContainText("08:00");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Announcements", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Announcement", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("QA School notice");
  await page
    .getByLabel("Message", { exact: true })
    .fill("The new school workflows are ready.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("QA School notice", { exact: true }),
  ).toBeVisible();
});

test("attendance retakes, student fee search, statements and printable timetables work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Attendance", exact: true })
    .click();
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "Grade 8 · School A" });
  await expect(
    page.getByRole("button", { name: "Retake attendance", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".attendance-confirmation")).toContainText(
    "qa-admin",
  );
  await page
    .getByRole("button", { name: "Retake attendance", exact: true })
    .click();
  await page
    .getByLabel("Reason for correction")
    .fill("Office confirmed a late arrival");
  await page
    .getByRole("group", {
      name: "Attendance · School A Student 2",
      exact: true,
    })
    .getByRole("button", { name: "Late", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save attendance", exact: true })
    .click();
  await expect(page.locator(".attendance-confirmation")).toContainText(
    "Revision 2",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Fees & payments", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Fee", exact: true }).click();
  await page.getByLabel("Search student", { exact: true }).fill("S-002");
  await page
    .locator(".student-choice")
    .filter({ hasText: "School A Student 2" })
    .click();
  await page.getByLabel("Amount (AFN)", { exact: true }).fill("1200");
  await page.getByLabel("Billing month", { exact: true }).fill("2026-11");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Saved successfully", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Student statement", exact: true })
    .click();
  await page.getByLabel("Search student", { exact: true }).fill("S-002");
  await page
    .locator(".student-choice")
    .filter({ hasText: "School A Student 2" })
    .click();
  await expect(page.locator(".print-surface")).toContainText("2026-11");
  await expect(
    page.getByRole("button", { name: "Print statement", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Timetable", exact: true })
    .click();
  await page
    .getByLabel("Class", { exact: true })
    .selectOption({ label: "QA Grade 10" });
  await expect(page.locator(".weekly-timetable")).toContainText(
    "QA New Teacher",
  );
  await expect(
    page.getByRole("button", { name: "Print timetable", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Timetable for").selectOption("teacher");
  await page
    .getByLabel("Teacher", { exact: true })
    .selectOption({ label: "QA New Teacher · QA-T-NEW" });
  await expect(page.locator(".weekly-timetable")).toContainText("QA Grade 10");
  await page.screenshot({
    path: "test-results/weekly-timetable.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Upcoming examination");
  expect(errors).toEqual([]);
});
