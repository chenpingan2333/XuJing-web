import { Page } from "@playwright/test";

const TEST_USER = {
  userId: "test-e2e-user-001",
  role: "USER",
  subscription: "free",
};

const TEST_TOKEN = "e2e-mock-jwt-token";

/**
 * Inject a mock auth session into the page.
 * Intercepts the useAuth flow so the chat page renders without real login.
 */
export async function mockLogin(page: Page) {
  // Intercept /api/auth/dev/token
  await page.route("**/api/auth/dev/token", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          userId: TEST_USER.userId,
          accessToken: TEST_TOKEN,
          refreshToken: "e2e-refresh-mock",
        },
        timestamp: new Date().toISOString(),
      }),
    });
  });

  // Intercept /api/users
  await page.route("**/api/users", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: TEST_USER,
        timestamp: new Date().toISOString(),
      }),
    });
  });
}

export { TEST_USER, TEST_TOKEN };