const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");
const template = JSON.parse(read("config.json"));
const script = new vm.Script(read("sub-store-inject-dns-node.js"));
const privatePath = "/dns-query/test-only-key%2Fvalue?token=test%2Bvalue";

function execution(options = {}) {
  const input = typeof options.config === "string" ? options.config : JSON.stringify(options.config ?? template);
  const logs = [];
  const context = vm.createContext({
    $content: options.useFiles ? null : input,
    $files: [input],
    console: Object.fromEntries(["log", "info", "warn", "error", "debug"].map(method => [method, (...args) => logs.push(args)])),
  });
  if (Object.hasOwn(options, "args")) context.$arguments = options.args;
  else context.$arguments = { dns_node_path: privatePath };
  return { context, logs, original: context.$content };
}

function rejects(options, expected) {
  const state = execution(options);
  assert.throws(() => script.runInContext(state.context), error => {
    assert.match(error.message, expected);
    assert.ok(!error.message.includes(privatePath), "错误不能包含私有路径");
    return true;
  });
  assert.equal(state.context.$content, state.original, "失败时不覆盖输入");
  assert.deepEqual(state.logs, []);
}

test("只更新 dns_node.path，保留编码、查询参数及其他配置，不记录日志", () => {
  const state = execution();
  script.runInContext(state.context);
  const expected = structuredClone(template);
  expected.dns.servers.find(server => server.tag === "dns_node").path = privatePath;
  assert.deepEqual(JSON.parse(state.context.$content), expected);
  assert.deepEqual(state.logs, []);
  const firstOutput = state.context.$content;
  const repeated = vm.createContext({ $content: firstOutput, $arguments: { dns_node_path: privatePath } });
  script.runInContext(repeated);
  assert.equal(repeated.$content, firstOutput);
});

test("支持从 $files 读取输入", () => {
  const state = execution({ useFiles: true });
  script.runInContext(state.context);
  assert.equal(JSON.parse(state.context.$content).dns.servers.find(server => server.tag === "dns_node").path, privatePath);
});

test("缺少参数或参数格式错误时停止，错误消息不回显参数", () => {
  for (const args of [undefined, null, [], {}, { dns_node_path: privatePath, [privatePath]: true }]) {
    rejects({ args }, /dns_node_path/);
  }
});

test("拒绝空路径、完整 URL、空白、片段和模板占位符", () => {
  for (const dns_node_path of ["", 1, "https://example.com/dns-query/key", "//example.com/key", "/dns-query/key\n", "/dns-query/key#fragment", "/dns-query/xxx"]) {
    rejects({ args: { dns_node_path } }, /dns_node_path/);
  }
});

test("JSON 错误不会泄露输入片段，错误结构不产生输出", () => {
  rejects({ config: `{"private": "${privatePath}", broken` }, /合法的 JSON/);
  for (const config of ["null", "[]", "{}", '{"dns":{"servers":{}}}']) {
    rejects({ config }, /dns.servers/);
  }
});

test("缺失、重复或类型错误的 dns_node 均停止", () => {
  for (const servers of [[], [{ tag: "dns_node", type: "udp" }], [{ tag: "dns_node", type: "https" }, { tag: "dns_node", type: "https" }]]) {
    rejects({ config: { dns: { servers } } }, /dns_node/);
  }
});

test("可接在现有生成脚本之后，节点和生成配置保留", async () => {
  const state = execution();
  state.context.$arguments = { name: "airport", type: "subscription" };
  state.context.produceArtifact = async () => [{ type: "trojan", tag: "香港测试", server: "example.com", server_port: 443, password: "fixture" }];
  await new vm.Script(`(async () => {\n${read("sub-store-generate.js")}\n})()`).runInContext(state.context);
  const expected = JSON.parse(state.context.$content);
  expected.dns.servers.find(server => server.tag === "dns_node").path = privatePath;
  state.context.$arguments = { dns_node_path: privatePath };
  script.runInContext(state.context);
  assert.deepEqual(JSON.parse(state.context.$content), expected);
  assert.deepEqual(state.logs, []);
});
