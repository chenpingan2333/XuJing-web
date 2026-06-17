/**
 * ApiConfigService — API configuration management
 *
 * AES encryption completed at Service layer; Repository never touches plaintext keys.
 */

import { apiConfigRepository } from "../repositories/api-config.repository";
import { providerGateway } from "./provider-gateway";
import { encryptApiKey } from "./crypto";

export class ApiConfigService {
  async listConfigs(userId: string) {
    const configs = await apiConfigRepository.findByUser(userId);
    return configs.map((c) => ({
      ...c,
      apiKeyEncrypted: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    }));
  }

  async createConfig(userId: string, data: {
    name: string;
    platform: string;
    apiUrl: string;
    apiKey: string;
    modelId: string;
    isDefault?: boolean;
  }) {
    const encrypted = await encryptApiKey(data.apiKey);
    return apiConfigRepository.create({
      userId,
      name: data.name,
      platform: data.platform as any,
      apiUrl: data.apiUrl,
      apiKeyEncrypted: encrypted,
      modelId: data.modelId,
      isDefault: data.isDefault ?? false,
    });
  }

  async updateConfig(userId: string, configId: string, data: {
    name?: string;
    apiUrl?: string;
    apiKey?: string;
    modelId?: string;
  }) {
    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.apiUrl) updateData.apiUrl = data.apiUrl;
    if (data.modelId) updateData.modelId = data.modelId;
    if (data.apiKey) {
      updateData.apiKeyEncrypted = await encryptApiKey(data.apiKey);
    }
    return apiConfigRepository.update(configId, updateData as any);
  }

  async deleteConfig(userId: string, configId: string, options: { actorId?: string; actorIp?: string; actorUa?: string; requestMethod?: string; requestPath?: string; reason?: string } = {}) {
    const config = await apiConfigRepository.findById(configId);
    if (!config || config.userId !== userId) throw new Error("Unauthorized");
    return apiConfigRepository.delete(configId, { actorId: options.actorId ?? userId, ...options });
  }

  async setDefaultConfig(userId: string, configId: string) {
    const config = await apiConfigRepository.findById(configId);
    if (!config || config.userId !== userId) throw new Error("Unauthorized");
    return apiConfigRepository.setDefault(userId, configId);
  }

  async testConfig(userId: string, configId: string) {
    const config = await apiConfigRepository.findById(configId);
    if (!config || config.userId !== userId) throw new Error("Unauthorized");
    return providerGateway.testConnection(config);
  }
}

export const apiConfigService = new ApiConfigService();
