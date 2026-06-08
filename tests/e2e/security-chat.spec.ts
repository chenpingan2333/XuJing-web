import { test, expect } from "@playwright/test";
import { ChatPage } from "./poms/chat-page";
import { mockLogin, TEST_TOKEN } from "./poms/auth-helper";

const CHARACTER_ID = "019ea15e-e814-7d89-9488-448fd81123b8"; // 小叙
const ATTACKER_CHARACTER_ID = "019ea15e-e814-7d89-9999-448fd81123b9";

test.describe("Security — Regenerate & Cross-User Isolation", () => {
  let chat: ChatPage;

  async function setupChatWithHistory(page: import("@playwright/test").Page) {
    chat = new ChatPage(page);

    await mockLogin(page);

    await page.route("**/api/characters/" + CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: CHARACTER_ID, name: "小叙", avatarUrl: null },
        }),
      });
    });

    await page.route("**/api/chat/" + CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            messages: [
              { id: "msg-h1", role: "USER", content: "今天天气真好", createdAt: "2026-06-08T10:00:00Z" },
              { id: "msg-h2", role: "ASSISTANT", content: "是啊，阳光特别温暖。要不要一起出去散步？", createdAt: "2026-06-08T10:00:02Z" },
            ],
            memory: { used: 5, limit: 100 },
          },
        }),
      });
    });

    await page.goto("/chat/" + CHARACTER_ID);
    await chat.login("e2e@test.local");

    await expect(chat.regenButton).toBeVisible({ timeout: 5000 });
  }

  test.beforeEach(async ({ page }) => {
    await setupChatWithHistory(page);
  });

  // ─── S1 — Regenerate request carries correct Authorization header ───
  test("S1 — Regenerate request includes Authorization header", async ({ page }) => {
    const regenRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/chat/" + CHARACTER_ID + "/regenerate") && req.method() === "POST",
    );

    await page.route("**/api/chat/" + CHARACTER_ID + "/regenerate", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"新的"}\n\n',
          'data: {"type":"delta","content":"回复"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.clickRegenerate();

    const regenReq = await regenRequestPromise;
    const authHeader = regenReq.headers()["authorization"];
    expect(authHeader).toBe("Bearer " + TEST_TOKEN);
  });

  // ─── S2 — Regenerate replaces last AI bubble with new streamed content ───
  test("S2 — Regenerate replaces last AI bubble with new streamed content", async ({ page }) => {
    const oldContent = await chat.getLastAiContent();
    expect(oldContent).toContain("是啊，阳光特别温暖");

    await page.route("**/api/chat/" + CHARACTER_ID + "/regenerate", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"今晚"}\n\n',
          'data: {"type":"delta","content":"月色"}\n\n',
          'data: {"type":"delta","content":"真美"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.clickRegenerate();
    await chat.waitForStreamEnd();

    const newContent = await chat.getLastAiContent();
    expect(newContent).not.toContain("是啊，阳光特别温暖");
    expect(newContent).toContain("今晚月色真美");
  });

  // ─── S3 — After regenerate stream ends, UI controls recover ───
  test("S3 — After regenerate stream ends, InputBar and all action buttons recover", async ({ page }) => {
    await page.route("**/api/chat/" + CHARACTER_ID + "/regenerate", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"重生"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.clickRegenerate();

    // During streaming — input + actions locked
    expect(await chat.isInputDisabled()).toBe(true);
    expect(await chat.isRegenDisabled()).toBe(true);
    expect(await chat.isContinueDisabled()).toBe(true);
    expect(await chat.isSuggestDisabled()).toBe(true);

    await chat.waitForStreamEnd();

    // After stream — everything recovered
    expect(await chat.isInputDisabled()).toBe(false);
    expect(await chat.isRegenDisabled()).toBe(false);
    expect(await chat.isContinueDisabled()).toBe(false);
    expect(await chat.isSuggestDisabled()).toBe(false);
  });

  // ─── S4 — Cross-user character chat returns 403 ───
  test("S4 — Accessing another user''s character shows no character data", async ({ page }) => {
    // Mock attacker''s character endpoint to return 403
    await page.route("**/api/characters/" + ATTACKER_CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "无权访问此角色的对话",
          timestamp: new Date().toISOString(),
        }),
      });
    });

    // Mock attacker''s chat history — must also return 403
    await page.route("**/api/chat/" + ATTACKER_CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "无权访问此角色的对话",
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await chat.goto(ATTACKER_CHARACTER_ID);

    // Character header with "小叙" should NOT appear (that''s a different character)
    // The 403 response means no character data is loaded
    await expect(chat.headerName).not.toBeVisible({ timeout: 5000 });
    await expect(chat.headerMemory).not.toBeVisible({ timeout: 3000 });

    // Bottom nav should still be visible (user is authenticated)
    await expect(chat.navChat).toBeVisible();
  });

  // ─── S5 — Regenerate for cross-user character is rejected ───
  test("S5 — Cross-user regenerate endpoint returns 403", async ({ page }) => {
    await page.route("**/api/characters/" + ATTACKER_CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id: ATTACKER_CHARACTER_ID, name: "黑客角色", avatarUrl: null },
        }),
      });
    });

    await page.route("**/api/chat/" + ATTACKER_CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "无权访问此角色的对话",
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await page.route("**/api/chat/" + ATTACKER_CHARACTER_ID + "/regenerate", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "无权访问此角色的对话",
          timestamp: new Date().toISOString(),
        }),
      });
    });

    await chat.goto(ATTACKER_CHARACTER_ID);

    // Regenerate button should not appear (no accessible AI messages)
    await expect(chat.regenButton).not.toBeVisible({ timeout: 5000 });
  });
});
