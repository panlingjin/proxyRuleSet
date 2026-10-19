// 放在 xream template.js 之后，作为第二个文件脚本运行，不需要参数。
const config = JSON.parse($content ?? $files[0]);
if (!Array.isArray(config.outbounds)) throw new Error("缺少 outbounds，请先运行 xream 模板脚本");

const entries = [...config.outbounds, ...(config.endpoints ?? [])];
const tags = new Set();
for (const entry of entries) {
  if (typeof entry.tag !== "string" || !entry.tag || tags.has(entry.tag)) {
    throw new Error(`节点或分组名称无效/重复：${entry.tag}`);
  }
  tags.add(entry.tag);
  if (entry.tag === "COMPATIBLE" && entry.type === "direct") {
    throw new Error("xream 为缺少节点的分组添加了 COMPATIBLE 直连，请检查订阅及 outbound 筛选参数");
  }
}

const cinema = config.outbounds.find(outbound => outbound.tag === "守候影院");
if (!cinema || !Array.isArray(cinema.outbounds)) throw new Error("缺少守候影院分组");
// xream 追加节点后，将固定的“直连”移到末尾，保持原模板的节点优先顺序。
cinema.outbounds = [...cinema.outbounds.filter(tag => tag !== "直连"), "直连"];

for (const outbound of config.outbounds) {
  if ("filter" in outbound) throw new Error(`${outbound.tag} 仍包含 filter，请使用 config.json`);
  if (!["selector", "urltest"].includes(outbound.type)) continue;
  if (!Array.isArray(outbound.outbounds) || !outbound.outbounds.length) {
    throw new Error(`${outbound.tag} 是空分组`);
  }
  for (const tag of outbound.outbounds) {
    if (tag === "{all}" || !tags.has(tag)) {
      throw new Error(`${outbound.tag} 包含未展开或不存在的引用：${tag}`);
    }
  }
  if (outbound.default && !outbound.outbounds.includes(outbound.default)) {
    throw new Error(`${outbound.tag} 的 default 不在分组中`);
  }
}

$content = JSON.stringify(config, null, 2);
