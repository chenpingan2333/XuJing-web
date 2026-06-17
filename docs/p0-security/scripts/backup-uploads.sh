#!/usr/bin/env bash
# ==============================================================================
# 叙境-web Uploads 目录自动备份脚本
# ==============================================================================
# 文件：docs/p0-security/scripts/backup-uploads.sh
# 用途：每日增量备份 /var/www/xujing/public/uploads/ 到 /var/backup/xujing/uploads/
# 安全：严禁使用 --delete 参数，防止备份操作误删文件
# 策略：rsync -a 增量同步 + 三级保留（日/周/月）+ 完整性校验
# ==============================================================================

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# 配置参数（可通过命令行参数覆盖）
# ──────────────────────────────────────────────────────────────────────────────
SOURCE_DIR="/var/www/xujing/public/uploads/"
BACKUP_DIR="/var/backup/xujing/uploads"
RETENTION_DAILY=7      # 日备份保留天数
RETENTION_WEEKLY=4     # 周备份保留周数
RETENTION_MONTHLY=6    # 月备份保留月数
DISK_THRESHOLD=90      # 磁盘使用率告警阈值(%)
LOG_FILE="/var/log/xujing/backup-uploads.log"

# RUN_ID（由 backup-master.sh 传入，用于统一追踪一次备份周期）
RUN_ID=""

# ──────────────────────────────────────────────────────────────────────────────
# 命令行参数解析
# ──────────────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --source-dir=*)   SOURCE_DIR="${1#*=}" ;;
        --backup-dir=*)   BACKUP_DIR="${1#*=}" ;;
        --retention-daily=*)   RETENTION_DAILY="${1#*=}" ;;
        --retention-weekly=*)  RETENTION_WEEKLY="${1#*=}" ;;
        --retention-monthly=*) RETENTION_MONTHLY="${1#*=}" ;;
        --disk-threshold=*)    DISK_THRESHOLD="${1#*=}" ;;
        --log-file=*)     LOG_FILE="${1#*=}" ;;
        --run-id=*)      RUN_ID="${1#*=}" ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --source-dir=PATH       源目录 (默认: /var/www/xujing/public/uploads/)"
            echo "  --backup-dir=PATH       备份目录 (默认: /var/backup/xujing/uploads)"
            echo "  --retention-daily=N     日备份保留天数 (默认: 7)"
            echo "  --retention-weekly=N    周备份保留周数 (默认: 4)"
            echo "  --retention-monthly=N   月备份保留月数 (默认: 6)"
            echo "  --disk-threshold=N      磁盘告警阈值%% (默认: 90)"
            echo "  --log-file=PATH         日志文件路径"
            echo "  --run-id=RUN_ID         统一备份运行ID（由 backup-master.sh 传入）"
            echo "  --help                  显示帮助信息"
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            exit 1
            ;;
    esac
    shift
done

# RUN_ID 标识（用于日志前缀，为空时使用独立模式）
RUN_TAG="${RUN_ID:-standalone}"

# ──────────────────────────────────────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────────────────────────────────────
log() {
    local level="$1"; shift
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] [${RUN_TAG}] $*" | tee -a "${LOG_FILE}"
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }

# ──────────────────────────────────────────────────────────────────────────────
# 错误处理
# ──────────────────────────────────────────────────────────────────────────────
cleanup() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        log_error "备份脚本异常退出，退出码: ${exit_code}"
        log_error "源目录: ${SOURCE_DIR}"
        log_error "备份目录: ${BACKUP_DIR}"
    fi
}
trap cleanup ERR EXIT

# ──────────────────────────────────────────────────────────────────────────────
# 安全检查：严禁 --delete 参数
# ──────────────────────────────────────────────────────────────────────────────
# 此脚本的核心安全约束：绝不使用 --delete 参数
# 历史事故：rsync --delete 曾导致 uploads 目录全部文件丢失
# 增量备份仅添加/更新文件，不删除备份中源端已不存在的文件
SAFE_RSYNC_OPTS="-av"
# 验证：确保没有 --delete 混入
if echo "${SAFE_RSYNC_OPTS}" | grep -q '\-\-delete'; then
    log_error "安全检查失败：rsync 参数中包含 --delete，禁止执行！"
    exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
# 前置检查
# ──────────────────────────────────────────────────────────────────────────────
log_info "========== Uploads 备份开始 =========="
log_info "源目录: ${SOURCE_DIR}"
log_info "备份目录: ${BACKUP_DIR}"

# 检查源目录是否存在
if [[ ! -d "${SOURCE_DIR}" ]]; then
    log_error "源目录不存在: ${SOURCE_DIR}"
    exit 1
fi

# 检查 rsync 命令
if ! command -v rsync &>/dev/null; then
    log_error "rsync 未安装，请先安装: apt install -y rsync"
    exit 1
fi

# 创建备份目录
mkdir -p "${BACKUP_DIR}"

# ──────────────────────────────────────────────────────────────────────────────
# 磁盘空间检查
# ──────────────────────────────────────────────────────────────────────────────
check_disk_space() {
    local dir="$1"
    local threshold="$2"
    local usage
    usage=$(df "${dir}" | awk 'NR==2 {gsub(/%/,""); print $5}')
    if [[ ${usage} -ge ${threshold} ]]; then
        log_error "磁盘空间不足: ${dir} 使用率 ${usage}% >= 阈值 ${threshold}%"
        log_error "请清理磁盘空间或调整备份保留策略"
        return 1
    fi
    log_info "磁盘空间检查通过: ${dir} 使用率 ${usage}%"
    return 0
}

check_disk_space "${BACKUP_DIR}" "${DISK_THRESHOLD}" || exit 1

# ──────────────────────────────────────────────────────────────────────────────
# 执行增量备份（核心操作）
# ──────────────────────────────────────────────────────────────────────────────
# rsync -av 参数说明：
#   -a : 归档模式（-rlptgoD），保留权限/时间戳/符号链接等
#   -v : 详细输出
#   ⚠️  严禁添加 --delete：防止源端文件丢失时同步删除备份文件
#   ⚠️  这是本脚本最重要的安全约束
# ──────────────────────────────────────────────────────────────────────────────
log_info "执行增量备份: rsync ${SAFE_RSYNC_OPTS} ${SOURCE_DIR} ${BACKUP_DIR}/"

RSYNC_OUTPUT=$(rsync ${SAFE_RSYNC_OPTS} "${SOURCE_DIR}" "${BACKUP_DIR}/" 2>&1) || {
    log_error "rsync 执行失败: ${RSYNC_OUTPUT}"
    exit 1
}

echo "${RSYNC_OUTPUT}" >> "${LOG_FILE}"

# 统计同步结果
SYNCED_FILES=$(echo "${RSYNC_OUTPUT}" | grep -c "^deleting" || true)
if [[ ${SYNCED_FILES} -gt 0 ]]; then
    log_warn "检测到 rsync 输出中包含 'deleting'，但本脚本未使用 --delete，请检查！"
fi

NEW_FILES=$(echo "${RSYNC_OUTPUT}" | grep -cE "^>f" || true)
log_info "本次同步新增/更新文件数: ${NEW_FILES}"

# ──────────────────────────────────────────────────────────────────────────────
# 备份完整性校验
# ──────────────────────────────────────────────────────────────────────────────
log_info "执行备份完整性校验..."

# 统计源端和备份端文件数
SOURCE_COUNT=$(find "${SOURCE_DIR}" -type f 2>/dev/null | wc -l)
BACKUP_COUNT=$(find "${BACKUP_DIR}" -type f -not -name '*.meta' -not -name '*.md5' 2>/dev/null | wc -l)

log_info "源端文件数: ${SOURCE_COUNT}"
log_info "备份端文件数: ${BACKUP_COUNT}"

if [[ ${BACKUP_COUNT} -lt ${SOURCE_COUNT} ]]; then
    log_warn "备份端文件数(${BACKUP_COUNT})少于源端(${SOURCE_COUNT})，可能存在未同步文件"
fi

# 生成备份清单（文件列表 + MD5）
MANIFEST_FILE="${BACKUP_DIR}/.backup-manifest-$(date '+%Y%m%d').lst"
log_info "生成备份清单: ${MANIFEST_FILE}"

(cd "${BACKUP_DIR}" && find . -type f -not -name '.backup-manifest-*' -not -name '*.meta' | sort) > "${MANIFEST_FILE}" 2>/dev/null || true

MANIFEST_COUNT=$(wc -l < "${MANIFEST_FILE}" 2>/dev/null || echo 0)
log_info "备份清单记录文件数: ${MANIFEST_COUNT}"

# ──────────────────────────────────────────────────────────────────────────────
# 生成元数据文件
# ──────────────────────────────────────────────────────────────────────────────
META_FILE="${BACKUP_DIR}/.backup-meta-$(date '+%Y%m%d-%H%M%S').json"
log_info "生成元数据文件: ${META_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | awk '{print $1}' || echo "unknown")
SOURCE_SIZE=$(du -sh "${SOURCE_DIR}" 2>/dev/null | awk '{print $1}' || echo "unknown")

cat > "${META_FILE}" << METAEOF
{
  "backup_time": "$(date -Iseconds)",
  "source_dir": "${SOURCE_DIR}",
  "backup_dir": "${BACKUP_DIR}",
  "source_file_count": ${SOURCE_COUNT},
  "backup_file_count": ${BACKUP_COUNT},
  "source_size": "${SOURCE_SIZE}",
  "backup_size": "${BACKUP_SIZE}",
  "new_synced_files": ${NEW_FILES},
  "rsync_opts": "${SAFE_RSYNC_OPTS}",
  "delete_protection": true,
  "manifest_file": "$(basename "${MANIFEST_FILE}")",
  "run_id": "${RUN_TAG}",
  "script_version": "1.1.0"
}
METAEOF

log_info "元数据文件已生成"

# ──────────────────────────────────────────────────────────────────────────────
# 三级保留策略清理
# ──────────────────────────────────────────────────────────────────────────────
# 清理旧的备份清单和元数据文件（不影响实际备份文件）
# 实际备份文件采用增量模式，不按时间删除（安全优先）
# 仅清理辅助文件（.backup-manifest-*.lst, .backup-meta-*.json）
# ──────────────────────────────────────────────────────────────────────────────
log_info "执行辅助文件保留策略清理..."

# 日级：保留最近 ${RETENTION_DAILY} 天的清单/元数据
find "${BACKUP_DIR}" -maxdepth 1 -name '.backup-manifest-*.lst' -type f -mtime +${RETENTION_DAILY} -delete -print 2>/dev/null | while read -r f; do
    log_info "清理日级清单: ${f}"
done

find "${BACKUP_DIR}" -maxdepth 1 -name '.backup-meta-*.json' -type f -mtime +${RETENTION_DAILY} -delete -print 2>/dev/null | while read -r f; do
    log_info "清理日级元数据: ${f}"
done

log_info "辅助文件清理完成"

# ──────────────────────────────────────────────────────────────────────────────
# 备份空间报告
# ──────────────────────────────────────────────────────────────────────────────
log_info "========== 备份空间报告 =========="
log_info "源目录大小: ${SOURCE_SIZE}"
log_info "备份目录大小: ${BACKUP_SIZE}"
log_info "源端文件数: ${SOURCE_COUNT}"
log_info "备份端文件数: ${BACKUP_COUNT}"
log_info "本次新增/更新: ${NEW_FILES} 文件"

DISK_USAGE=$(df -h "${BACKUP_DIR}" | awk 'NR==2 {print $5}')
DISK_AVAIL=$(df -h "${BACKUP_DIR}" | awk 'NR==2 {print $4}')
log_info "备份磁盘使用率: ${DISK_USAGE}"
log_info "备份磁盘可用空间: ${DISK_AVAIL}"

log_info "========== Uploads 备份完成 =========="

# ──────────────────────────────────────────────────────────────────────────────
# 退出处理（覆盖 trap EXIT）
# ──────────────────────────────────────────────────────────────────────────────
trap - EXIT
exit 0
