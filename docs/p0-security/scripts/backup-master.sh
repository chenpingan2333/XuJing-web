#!/usr/bin/env bash
# ==============================================================================
# 叙境-web 统一备份调度脚本 (Backup Master)
# ==============================================================================
# 文件：docs/p0-security/scripts/backup-master.sh
# 用途：生成统一 RUN_ID，串联调度 PG备份 + Uploads备份，统一日志与状态追踪
# 调度：cron 每日 02:00 CST 执行此脚本（替代分别调度两个子脚本）
# 设计：
#   - 每次执行生成唯一 RUN_ID（时间戳+随机后缀），贯穿整个备份周期
#   - 子脚本通过 --run-id 参数接收 RUN_ID，写入各自备份的元数据
#   - 恢复时通过 RUN_ID 精确定位同一次备份的 DB快照 + 文件快照
#   - 任一子任务失败不阻断后续任务，最终汇总报告
# ==============================================================================

set -euo pipefail

# ======================== 配置区 ========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 子脚本路径
PG_BACKUP_SCRIPT="${SCRIPT_DIR}/backup-postgres.sh"
UPLOADS_BACKUP_SCRIPT="${SCRIPT_DIR}/backup-uploads.sh"

# 统一日志
LOG_DIR="/var/log/xujing-backup"
LOG_FILE="${LOG_DIR}/backup-master-$(date +%Y%m%d_%H%M%S).log"

# RUN_ID 生成格式：run-YYYYMMDD-HHMMSS-XXXX（XXXX为4位随机hex）
RUN_ID="run-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2 2>/dev/null || echo $((RANDOM % 65536)) | xargs printf '%04x')"

# RUN_ID 状态文件目录（用于恢复时按 RUN_ID 查找）
RUN_STATE_DIR="/var/backup/xujing/runs"

# ======================== 函数定义 ========================

log() {
    local level="$1"; shift
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] [${RUN_ID}] $*" | tee -a "${LOG_FILE}"
}

log_info()  { log "INFO"  "$@"; }
log_warn()  { log "WARN"  "$@"; }
log_error() { log "ERROR" "$@"; }

# 记录 RUN 状态（供恢复演练时按 RUN_ID 定位）
record_run_state() {
    local status="$1"  # started / pg_done / uploads_done / completed / failed
    local detail="$2"

    mkdir -p "${RUN_STATE_DIR}"
    local state_file="${RUN_STATE_DIR}/${RUN_ID}.state"

    cat >> "${state_file}" << EOF
[$(date '+%Y-%m-%d %H:%M:%S')] status=${status} detail=${detail}
EOF

    chmod 640 "${state_file}"
}

# 生成 RUN 摘要文件
generate_run_summary() {
    local pg_status="$1"
    local uploads_status="$2"
    local start_time="$3"
    local end_time="$4"

    local summary_file="${RUN_STATE_DIR}/${RUN_ID}.summary"

    cat > "${summary_file}" << EOF
run_id=${RUN_ID}
start_time=${start_time}
end_time=${end_time}
pg_backup_status=${pg_status}
uploads_backup_status=${uploads_status}
overall_status=$([ "${pg_status}" = "SUCCESS" ] && [ "${uploads_status}" = "SUCCESS" ] && echo "SUCCESS" || echo "PARTIAL_FAILURE")
log_file=${LOG_FILE}
hostname=$(hostname)
EOF

    chmod 640 "${summary_file}"
    log_info "RUN 摘要已生成: ${summary_file}"
}

# ======================== 主流程 ========================

main() {
    local run_start_time
    run_start_time=$(date '+%Y-%m-%d %H:%M:%S')

    # 创建日志目录
    mkdir -p "${LOG_DIR}"
    mkdir -p "${RUN_STATE_DIR}"

    log_info "========================================"
    log_info "叙境统一备份调度开始"
    log_info "RUN_ID: ${RUN_ID}"
    log_info "========================================"

    record_run_state "started" "master script initiated"

    # ------------------------ Phase 1: PG 备份 ------------------------
    local pg_status="SKIPPED"

    if [[ -x "${PG_BACKUP_SCRIPT}" ]]; then
        log_info "---------- [Phase 1] PostgreSQL 备份开始 ----------"
        record_run_state "pg_start" "starting pg backup"

        if "${PG_BACKUP_SCRIPT}" --run-id="${RUN_ID}" 2>&1 | tee -a "${LOG_FILE}"; then
            pg_status="SUCCESS"
            record_run_state "pg_done" "pg backup succeeded"
            log_info "PostgreSQL 备份成功"
        else
            pg_status="FAILED"
            record_run_state "pg_failed" "pg backup failed with exit code $?"
            log_error "PostgreSQL 备份失败，继续执行后续任务"
        fi
    else
        log_warn "PG 备份脚本不存在或不可执行: ${PG_BACKUP_SCRIPT}"
        pg_status="MISSING"
    fi

    # ------------------------ Phase 2: Uploads 备份 ------------------------
    local uploads_status="SKIPPED"

    if [[ -x "${UPLOADS_BACKUP_SCRIPT}" ]]; then
        log_info "---------- [Phase 2] Uploads 备份开始 ----------"
        record_run_state "uploads_start" "starting uploads backup"

        if "${UPLOADS_BACKUP_SCRIPT}" --run-id="${RUN_ID}" 2>&1 | tee -a "${LOG_FILE}"; then
            uploads_status="SUCCESS"
            record_run_state "uploads_done" "uploads backup succeeded"
            log_info "Uploads 备份成功"
        else
            uploads_status="FAILED"
            record_run_state "uploads_failed" "uploads backup failed with exit code $?"
            log_error "Uploads 备份失败"
        fi
    else
        log_warn "Uploads 备份脚本不存在或不可执行: ${UPLOADS_BACKUP_SCRIPT}"
        uploads_status="MISSING"
    fi

    # ------------------------ Phase 3: 周日快照 ------------------------
    # 周日 03:30 由 cron 单独调度 tar 快照，此处仅记录提醒
    local dow
    dow=$(date +%w)
    if [[ "${dow}" = "0" ]]; then
        log_info "今天是周日，请确认 tar 快照任务已由 cron 调度（03:30）"
    fi

    # ------------------------ 汇总报告 ------------------------
    local run_end_time
    run_end_time=$(date '+%Y-%m-%d %H:%M:%S')

    generate_run_summary "${pg_status}" "${uploads_status}" "${run_start_time}" "${run_end_time}"

    log_info "========================================"
    log_info "叙境统一备份调度完成"
    log_info "  RUN_ID:    ${RUN_ID}"
    log_info "  PG:        ${pg_status}"
    log_info "  Uploads:   ${uploads_status}"
    log_info "  Overall:   $([ "${pg_status}" = "SUCCESS" ] && [ "${uploads_status}" = "SUCCESS" ] && echo "SUCCESS" || echo "PARTIAL_FAILURE")"
    log_info "========================================"

    # 任一失败则退出码为1（便于 cron 告警）
    if [[ "${pg_status}" != "SUCCESS" ]] || [[ "${uploads_status}" != "SUCCESS" ]]; then
        record_run_state "completed" "partial or full failure"
        exit 1
    fi

    record_run_state "completed" "all tasks succeeded"
    exit 0
}

# 捕获未处理错误
trap 'log_error "Master 脚本异常终止，行号: $LINENO"; record_run_state "failed" "trap at line $LINENO"; exit 1' ERR

# 执行
main "$@"
