# sing-box 1.14.3

`config.json` 是订阅转换模板；`{all}` 和 `filter` 需要由转换服务展开，不能直接作为 sing-box 的完整运行配置。

## 版本备份

- `config.json`：当前针对 1.14.3 调整的模板。
- `config-1.13.4.json`：本轮升级修改前的原始模板，从 Git 提交 `c7d1556` 恢复并按字节核对一致。
- `config-1.11.json`：已有的 1.11 版本模板。

历史模板用于对应版本的恢复，不包含后续修改。升级或回滚时，使用匹配版本的内核检查订阅转换后的完整配置。

## 官方 Dashboard

模板通过顶层 `services` 启用官方 API 和 Dashboard，监听 `0.0.0.0:9091`，与原有 `9090` 端口的 zashboard 并行使用。两个面板均不启用认证，用于局域网访问。

在局域网浏览器中打开 `http://Debian地址:9091/dashboard/`。如面板要求填写连接信息，服务器地址使用 `http://Debian地址:9091`，密钥留空。原有 zashboard 地址为 `http://Debian地址:9090/ui/`。

面板文件保存在 sing-box 工作目录下的 `dashboard/`，由 sing-box 自动下载和更新；下载通过“节点选择”出站，需要可用节点和可写的工作目录。

## DNS 与测速

DNS 在模式规则和 HTTPS 查询拒绝规则之后，依次匹配自定义直连、自定义代理（含 `source-transit`）、国内分类和国外分类；最终使用 `dns_direct`。全局模式的数据流量使用 `GLOBAL` 分组。

`dns_direct` 指向局域网 AdGuard Home；`dns_proxy` 经“节点选择”查询 Google DoH，不经过 AdGuard Home。保留 sing-box 默认内存 DNS 缓存，不启用 DNS 缓存持久化 `store_dns` 或乐观缓存 `optimistic`；现有缓存文件继续启用。

自动测速 URL 使用 `https://www.gstatic.com/generate_204`，间隔为 `5m`，容差为 `50`。官方未填写间隔时的默认值为 `3m`；需要更频繁更新测速结果时可改为该值。

## 部署检查

使用 1.14.3 内核对订阅转换后的完整配置执行 `sing-box check -c <生成配置路径>`。本仓库的模板检查不能替代 Debian 上的启动和联网验证。

官方说明：<https://sing-box.sagernet.org/configuration/service/api/>。
