import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for /chat/[characterId]
 */
export class ChatPage {
  readonly page: Page;

  // Header
  readonly headerName: Locator;
  readonly headerMemory: Locator;

  // Input
  readonly inputBox: Locator;
  readonly sendButton: Locator;

  // Message list
  readonly messageList: Locator;
  readonly aiBubbles: Locator;
  readonly userBubbles: Locator;

  // AI action buttons
  readonly regenButton: Locator;
  readonly continueButton: Locator;
  readonly suggestButton: Locator;

  // Bottom nav
  readonly navCharacters: Locator;
  readonly navChat: Locator;
  readonly navShop: Locator;
  readonly navMe: Locator;

  // Empty state
  readonly emptyHint: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header — character name + memory status
    this.headerName = page.locator("text=小叙");
    this.headerMemory = page.locator("text=/记忆 \\d+/\\d+/");

    // Input
    this.inputBox = page.getByPlaceholder("随便聊聊……");
    this.sendButton = page.getByRole("button", { name: "发送" });

    // Messages
    this.messageList = page.locator(".space-y-4");
    this.aiBubbles = page.locator(".space-y-4 > div").filter({ has: page.locator(".border-l-2") });
    this.userBubbles = page.locator(".space-y-4 > div").filter({ has: page.locator(".bg-neutral-900") });

    // AI action buttons (only appear on last AI message)
    this.regenButton = page.getByTitle("重新生成回复");
    this.continueButton = page.getByTitle("再回复一句");
    this.suggestButton = page.getByTitle("AI灵感回复");

    // Bottom nav
    this.navCharacters = page.locator("nav a", { hasText: "角色" });
    this.navChat = page.locator("nav a", { hasText: "聊天" });
    this.navShop = page.locator("nav a", { hasText: "商店" });
    this.navMe = page.locator("nav a", { hasText: "我的" });

    // Empty state
    this.emptyHint = page.locator("text=开始对话吧");
  }

  async goto(characterId: string) {
    await this.page.goto("/chat/" + characterId);
    await this.page.waitForLoadState("networkidle");
  }

  async login(email: string) {
    await this.page.fill("input[type=\"email\"]", email);
    await this.page.click("button:has-text(\"登录\")");
    await this.page.waitForLoadState("networkidle");
  }

  async typeMessage(text: string) {
    await this.inputBox.fill(text);
  }

  async clickSend() {
    await this.sendButton.click();
  }

  async sendMessage(text: string) {
    await this.typeMessage(text);
    await this.clickSend();
  }

  /** Get the content text of the last AI bubble */
  async getLastAiContent(): Promise<string> {
    const count = await this.aiBubbles.count();
    if (count === 0) return "";
    return (await this.aiBubbles.nth(count - 1).textContent()) ?? "";
  }

  // ── Streaming state: textarea disabled ⇔ isStreaming=true ──

  async isInputDisabled(): Promise<boolean> {
    return await this.inputBox.isDisabled();
  }

  async isSendDisabled(): Promise<boolean> {
    return await this.sendButton.isDisabled();
  }

  // ── Individual action button disabled checks ──

  async isRegenDisabled(): Promise<boolean> {
    const count = await this.regenButton.count();
    if (count === 0) return true;
    return await this.regenButton.isDisabled();
  }

  async isContinueDisabled(): Promise<boolean> {
    const count = await this.continueButton.count();
    if (count === 0) return true;
    return await this.continueButton.isDisabled();
  }

  async isSuggestDisabled(): Promise<boolean> {
    const count = await this.suggestButton.count();
    if (count === 0) return true;
    return await this.suggestButton.isDisabled();
  }

  async areAllActionsDisabled(): Promise<boolean> {
    return (await this.isRegenDisabled())
      && (await this.isContinueDisabled())
      && (await this.isSuggestDisabled());
  }

  async areAllControlsDisabled(): Promise<boolean> {
    return (await this.isInputDisabled()) && (await this.areAllActionsDisabled());
  }

  async clickRegenerate() {
    await this.regenButton.click();
  }

  /** Wait for streaming to end: input textarea becomes enabled */
  async waitForStreamEnd() {
    await expect(this.inputBox).not.toBeDisabled({ timeout: 10000 });
  }
}
