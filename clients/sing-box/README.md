# sing-box 1.14.3

`config.json` 是唯一的当前模板，使用 Sub-Store 的 xream 脚本生成完整配置。按 [生成完整配置说明](SUB-STORE.md) 设置 `sub-store-arguments.json` 中的参数，并在 xream 之后运行 `sub-store-postprocess.js`。模板不含 `{all}` 和 `filter`；空分组需要填入节点后才能运行。

## 版本备份

- `config.json`：当前针对 1.14.3 的 Sub-Store/xream 模板。
- `config-1.13.4.json`：本轮升级修改前的原始模板，从 Git 提交 `c7d1556` 恢复并按字节核对一致。
- `config-1.11.json`：已有的 1.11 版本模板。

历史模板用于对应版本的恢复，不包含后续修改。升级或回滚时，使用匹配版本的内核检查订阅转换后的完整配置。

## 面板

模板通过顶层 `services` 启用官方 API 和 Dashboard，监听 `0.0.0.0:9091`，与 `9090` 端口的 Yacd-meta（Clash API）并行使用。两个面板均不启用认证，用于局域网访问。

官方面板地址为 `http://Debian地址:9091/dashboard/`。如面板要求填写连接信息，服务器地址使用 `http://Debian地址:9091`，密钥留空。

Yacd-meta 地址为 `http://Debian地址:9090/ui/`，后端地址为 `http://Debian地址:9090`，密钥留空。`external_ui` 使用独立的 `yacd` 目录；首次部署时该目录为空，sing-box 会经 `gh-proxy.com` 镜像直连下载面板，避免继续加载旧 `ui` 目录中的 zashboard 文件。目录名不改变浏览器的 `/ui/` 访问路径。

官方面板文件保存在 sing-box 工作目录下的 `dashboard/`，由 sing-box 自动下载和更新；显式配置 GitHub 归档的 `gh-proxy.com` 镜像地址，使用共享“直连下载”HTTP 客户端，需要直连网络和可写的工作目录。

## DNS 与测速

DNS 先拒绝 HTTPS 类型查询，再匹配模式规则；规则模式下依次匹配自定义直连、自定义代理（含 `source-transit`）、国内分类和国外分类，最终使用 `dns_direct`。全局模式的数据流量使用 `GLOBAL` 分组。

启用 `dns.reverse_mapping`，根据经 sing-box 返回的 DNS 响应保存 IP 与域名映射，为后续路由补充域名信息；保留协议嗅探。DNS 劫持规则匹配目标端口 53 或嗅探识别出的 DNS 协议，两者满足任一条件即执行 `hijack-dns`。

`dns_direct` 指向局域网 AdGuard Home；`dns_proxy` 经“节点选择”查询 Google DoH，不经过 AdGuard Home。保留 sing-box 默认内存 DNS 缓存，不启用 DNS 缓存持久化 `store_dns` 或乐观缓存 `optimistic`；现有缓存文件继续启用。

`route.default_domain_resolver` 使用 `dns_resolver`（`223.5.5.5`），用于未单独指定解析器的代理节点域名解析；“直连”出站显式指定 `domain_resolver: "dns_direct"`，目标域名继续交给 AdGuard Home。客户端 DNS 查询仍按 `dns.rules` 分流。

远程规则集通过顶层 `http_clients` 中的“直连下载”客户端下载，由 `route.default_http_client` 统一指定，出口为“直连”。全部 20 个远程规则集、官方 Dashboard 和 Yacd-meta 的 GitHub 下载地址均添加 `https://gh-proxy.com/` 前缀，格式为 `https://gh-proxy.com/https://原始GitHub地址`。规则集不再使用已弃用的 `download_detour`；Yacd-meta 通过 `external_ui_download_detour: "直连"` 指定下载出口。

规则集优先使用 SagerNet 官方仓库：14 个域名分类使用 `SagerNet/sing-geosite` 的 `rule-set` 分支，国内 IP 使用 `SagerNet/sing-geoip` 的 `rule-set` 分支。配置中的标签及引用保持不变，`geosite-ai` 对应官方文件 `geosite-category-ai-!cn.srs`。官方当前没有 `geoip-google`、`geoip-telegram`、`geoip-twitter`、`geoip-netflix`、`geoip-apple`，这 5 项继续使用 MetaCubeX 原来源；自定义内联规则保留。来源切换后同名分类的具体覆盖范围可能不同，部署后应检查常用服务分流。

当前模板的自动测速组省略 `url`、`interval` 和 `tolerance`，使用 sing-box 默认值：测速 URL 为 `https://www.gstatic.com/generate_204`，间隔为 `3m`，容差为 `50ms`。

自动测速分组统一命名为“香港自动”“新加坡自动”“日本自动”“台湾自动”“美国自动”，分组引用和 xream 筛选参数同步使用这些名称。

## 路由顺序

首条路由规则在嗅探前执行 `bypass`：全局模式之外，目标为私有 IP 或命中 `geoip-cn`，且端口不是 53 或 853 的 auto_redirect 连接，在预匹配阶段由内核直接转发。当前 Debian TUN 已启用 `auto_route` 和 `auto_redirect`。命中国内 IP 的连接优先旁路，即使域名原本会命中代理或服务分组，也不会再执行后续域名分流、嗅探及 QUIC/STUN 拦截。

`bypass` 未指定 `outbound`，因此 HTTP/SOCKS 等非 auto_redirect 连接会跳过此规则，继续匹配原有私有 IP 直连等规则。全局模式也跳过该旁路规则，后续仍沿用原有的私有 IP 直连及 `GLOBAL` 规则。旁路匹配按端口排除常用 DNS：53 继续参与 DNS 劫持，853 继续交给后续规则；其他端口上符合旁路条件的流量不再执行 DNS 协议识别。末尾的 `geoip-cn` 直连规则继续保留，用于未旁路的连接。

未旁路的连接随后依次处理嗅探、DNS 劫持、私有 IP 直连、853/STUN/QUIC 拒绝和模式规则，并保留自定义规则的优先级。服务分类按域名匹配，再匹配国内外通用域名分类；Apple、Google、Telegram、Twitter、Netflix 和国内 IP 规则统一放在域名规则之后，避免服务 IP 规则抢先覆盖后面的域名分类。

嗅探规则排除已知目标域名为 `push.apple.com`（含子域名）的 Apple 推送连接，以及目标 IP 命中 `geoip-telegram` 的连接；仅跳过嗅探，出站仍由后续规则决定。Apple 推送域名需要在嗅探前已经可用，例如由 HTTP/SOCKS 请求或 DNS 反向映射提供；只有未知 IP 的连接无法靠此域名条件排除。其他流量保留默认全部嗅探器及 `300ms` 超时，不采用参考配置的 `100ms`。

当前拒绝规则匹配目标端口 853 或已识别的 STUN/QUIC 协议，位于私有 IP 直连之后、模式规则之前，适用于直连、规则和全局模式。设置 `no_drop: true`，避免高频触发后自动切换为静默丢弃。协议条件依赖嗅探识别：已旁路、跳过嗅探或未成功识别的 STUN/QUIC 无法保证拦截；不按端口统一封禁 UDP 443。

`mixed-in` 在所有域名规则之后、IP 规则之前执行 `resolve`，让未匹配域名规则的 HTTP/SOCKS 请求先解析，再按服务 IP 和国内 IP 分类。该动作未指定 `server`，解析遵循 `dns.rules`，未命中时使用 `dns.final`；已命中前面域名规则的请求不会执行这一步。最终仍由“漏网之鱼”分组处理。

## 部署检查

使用 1.14.3 内核对订阅转换后的完整配置执行 `sing-box check -c <生成配置路径>`。本仓库的模板检查不能替代 Debian 上的启动和联网验证。

官方说明：<https://sing-box.sagernet.org/configuration/service/api/>。
