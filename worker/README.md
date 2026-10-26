# CORS 透传代理

只做一件事：让浏览器能直连那些不返回 `Access-Control-Allow-Origin` 的模型厂商。

## 为什么需要

浏览器的同源策略会拦下响应（请求其实发出去了，响应被藏起来）。
表现为「连接失败 / 网络不可达 / CORS」，重试和改代码都没用。

实测被挡的：**智谱 `open.bigmodel.cn`**。
OpenAI / Anthropic / DeepSeek / Groq / Mistral 通常可直接连，**不需要代理**。

## 部署（约 5 分钟）

```bash
npm i -g wrangler
wrangler login
wrangler deploy worker/cors-proxy.js --name astrum-cors
```

部署完会得到一个地址：

```
https://astrum-cors.<你的账号>.workers.dev
```

免费额度 **10 万请求/天**，一次问答消耗 1 个请求。

## 前端怎么配

设置 → 回答来源 → 选中被挡的厂商（如「智谱」）→ 把 **端点** 改成：

```
https://astrum-cors.<你的账号>.workers.dev/?to=https://open.bigmodel.cn/api/paas/v4/chat/completions
```

**密钥照旧填你自己的**，不用改。

## 必须改 CSP

`index.html` 的 `connect-src` 里加上你的 Worker 域名：

```
https://astrum-cors.<你的账号>.workers.dev
```

改完**必须重新构建**：

```bash
node tools/sync-csp-hash.js
node tools/build-standalone.js
```

否则 CSP 哈希失效，脚本会被浏览器拒绝执行（表现为整页空白）。

## 安全说明

| 点 | 做法 |
| --- | --- |
| 不持有 key | Worker 只转发你的 `Authorization` 头，自己不存任何密钥 |
| 不要共享 key | 若想「所有人都能用」，密钥必须放在 Worker 里，那会变成你的账单 |
| 白名单 | 只放行名单内的上游域名，否则地址会被人当免费代理 |
| 只允许 POST | 不需要 GET/PUT/DELETE |

## 自测

```bash
curl -i -X POST "https://astrum-cors.<你的账号>.workers.dev/?to=https://open.bigmodel.cn/api/paas/v4/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的key" \
  -d '{"model":"glm-4-flash","messages":[{"role":"user","content":"hi"}]}'
```

能看到 `access-control-allow-origin: *` 就说明通了。

## 不想建 Worker 的替代

**本地反代**（只适合自己用）：

```bash
npx local-cors-proxy --proxyUrl https://open.bigmodel.cn --port 8010
```

端点填 `http://localhost:8010/api/paas/v4/chat/completions`。
本项目 CSP 已允许 `http://localhost:*`，无需改动。
