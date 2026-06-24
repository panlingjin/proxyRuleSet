# ProxyRuleSet

Personal proxy rules and client configuration templates.

## Structure

- `rules/`: canonical custom rule lists.
- `clients/mihomo/`: Mihomo configuration templates.
- `clients/openclash/`: OpenClash subscription conversion template.
- `clients/sing-box/`: sing-box configuration templates.
- `scripts/`: helper scripts.

## Canonical Rule URLs

- Direct: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/rules/direct.list`
- Proxy Lite: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/rules/proxy-lite.list`
- Shouhou: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/rules/shouhou.list`
- Transit: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/rules/transit.list`

## Legacy Compatibility URLs

The root `.list` files are kept for existing subscriptions only. New references should use `rules/`.

- Direct: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/Direct.list`
- Proxy Lite: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/ProxyLite.list`
- Shouhou: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/Shouhou.list`
- Transit: `https://raw.githubusercontent.com/panlingjin/proxyRuleSet/refs/heads/main/Transit.list`

## Maintenance

Edit the canonical files in `rules/` first, then mirror the same content to the root compatibility files before publishing.
