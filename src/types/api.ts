/** API 层通用类型 */

import type { ApiResponse } from "@/app/api/_base/response";

/** 分页参数 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** 分页响应 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** API Route 统一响应类型 */
export type { ApiResponse };
