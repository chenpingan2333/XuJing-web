#!/bin/bash
# ==============================================================================
# 叙境-web PostgreSQL 自动备份脚本
# ==============================================================================
# 版本: v1.0
# 创建日期: 2026-06-17
# 用途: 对 xujing 数据库执行全量逻辑备份，压缩存储，自动清理过期备份
# 调度: 建议每日 02:00 CST 执行（cron）
# ==============================================================================
# ⚠️ 注意事项:
#   1. 需要配置 ~/.pgpass 文件或设置 PGPASSWORD 环境变量
#   2. 脚本以 postgres 用户或具有 pg_dump 权限的用户运行
#   3. 确保备份目录有足够磁盘空间（建议 > 5GB）
#   4. 此脚本仅做方案设计，未在生产环境执行
# ==============================================================================

set -euo pipefail

# ======================== 配置区 ========================

# 数据库连接信息
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_NAME="xujing"
DB_USER="postgres"
# 密码通过 ~/.pgpass 文件提供，格式:
# hostname:port:database:username:password
# 127.0.0.1:5432:xujing:postgres:YOUR_PASSWORD
# ~/.pgpass 权限必须为 600

# 备份目录
BACKUP_DIR="/var/backup/xujing/postgres"

# 备份保留策略
DAILY_RETAIN_DAYS=7      # 每日备份保留天数
WEEKLY_RETAIN_WEEKS=4    # 每周备份保留周数
MONTHLY_RETAIN_MONTHS=6  # 每月备份保留月数

# 备份文件命名
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/xujing-${TIMESTAMP}.dump.gz"
BACKUP_FILE_UNCOMPRESSED="${BACKUP_DIR}/xujing-${TIMESTAMP}.dump"

# 日志配置
LOG_DIR="/var/log/xujing-backup"
LOG_FILE="${LOG_DIR}/backup-postgres-${TIMESTAMP}.log"

# RUN_ID（由 backup-master.sh 传入，用于统一追踪一次备份周期）
RUN_ID=""

# 告警邮件（可选）
# ALERT_EMAIL="admin@example.com"

# ======================== 命令行参数解析 ========================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --run-id=*)
            RUN_ID="${1#*=}"
            ;;
        --help|-h)
            echo "用法: $0 [--run-id=RUN_ID]"
            echo ""
            echo "选项:"
            echo "  --run-id=RUN_ID   统一备份运行ID（由 backup-master.sh 传入）"
            echo "  --help            显示帮助信息"
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

# ======================== 函数定义 ========================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] [${RUN_TAG}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() {
    log "INFO" "$@"
}

log_warn() {
    log "WARN" "$@"
}

log_error() {
    log "ERROR" "$@"
}

# 检查前置条件
check_prerequisites() {
    # 检查 pg_dump 是否可用
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump 命令未找到，请确认 PostgreSQL 客户端已安装"
        exit 1
    fi

    # 检查备份目录是否存在
    if [ ! -d "${BACKUP_DIR}" ]; then
        log_warn "备份目录不存在，正在创建: ${BACKUP_DIR}"
        mkdir -p "${BACKUP_DIR}"
    fi

    # 检查日志目录是否存在
    if [ ! -d "${LOG_DIR}" ]; then
        mkdir -p "${LOG_DIR}"
    fi

    # 检查磁盘空间（至少 1GB 可用）
    local available_kb
    available_kb=$(df -P "${BACKUP_DIR}" | awk 'NR==2 {print $4}')
    local available_gb=$((available_kb / 1024 / 1024))
    if [ "${available_gb}" -lt 1 ]; then
        log_error "磁盘空间不足: ${BACKUP_DIR} 仅剩 ${available_gb}GB，至少需要 1GB"
        exit 1
    fi
    log_info "磁盘空间检查通过: ${available_gb}GB 可用"

    # 检查数据库连接
    if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" &> /dev/null; then
        log_error "数据库连接失败: ${DB_HOST}:${DB_PORT}"
        exit 1
    fi
    log_info "数据库连接检查通过"
}

# 执行备份
perform_backup() {
    log_info "开始备份数据库: ${DB_NAME}"
    log_info "备份文件: ${BACKUP_FILE}"

    local start_time=$(date +%s)

    # 使用 pg_dump 自定义格式（-Fc），支持并行恢复
    # 通过管道直接压缩，不保留未压缩文件
    if pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -Fc \
        --no-password \
        "${DB_NAME}" \
        | gzip -9 > "${BACKUP_FILE}" 2>> "${LOG_FILE}"; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # 获取备份文件大小
        local file_size
        file_size=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null || echo "0")
        local file_size_mb=$((file_size / 1024 / 1024))

        log_info "备份完成! 耗时: ${duration}s, 文件大小: ${file_size_mb}MB"
    else
        log_error "pg_dump 执行失败"
        # 清理不完整的备份文件
        rm -f "${BACKUP_FILE}"
        exit 1
    fi
}

# 校验备份完整性
verify_backup() {
    log_info "校验备份文件完整性..."

    # gzip 完整性校验
    if gzip -t "${BACKUP_FILE}" 2>> "${LOG_FILE}"; then
        log_info "gzip 完整性校验通过"
    else
        log_error "gzip 完整性校验失败，备份文件可能已损坏"
        exit 1
    fi

    # 检查文件大小（至少 1KB）
    local file_size
    file_size=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null || echo "0")
    if [ "${file_size}" -lt 1024 ]; then
        log_error "备份文件异常小 (${file_size} bytes)，可能备份失败"
        exit 1
    fi

    log_info "备份文件大小: $((file_size / 1024))KB"
}

# 记录备份元数据
record_metadata() {
    local metadata_file="${BACKUP_FILE}.meta"
    local db_size
    db_size=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        -t -A -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'))" 2>/dev/null || echo "unknown")

    local table_count
    table_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "unknown")

    cat > "${metadata_file}" << EOF
run_id=${RUN_TAG}
backup_time=${TIMESTAMP}
database=${DB_NAME}
db_size=${db_size}
table_count=${table_count}
backup_file=$(basename ${BACKUP_FILE})
backup_size=$(stat -c%s ${BACKUP_FILE} 2>/dev/null || echo "unknown")
pg_dump_version=$(pg_dump --version)
hostname=$(hostname)
EOF

    chmod 640 "${metadata_file}"
    log_info "元数据已记录: ${metadata_file}"
}

# 清理过期备份
cleanup_old_backups() {
    log_info "清理过期备份..."

    local cleaned=0

    # 清理超过 DAILY_RETAIN_DAYS 天的每日备份（保留周日的）
    local daily_cutoff=$(date -d "-${DAILY_RETAIN_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${DAILY_RETAIN_DAYS}d +%Y%m%d 2>/dev/null || echo "")
    if [ -n "${daily_cutoff}" ]; then
        for f in "${BACKUP_DIR}"/xujing-*.dump.gz; do
            [ -f "$f" ] || continue
            local file_date=$(basename "$f" | grep -oP '^xujing-\K\d{8}')
            local file_dow=$(date -d "${file_date}" +%w 2>/dev/null || echo "0")

            # 保留周日的备份（用于周备份策略）
            if [ "${file_dow}" = "0" ]; then
                continue
            fi

            if [ "${file_date}" -lt "${daily_cutoff}" ]; then
                log_info "删除过期每日备份: $(basename $f)"
                rm -f "$f" "${f}.meta"
                cleaned=$((cleaned + 1))
            fi
        done
    fi

    # 清理超过 WEEKLY_RETAIN_WEEKS 周的周日备份（保留每月1日的）
    local weekly_cutoff=$(date -d "-${WEEKLY_RETAIN_WEEKS} weeks" +%Y%m%d 2>/dev/null || date -v-${WEEKLY_RETAIN_WEEKS}w +%Y%m%d 2>/dev/null || echo "")
    if [ -n "${weekly_cutoff}" ]; then
        for f in "${BACKUP_DIR}"/xujing-*.dump.gz; do
            [ -f "$f" ] || continue
            local file_date=$(basename "$f" | grep -oP '^xujing-\K\d{8}')
            local file_dom=$(date -d "${file_date}" +%d 2>/dev/null || echo "00")

            # 保留每月1日的备份（用于月备份策略）
            if [ "${file_dom}" = "01" ]; then
                continue
            fi

            # 仅处理周日备份
            local file_dow=$(date -d "${file_date}" +%w 2>/dev/null || echo "0")
            if [ "${file_dow}" != "0" ]; then
                continue
            fi

            if [ "${file_date}" -lt "${weekly_cutoff}" ]; then
                log_info "删除过期每周备份: $(basename $f)"
                rm -f "$f" "${f}.meta"
                cleaned=$((cleaned + 1))
            fi
        done
    fi

    # 清理超过 MONTHLY_RETAIN_MONTHS 月的月备份
    local monthly_cutoff=$(date -d "-${MONTHLY_RETAIN_MONTHS} months" +%Y%m%d 2>/dev/null || date -v-${MONTHLY_RETAIN_MONTHS}m +%Y%m%d 2>/dev/null || echo "")
    if [ -n "${monthly_cutoff}" ]; then
        for f in "${BACKUP_DIR}"/xujing-*.dump.gz; do
            [ -f "$f" ] || continue
            local file_date=$(basename "$f" | grep -oP '^xujing-\K\d{8}')
            local file_dom=$(date -d "${file_date}" +%d 2>/dev/null || echo "00")

            # 仅处理每月1日的备份
            if [ "${file_dom}" != "01" ]; then
                continue
            fi

            if [ "${file_date}" -lt "${monthly_cutoff}" ]; then
                log_info "删除过期每月备份: $(basename $f)"
                rm -f "$f" "${f}.meta"
                cleaned=$((cleaned + 1))
            fi
        done
    fi

    log_info "清理完成，共删除 ${cleaned} 个过期备份"
}

# 发送告警（可选）
send_alert() {
    local subject="$1"
    local body="$2"

    # 方式一：邮件告警
    # echo "${body}" | mailx -s "${subject}" "${ALERT_EMAIL}"

    # 方式二：企业微信 Webhook
    # curl -s -X POST "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY" \
    #     -H 'Content-Type: application/json' \
    #     -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"${subject}\n${body}\"}}"

    log_info "告警: ${subject}"
}

# ======================== 主流程 ========================

main() {
    log_info "========================================"
    log_info "PostgreSQL 备份任务开始"
    log_info "RUN_ID: ${RUN_TAG}"
    log_info "========================================"

    # 1. 前置检查
    check_prerequisites

    # 2. 执行备份
    perform_backup

    # 3. 校验完整性
    verify_backup

    # 4. 记录元数据
    record_metadata

    # 5. 清理过期备份
    cleanup_old_backups

    # 6. 输出备份摘要
    local file_size
    file_size=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}" 2>/dev/null || echo "0")
    local file_size_mb=$((file_size / 1024 / 1024))

    log_info "========================================"
    log_info "备份任务完成!"
    log_info "  文件: ${BACKUP_FILE}"
    log_info "  大小: ${file_size_mb}MB"
    log_info "========================================"
}

# 捕获错误
trap 'log_error "备份任务异常终止，行号: $LINENO"; send_alert "[叙境] PG备份失败" "备份任务在行 $LINENO 异常终止"; exit 1' ERR

# 执行
main "$@"
