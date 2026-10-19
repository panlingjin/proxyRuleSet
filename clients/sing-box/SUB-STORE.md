# 使用 Sub-Store / xream 生成完整 sing-box 配置

本方案仅使用 `config.json` 和 xream `template.js`，针对 sing-box 1.14.3。当前配置统一通过 Sub-Store 生成，不再维护另一份 Toperlock 模板；历史版本文件只用于备份。

## 文件用途

| 文件 | 用途 |
| --- | --- |
| `config.json` | 唯一当前模板，不含 `{all}` 和 `filter`，等待 xream 注入节点 |
| `sub-store-arguments.json` | xream 脚本参数示例，包含完整地区筛选条件 |
| `sub-store-postprocess.js` | 第二个文件脚本，恢复守候影院顺序并检查空组、重复名称和引用 |

## 1. 保存订阅

在 Sub-Store 中保存机场订阅，确认可以预览节点。多个机场可以先创建组合订阅。下文假设内部名称（name）为 `airport`，请替换为实际保存的名称。

模板包含香港、新加坡、日本、台湾、美国分组，订阅需要能匹配相应节点名。多个来源出现重名时，先通过订阅重命名操作加上机场前缀等标识。

## 2. 新建普通文件

进入“文件” → 新建：

| 项目 | 值 |
| --- | --- |
| 文件类型 | 普通文件（不是 mihomo 配置） |
| 文件名称 | `sing-box-config` |
| 来源 | 本地内容 |
| 内容 | 复制 `config.json` 的完整内容 |

“本地内容”保存在 Sub-Store 中，不是让服务读取你电脑的路径。

推送新增文件到 GitHub 后，也可以选择远程来源：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/panlingjin/proxyRuleSet/main/clients/sing-box/config.json
```

本地 Git 提交不会自动出现在远程。使用远程方式前先确认文件已推送。

## 3. 第一个文件脚本：xream 节点注入

在该文件的“脚本操作”中新建远程脚本，地址填写：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/xream/scripts/refs/heads/main/surge/modules/sub-store-scripts/sing-box/template.js
```

在参数编辑器中分别设置：

| 参数 | 值 |
| --- | --- |
| `name` | `airport`，替换为实际订阅内部名称 |
| `type` | 单条订阅填 `subscription`，组合订阅填 `collection` |
| `outbound` | 下方完整内容 |

```text
🕳^(守候影院|手动切换|GLOBAL)$
🕳^香港自动$🏷ℹ️^(?!.*2\.00x).*(?:🇭🇰|HK|香港|港|HongKong)
🕳^香港手动$🏷ℹ️🇭🇰|HK|香港|港|HongKong
🕳^新加坡自动$🏷ℹ️^(?!.*2\.00x).*(?:🇸🇬|SG|新加坡|狮|Singapore)
🕳^新加坡手动$🏷ℹ️🇸🇬|SG|新加坡|狮|Singapore
🕳^日本自动$🏷ℹ️🇯🇵|JP|日本|日|Japan
🕳^台湾自动$🏷ℹ️🇹🇼|TW|台湾|臺灣|台|Taiwan
🕳^美国自动$🏷ℹ️🇺🇸|US|美国|美|United States
```

这些参数也保存在 `sub-store-arguments.json` 中。使用键值参数编辑器时，`outbound` 填上方原始文本，不要额外加引号或手动 URL 编码；若手工将参数拼到脚本链接的 `#` 后面，需要 URL 编码。

`🕳` 后匹配分组名，`🏷` 后匹配节点名，`ℹ️` 表示忽略大小写。不含 `🏷` 的第一条给“守候影院”“手动切换”“GLOBAL”注入全部节点。香港和新加坡自动组排除包含字面量 `2.00x` 的节点，手动组不排除。

其余已有服务分组继续引用原来的地区组，脚本不直接向它们注入全部节点。DNS、路由、镜像下载和面板设置保持原样。

## 4. 第二个文件脚本：后处理

在 xream 脚本之后再添加一个本地文件脚本，粘贴 `sub-store-postprocess.js` 全部内容，不需要参数。

也可以在文件推送后使用远程脚本地址：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/panlingjin/proxyRuleSet/main/clients/sing-box/sub-store-postprocess.js
```

操作顺序必须是：模板 → xream → 后处理。

后处理将“守候影院”的“直连”移至末尾，保持原来的节点优先顺序。xream 遇到空组会自动插入 `COMPATIBLE` 直连节点，后处理会拒绝这类结果；同时检查空组、重复节点/分组名、未展开占位符和无效分组引用。缺少地区节点时需要调整订阅或筛选参数。

## 5. 预览、下载和部署

保存并预览文件输出，确认真实节点已注入、各地区组非空，且没有 `{all}`、`filter` 或 `COMPATIBLE` 兜底节点。

复制该文件的输出/分享链接，而不是仅输出节点的订阅链接。普通文件接口形式是 `/api/file/sing-box-config`，实际完整 URL 及访问前缀以 Sub-Store 复制出的链接为准。

在 Debian 上使用 1.14.3 内核检查生成后的完整配置：

```bash
curl --fail --location --output /tmp/sing-box-generated.json '粘贴Sub-Store文件链接'
sing-box check -c /tmp/sing-box-generated.json
```

检查通过后按现有部署流程备份、替换运行配置并重载服务。需要使用本仓库更新脚本时，`DOWNLOAD_URL` 应指向文件输出链接，其他路径及服务参数按目标机设置。生成配置不会自动替换 Debian 上的运行文件。

修改 DNS、路由或面板配置时，仅维护 `config.json`；修改地区筛选时，更新 `sub-store-arguments.json` 的 `outbound` 参数，并同步 Sub-Store 中保存的参数。URLTest 分组均采用“地区 自动”名称，重命名时需同时修改模板引用和筛选参数。

## 参考

- [xream 脚本源码](https://github.com/xream/scripts/blob/main/surge/modules/sub-store-scripts/sing-box/template.js)
- [Sub-Store 文件概览](https://sub-store-org.github.io/doc/file/overview)
- [Sub-Store 文件脚本](https://sub-store-org.github.io/doc/file/scripts)
- [Sub-Store 脚本参数](https://sub-store-org.github.io/doc/script/usage)
