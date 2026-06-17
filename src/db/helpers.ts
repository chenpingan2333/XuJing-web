import { sql, type SQL } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";

/**
 * 软删除表类型约束：表必须包含 deletedAt 字段
 */
export type SoftDeletableTable = PgTableWithColumns<{
  name: string;
  schema: string | undefined;
  dialect: "pg";
  columns: {
    deletedAt: {
      name: string;
      dataType: "date";
      columnType: string;
      data: Date | null;
      driverParam: string;
      notNull: false;
      hasDefault: false;
      enumValues: undefined;
      baseColumn: never;
    };
    [key: string]: any;
  };
}>;

/**
 * 生成 `deleted_at IS NULL` 条件，用于查询时过滤已软删除的记录。
 *
 * 用法示例:
 *   import { eq, and } from "drizzle-orm";
 *   import { withNotDeleted } from "@/db/helpers";
 *   import { messages } from "@/db/schema";
 *
 *   db.select()
 *     .from(messages)
 *     .where(and(eq(messages.userId, userId), withNotDeleted(messages)));
 *
 * @param table - 支持 soft delete 的表对象（必须包含 deletedAt 字段）
 * @returns SQL 片段 `${table.deletedAt} IS NULL`
 */
export function withNotDeleted(
  table: SoftDeletableTable
): SQL {
  return sql`${table.deletedAt} IS NULL`;
}

/** Generate RFC 9562 compliant UUID v7 using Web Crypto API.
 *  Fully portable across Node.js, Edge, and browser runtimes. */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);

  // 48-bit timestamp, big-endian bytes 0-5
  const ts = BigInt(Date.now());
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // Random portion for bytes 6-15
  const rand = new Uint8Array(10);
  globalThis.crypto.getRandomValues(rand);
  bytes.set(rand, 6);

  // Version 7: bytes[6] = 0b0111xxxx
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;

  // Variant 10xx: bytes[8] = 0b10xxxxxx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  // Format as UUID string
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
