const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");
const template = JSON.parse(read("config.json"));
const argumentsExample = JSON.parse(read("sub-store-arguments.json"));
// Sub-Store 以支持顶层 await 的文件脚本执行，测试不向生产脚本添加 Node 依赖。
const script = new vm.Script(`(async () => {\n${read("sub-store-generate.js")}\n})()`);
const node = (tag, fields = {}) => ({ type: "trojan", tag, server: "example.com", server_port: 443, password: "fixture", ...fields });
const nodes = ["hk 标准", "香港 2.00x", "🇭🇰 2a00x", "SG 标准", "新加坡 2.00x", "🇸🇬 2.00X", "jp 标准", "tw 标准", "us 标准", "德国"].map(tag => node(tag));
const minimal = () => ({ outbounds: [
  { tag: "手动切换", type: "selector", outbounds: ["直连"] },
  { tag: "直连", type: "direct" },
] });
const members = (config, tag) => config.outbounds.find(entry => entry.tag === tag).outbounds;

function execution(options = {}) {
  const input = typeof options.template === "string" ? options.template : JSON.stringify(options.template ?? template);
  const calls = [];
  const context = vm.createContext({
    $content: options.useFiles ? null : input,
    $files: [input],
    produceArtifact: async parameters => {
      calls.push(JSON.parse(JSON.stringify(parameters)));
      if (options.error !== undefined) throw options.error;
      return structuredClone(Object.hasOwn(options, "nodes") ? options.nodes : nodes);
    },
  });
  if (options.args !== undefined) context.$arguments = options.args;
  return { context, calls, original: context.$content };
}
async function generate(options) {
  const state = execution(options);
  await script.runInContext(state.context);
  return { config: JSON.parse(state.context.$content), calls: state.calls };
}
async function rejects(options, expected, beforeFetch = false) {
  const state = execution(options);
  await assert.rejects(script.runInContext(state.context), expected);
  assert.equal(state.context.$content, state.original, "失败时不得覆盖 $content");
  if (beforeFetch) assert.equal(state.calls.length, 0);
}

test("默认规则、JSON 参数示例和文件输入生成一致，保留模板的网络设置", async () => {
  const implicit = await generate();
  const explicit = await generate({ args: argumentsExample });
  const fallback = await generate({ useFiles: true });
  assert.deepEqual(implicit.config, explicit.config);
  assert.deepEqual(implicit.config, fallback.config);
  assert.deepEqual(argumentsExample, { name: "airport", type: "subscription" });
  assert.deepEqual(implicit.calls, [{ name: "airport", type: "subscription", platform: "sing-box", produceType: "internal" }]);
  const { outbounds: originalOutbounds, ...originalNetwork } = template;
  const { outbounds: generatedOutbounds, ...generatedNetwork } = implicit.config;
  assert.deepEqual(generatedNetwork, originalNetwork);
  assert.deepEqual(generatedOutbounds.slice(originalOutbounds.length), nodes);
  for (const original of originalOutbounds) {
    const actual = generatedOutbounds.find(entry => entry.tag === original.tag);
    if (["守候影院", "手动切换", "GLOBAL", "香港自动", "香港手动", "新加坡自动", "新加坡手动", "日本自动", "台湾自动", "美国自动"].includes(original.tag)) {
      const { outbounds: ignoredOriginal, ...originalFields } = original;
      const { outbounds: ignoredActual, ...actualFields } = actual;
      assert.deepEqual(actualFields, originalFields);
    } else assert.deepEqual(actual, original);
  }
});

test("默认地区筛选忽略大小写，只在香港和新加坡自动组排除高倍率", async () => {
  const { config } = await generate();
  assert.deepEqual(members(config, "香港自动"), ["hk 标准", "🇭🇰 2a00x"]);
  assert.deepEqual(members(config, "香港手动"), ["hk 标准", "香港 2.00x", "🇭🇰 2a00x"]);
  assert.deepEqual(members(config, "新加坡自动"), ["SG 标准"]);
  assert.deepEqual(members(config, "新加坡手动"), ["SG 标准", "新加坡 2.00x", "🇸🇬 2.00X"]);
  for (const [group, tag] of [["日本自动", "jp 标准"], ["台湾自动", "tw 标准"], ["美国自动", "us 标准"]]) {
    assert.deepEqual(members(config, group), [tag]);
  }
  for (const group of ["手动切换", "GLOBAL"]) assert.deepEqual(members(config, group), nodes.map(item => item.tag));
  assert.deepEqual(members(config, "守候影院"), ["直连", ...nodes.map(item => item.tag)]);
});

test("订阅名称清理首尾空白，保留名称内部的空格", async () => {
  for (const [rawName, name] of [[" \tairport\n", "airport"], ["  My Airport  ", "My Airport"]]) {
    const { calls } = await generate({ args: { name: rawName } });
    assert.equal(calls[0].name, name);
    assert.equal(calls[0].type, "subscription");
  }
});

for (const [group, aliases] of [
  ["香港自动", ["🇭🇰 01", "香港专线", "hk01", "HK-02", "_HK_03", "Hong Kong 04", "HongKong 05", "港01"]],
  ["新加坡自动", ["🇸🇬 01", "新加坡专线", "sg01", "Singapore 02", "狮城03", "獅城04", "狮01"]],
  ["日本自动", ["🇯🇵 01", "日本专线", "jp01", "Japan 02", "日01", "机场-日-02"]],
  ["台湾自动", ["🇹🇼 01", "台湾专线", "台灣02", "臺灣03", "tw01", "Taiwan 02", "台01"]],
  ["美国自动", ["🇺🇸 01", "美国专线", "美國02", "us01", "USA 02", "United States 03", "UnitedStates 04", "美01"]],
]) test(group + "识别旗帜、完整名称、数字代码和独立简写", async () => {
  const { config } = await generate({ nodes: aliases.map(tag => node(tag)) });
  assert.deepEqual(members(config, group), aliases);
});

test("地区代码和单字简写不误匹配 Network、PLUS、RUS 或公告词", async () => {
  const tags = ["🇭🇰 香港01 BGP Network", "Global Network", "德国 VIP PLUS", "俄罗斯 RUS 01", "到期日：2026-12-31", "每日更新", "完美专线", "平台测试", "Software", "Twitter公告", "status", "bonus", "ASGARD", "SHKService", "AJProxy"];
  const { config } = await generate({ nodes: tags.map(tag => node(tag)) });
  for (const group of ["日本自动", "台湾自动", "美国自动", "新加坡自动"]) assert.deepEqual(members(config, group), ["直连"]);
  assert.deepEqual(members(config, "香港自动"), [tags[0]]);
  assert.deepEqual(members(config, "手动切换"), tags);
});

for (const [prefix, automatic, manual] of [["HK", "香港自动", "香港手动"], ["SG", "新加坡自动", "新加坡手动"]]) {
  test(automatic + "按完整数值排除 >=2 倍率，保留小数低倍率与无标识节点", async () => {
    const rates = [
      ["0.2x", false], ["0.20x", false], ["1.2x", false], ["1.50x", false], ["1.99x", false], ["1.999x", false],
      ["2x", true], ["2.0x", true], ["2.00x", true], ["2.01X", true], ["3.00x", true], ["10x", true], ["20.5x", true],
      ["2 X", true], ["3×", true], ["2倍", true], ["1.50X", false], ["2a00x", false], ["2xray", false], ["普通线路", false],
      ["1.5x + 备用3x", true],
    ];
    const tagged = rates.map(([rate, high], index) => ({ tag: `${prefix} #${index} ${rate}`, high }));
    const { config } = await generate({ nodes: tagged.map(({ tag }) => node(tag)) });
    assert.deepEqual(members(config, automatic), tagged.filter(item => !item.high).map(item => item.tag));
    assert.deepEqual(members(config, manual), tagged.map(item => item.tag));
    assert.deepEqual(members(config, "GLOBAL"), tagged.map(item => item.tag));
  });
}

test("日本台湾美国自动组继续保留高倍率节点", async () => {
  const tags = ["日本 3x", "台湾 3倍", "美国 10X"];
  const { config } = await generate({ nodes: tags.map(tag => node(tag)) });
  for (const [index, group] of ["日本自动", "台湾自动", "美国自动"].entries()) assert.deepEqual(members(config, group), [tags[index]]);
});

test("通过 name 和 type 切换单订阅与组合订阅，固定分组规则不变", async () => {
  for (const type of ["subscription", "collection"]) {
    const args = { name: "第二机场", type };
    const { config, calls } = await generate({ template: minimal(), args, nodes: [node("线路-A"), node("线路-B")] });
    assert.deepEqual(members(config, "手动切换"), ["直连", "线路-A", "线路-B"]);
    assert.deepEqual(calls, [{ name: "第二机场", type, platform: "sing-box", produceType: "internal" }]);
    assert.equal(config.outbounds.length, 4);
    assert.equal("endpoints" in config, false);
  }
});

test("固定成员保持优先，注入节点去重并保持订阅顺序", async () => {
  const input = minimal();
  input.outbounds[0].outbounds = ["直连", "hk 标准", "直连"];
  const { config } = await generate({ template: input });
  assert.deepEqual(members(config, "手动切换"), ["直连", ...nodes.map(item => item.tag)]);
});

test("全节点分组统一填充，固定成员及有效 default 保留", async () => {
  const input = minimal();
  input.outbounds[0].default = "直连";
  input.outbounds.push({ tag: "GLOBAL", type: "selector", outbounds: [] });
  const { config } = await generate({ template: input });
  assert.deepEqual(members(config, "手动切换"), ["直连", ...nodes.map(item => item.tag)]);
  assert.deepEqual(members(config, "GLOBAL"), nodes.map(item => item.tag));
  assert.equal(config.outbounds[0].default, "直连");
});

test("WireGuard/Tailscale 分类到 endpoints，辅助出站和跨 endpoint 的 detour 保留", async () => {
  const converted = [
    node("SS", { type: "shadowsocks", detour: "SS_shadowtls" }),
    { type: "shadowtls", tag: "SS_shadowtls", detour: "WG" },
    { type: "wireguard", tag: "WG", detour: "直连" },
    { type: "tailscale", tag: "TS" },
  ];
  const input = minimal();
  input.endpoints = [{ type: "wireguard", tag: "已有端点" }];
  const { config } = await generate({ template: input, nodes: converted });
  assert.deepEqual(members(config, "手动切换"), ["直连", "SS", "SS_shadowtls", "WG", "TS"]);
  assert.deepEqual(config.outbounds.slice(2), converted.slice(0, 2));
  assert.deepEqual(config.endpoints, [...input.endpoints, ...converted.slice(2)]);
  const withoutEndpoints = await generate({ template: minimal(), nodes: converted });
  assert.deepEqual(withoutEndpoints.config.endpoints, converted.slice(2));
});

test("影院与其他分组采用相同注入逻辑，不移动或添加直连", async () => {
  const input = minimal();
  input.outbounds[0].tag = "守候影院";
  input.outbounds[0].outbounds = ["直连"];
  input.outbounds[1].tag = "直连";
  const withDirect = await generate({ template: input });
  assert.deepEqual(members(withDirect.config, "守候影院"), ["直连", ...nodes.map(item => item.tag)]);
  input.outbounds[0].outbounds = [];
  const withoutDirect = await generate({ template: input });
  assert.deepEqual(members(withoutDirect.config, "守候影院"), nodes.map(item => item.tag));
});

test("无匹配规则的固定服务组保持原样，不为未知名称注入节点", async () => {
  const input = minimal();
  input.outbounds.push({ tag: "自定义服务", type: "selector", outbounds: ["直连", "手动切换"] });
  const { config } = await generate({ template: input });
  assert.deepEqual(config.outbounds[2], input.outbounds[2]);
});

for (const [label, filtered, group] of [
  ["缺少日本", nodes.filter(item => !item.tag.startsWith("jp")), "日本自动"],
  ["香港只剩高倍率", nodes.filter(item => !["hk 标准", "🇭🇰 2a00x"].includes(item.tag)), "香港自动"],
  ["新加坡只剩高倍率", nodes.filter(item => item.tag !== "SG 标准"), "新加坡自动"],
]) test(label + "时空组引用模板直连", async () => {
  const { config } = await generate({ nodes: filtered });
  assert.deepEqual(members(config, group), ["直连"]);
  assert.equal(config.outbounds.some(entry => entry.tag === "COMPATIBLE"), false);
  assert.deepEqual(config.outbounds.find(entry => entry.tag === "直连"), template.outbounds.find(entry => entry.tag === "直连"));
  assert.deepEqual(members(config, "手动切换"), filtered.map(entry => entry.tag));
});

test("多个 selector/urltest 空组复用模板直连，不修改非空分组或直连设置", async () => {
  const input = minimal();
  input.outbounds[1].domain_resolver = { server: "dns_direct", strategy: "ipv4_only" };
  input.outbounds[1].bind_interface = "eth0";
  input.outbounds.push(
    { tag: "Empty selector", type: "selector", outbounds: [] },
    { tag: "Empty urltest", type: "urltest", outbounds: [] },
    { tag: "Fixed", type: "selector", outbounds: ["直连"] },
  );
  const { config } = await generate({ template: input });
  for (const group of ["Empty selector", "Empty urltest"]) assert.deepEqual(members(config, group), ["直连"]);
  assert.deepEqual(config.outbounds[1], input.outbounds[1]);
  assert.equal(config.outbounds.length, input.outbounds.length + nodes.length);
  assert.deepEqual(members(config, "Fixed"), ["直连"]);
  assert.deepEqual(members(config, "手动切换"), ["直连", ...nodes.map(entry => entry.tag)]);
});

test("模板原有 COMPATIBLE 保留，但新空组统一引用直连", async () => {
  const input = minimal();
  const compatible = { tag: "COMPATIBLE", type: "direct", domain_resolver: "dns_proxy" };
  input.outbounds.push(compatible, { tag: "Empty", type: "selector", outbounds: [] });
  const { config } = await generate({ template: input });
  assert.deepEqual(config.outbounds.filter(entry => entry.tag === "COMPATIBLE"), [compatible]);
  assert.deepEqual(members(config, "Empty"), ["直连"]);
});

test("没有空组时不额外创建任何兜底出站", async () => {
  const { config } = await generate();
  assert.equal(config.outbounds.some(entry => entry.tag === "COMPATIBLE"), false);
  assert.equal(config.outbounds.length, template.outbounds.length + nodes.length);
});

test("需要兜底但模板直连缺失、类型错误或仅存在于 endpoint 时明确报错", async () => {
  const input = minimal();
  input.outbounds[0].outbounds = [];
  input.outbounds.splice(1, 1);
  input.outbounds.push({ tag: "Empty", type: "selector", outbounds: [] });
  await rejects({ template: input }, /空组兜底需要模板.*直连.*direct/);
  input.endpoints = [{ tag: "直连", type: "wireguard" }];
  await rejects({ template: input }, /空组兜底需要模板.*直连.*direct/);
  delete input.endpoints;
  input.outbounds.push(node("直连"));
  await rejects({ template: input }, /空组兜底需要模板.*直连.*direct/);
});

test("空组兜底不能使用订阅额外生成的直连代替模板直连", async () => {
  const input = { outbounds: [{ tag: "Empty", type: "selector", outbounds: [] }] };
  await rejects({ template: input, nodes: [...nodes, { tag: "直连", type: "direct" }] }, /空组兜底需要模板.*直连.*direct/);
});

test("空组兜底不会掩盖错误的 default 或其他悬空引用", async () => {
  const input = minimal();
  input.outbounds.push({ tag: "Empty", type: "selector", outbounds: [], default: "missing" });
  await rejects({ template: input }, /Empty.*default/);
  delete input.outbounds[2].default;
  input.outbounds[0].outbounds.push("missing");
  await rejects({ template: input }, /手动切换.*不存在的成员引用/);
});

for (const [args, expected] of [
  [null, /参数必须是对象/],
  [[], /参数必须是对象/],
  [{ name: " " }, /name/],
  [{ name: 1 }, /name/],
  [{ name: null }, /name/],
  [{ type: "col" }, /type/],
  [{ type: null }, /type/],
  [{ outbound: "🕳.*" }, /仅支持 name 和 type.*outbound/],
  [{ outbounds: [] }, /仅支持 name 和 type.*outbounds/],
]) test("错误参数提前失败：" + JSON.stringify(args), () => rejects({ template: minimal(), args }, expected, true));

for (const [input, expected] of [
  ["{", /不是合法的 JSON/],
  ["null", /包含 outbounds 数组/],
  ["[]", /包含 outbounds 数组/],
  [{}, /包含 outbounds 数组/],
  [{ outbounds: [], endpoints: {} }, /endpoints 必须是数组/],
  [{ outbounds: [null] }, /非空 tag 和 type/],
  [{ outbounds: [{ tag: "", type: "direct" }] }, /非空 tag 和 type/],
  [{ outbounds: [{ tag: "Bad" }] }, /非空 tag 和 type/],
  [{ outbounds: [{ tag: "手动切换", type: "selector" }] }, /outbounds 必须是数组/],
]) test("错误模板提前失败：" + JSON.stringify(input), () => rejects({ template: input }, expected, true));

test("获取订阅失败、结果类型错误和空订阅时保留原输出", async () => {
  await rejects({ error: new Error("网络不可用") }, /airport.*网络不可用/);
  await rejects({ error: "网络不可用" }, /airport.*网络不可用/);
  await rejects({ error: null }, /airport.*null/);
  await rejects({ nodes: { outbounds: [] } }, /未返回 sing-box 节点数组/);
  await rejects({ nodes: [] }, /转换后没有节点/);
  await rejects({ nodes: [null] }, /非空 tag 和 type/);
});

test("订阅返回的全部类型统一参与分组匹配，包括辅助出站", async () => {
  const converted = [
    node("actual"),
    { tag: "source-shadowtls", type: "shadowtls" },
    { tag: "source-direct", type: "direct" },
    { tag: "source-block", type: "block" },
    { tag: "source-dns", type: "dns" },
    { tag: "source-selector", type: "selector", outbounds: ["actual"] },
    { tag: "source-urltest", type: "urltest", outbounds: ["actual"] },
  ];
  const { config } = await generate({ template: minimal(), nodes: converted });
  assert.deepEqual(members(config, "手动切换"), ["直连", ...converted.map(entry => entry.tag)]);
  assert.deepEqual(config.outbounds.slice(2), converted);
  const helperOnly = await generate({ template: minimal(), nodes: [node("Helper", { type: "shadowtls" })] });
  assert.deepEqual(members(helperOnly.config, "手动切换"), ["直连", "Helper"]);
});

test("节点之间、节点与分组、outbound 与 endpoint 的名称冲突均失败", async () => {
  await rejects({ nodes: [node("Duplicate"), node("Duplicate")] }, /名称重复：Duplicate/);
  await rejects({ nodes: [node("AI")] }, /名称重复：AI/);
  await rejects({ nodes: [node("WG"), { tag: "WG", type: "wireguard" }] }, /名称重复：WG/);
  const input = minimal();
  input.endpoints = [{ tag: "直连", type: "wireguard" }];
  await rejects({ template: input }, /名称重复：直连/, true);
});

for (const [label, modify, expected] of [
  ["悬空成员", input => input.outbounds[0].outbounds.push("missing"), /手动切换.*不存在的成员引用：missing/],
  ["占位符", input => input.outbounds[0].outbounds.push("{all}"), /手动切换.*未展开/],
  ["非法成员", input => input.outbounds[0].outbounds.push(null), /手动切换.*成员引用/],
  ["默认项无效", input => input.outbounds[0].default = "missing", /手动切换.*default/],
  ["默认项为空", input => input.outbounds[0].default = "", /手动切换.*default/],
  ["旧 filter", input => input.outbounds[0].filter = "HK", /手动切换.*filter/],
]) test("拒绝" + label, () => {
  const input = minimal();
  modify(input);
  return rejects({ template: input }, expected);
});

test("拒绝节点及 endpoint 的悬空 detour", async () => {
  for (const type of ["trojan", "wireguard"]) {
    await rejects({ template: minimal(), nodes: [node("broken", { type, detour: "missing" })] }, /broken.*detour.*missing/);
  }
});
