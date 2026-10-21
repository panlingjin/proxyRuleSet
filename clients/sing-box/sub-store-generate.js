// Sub-Store 普通文件脚本：读取 config.json 模板，注入订阅节点并校验后输出。
// 仅支持 name（默认 airport）、type（subscription / collection）两个参数。
// 分组筛选固定在此处；所有分组统一保留模板成员，再追加匹配节点。
// 英文地区代码不能嵌在单词内；单字简写两侧不能紧邻汉字或英文字母。
const REGIONS = {
  hk: /🇭🇰|香港|(?:^|[^a-z])(?:HK|Hong\s*Kong)(?![a-z])|(?:^|[^a-z\u3400-\u9fff])港(?=$|[^a-z\u3400-\u9fff])/i,
  sg: /🇸🇬|新加坡|狮城|獅城|(?:^|[^a-z])(?:SG|Singapore)(?![a-z])|(?:^|[^a-z\u3400-\u9fff])狮(?=$|[^a-z\u3400-\u9fff])/i,
  jp: /🇯🇵|日本|(?:^|[^a-z])(?:JP|Japan)(?![a-z])|(?:^|[^a-z\u3400-\u9fff])日(?=$|[^a-z\u3400-\u9fff])/i,
  tw: /🇹🇼|台湾|台灣|臺灣|(?:^|[^a-z])(?:TW|Taiwan)(?![a-z])|(?:^|[^a-z\u3400-\u9fff])台(?=$|[^a-z\u3400-\u9fff])/i,
  us: /🇺🇸|美国|美國|(?:^|[^a-z])(?:US|USA|United\s*States)(?![a-z])|(?:^|[^a-z\u3400-\u9fff])美(?=$|[^a-z\u3400-\u9fff])/i,
};
const GROUP_RULES = [
  { tags: ["守候影院", "手动切换", "GLOBAL"], pattern: /.*/ },
  { tags: ["香港自动"], pattern: REGIONS.hk, excludeHighMultiplier: true },
  { tags: ["香港手动"], pattern: REGIONS.hk },
  { tags: ["新加坡自动"], pattern: REGIONS.sg, excludeHighMultiplier: true },
  { tags: ["新加坡手动"], pattern: REGIONS.sg },
  { tags: ["日本自动"], pattern: REGIONS.jp },
  { tags: ["台湾自动"], pattern: REGIONS.tw },
  { tags: ["美国自动"], pattern: REGIONS.us },
];

function isHighMultiplier(tag) {
  // 提取完整数值再比较，避免把 1.50x 的小数尾部误判成 50x。
  for (const match of tag.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:x|×|倍)(?![a-z0-9])/gi)) {
    if (Number(match[1]) >= 2) return true;
  }
  return false;
}

const args = typeof $arguments === "undefined" ? {} : $arguments;
if (!args || typeof args !== "object" || Array.isArray(args)) {
  throw new Error("脚本参数必须是对象，请使用 Sub-Store 参数编辑器");
}
const unsupported = Object.keys(args).filter(key => !["name", "type"].includes(key));
if (unsupported.length) throw new Error(`仅支持 name 和 type 参数，请移除：${unsupported.join("、")}`);
const { name: rawName = "airport", type = "subscription" } = args;
if (typeof rawName !== "string" || !rawName.trim()) throw new Error("name 必须是非空订阅内部名称");
const name = rawName.trim();
if (!["subscription", "collection"].includes(type)) {
  throw new Error("type 仅支持 subscription 或 collection");
}

let config;
try {
  config = JSON.parse($content ?? $files[0]);
} catch {
  throw new Error("模板不是合法的 JSON 配置");
}
if (!config || typeof config !== "object" || Array.isArray(config) || !Array.isArray(config.outbounds)) {
  throw new Error("模板必须是包含 outbounds 数组的 JSON 对象");
}
if (config.endpoints !== undefined && !Array.isArray(config.endpoints)) {
  throw new Error("模板 endpoints 必须是数组");
}

const isGroup = entry => ["selector", "urltest"].includes(entry.type);
const entries = new Map();
function register(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      typeof entry.tag !== "string" || !entry.tag.trim() ||
      typeof entry.type !== "string" || !entry.type.trim()) {
    throw new Error("节点、分组或 endpoint 必须具有非空 tag 和 type");
  }
  if (entries.has(entry.tag)) throw new Error(`节点或分组名称重复：${entry.tag}，请在订阅中重命名`);
  if ("filter" in entry) throw new Error(`${entry.tag} 仍包含 filter，请使用当前 config.json 模板`);
  if (isGroup(entry) && !Array.isArray(entry.outbounds)) {
    throw new Error(`${entry.tag} 的 outbounds 必须是数组`);
  }
  entries.set(entry.tag, entry);
}
for (const entry of [...config.outbounds, ...(config.endpoints ?? [])]) register(entry);

const groups = config.outbounds.filter(isGroup);
const templateDirect = config.outbounds.find(entry => entry.tag === "直连" && entry.type === "direct");

let nodes;
try {
  nodes = await produceArtifact({ name, type, platform: "sing-box", produceType: "internal" });
} catch (error) {
  throw new Error(`读取 ${type} 订阅 ${name} 失败：${error?.message ?? error}`);
}
if (!Array.isArray(nodes)) throw new Error("Sub-Store 未返回 sing-box 节点数组，请检查后端版本");
for (const node of nodes) register(node);

if (!nodes.length) throw new Error(`订阅 ${name} 转换后没有节点`);

for (const group of groups) {
  const matchingRules = GROUP_RULES.filter(rule => rule.tags.includes(group.tag));
  if (!matchingRules.length) continue;
  const matched = nodes.filter(node => matchingRules.some(rule =>
    rule.pattern.test(node.tag) && (!rule.excludeHighMultiplier || !isHighMultiplier(node.tag))
  ));
  group.outbounds = [...new Set([...group.outbounds, ...matched.map(node => node.tag)])];
}

const endpointNodes = nodes.filter(node => ["wireguard", "tailscale"].includes(node.type));
config.outbounds.push(...nodes.filter(node => !["wireguard", "tailscale"].includes(node.type)));
if (endpointNodes.length) config.endpoints = [...(config.endpoints ?? []), ...endpointNodes];

// 空组直接引用模板的“直连”，沿用其 DNS 等设置，不额外创建出站。
const emptyGroups = [...entries.values()].filter(entry => isGroup(entry) && !entry.outbounds.length);
if (emptyGroups.length) {
  if (!templateDirect) {
    throw new Error("空组兜底需要模板 outbounds 中存在 tag 为“直连”的 direct 出站");
  }
  for (const group of emptyGroups) group.outbounds.push(templateDirect.tag);
}

// 检查分组成员、默认项及 detour 引用是否存在。
for (const entry of entries.values()) {
  if (isGroup(entry)) {
    for (const tag of entry.outbounds) {
      if (typeof tag !== "string" || tag === "{all}" || !entries.has(tag)) {
        throw new Error(`${entry.tag} 包含未展开或不存在的成员引用：${tag}`);
      }
    }
    if (entry.default !== undefined && !entry.outbounds.includes(entry.default)) {
      throw new Error(`${entry.tag} 的 default 不在分组中：${entry.default}`);
    }
  }
  if (entry.detour !== undefined) {
    if (typeof entry.detour !== "string" || !entries.has(entry.detour)) {
      throw new Error(`${entry.tag} 包含不存在的 detour 引用：${entry.detour}`);
    }
  }
}

// 所有检查通过才覆盖输出，避免把部分生成的配置交给下一步。
$content = JSON.stringify(config, null, 2);
