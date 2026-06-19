/**
 * ProviderGateway 鈥?缁熶竴 AI Provider 璺敱灞? *
 * 鑱岃矗:
 *  1. 鏍规嵁 ApiConfig.platform 璺敱鍒板搴?Provider
 *  2. 鍐呴儴瑙ｅ瘑 api_key_encrypted
 *  3. 缁熶竴杩斿洖 AsyncGenerator<ChatEvent> 娴? *  4. 鏃?SDK 渚濊禆锛屽叏閮ㄤ娇鐢ㄥ師鐢?fetch
 */

import { getEnv } from "@/lib/env";
import type { ApiConfig } from "@/db/schema/api-configs";
import { decryptApiKey } from "./crypto";

// 鈹€鈹€鈹€ Types 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ChatEvent =
  | { type: "delta"; content: string }
  | { type: "message_created"; tempId: string; messageId: string }
  | { type: "done" }
  | { type: "error"; message: string };

// 鈹€鈹€鈹€ Gateway 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export class ProviderGateway {
  /**
   * 娴佸紡鑱婂ぉ 鈥?缁熶竴鍏ュ彛
   */
  async *chat(
    config: ApiConfig,
    messages: ChatMessage[],
    systemPrompt: string
  ): AsyncGenerator<ChatEvent> {
    const apiKey = await decryptApiKey(config.apiKeyEncrypted);

    const allMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    switch (config.platform) {
      case "OPENAI":
      case "CUSTOM_OPENAI":
      case "DEEPSEEK":
      case "GROK":
        yield* this._openaiCompatible(this._safeUrl(config.apiUrl, config.platform), apiKey, config.modelId, allMessages);
        break;

      case "ANTHROPIC":
      case "CUSTOM_ANTHROPIC":
        yield* this._anthropic(config.apiUrl, apiKey, config.modelId, allMessages);
        break;

      case "GEMINI":
      case "CUSTOM_GEMINI":
        yield* this._gemini(config.apiUrl, apiKey, config.modelId, allMessages);
        break;

      default:
        // Fallback: treat unknown platforms as OpenAI-compatible
        yield* this._openaiCompatible(this._safeUrl(config.apiUrl, config.platform), apiKey, config.modelId, allMessages);
    }
  }

  /**
   * VIP 平台模型——专属路由
   *
   * 浠呮湇鍔＄璋冪敤銆侫PI Key 瀹屽叏鏉ヨ嚜鐜鍙橀噺 PLATFORM_API_KEY锛?   * 涓嶇粡杩囨暟鎹簱鍔犲瘑灞傦紝涓嶇粡杩囦换浣曚腑闂翠欢浼犻€掞紝姘镐笉鏆撮湶缁欏墠绔€?   * 鍓嶇缁熶竴鏄剧ず涓?VIP涓撳睘妯″瀷"锛屼笉鏆撮湶瀹為檯妯″瀷鍚嶇О銆?   */
  async *vipPlatformChat(
    messages: ChatMessage[],
    systemPrompt: string
  ): AsyncGenerator<ChatEvent> {
    const env = getEnv();
    const apiUrl = env.PLATFORM_API_URL;
    const apiKey = env.PLATFORM_API_KEY ?? "";
    const modelId = env.PLATFORM_MODEL_ID;

    if (!apiKey) {
      yield { type: "error", message: "骞冲彴妯″瀷鏆備笉鍙敤锛岃绋嶅悗閲嶈瘯" };
      return;
    }

    const allMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    yield* this._openaiCompatible(this._safeUrl(apiUrl, "DEEPSEEK"), apiKey, modelId, allMessages);
  }

  /**
   * 娴嬭瘯杩炴帴 鈥?鍙戦€佹渶灏忚姹?   */
  async testConnection(config: ApiConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const apiKey = await decryptApiKey(config.apiKeyEncrypted);
      const testMessages: ChatMessage[] = [
        { role: "user", content: "Hi" },
      ];
      const systemPrompt = "Reply with just 'ok'.";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const isOpenAI = ["OPENAI", "CUSTOM_OPENAI", "DEEPSEEK", "GROK"].includes(config.platform);

      let url = config.apiUrl;
      if (!url.endsWith("/chat/completions") && isOpenAI) {
        url = url.replace(/\/+$/, "") + "/chat/completions";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(config.platform === "ANTHROPIC" ? { "anthropic-version": "2023-06-01" } : {}),
        },
        body: JSON.stringify(
          isOpenAI
            ? {
                model: config.modelId,
                messages: [{ role: "system", content: systemPrompt }, ...testMessages],
                max_tokens: 10,
                stream: false,
              }
            : {
                model: config.modelId,
                messages: testMessages,
                system: systemPrompt,
                max_tokens: 10,
              }
        ),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  /**
   * 闈炴祦寮忚亰澶?鈥?鐢ㄤ簬鍚庡彴浠诲姟锛堣蹇嗘彁鍙栫瓑锛夛紝杩斿洖瀹屾暣鍝嶅簲鏂囨湰銆?   */
  async chatNonStreaming(
    config: { apiUrl: string; apiKey: string; platform: string; modelId: string },
    messages: ChatMessage[],
    systemPrompt: string,
  ): Promise<string> {
    const allMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const isOpenAI = ["OPENAI", "CUSTOM_OPENAI", "DEEPSEEK", "GROK"].includes(config.platform);
      let url = config.apiUrl;
      if (!url.endsWith("/chat/completions") && isOpenAI) {
        url = url.replace(/\/+$/, "") + "/chat/completions";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          messages: allMessages,
          max_tokens: 512,
          temperature: 0.3,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return "";

      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? "";
    } catch {
      return "";
    } finally {
      clearTimeout(timeout);
    }
  }

  // 鈹€鈹€鈹€ OpenAI-Compatible (OpenAI / DeepSeek / Grok / Custom) 鈹€鈹€鈹€

  /** 防御：若 apiUrl 不含协议头（如被误填为 API Key），自动修正为平台默认端点 */
  private _safeUrl(baseUrl: string, platform: string): string {
    if (/^https?:\/\//.test(baseUrl)) return baseUrl;
    const defaults: Record<string, string> = {
      OPENAI: "https://api.openai.com",
      DEEPSEEK: "https://api.deepseek.com",
      GROK: "https://api.x.ai",
    };
    return defaults[platform] ?? "https://api.deepseek.com";
  }

  private async *_openaiCompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<ChatEvent> {
    let url = baseUrl;
    if (!url.endsWith("/chat/completions")) {
      url = url.replace(/\/+$/, "") + "/chat/completions";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `API error ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: "delta", content };
          }
        } catch {
          // skip unparseable chunks
        }
      }
    }

    yield { type: "done" };
  }

  // 鈹€鈹€鈹€ Anthropic 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  private async *_anthropic(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<ChatEvent> {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    let url = baseUrl;
    if (!url.endsWith("/messages")) {
      url = url.replace(/\/+$/, "") + "/messages";
    }

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages,
      max_tokens: 4096,
      stream: true,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Anthropic error ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        try {
          const json = JSON.parse(data);
          if (json.type === "content_block_delta") {
            const text = json.delta?.text;
            if (text) yield { type: "delta", content: text };
          }
          if (json.type === "message_stop") {
            yield { type: "done" };
            return;
          }
        } catch {
          // skip
        }
      }
    }

    yield { type: "done" };
  }

  // 鈹€鈹€鈹€ Gemini 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  private async *_gemini(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<ChatEvent> {
    // Convert OpenAI-format messages to Gemini format
    const systemMsg = messages.find((m) => m.role === "system");
    const contents = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    let url = baseUrl;
    if (!url.includes("streamGenerateContent")) {
      url = url.replace(/\/+$/, "");
      url = `${url}/models/${model}:streamGenerateContent`;
    }
    url += url.includes("?") ? "&" : "?";
    url += `key=${encodeURIComponent(apiKey)}`;

    const body: Record<string, unknown> = {
      contents,
    };
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Gemini error ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { type: "delta", content: text };
        } catch {
          // skip
        }
      }
    }

    yield { type: "done" };
  }
}

export const providerGateway = new ProviderGateway();
