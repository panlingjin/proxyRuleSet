# 使用 Sub-Store 生成完整 sing-box 配置

本方案针对 sing-box 1.14.3，流程为：`config.json` 模板 → `sub-store-generate.js` → 完整配置。一个文件脚本完成节点注入和校验，地区识别和分组筛选固定在脚本顶部的 `REGIONS`、`GROUP_RULES` 中。

## 文件用途

| 文件 | 用途 |
| --- | --- |
| `config.json` | 唯一当前模板，维护 DNS、路由、规则集、入站、分组和面板 |
| `sub-store-generate.js` | 读取订阅或组合订阅，按固定规则填充分组并校验输出 |
| `sub-store-arguments.json` | 仅包含 `name` 和 `type` 的参数示例 |

## 1. 保存订阅

在 Sub-Store 中保存机场订阅，确认可以预览节点。多个机场先创建组合订阅。下文假设内部名称（name）为 `airport`，替换为实际保存的名称。

模板包含香港、新加坡、日本、台湾、美国分组，按节点名称匹配地区；缺少地区节点时，对应空组会回退直连。多个来源出现重名时，先通过订阅重命名操作加上机场前缀等标识；脚本不自动改名。

## 2. 新建普通文件

进入“文件” → 新建：

| 项目 | 值 |
| --- | --- |
| 文件类型 | 普通文件（不是 mihomo 配置） |
| 文件名称 | `sing-box-config` |
| 来源 | 本地内容 |
| 内容 | 复制 `config.json` 的完整内容 |

“本地内容”保存在 Sub-Store 中，不是让服务读取电脑上的文件路径。也可以选择远程来源：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/panlingjin/proxyRuleSet/main/clients/sing-box/config.json
```

本地提交不会自动出现在远程；使用远程模板或脚本前，先确认对应文件已推送。

## 3. 添加生成脚本与参数

在该文件的“脚本操作”中添加一个本地脚本，粘贴 `sub-store-generate.js` 全部内容。文件推送后，也可以使用远程脚本地址：

```text
https://gh-proxy.com/https://raw.githubusercontent.com/panlingjin/proxyRuleSet/main/clients/sing-box/sub-store-generate.js
```

只支持以下两个参数：

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `name` | 已保存的订阅内部名称，不是显示名称或 URL | `airport` |
| `type` | 单订阅填 `subscription`，组合订阅填 `collection` | `subscription` |

参数示例也保存在 `sub-store-arguments.json`：

```json
{
  "name": "airport",
  "type": "subscription"
}
```

通常只需修改 `name`，名称首尾空白会自动清理，内部空格保留；组合订阅再设置 `type=collection`，不传 `type` 则默认使用 `subscription`。其他参数（包括旧的 `outbound`）会报错，请从参数编辑器中移除。`type` 不接受 `1`、`组合订阅` 等别名。

## 4. 固定分组规则与校验

| 分组 | 注入节点 |
| --- | --- |
| 香港自动 | 香港节点，排除名称中标明倍率 ≥2 的节点 |
| 香港手动 | 全部香港节点 |
| 新加坡自动 | 新加坡节点，排除名称中标明倍率 ≥2 的节点 |
| 新加坡手动 | 全部新加坡节点 |
| 日本自动、台湾自动、美国自动 | 对应地区的全部节点 |
| 守候影院、手动切换、GLOBAL | Sub-Store 返回的全部节点 |
| 其他服务分组 | 保留模板中的成员，空组使用直连兜底 |

地区识别支持旗帜、完整中英文名称，以及带边界的地区代码，忽略大小写。代码两侧不能紧邻英文字母，但允许 `HK01`、`JP02`、`_TW_` 等命名，避免把 `Network`、`PLUS`、`RUS` 当作地区代码。`港`、`狮`、`日`、`台`、`美` 简写两侧不能紧邻汉字或英文字母，因此保留 `日01`，但不匹配“到期日”“完美专线”等词。需要调整地区识别时，修改脚本顶部的 `REGIONS`。

高倍率按完整数值判断，识别数字后接 `x`、`X`、`×` 或“倍”（中间允许空白）的标记，例如 `2x`、`2.0x`、`2.00x`、`3×`、`2倍`。倍率 ≥2 时从香港、新加坡自动组中排除；`0.2x`、`1.2x`、`1.50x` 等低倍率保留，没有可识别标记时也保留。手动组、全节点组及日本、台湾、美国自动组不排除高倍率。该判断依赖节点名称，不查询机场实际计费；筛选范围由 `GROUP_RULES` 中的 `excludeHighMultiplier` 控制。

所有分组统一保留模板原有成员，再按订阅顺序追加匹配节点，并对成员名称去重；不单独重排任何分组。当前模板“守候影院”的“直连”因此仍排在首位，后面追加订阅节点。脚本不创建分组，不对未知分组名称自动注入订阅节点。节点注入完成后，任何仍为空的 `selector` 或 `urltest` 都填入模板中的“直连”tag，使分组非空。

脚本从 `$content ?? $files[0]` 解析 JSON 模板，调用 `produceArtifact({ name, type, platform: "sing-box", produceType: "internal" })` 获取转换后的节点。全部返回条目统一按名称和倍率参与分组匹配，不按类型额外筛选。普通出站（包括辅助出站）保存在 `outbounds`；WireGuard、Tailscale 放入 `endpoints`。

协议转换由 Sub-Store 完成。转换器不支持的节点可能被跳过，应查看 Sub-Store 日志；脚本拒绝转换后节点数组为空的结果。协议支持仍受后端版本和目标 sing-box 内核约束。

空组直接引用模板 `outbounds` 中 `tag: "直连"`、`type: "direct"` 的出站，完整沿用其 `domain_resolver` 等设置，不额外创建 `COMPATIBLE`。需要兜底却找不到该模板出站时，报错停止生成；不会使用订阅额外生成的同名节点或 endpoint 代替。模板里已有的历史 `COMPATIBLE` 出站仍按普通配置保留。非空组不会额外添加兜底成员。缺少地区节点或倍率排除后为空时，该组实际走直连，不再保证对应地区出口。

输出前检查模板和参数、节点/分组/endpoint 名称唯一性、成员引用、`default` 和 `detour` 引用是否存在，拒绝 `{all}` 与旧 `filter`。不在生成脚本中检查依赖循环，完整配置仍需交给 sing-box 检查。兜底只补空组，不修复不存在的引用或无效 `default`；订阅请求失败或转换后的节点数组为空时，仍报错停止生成。

只有全部检查通过才写入 `$content`，失败时保留原输入并抛出包含相关分组或节点名称的错误。DNS、路由顺序、规则集、TUN、面板和测速参数沿用模板。脚本的引用检查不能替代 sing-box 对完整配置的检查。

## 5. 预览、下载和部署

保存并预览文件输出，确认真实节点已注入、分组非空、原成员顺序保留，且没有 `{all}` 或 `filter`。若某个地区组只有“直连”，表示该组未匹配到符合条件的节点并回退直连；需要地区出口时，应调整订阅节点名称或脚本筛选规则。

复制该文件的输出/分享链接，而不是仅输出节点的订阅链接。普通文件接口形式是 `/api/file/sing-box-config`，完整 URL 和访问前缀以 Sub-Store 复制出的链接为准。

在 Debian 上使用 1.14.3 内核检查生成后的完整配置：

```bash
curl --fail --location --output /tmp/sing-box-generated.json '粘贴Sub-Store文件链接'
sing-box check -c /tmp/sing-box-generated.json
```

检查通过后，按现有部署流程备份、替换运行配置并重载服务。使用本仓库的 `scripts/update-sing-box.sh` 时，`DOWNLOAD_URL` 指向文件输出链接；其他路径及服务参数按目标机设置。生成脚本不会自动替换 Debian 上的文件或重载服务。

## 原有 xream 流程迁移

将普通文件中的 xream 和后处理操作替换为一个 `sub-store-generate.js` 操作，仅保留 `name`、`type` 两个参数，删除 `outbound`。不要把新脚本叠加在 xream 后面，否则已注入节点会触发名称冲突。

新流程只需一个生成脚本，不应再添加旧后处理操作。本仓库的参数示例仅用于新生成脚本。

修改 DNS、路由或面板时维护 `config.json`；修改筛选时维护生成脚本的 `REGIONS`、`GROUP_RULES` 并同步本文。重命名分组时同步修改模板中的引用及脚本中的对应名称。历史版本配置仍仅用于对应版本的恢复。

## 本地测试

在仓库根目录使用 Node.js 22 或更新版本执行：

```bash
node --test clients/sing-box/sub-store-generate.test.cjs
```

测试通过模拟 Sub-Store 文件脚本上下文检查生成行为，不联网获取真实订阅，也不运行 sing-box；实际 Sub-Store 预览和目标 Debian 内核检查仍需执行。

## 参考

- [Sub-Store 文件脚本](https://sub-store-org.github.io/doc/file/scripts)
- [Sub-Store 脚本 API](https://sub-store-org.github.io/doc/script/api)
- [Sub-Store 脚本参数](https://sub-store-org.github.io/doc/script/usage)
