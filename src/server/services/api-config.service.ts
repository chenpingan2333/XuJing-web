/**
 * ApiConfigService — API 配置管理
 *
 * AES 加密在 Service 层完成，Repository 不接触明文密钥。
 */

import { apiConfigRepository } from "../repositories/api-config.repository";
import { providerGateway } from "./provider-gateway";
import { encryptApiKey } from "./crypto";

export class ApiConfigService {
  async listConfigs(userId: string) {
    const configs = await apiConfigRepository.findByUser(userId);
    // 返回时脱敏 api_key
    return configs.map((c) => ({
      ...c,
      apiKeyEncrypted: "••••••••",
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
    const encrypted = encryptApiKey(data.apiKey);
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
      updateData.apiKeyEncrypted = encryptApiKey(data.apiKey);
    }
    return apiConfigRepository.update(configId, updateData as any);
  }

  async deleteConfig(userId: string, configId: string) {
    const config = await apiConfigRepository.findById(configId);
    if (!config || config.userId !== userId) throw new Error("Unauthorized");
    return apiConfigRepository.delete(configId);
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