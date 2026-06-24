#!/bin/bash

# 定义配置
DOWNLOAD_URL=""  # 替换为实际下载URL
TEMP_FILE="/tmp/sing-box-config.tmp"
TARGET_DIR="/etc/sing-box"
TARGET_FILE="$TARGET_DIR/config.json"
SERVICE_NAME="sing-box"  # 替换为实际服务名

# 错误处理函数
handle_error() {
    echo "错误: $1"
    echo "操作失败，请检查日志。"
    exit 1
}

# 步骤1: 下载文件
echo "正在下载配置文件..."
if ! wget -q --timeout=30 --tries=2 "$DOWNLOAD_URL" -O "$TEMP_FILE"; then
    handle_error "文件下载失败！请检查URL和网络连接。"
fi

# 检查下载文件是否非空
if [ ! -s "$TEMP_FILE" ]; then
    handle_error "下载的文件为空！"
fi

# 备份原有配置文件（如果存在）
# if [ -f "$TARGET_FILE" ]; then
#     backup_file="${TARGET_FILE}.bak_$(date +%Y%m%d%H%M%S)"
#     if ! cp "$TARGET_FILE" "$backup_file"; then
#         handle_error "配置文件备份失败！"
#     fi
#     echo "已备份原配置: $backup_file"
# fi

# 复制新配置文件
echo "安装新配置文件..."
if ! cp "$TEMP_FILE" "$TARGET_FILE"; then
    handle_error "文件复制到 $TARGET_DIR 失败！"
fi

# 清理临时文件
echo "清理临时文件..."
rm -f "$TEMP_FILE"


# 步骤3: 重载服务
echo "重载服务 $SERVICE_NAME..."
if ! systemctl reload "$SERVICE_NAME"; then
    handle_error "服务重载失败！请使用 journalctl -u $SERVICE_NAME 查看日志"
fi

echo "所有操作已完成！"