import { test, expect } from "@playwright/test";
import { ChatPage } from "./poms/chat-page";
import { mockLogin, TEST_TOKEN } from "./poms/auth-helper";

const CHARACTER_ID = "019ea15e-e814-7d89-9488-448fd81123b8"; // 小叙

test.describe("Core Chat Flow", () => {
  let chat: ChatPage;

  test.beforeEach(async ({ page }) => {
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
          data: { messages: [], memory: { used: 0, limit: 100 } },
        }),
      });
    });

    await chat.goto(CHARACTER_ID);
    await chat.login("e2e@test.local");
  });

  // ─── A1 — Bottom nav renders all 4 tabs ───
  test("A1 — Bottom nav renders all 4 tabs", async () => {
    await expect(chat.navCharacters).toBeVisible();
    await expect(chat.navChat).toBeVisible();
    await expect(chat.navShop).toBeVisible();
    await expect(chat.navMe).toBeVisible();
  });

  // ─── A2 — Header shows character name and memory quota ───
  test("A2 — Header shows character name and FREE memory quota", async () => {
    await expect(chat.headerName).toBeVisible();
    await expect(chat.headerMemory).toContainText("记忆 0/100");
  });

  // ─── A3 — Empty state placeholder ───
  test("A3 — Empty state shows placeholder text", async () => {
    await expect(chat.emptyHint).toBeVisible();
  });

  // ─── A4 — Send message + SSE streaming renders AI reply ───
  test("A4 — Send message + SSE streaming renders AI reply", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.characterId).toBe(CHARACTER_ID);
      expect(body.content).toBe("你好，最近怎么样？");

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"你"}\n\n',
          'data: {"type":"delta","content":"好呀"}\n\n',
          'data: {"type":"delta","content":"，我"}\n\n',
          'data: {"type":"delta","content":"最近"}\n\n',
          'data: {"type":"delta","content":"还不错"}\n\n',
          'data: {"type":"delta","content":"！"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.sendMessage("你好，最近怎么样？");

    // Wait for streaming to end (input textarea re-enabled)
    await chat.waitForStreamEnd();

    await expect(chat.userBubbles.first()).toBeVisible();
    expect(await chat.userBubbles.count()).toBe(1);
    await expect(chat.aiBubbles.first()).toBeVisible();
    expect(await chat.aiBubbles.count()).toBe(1);

    const aiContent = await chat.getLastAiContent();
    expect(aiContent).toContain("你好呀，我最近还不错！");
  });

  // ─── A5 — Input + send button disabled during streaming, input re-enabled after ───
  test("A5 — Input + send button disabled during streaming, input re-enabled after", async ({ page }) => {
    // Delay fulfillment by 2s so the client stays in streaming state
    await page.route("**/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"正在"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.sendMessage("测试");

    // During streaming: input textarea AND send button must both be disabled
    expect(await chat.isInputDisabled()).toBe(true);
    expect(await chat.isSendDisabled()).toBe(true);

    // Wait for stream to complete — input textarea should become enabled
    await chat.waitForStreamEnd();

    // Input textarea is unlocked (streaming ended)
    expect(await chat.isInputDisabled()).toBe(false);
    // Send button is naturally disabled because input is empty after sending
    // This is correct behavior — no assertion needed for send button here
  });

  // ─── A6 — All action buttons disabled during streaming, re-enabled after ───
  test("A6 — All action buttons disabled during streaming, re-enabled after", async ({ page }) => {
    // Re-mock chat history with an AI message so action buttons render
    await page.unroute("**/api/chat/" + CHARACTER_ID);
    await page.route("**/api/chat/" + CHARACTER_ID, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            messages: [
              { id: "msg-1", role: "USER", content: "嗨", createdAt: "2026-06-08T00:00:00Z" },
              { id: "msg-2", role: "ASSISTANT", content: "嗨！有什么可以帮你的吗？", createdAt: "2026-06-08T00:00:01Z" },
            ],
            memory: { used: 2, limit: 100 },
          },
        }),
      });
    });

    // Reload to pick up history with action buttons
    await page.goto("/chat/" + CHARACTER_ID);
    await expect(chat.regenButton).toBeVisible({ timeout: 5000 });
    expect(await chat.isRegenDisabled()).toBe(false);

    // Delay the next POST /api/chat by 2s
    await page.route("**/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"type":"delta","content":"新回复"}\n\n',
          'data: {"type":"done"}\n\n',
        ].join(""),
      });
    });

    await chat.sendMessage("再来一句");

    // During streaming: ALL controls locked
    expect(await chat.areAllControlsDisabled()).toBe(true);
    expect(await chat.isRegenDisabled()).toBe(true);
    expect(await chat.isContinueDisabled()).toBe(true);
    expect(await chat.isSuggestDisabled()).toBe(true);

    // Wait for stream to complete
    await chat.waitForStreamEnd();

    // After stream: all controls re-enabled
    expect(await chat.isInputDisabled()).toBe(false);
    expect(await chat.isRegenDisabled()).toBe(false);
    expect(await chat.isContinueDisabled()).toBe(false);
    expect(await chat.isSuggestDisabled()).toBe(false);
  });
});
