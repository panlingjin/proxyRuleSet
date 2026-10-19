#!/bin/bash

set -u
umask 077

# 可直接修改默认值，也可通过环境变量传入；DOWNLOAD_URL 必须是完整配置下载地址。
# 例如：sudo DOWNLOAD_URL='https://订阅服务/完整配置' bash scripts/update-sing-box.sh
DOWNLOAD_URL="${DOWNLOAD_URL:-}"
TARGET_DIR="${TARGET_DIR:-/etc/sing-box}"
TARGET_FILE="$TARGET_DIR/config.json"
BACKUP_FILE="$TARGET_FILE.bak"
SERVICE_NAME="${SERVICE_NAME:-sing-box}"
SING_BOX_BIN="${SING_BOX_BIN:-/usr/bin/sing-box}"
WORK_DIR="${WORK_DIR:-/var/lib/sing-box}"

# 流程：下载 → 检查 → 备份 → 替换 → 重载；用于已部署的单文件配置。
# 仅保留最近一份备份；重载失败时保留新配置及备份，供手动处理。
# reload 返回成功仅代表重载请求已提交，不代表新配置已完成启动或联网验证。
TEMP_FILE=""
BACKUP_TEMP=""

fail() {
    echo "错误: $*" >&2
    exit 1
}

cleanup() {
    local file
    for file in "$TEMP_FILE" "$BACKUP_TEMP"; do
        if [[ -n "$file" ]]; then
            rm -f -- "$file"
        fi
    done
}

trap cleanup EXIT
trap 'fail "收到中断信号，停止更新。"' INT TERM HUP

[[ $(id -u) == 0 ]] || fail "请使用 root 或 sudo 运行脚本。"
[[ -n "$DOWNLOAD_URL" ]] || fail "请先设置 DOWNLOAD_URL。"
for command in wget systemctl mktemp cp mv chown chmod rm; do
    command -v "$command" >/dev/null 2>&1 || fail "缺少必需命令: $command"
done
[[ -x "$SING_BOX_BIN" && ! -d "$SING_BOX_BIN" ]] || fail "sing-box 内核不可执行: $SING_BOX_BIN"
[[ -d "$TARGET_DIR" && -w "$TARGET_DIR" ]] || fail "配置目录不存在或不可写: $TARGET_DIR"
[[ -f "$TARGET_FILE" && ! -L "$TARGET_FILE" ]] || fail "当前配置必须是已存在的普通文件: $TARGET_FILE"
[[ -d "$WORK_DIR" ]] || fail "工作目录不存在: $WORK_DIR"
systemctl is-active --quiet "$SERVICE_NAME" || fail "服务未运行，请先检查服务状态。"

# 1. 下载：临时文件放在目标目录，且不以 .json 结尾，避免被内核加载。
echo "正在下载配置文件..."
TEMP_FILE=$(mktemp "$TARGET_DIR/.sing-box-config.XXXXXX") || fail "无法创建下载临时文件。"
wget -q --timeout=30 --tries=2 "$DOWNLOAD_URL" -O "$TEMP_FILE" ||
    fail "文件下载失败，请检查 URL 和网络连接。"
[[ -s "$TEMP_FILE" ]] || fail "下载的文件为空。"

# 2. 检查：校验失败直接退出，正式配置和已有备份均不变。
echo "正在校验新配置..."
"$SING_BOX_BIN" -D "$WORK_DIR" check -c "$TEMP_FILE" ||
    fail "新配置校验失败，保留原配置。"

# 3. 备份：先完成临时备份，再替换上一份备份；仅允许 root 读取。
echo "正在备份原配置..."
BACKUP_TEMP=$(mktemp "$TARGET_DIR/.sing-box-backup.XXXXXX") || fail "无法创建临时备份。"
if ! cp -- "$TARGET_FILE" "$BACKUP_TEMP" ||
    ! chown 0:0 "$BACKUP_TEMP" || ! chmod 600 "$BACKUP_TEMP" ||
    ! mv -fT -- "$BACKUP_TEMP" "$BACKUP_FILE"; then
    fail "备份失败，保留原配置。"
fi

# 4. 替换：继承原属主、属组和权限，再通过同一文件系统内的 mv 原子替换。
echo "正在替换配置..."
chown --reference="$TARGET_FILE" "$TEMP_FILE" &&
    chmod --reference="$TARGET_FILE" "$TEMP_FILE" || fail "无法设置新配置属主或权限。"
mv -fT -- "$TEMP_FILE" "$TARGET_FILE" || fail "配置替换失败，保留原配置。"

# 5. 重载：失败时报告备份位置，不自动回滚或重启服务。
echo "正在重载服务 ${SERVICE_NAME}..."
if ! systemctl reload "$SERVICE_NAME"; then
    fail "新配置已替换，但重载失败。旧配置备份: ${BACKUP_FILE}；请使用 journalctl -u ${SERVICE_NAME} 查看日志。"
fi
echo "配置已替换，重载请求已提交。旧配置备份: $BACKUP_FILE"
