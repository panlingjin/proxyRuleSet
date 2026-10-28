// Sub-Store 普通文件脚本：放在 sub-store-generate.js 之后。
// 在本脚本的参数编辑器中填写 { "dns_node_path": "/dns-query/真实key" }。
// 真实参数仅保存在自己的 Sub-Store 中；公开模板和脚本不包含密钥。
const args = typeof $arguments === "undefined" ? {} : $arguments;
if (!args || typeof args !== "object" || Array.isArray(args) ||
    Object.keys(args).some(key => key !== "dns_node_path")) {
  throw new Error("请在本注入脚本的参数编辑器中仅填写 dns_node_path");
}

const dnsNodePath = args.dns_node_path;
if (typeof dnsNodePath !== "string" || !dnsNodePath.startsWith("/") ||
    dnsNodePath.startsWith("//") || /[\s#]/u.test(dnsNodePath) ||
    dnsNodePath === "/dns-query/xxx") {
  throw new Error("dns_node_path 必须是以 / 开头的真实 DoH 路径，不能包含空白或片段标识");
}

let config;
try {
  config = JSON.parse($content ?? $files[0]);
} catch {
  // 不转发解析错误，避免错误消息携带包含密钥的配置片段。
  throw new Error("输入不是合法的 JSON 配置");
}
if (!config || typeof config !== "object" || Array.isArray(config) ||
    !Array.isArray(config.dns?.servers)) {
  throw new Error("配置必须包含 dns.servers 数组");
}

const servers = config.dns.servers.filter(server => server?.tag === "dns_node");
if (servers.length !== 1 || servers[0].type !== "https") {
  throw new Error("配置中必须存在且仅存在一个 tag 为 dns_node 的 https DNS 服务器");
}

// 路径按原值注入，保留已有的百分号编码和查询参数；不输出参数或配置日志。
servers[0].path = dnsNodePath;
// 全部校验通过后才覆盖输出。
$content = JSON.stringify(config, null, 2);
