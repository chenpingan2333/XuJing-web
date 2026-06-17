/**
 * 叙境（XuJing）资产完整性校验脚本
 *
 * P1安全边界建设 — 检测文件系统与数据库之间的资产引用不一致：
 *   - missing_files: DB有引用但文件系统不存在（数据完整性风险）
 *   - orphan_files:   文件系统存在但DB无引用（磁盘泄漏/僵尸文件）
 *
 * 用法: npx tsx src/scripts/integrity-check.ts [--fix]
 *   --fix: 对orphan_files生成删除建议清单（不自动删除）
 *
 * ⚠️  只读检测，不修改任何数据/文件
 */

import { db } from "@/db";
import { characters, userCharacterSettings } from "@/db/schema";
import { isNull, isNotNull, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

// ─── 常量 ────────────────────────────────────────────────
const UPLOAD_DIR = "/var/www/xujing/public/uploads";
const OFFICIAL_DIR = "/var/www/xujing/public/images/official";
const UPLOAD_URL_PREFIX = "/uploads/";
const OFFICIAL_URL_PREFIX = "/images/official/";

// ─── 类型定义 ─────────────────────────────────────────────
interface FileRef {
  url: string;
  source: string; // 表名:字段名:记录ID
}

interface IntegrityReport {
  timestamp: string;
  dbRefs: {
    uploads: FileRef[];
    official: FileRef[];
  };
  fsFiles: {
    uploads: string[];
    official: string[];
  };
  missingFiles: FileRef[];  // DB有引用但文件不存在
  orphanFiles: string[];    // 文件存在但DB无引用
  summary: {
    totalDbUploadRefs: number;
    totalDbOfficialRefs: number;
    totalFsUploadFiles: number;
    totalFsOfficialFiles: number;
    missingCount: number;
    orphanCount: number;
    status: "PASS" | "WARN" | "FAIL";
  };
}

// ─── 数据库查询 ──────────────────────────────────────────
/**
 * 检测指定表是否拥有 deleted_at 列
 * P1兼容：migrate/push被禁止，部分表可能尚未添加deleted_at列
 */
async function hasDeletedAtColumn(table: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = 'deleted_at' LIMIT 1`
  );
  return (result as unknown as unknown[]).length > 0;
}

async function collectDbRefs(): Promise<{ uploads: FileRef[]; official: FileRef[] }> {
  const uploads: FileRef[] = [];
  const official: FileRef[] = [];

  // 1. characters 表 — avatarUrl + backgroundUrl（未软删除的记录）
  const charsHasDeletedAt = await hasDeletedAtColumn("characters");
  const activeChars = await db
    .select({
      id: characters.id,
      avatarUrl: characters.avatarUrl,
      backgroundUrl: characters.backgroundUrl,
    })
    .from(characters)
    .where(charsHasDeletedAt ? isNull(characters.deletedAt) : undefined!);

  for (const c of activeChars) {
    if (c.avatarUrl) {
      const ref: FileRef = { url: c.avatarUrl, source: `characters.avatar_url:${c.id}` };
      if (c.avatarUrl.startsWith(UPLOAD_URL_PREFIX)) uploads.push(ref);
      else if (c.avatarUrl.startsWith(OFFICIAL_URL_PREFIX)) official.push(ref);
    }
    if (c.backgroundUrl) {
      const ref: FileRef = { url: c.backgroundUrl, source: `characters.background_url:${c.id}` };
      if (c.backgroundUrl.startsWith(UPLOAD_URL_PREFIX)) uploads.push(ref);
      else if (c.backgroundUrl.startsWith(OFFICIAL_URL_PREFIX)) official.push(ref);
    }
  }

  // 2. characters 表 — 已软删除的记录（仍需检测文件是否残留）
  //    若deleted_at列不存在，则无已软删除记录，跳过查询
  const deletedChars = charsHasDeletedAt
    ? await db
        .select({
          id: characters.id,
          avatarUrl: characters.avatarUrl,
          backgroundUrl: characters.backgroundUrl,
        })
        .from(characters)
        .where(isNotNull(characters.deletedAt))
    : [];

  // 已软删除记录的文件引用标记为 [DELETED]，用于orphan检测时排除
  const deletedUploadUrls = new Set<string>();
  const deletedOfficialUrls = new Set<string>();
  for (const c of deletedChars) {
    if (c.avatarUrl) {
      if (c.avatarUrl.startsWith(UPLOAD_URL_PREFIX)) deletedUploadUrls.add(c.avatarUrl);
      else if (c.avatarUrl.startsWith(OFFICIAL_URL_PREFIX)) deletedOfficialUrls.add(c.avatarUrl);
    }
    if (c.backgroundUrl) {
      if (c.backgroundUrl.startsWith(UPLOAD_URL_PREFIX)) deletedUploadUrls.add(c.backgroundUrl);
      else if (c.backgroundUrl.startsWith(OFFICIAL_URL_PREFIX)) deletedOfficialUrls.add(c.backgroundUrl);
    }
  }

  // 3. user_character_settings 表 — backgroundUrl（未软删除）
  const settingsHasDeletedAt = await hasDeletedAtColumn("user_character_settings");
  const activeSettings = await db
    .select({
      id: userCharacterSettings.id,
      backgroundUrl: userCharacterSettings.backgroundUrl,
    })
    .from(userCharacterSettings)
    .where(settingsHasDeletedAt ? isNull(userCharacterSettings.deletedAt) : undefined!);

  for (const s of activeSettings) {
    if (s.backgroundUrl) {
      const ref: FileRef = { url: s.backgroundUrl, source: `user_character_settings.background_url:${s.id}` };
      if (s.backgroundUrl.startsWith(UPLOAD_URL_PREFIX)) uploads.push(ref);
      else if (s.backgroundUrl.startsWith(OFFICIAL_URL_PREFIX)) official.push(ref);
    }
  }

  // 4. user_character_settings 表 — 已软删除
  //    若deleted_at列不存在，则无已软删除记录，跳过查询
  const deletedSettings = settingsHasDeletedAt
    ? await db
        .select({
          id: userCharacterSettings.id,
          backgroundUrl: userCharacterSettings.backgroundUrl,
        })
        .from(userCharacterSettings)
        .where(isNotNull(userCharacterSettings.deletedAt))
    : [];

  for (const s of deletedSettings) {
    if (s.backgroundUrl) {
      if (s.backgroundUrl.startsWith(UPLOAD_URL_PREFIX)) deletedUploadUrls.add(s.backgroundUrl);
      else if (s.backgroundUrl.startsWith(OFFICIAL_URL_PREFIX)) deletedOfficialUrls.add(s.backgroundUrl);
    }
  }

  // 将已软删除记录的引用信息也加入（标记为DELETED，用于missing检测时降级）
  for (const url of deletedUploadUrls) {
    uploads.push({ url, source: `[DELETED] uploads ref` });
  }
  for (const url of deletedOfficialUrls) {
    official.push({ url, source: `[DELETED] official ref` });
  }

  return { uploads, official };
}

// ─── 文件系统扫描 ──────────────────────────────────────────
function scanDirectory(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.warn(`  ⚠️  目录不存在: ${dir}`);
    return [];
  }
  const entries = fs.readdirSync(dir);
  return entries.filter((name) => fs.statSync(path.join(dir, name)).isFile());
}

function collectFsFiles(): { uploads: string[]; official: string[] } {
  const uploadFiles = scanDirectory(UPLOAD_DIR);
  const officialFiles = scanDirectory(OFFICIAL_DIR);
  return {
    uploads: uploadFiles.map((f) => `${UPLOAD_URL_PREFIX}${f}`),
    official: officialFiles.map((f) => `${OFFICIAL_URL_PREFIX}${f}`),
  };
}

// ─── 一致性检测 ──────────────────────────────────────────
function detectMissingFiles(dbRefs: FileRef[], fsUrls: Set<string>): FileRef[] {
  return dbRefs.filter((ref) => {
    // 已软删除记录的引用，文件缺失不算missing（预期行为）
    if (ref.source.startsWith("[DELETED]")) return false;
    return !fsUrls.has(ref.url);
  });
}

function detectOrphanFiles(
  fsUrls: string[],
  dbRefUrls: Set<string>,
  deletedRefUrls: Set<string>
): string[] {
  return fsUrls.filter((url) => {
    // 文件存在但DB无任何引用（包括已软删除的引用）
    return !dbRefUrls.has(url) && !deletedRefUrls.has(url);
  });
}

// ─── 报告生成 ──────────────────────────────────────────────
function buildReport(
  dbRefs: { uploads: FileRef[]; official: FileRef[] },
  fsFiles: { uploads: string[]; official: string[] },
  missingFiles: FileRef[],
  orphanFiles: string[]
): IntegrityReport {
  const activeDbUploadUrls = new Set(
    dbRefs.uploads.filter((r) => !r.source.startsWith("[DELETED]")).map((r) => r.url)
  );
  const activeDbOfficialUrls = new Set(
    dbRefs.official.filter((r) => !r.source.startsWith("[DELETED]")).map((r) => r.url)
  );
  const deletedUploadUrls = new Set(
    dbRefs.uploads.filter((r) => r.source.startsWith("[DELETED]")).map((r) => r.url)
  );
  const deletedOfficialUrls = new Set(
    dbRefs.official.filter((r) => r.source.startsWith("[DELETED]")).map((r) => r.url)
  );

  // orphan检测：文件存在但DB无任何引用（active+deleted都没有）
  const allDbUploadUrls = new Set([...activeDbUploadUrls, ...deletedUploadUrls]);
  const allDbOfficialUrls = new Set([...activeDbOfficialUrls, ...deletedOfficialUrls]);

  const uploadOrphans = detectOrphanFiles(fsFiles.uploads, allDbUploadUrls, new Set());
  const officialOrphans = detectOrphanFiles(fsFiles.official, allDbOfficialUrls, new Set());
  const allOrphans = [...uploadOrphans, ...officialOrphans];

  const totalMissing = missingFiles.length;
  const totalOrphan = allOrphans.length;

  let status: "PASS" | "WARN" | "FAIL" = "PASS";
  if (totalMissing > 0) status = "FAIL";
  else if (totalOrphan > 0) status = "WARN";

  return {
    timestamp: new Date().toISOString(),
    dbRefs: {
      uploads: dbRefs.uploads.filter((r) => !r.source.startsWith("[DELETED]")),
      official: dbRefs.official.filter((r) => !r.source.startsWith("[DELETED]")),
    },
    fsFiles,
    missingFiles,
    orphanFiles: allOrphans,
    summary: {
      totalDbUploadRefs: activeDbUploadUrls.size,
      totalDbOfficialRefs: activeDbOfficialUrls.size,
      totalFsUploadFiles: fsFiles.uploads.length,
      totalFsOfficialFiles: fsFiles.official.length,
      missingCount: totalMissing,
      orphanCount: totalOrphan,
      status,
    },
  };
}

function printReport(report: IntegrityReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("  叙境 资产完整性校验报告");
  console.log("  Integrity Check Report");
  console.log("=".repeat(60));
  console.log(`  时间: ${report.timestamp}`);
  console.log();

  // 摘要
  const s = report.summary;
  console.log("── 摘要 ──────────────────────────────────────────");
  console.log(`  状态: ${s.status === "PASS" ? "✅ PASS" : s.status === "WARN" ? "⚠️  WARN" : "❌ FAIL"}`);
  console.log(`  DB引用 (uploads):   ${s.totalDbUploadRefs} 条`);
  console.log(`  DB引用 (official):  ${s.totalDbOfficialRefs} 条`);
  console.log(`  FS文件 (uploads):   ${s.totalFsUploadFiles} 个`);
  console.log(`  FS文件 (official):  ${s.totalFsOfficialFiles} 个`);
  console.log(`  缺失文件 (missing): ${s.missingCount} 个`);
  console.log(`  僵尸文件 (orphan):  ${s.orphanCount} 个`);
  console.log();

  // 缺失文件详情
  if (report.missingFiles.length > 0) {
    console.log("── ❌ 缺失文件 (DB有引用但文件不存在) ────────────────");
    for (const ref of report.missingFiles) {
      console.log(`  ${ref.url}`);
      console.log(`    引用来源: ${ref.source}`);
    }
    console.log();
  } else {
    console.log("── ✅ 缺失文件: 无 ────────────────────────────────");
    console.log();
  }

  // 僵尸文件详情
  if (report.orphanFiles.length > 0) {
    console.log("── ⚠️  僵尸文件 (文件存在但DB无引用) ─────────────────");
    for (const url of report.orphanFiles) {
      const fsPath = url.startsWith(UPLOAD_URL_PREFIX)
        ? path.join(UPLOAD_DIR, url.replace(UPLOAD_URL_PREFIX, ""))
        : path.join(OFFICIAL_DIR, url.replace(OFFICIAL_URL_PREFIX, ""));
      try {
        const stat = fs.statSync(fsPath);
        const sizeKB = (stat.size / 1024).toFixed(1);
        console.log(`  ${url} (${sizeKB} KB)`);
      } catch {
        console.log(`  ${url}`);
      }
    }
    console.log();
  } else {
    console.log("── ✅ 僵尸文件: 无 ────────────────────────────────");
    console.log();
  }

  // DB引用详情
  console.log("── DB引用详情 ─────────────────────────────────────");
  console.log("  [uploads 引用]");
  for (const ref of report.dbRefs.uploads) {
    console.log(`    ${ref.url} ← ${ref.source}`);
  }
  console.log("  [official 引用]");
  for (const ref of report.dbRefs.official) {
    console.log(`    ${ref.url} ← ${ref.source}`);
  }
  console.log();

  // FS文件详情
  console.log("── FS文件详情 ─────────────────────────────────────");
  console.log(`  [uploads 目录: ${UPLOAD_DIR}]`);
  for (const url of report.fsFiles.uploads) {
    console.log(`    ${url}`);
  }
  console.log(`  [official 目录: ${OFFICIAL_DIR}]`);
  for (const url of report.fsFiles.official) {
    console.log(`    ${url}`);
  }
  console.log();

  console.log("=".repeat(60));
  console.log(`  校验结果: ${s.status}`);
  console.log("=".repeat(60));
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes("--fix");

  console.log("🔍 叙境 资产完整性校验");
  console.log(`   模式: ${fixMode ? "检测+修复建议" : "只读检测"}`);
  console.log();

  // Step 1: 收集DB引用
  console.log("📋 Step 1: 收集数据库文件引用...");
  const dbRefs = await collectDbRefs();
  const activeUploadRefs = dbRefs.uploads.filter((r) => !r.source.startsWith("[DELETED]"));
  const activeOfficialRefs = dbRefs.official.filter((r) => !r.source.startsWith("[DELETED]"));
  console.log(`   uploads引用: ${activeUploadRefs.length} 条 (含已删除: ${dbRefs.uploads.length})`);
  console.log(`   official引用: ${activeOfficialRefs.length} 条 (含已删除: ${dbRefs.official.length})`);

  // Step 2: 扫描文件系统
  console.log("📂 Step 2: 扫描文件系统...");
  const fsFiles = collectFsFiles();
  console.log(`   uploads文件: ${fsFiles.uploads.length} 个`);
  console.log(`   official文件: ${fsFiles.official.length} 个`);

  // Step 3: 一致性检测
  console.log("🔎 Step 3: 一致性检测...");
  const fsUploadSet = new Set(fsFiles.uploads);
  const fsOfficialSet = new Set(fsFiles.official);
  const missingUploads = detectMissingFiles(activeUploadRefs, fsUploadSet);
  const missingOfficial = detectMissingFiles(activeOfficialRefs, fsOfficialSet);
  const missingFiles = [...missingUploads, ...missingOfficial];

  // Step 4: 生成报告
  console.log("📊 Step 4: 生成报告...");
  const report = buildReport(dbRefs, fsFiles, missingFiles, []);

  // 输出报告
  printReport(report);

  // --fix 模式：生成修复建议
  if (fixMode && report.orphanFiles.length > 0) {
    console.log();
    console.log("── 🔧 修复建议 (orphan_files清理) ─────────────────");
    console.log("  ⚠️  以下文件为僵尸文件，可安全删除（请人工确认后执行）:");
    console.log();
    for (const url of report.orphanFiles) {
      const fsPath = url.startsWith(UPLOAD_URL_PREFIX)
        ? path.join(UPLOAD_DIR, url.replace(UPLOAD_URL_PREFIX, ""))
        : path.join(OFFICIAL_DIR, url.replace(OFFICIAL_URL_PREFIX, ""));
      console.log(`  rm -f "${fsPath}"  # ${url}`);
    }
    console.log();
    console.log("  ⚠️  禁止使用 rsync --delete 清理目录！");
    console.log("  ⚠️  执行前请先备份: tar czf /tmp/orphan-backup-$(date +%s).tar.gz <files>");
  }

  // JSON报告输出到文件
  const reportDir = "/root/XuJing-web/docs/p1-security";
  const reportPath = path.join(reportDir, "integrity-check-report.json");
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n📄 JSON报告已保存: ${reportPath}`);
  } catch (err) {
    console.warn(`\n⚠️  JSON报告保存失败: ${err}`);
  }

  // 退出码
  process.exit(report.summary.status === "FAIL" ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ 完整性校验失败:", err);
  process.exit(2);
});
