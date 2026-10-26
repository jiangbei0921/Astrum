/* ASTRUM · CORS 透传代理（Cloudflare Worker）
 *
 * 作用：只解决「浏览器不允许跨域」这一件事。
 *
 * 设计原则：
 *   1) 不持有任何 API key —— 用户的 Authorization 头原样转发。
 *      责任边界清楚：调用成本与 key 都属于用户，代理不知情。
 *   2) 白名单限定上游域名 —— 否则这个地址会被人当免费代理到处贴。
 *   3) 只放行 POST 与 OPTIONS —— 不需要 GET/PUT/DELETE。
 *
 * 部署：
 *   npm i -g wrangler
 *   wrangler deploy worker/cors-proxy.js --name astrum-cors
 *
 * 用法（前端把 endpoint 指过来）：
 *   https://astrum-cors.<你的账号>.workers.dev/?to=https://open.bigmodel.cn/api/paas/v4/chat/completions
 */

const ALLOW_HOSTS = [
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
  'api.deepseek.com',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.groq.com',
  'api.x.ai'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, anthropic-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (req.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405);
    }

    const to = new URL(req.url).searchParams.get('to');
    if (!to) return json({ error: 'missing ?to=' }, 400);

    let target;
    try {
      target = new URL(to);
    } catch (e) {
      return json({ error: 'invalid to' }, 400);
    }
    if (!ALLOW_HOSTS.includes(target.host)) {
      return json({ error: 'host not allowed: ' + target.host }, 403);
    }

    const headers = { 'content-type': 'application/json' };
    const auth = req.headers.get('authorization');
    if (auth) headers.authorization = auth;
    const xkey = req.headers.get('x-api-key');
    if (xkey) headers['x-api-key'] = xkey;
    const ver = req.headers.get('anthropic-version');
    if (ver) headers['anthropic-version'] = ver;

    let upstream;
    try {
      upstream = await fetch(target.toString(), {
        method: 'POST',
        headers: headers,
        body: await req.text()
      });
    } catch (e) {
      return json({ error: 'upstream unreachable' }, 502);
    }

    /* 流式响应直接透传 body，不做缓冲——否则打字机效果会变成一次性吐完 */
    return new Response(upstream.body, {
      status: upstream.status,
      headers: Object.assign({
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store'
      }, CORS)
    });
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS)
  });
}
