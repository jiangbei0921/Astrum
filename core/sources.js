/* ASTRUM · 模型来源层
 * 事实层固定在本地星历与知识库；本层只负责「表述层」的来源管理与调用。
 * 诚实原则：
 *  - 未配置密钥即视为不可用，绝不伪造模型输出；
 *  - 浏览器直连云端普遍受 CORS 限制，失败时如实报告并回退本地表述；
 *  - 能力差异按「功能维度」呈现（能否复算星历、有无引用、能否离线），不编造跑分。
 */
(function (root) {
  'use strict';

  var STORE_KEY = (typeof window !== 'undefined' && window.Profile) ? window.Profile.ns('astrum.sources.v1') : 'astrum.sources.v1';

  /* 内置来源。type: local（本地策略） | cloud（需配置） */
  var REGISTRY = [
    {
      id: 'local', name: 'ASTRUM 内核', vendor: '本地星历 + 知识库', type: 'local',
      desc: '星历实时复算、知识条目带来源与共识等级。完全离线。',
      caps: ['星历复算', '引用来源', '离线可用'],
      cfg: {}, dot: '#3b3bd6'
    },
    /* 这里曾有「内核 · 研究视角 / 科普叙事」两个条目。
     * 它们写的是 vega.scope 与 muse.depth —— 与「身份」完全同一组字段，
     * 且身份在 ask() 里后执行会覆盖它们，实际只剩 tone 生效。
     * 表述方式归「身份」管，来源只表示数据从哪来，所以移除。
     * 旧设置里若仍指向这两个 id，会在启动时回落到 local。 */
    {
      id: 'web', name: '联网检索', vendor: 'Wikimedia / 开放接口', type: 'web',
      desc: '把检索到的公开资料整合进答案，附原文链接；不可用时自动回退本地索引。',
      caps: ['需联网', '附原文链接', '实时内容'],
      dot: '#1a7d5b'
    },
    {
      /* 设备端模型：不需要任何密钥，文本不离开本机。
       * 由 Chrome 内置的 Gemini Nano 提供，属浏览器能力，不是远程 API。 */
      id: 'chrome-ai', name: '本机 · Chrome 内置', vendor: 'Gemini Nano（设备端）', type: 'device',
      desc: '调用浏览器自带的 Gemini Nano 在本机推理，无需密钥、无按 token 计费，文本不离开设备。需 Chrome 148+ 桌面版。',
      caps: ['免密钥', '本机推理', '文本不出设备'],
      shape: 'chrome', vision: true, dot: '#4285f4',
      note: '官方多语言列表暂为 en/es/ja/de/fr，中文输出质量可能不稳定；首次使用需下载模型（约数 GB）。',
      fields: [], models: [], steps: [
        '确认使用 Chrome 148 及以上桌面版',
        '首次使用时浏览器会提示下载设备端模型，需约 22 GB 可用空间与 4 GB 显存',
        '点「测试连接」可查看当前设备是否就绪',
        '若设备不满足条件，可改用「本地模型」接入 Ollama 等本机服务'
      ]
    },
    {
      id: 'openai', name: 'OpenAI', vendor: 'GPT 系列', type: 'cloud',
      desc: '通用表达与追问能力强，适合把参数讲成人话。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini', shape: 'openai', vision: true, dot: '#10a37f',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4-turbo', 'o4-mini'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://platform.openai.com/api-keys',
      steps: ['登录 OpenAI 平台，进入 API Keys 页面创建密钥', '把 sk- 开头的密钥粘贴到下方输入框', '模型名默认 gpt-4o-mini，可按账号可用模型修改', '点「测试连接」，显示已连通后再「设为默认」']
    },
    {
      id: 'anthropic', name: 'Anthropic', vendor: 'Claude 系列', type: 'cloud',
      desc: '长文本组织与谨慎表述见长，适合科普长文。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-sonnet-latest', shape: 'anthropic', vision: true, dot: '#c96442',
      models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-7-sonnet-latest'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://console.anthropic.com/settings/keys',
      steps: ['在 Anthropic Console 的 Settings → API Keys 创建密钥', '粘贴密钥；浏览器直连需允许危险头，建议改用代理地址', '模型名默认 claude-3-5-sonnet-latest', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'gemini', name: 'Google', vendor: 'Gemini 系列', type: 'cloud',
      desc: '多模态与长上下文，适合图文混合场景。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-1.5-flash', shape: 'gemini', vision: true, dot: '#4285f4',
      models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://aistudio.google.com/app/apikey',
      steps: ['在 Google AI Studio 创建 API Key', '粘贴密钥；模型名默认 gemini-1.5-flash', '若所在网络无法直连，填写可访问的代理地址', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'deepseek', name: 'DeepSeek', vendor: 'DeepSeek 系列', type: 'cloud',
      desc: '中文表达自然，OpenAI 兼容接口，支持浏览器直连。',
      caps: ['需联网', '需密钥', '浏览器直连', '不可复算星历'],
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat', shape: 'openai', dot: '#4d6bfe',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://platform.deepseek.com/api_keys',
      steps: ['登录 DeepSeek 开放平台创建 API Key', '粘贴密钥；接口地址已填官方 OpenAI 兼容端点', '模型名默认 deepseek-chat', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'moonshot', name: 'Moonshot', vendor: 'Kimi 系列', type: 'cloud',
      desc: '中文长文本与联网检索见长，OpenAI 兼容接口，支持浏览器直连。',
      caps: ['需联网', '需密钥', '浏览器直连', '不可复算星历'],
      endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      model: 'moonshot-v1-8k', shape: 'openai', dot: '#6f5cff',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-latest', 'kimi-k2-0711-preview'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://platform.moonshot.cn/console/api-keys',
      steps: ['在 Moonshot 开放平台创建 API Key', '粘贴 sk- 开头的密钥', '模型名默认 moonshot-v1-8k，长文本可选 32k/128k', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'zhipu', name: '智谱', vendor: 'GLM 系列', type: 'cloud',
      desc: '中文语义与工具调用成熟，OpenAI 兼容接口。注意：其 CORS 预检不放行浏览器直连，必须走代理。',
      caps: ['需联网', '需密钥', '需自建代理', '不可复算星历'],
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash', shape: 'openai', dot: '#3859ff',
      models: ['glm-4-flash', 'glm-4-air', 'glm-4-airx', 'glm-4-plus', 'glm-4-long', 'glm-4.5'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://open.bigmodel.cn/usercenter/apikeys',
      steps: ['在智谱开放平台创建 API Key', '粘贴密钥；接口地址已填官方 OpenAI 兼容端点', '模型名默认 glm-4-flash，长文可选 glm-4-long', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'qwen', name: '通义千问', vendor: 'Qwen 系列', type: 'cloud',
      desc: '阿里云百炼平台，中文推理与多模态，OpenAI 兼容接口，浏览器直连最宽松。',
      caps: ['需联网', '需密钥', '浏览器直连', '不可复算星历'],
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen-plus', shape: 'openai', dot: '#615ced',
      models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen2.5-72b-instruct', 'qwen3-235b-a22b'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://bailian.console.aliyun.com/?apiKey=1',
      steps: ['在阿里云百炼控制台创建 API Key', '粘贴 sk- 开头的密钥', '模型名默认 qwen-plus', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'mistral', name: 'Mistral', vendor: 'Mistral 系列', type: 'cloud',
      desc: '欧洲开源模型，推理速度快，OpenAI 兼容接口。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      model: 'mistral-small-latest', shape: 'openai', dot: '#fa500f',
      models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest', 'open-mistral-nemo'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://console.mistral.ai/api-keys',
      steps: ['在 Mistral Console 创建 API Key', '粘贴密钥', '模型名默认 mistral-small-latest', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'groq', name: 'Groq', vendor: 'LPU 推理', type: 'cloud',
      desc: '极低延迟推理，适合快速问答，OpenAI 兼容接口。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile', shape: 'openai', dot: '#f55036',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://console.groq.com/keys',
      steps: ['在 Groq Console 创建 API Key', '粘贴密钥', '模型名默认 llama-3.3-70b-versatile', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'xai', name: 'xAI', vendor: 'Grok 系列', type: 'cloud',
      desc: '实时信息与长上下文，OpenAI 兼容接口。',
      caps: ['需联网', '需密钥', '不可复算星历'],
      endpoint: 'https://api.x.ai/v1/chat/completions',
      model: 'grok-2-latest', shape: 'openai', dot: '#111111',
      models: ['grok-2-latest', 'grok-2-vision-latest', 'grok-3', 'grok-3-mini'],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: 'https://console.x.ai/',
      steps: ['在 xAI Console 创建 API Key', '粘贴密钥', '模型名默认 grok-2-latest', '点「测试连接」，通过后再「设为默认」']
    },
    {
      id: 'custom', name: '自定义', vendor: 'OpenAI 兼容端点', type: 'cloud',
      desc: '任意 OpenAI 兼容服务（自建代理、本地推理、企业网关等）。本地模型（Ollama / LM Studio / vLLM）通常无需密钥，可留空。',
      caps: ['需联网', '可免密钥', '不可复算星历'],
      /* 本地推理端点一般不做鉴权，允许密钥留空 */
      keyOptional: true,
      endpoint: '', model: '', shape: 'openai', dot: '#6b7280',
      models: [],
      fields: ['key', 'endpoint', 'model', 'temperature', 'maxTokens'],
      console: '',
      steps: ['填写完整的接口地址（以 /chat/completions 结尾）', '填写该服务要求的 API Key（若无需鉴权可留空）', '填写模型名', '点「测试连接」验证连通性']
    }
  ];

  var state = {
    config: {},       /* id -> { key, endpoint, model, enabled, proxyNote } */
    status: {},       /* id -> { state: 'ready'|'unconfigured'|'error', msg, at } */
    metrics: {}       /* id -> { latency, chars } */
  };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (raw && typeof raw === 'object') {
        state.config = raw.config || {};
        state.status = raw.status || {};
        state.metrics = raw.metrics || {};
      }
    } catch (e) { /* 忽略损坏的本地数据 */ }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        config: state.config, status: state.status, metrics: state.metrics
      }));
    } catch (e) { /* 隐私模式下退化为内存态 */ }
  }

  function conf(id) {
    var base = REGISTRY.filter(function (r) { return r.id === id; })[0];
    if (!base) return null;
    var c = state.config[id] || {};
    return {
      key: c.key || '',
      endpoint: c.endpoint || base.endpoint || '',
      model: c.model || base.model || '',
      temperature: typeof c.temperature === 'number' ? c.temperature : 0.6,
      maxTokens: typeof c.maxTokens === 'number' ? c.maxTokens : 400,
      enabled: c.enabled !== false
    };
  }

  /* 该来源是否必须填密钥。
   * 自定义端点（本地 Ollama / LM Studio / vLLM 等）通常无需鉴权，
   * 注册表里也写明「若无需鉴权可留空」—— 之前代码强制要求密钥，
   * 导致免密钥的本地模型根本用不了，这里按 provider 分别判断。 */
  function needsKey(base) {
    if (!base) return true;
    if (base.type === 'local' || base.type === 'web' || base.type === 'device') return false;
    if (base.keyOptional) return false;
    return true;
  }

  function statusOf(id) {
    var base = REGISTRY.filter(function (r) { return r.id === id; })[0];
    if (!base) return { state: 'error', msg: '未知来源' };
    if (base.type === 'local') return { state: 'ready', msg: '离线可用' };
    if (base.type === 'device') {
      var ds = state.status[id];
      if (ds && ds.state === 'ready') return { state: 'ready', msg: ds.msg || '本机已就绪' };
      if (ds && ds.state === 'error') return { state: 'error', msg: ds.msg || '本机不可用' };
      /* 探测过但未就绪（如下载中/需下载）时，回显真实状态而不是笼统提示 */
      if (ds && ds.msg) return { state: 'untested', msg: ds.msg };
      return { state: 'untested', msg: '需 Chrome 148+ 桌面版' };
    }
    if (base.type === 'web') {
      var ws = state.status[id];
      if (ws && ws.state === 'error') return { state: 'error', msg: ws.msg || '受网络限制' };
      if (ws && ws.state === 'ready') return { state: 'ready', msg: '在线可检索' };
      return { state: 'untested', msg: '联网可用' };
    }
    var c = conf(id);
    var s = state.status[id];
    if (!c.enabled) return { state: 'off', msg: '已停用' };
    if (needsKey(base) && !c.key) return { state: 'unconfigured', msg: '未配置密钥' };
    if (s && s.state === 'error') return { state: 'error', msg: s.msg || '连接失败' };
    if (s && s.state === 'ready') return { state: 'ready', msg: '已连通' };
    return { state: 'untested', msg: '待测试' };
  }

  function list() {
    return REGISTRY.map(function (r) {
      var c = r.type === 'cloud' ? conf(r.id) : { model: '', endpoint: '', key: r.type === 'web' ? 'web' : 'local' };
      return {
        id: r.id, name: r.name, vendor: r.vendor, type: r.type, desc: r.desc,
        caps: r.caps, dot: r.dot, model: c.model,
        endpoint: c.endpoint,
        /* 设备端与免鉴权端点不显示「未配置密钥」 */
        hasKey: r.type === 'device' ? true : (needsKey(r) ? !!c.key : true),
        enabled: c.enabled !== false,
        console: r.console || '', steps: r.steps || [],
        note: r.note || '',
        keyOptional: !needsKey(r),
        shape: r.shape || 'openai',
        vision: !!r.vision,
        models: r.models || [],
        fields: r.fields || ['key', 'endpoint', 'model'],
        temperature: r.type === 'cloud' ? c.temperature : undefined,
        maxTokens: r.type === 'cloud' ? c.maxTokens : undefined,
        status: statusOf(r.id)
      };
    });
  }

  function cloudProviders() {
    return list().filter(function (r) { return r.type === 'cloud'; });
  }

  function setConfig(id, patch) {
    state.config[id] = Object.assign({}, state.config[id] || {}, patch);
    if (patch.key !== undefined && state.status[id]) delete state.status[id];
    save();
  }

  function setStatus(id, st, msg) {
    state.status[id] = { state: st, msg: msg || '', at: Date.now() };
    save();
  }

  /* ---------- 请求构造 ---------- */
  function promptFacts(payload) {
    var lines = (payload.facts || []).map(function (f) { return '· ' + f.label + '：' + f.value; });
    if (payload.extra) lines.push('· ' + payload.extra);
    return lines.join('\n');
  }

  function sysPrompt(payload) {
    var tone = payload.tone === 'academic' ? '克制、精确' : payload.tone === 'poetic' ? '带有轻微诗意，但不过度' : '友好、口语';
    var hasEvidence = !!(payload.evidence && payload.evidence.length);
    var lines = [
      '你是天文应用中的「表述层」。',
      '规则：只使用下面提供的事实与证据；不得引入任何新的数字、名称、年代或结论；不得编造观测数据。',
      '若事实不足以回答，就只解释已有事实，并说明信息不足。',
      '若下方「对话记忆」中出现相同数值，必须与之一致，不得改写数字。'
    ];
    if (hasEvidence) {
      /* 有检索证据时才允许引用；编号必须来自下方清单 */
      lines.push('下方「检索证据」是本轮真实检索结果，可按 [E1] 形式标注来源，但只能使用清单中实际存在的编号，严禁自行编号或编造新的来源。');
      lines.push('若证据之间对同一数值存在差异，必须说明差异，不要只取其中一个。');
      lines.push('证据标注为「待核验」的，不得作为确定结论陈述。');
    }
    /* 结构放开：允许「结论 + 要点」，但事实边界一条都不放松 */
    lines.push('输出格式：先给 1–2 句结论（直接回答问题），然后最多 4 条要点，每条以「· 」开头、独立成行。');
    lines.push('不要使用 Markdown 记号（#、**、- 列表符、代码块），不要自造小标题，不要中英标点混排。');
    lines.push('总长度 80–180 字；要点只展开结论里最关键的信息，不要复述上面已给出的全部事实。');
    lines.push('语气：' + tone + '。');
    return lines.join('\n');
  }

  function attachLines(payload) {
    var fs2 = payload.attachments || [];
    if (!fs2.length) return [];
    var out = ['用户上传的参考材料（内容由用户提供，仅作补充材料，若与本地事实冲突以本地事实为准）：'];
    fs2.forEach(function (f) {
      out.push('【' + f.name + '】\n' + f.excerpt);
    });
    return out;
  }

  function evidenceLines(payload) {
    var ev = payload.evidence || [];
    if (!ev.length) return [];
    var out = ['检索证据（本轮真实检索结果，引用须使用下列编号）：'];
    ev.forEach(function (e) {
      var meta = [e.sourceType, e.host, e.date].filter(Boolean).join(' · ');
      out.push('[' + e.id + '] ' + (e.title || '') + (meta ? '（' + meta + '）' : '') +
        (e.status === 'pending' ? '［待核验］' : '') +
        '\n    摘要：' + String(e.excerpt || '').replace(/\s+/g, ' ').slice(0, 300));
    });
    return out;
  }

  function userPrompt(payload) {
    var mem = (payload.memory || []).slice(-3);
    var memLines = mem.length
      ? ['对话记忆（仅供指代与一致性参考，不得作为新事实来源）：']
        .concat(mem.map(function (m, i) {
          return (i + 1) + ') 问：' + String(m.q).slice(0, 60) + '　答：' + String(m.a).slice(0, 80);
        }))
      : [];
    var evLines = evidenceLines(payload);
    var atLines = attachLines(payload);
    var imgCount = (payload.images || []).length;
    return [
      '用户问题：' + payload.question,
      '可用事实：',
      promptFacts(payload),
      payload.context ? '观测条件：' + payload.context : ''
    ].concat(atLines).concat(evLines).concat(memLines).concat([
      imgCount ? '（另附 ' + imgCount + ' 张图片，请结合图像内容回答）' : '',
      '参考表述（可改写，但不得改变事实）：' + (payload.para || '（无）'),
      '要求：以「结论」开头，直接回答用户问题；若记忆中的主题被代词指代（它/这颗/那个），沿用记忆主题。' +
        (evLines.length ? '若用到检索证据，在句末标注对应编号。' : '')
    ]).filter(Boolean).join('\n');
  }

  function withTimeout(ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms);
    return { signal: ctl.signal, done: function () { clearTimeout(t); } };
  }

  /* ---------- 适配器 ---------- */
  /* 多模态：仅当该 provider 声明 vision 且用户真的附了图片时才拼图像块。
   * 未声明 vision 的来源一律不发图片 —— 发过去多半 400，不如提前拦下并在界面说明。 */
  function imageParts(base, payload) {
    if (!base.vision) return [];
    return (payload && payload.images) || [];
  }

  function base64Of(dataUrl) {
    var i = String(dataUrl || '').indexOf(',');
    return i >= 0 ? String(dataUrl).slice(i + 1) : '';
  }

  function buildRequest(id, payload) {
    var base = REGISTRY.filter(function (r) { return r.id === id; })[0];
    var c = conf(id);
    var sys = sysPrompt(payload), usr = userPrompt(payload);
    var imgs = imageParts(base, payload);
    var headers = { 'Content-Type': 'application/json' };
    var url = c.endpoint, body;

    if (base.shape === 'anthropic') {
      headers['x-api-key'] = c.key;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      var aContent = [{ type: 'text', text: usr }];
      imgs.forEach(function (im) {
        aContent.push({
          type: 'image',
          source: { type: 'base64', media_type: im.mime || 'image/png', data: base64Of(im.dataUrl) }
        });
      });
      body = {
        model: c.model, max_tokens: c.maxTokens, temperature: c.temperature,
        system: sys, messages: [{ role: 'user', content: aContent }]
      };
    } else if (base.shape === 'gemini') {
      /* 密钥走请求头而不是 URL 查询串，避免进入浏览器历史与网关日志 */
      url = c.endpoint.replace(/\/$/, '') + '/models/' + encodeURIComponent(c.model) + ':generateContent';
      headers['x-goog-api-key'] = c.key;
      var gParts = [{ text: usr }];
      imgs.forEach(function (im) {
        gParts.push({ inline_data: { mime_type: im.mime || 'image/png', data: base64Of(im.dataUrl) } });
      });
      body = {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: gParts }],
        generationConfig: { temperature: c.temperature, maxOutputTokens: c.maxTokens }
      };
    } else {
      headers['Authorization'] = 'Bearer ' + c.key;
      /* OpenAI 兼容：有图时 content 用数组，无图保持字符串（兼容老端点） */
      var oContent = usr;
      if (imgs.length) {
        oContent = [{ type: 'text', text: usr }];
        imgs.forEach(function (im) {
          oContent.push({ type: 'image_url', image_url: { url: im.dataUrl } });
        });
      }
      body = {
        model: c.model, temperature: c.temperature, max_tokens: c.maxTokens,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: oContent }]
      };
    }
    return { url: url, headers: headers, body: body };
  }

  function parseResponse(shape, data) {
    if (!data) return '';
    if (shape === 'anthropic') {
      return (data.content || []).map(function (c) { return c.text || ''; }).join('').trim();
    }
    if (shape === 'gemini') {
      var cand = (data.candidates || [])[0];
      if (!cand) return '';
      return ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('').trim();
    }
    var ch = (data.choices || [])[0];
    if (!ch) return '';
    return ((ch.message && ch.message.content) || ch.text || '').trim();
  }

  function tokensOf(shape, data) {
    if (!data) return 0;
    if (shape === 'anthropic' && data.usage) return (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
    if (shape === 'gemini' && data.usageMetadata) return data.usageMetadata.totalTokenCount || 0;
    if (data.usage) return data.usage.total_tokens || 0;
    return 0;
  }

  function clean(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/\*\*/g, '')
      .replace(/^\s*[-*]\s+/gm, '')
      /* 模型偶尔改用有序列表，去掉编号以免与「· 」要点混排 */
      .replace(/^\s*\d+[.、)）]\s+/gm, '')
      /* 统一要点符号：行首半角圆点或短横 → 「· 」 */
      .replace(/^\s*[•▪]\s*/gm, '· ')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .slice(0, 360);
  }

  /* ---------- 设备端模型（Chrome 内置 Gemini Nano） ----------
   * 不需要密钥，也不走网络；是否可用取决于浏览器版本与设备资源。 */
  function hasDeviceAI() {
    return typeof LanguageModel !== 'undefined';
  }

  var DEVICE_STATE_TEXT = {
    available: '本机已就绪',
    downloadable: '模型尚未下载（首次使用需下载）',
    downloading: '模型下载中',
    unavailable: '本机不满足运行条件'
  };

  /* 查询可用性并写入状态，供界面展示 */
  function probeDevice() {
    var id = 'chrome-ai';
    if (!hasDeviceAI()) {
      setStatus(id, 'error', '当前浏览器不支持内置 AI（需 Chrome 148+ 桌面版）');
      return Promise.resolve({ ok: false, msg: '当前浏览器不支持内置 AI（需 Chrome 148+ 桌面版）' });
    }
    return LanguageModel.availability().then(function (av) {
      var txt = DEVICE_STATE_TEXT[av] || ('状态：' + av);
      if (av === 'available') setStatus(id, 'ready', txt);
      else if (av === 'unavailable') setStatus(id, 'error', txt);
      else setStatus(id, 'untested', txt);
      return { ok: av === 'available', state: av, msg: txt };
    }).catch(function (e) {
      var m = '可用性检测失败：' + (e && e.message || e);
      setStatus(id, 'error', m);
      return { ok: false, msg: m };
    });
  }

  /* dataURL → Blob（不经过 fetch，避免受 connect-src 限制） */
  function dataUrlToBlob(dataUrl, mime) {
    try {
      var b64 = String(dataUrl || '').split(',')[1] || '';
      var bin = atob(b64);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime || 'image/png' });
    } catch (e) { return null; }
  }

  function generateDevice(payload) {
    if (!hasDeviceAI()) {
      return Promise.reject(new Error('当前浏览器不支持内置 AI（需 Chrome 148+ 桌面版）'));
    }
    var t0 = Date.now();
    var imgs = (payload && payload.images) || [];
    return LanguageModel.availability().then(function (av) {
      if (av === 'unavailable') throw new Error('本机不满足运行条件（需约 22 GB 磁盘与 4 GB 显存）');
      if (av !== 'available') {
        throw new Error('本机模型尚未就绪（' + (DEVICE_STATE_TEXT[av] || av) + '），请先在浏览器中触发一次下载');
      }
      var opts = { initialPrompts: [{ role: 'system', content: sysPrompt(payload) }] };
      /* 有图时才声明图像输入，避免无谓地抬高设备要求 */
      if (imgs.length) {
        opts.expectedInputs = [{ type: 'text' }, { type: 'image' }];
      }
      return LanguageModel.create(opts);
    }).then(function (session) {
      var input = userPrompt(payload);
      if (imgs.length) {
        var parts = [{ type: 'text', value: input }];
        imgs.forEach(function (im) {
          var blob = dataUrlToBlob(im.dataUrl, im.mime);
          if (blob) parts.push({ type: 'image', value: blob });
        });
        input = parts;
      }
      return session.prompt(input).then(function (txt) {
        try { session.destroy(); } catch (e) { /* 忽略 */ }
        var text = clean(txt);
        var latency = Date.now() - t0;
        state.metrics['chrome-ai'] = { latency: latency, chars: text.length, tokens: 0 };
        setStatus('chrome-ai', 'ready', '本机已就绪');
        save();
        return { text: text, latency: latency, tokens: 0 };
      });
    }).catch(function (e) {
      var msg = (e && e.message) || '本机推理失败';
      if (/not allowed|user gesture|activation/i.test(msg)) msg = '浏览器要求用户手势，请重新点击发送';
      if (/image|multimodal/i.test(msg) && imgs.length) msg = '本机模型暂不支持图像输入：' + msg;
      setStatus('chrome-ai', 'error', msg);
      throw new Error(msg);
    });
  }

  /* ---------- CSP 拦截识别 ----------
   * 浏览器把三种完全不同的失败都报成同一个 TypeError: Failed to fetch：
   *   ① 真的断网   ② 目标服务没给 CORS 头   ③ 当前页面的 CSP 把请求拦了
   * 三者对用户意味着完全不同的处理方式，混在一起就会误导（比如明明是宿主 CSP
   * 限制，却提示「可填写自建代理地址」）。
   * securitypolicyviolation 事件能拿到真实原因，用它把 ③ 单独识别出来。 */
  var CSP_HITS = {};      /* host -> 最近一次被拦的时间戳 */
  var CSP_LAST = null;

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('securitypolicyviolation', function (e) {
      try {
        var host = '';
        try { host = new URL(e.blockedURI).host; } catch (x) { host = String(e.blockedURI || ''); }
        var at = Date.now();
        if (host) CSP_HITS[host] = at;
        CSP_LAST = { host: host, directive: e.effectiveDirective || e.violatedDirective || '', at: at };
      } catch (x) { /* 忽略 */ }
    }, true);
  }

  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return ''; }
  }

  /* 判断某次失败是否由 CSP 造成：同域名且时间上贴近 */
  function cspBlocked(url, withinMs) {
    var h = hostOf(url);
    if (!h) return false;
    var at = CSP_HITS[h];
    if (!at) return false;
    return Date.now() - at < (withinMs || 500);
  }

  /* securitypolicyviolation 事件比 fetch 的 rejection 晚一个任务触发。
   * 因此判定 CSP 时必须先让出一小段时间，否则永远读不到刚才那次拦截。
   * 只在「瞬间失败」的路径上等待（约 80ms），超时等真实耗时不受影响。 */
  function defer(ms, fn) {
    return new Promise(function (res) { setTimeout(res, ms || 80); }).then(fn);
  }

  function looksLikeFetchFailure(msg) {
    return /Failed to fetch|NetworkError|Load failed/i.test(String(msg || ''));
  }

  function cspMessage(url) {
    var d = CSP_LAST && CSP_LAST.directive ? CSP_LAST.directive : 'connect-src';
    return '被当前页面的 CSP 拦截（' + d + ' 不允许连 ' + (hostOf(url) || '该域名') +
      '）· 请在独立浏览器标签打开本站';
  }

  /* 测试连接：发一条最小请求 */
  function test(id) {
    var base = REGISTRY.filter(function (r) { return r.id === id; })[0];
    if (!base || base.type === 'local') return Promise.resolve({ ok: true, msg: '本地来源无需连接' });
    if (base.type === 'device') return probeDevice();
    var c = conf(id);
    if (needsKey(base) && !c.key) { setStatus(id, 'unconfigured', '未配置密钥'); return Promise.resolve({ ok: false, msg: '未配置密钥' }); }
    var t0 = Date.now();
    var req = buildRequest(id, {
      question: '连通性测试', facts: [{ label: '测试', value: '仅回复 OK' }], para: '', tone: 'warm'
    });
    /* 测试请求压到最短 */
    if (base.shape === 'anthropic') req.body.max_tokens = 8;
    else if (base.shape === 'gemini') req.body.generationConfig.maxOutputTokens = 8;
    else req.body.max_tokens = 8;

    var timer = withTimeout(9000);
    return fetch(req.url, {
      method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: timer.signal
    }).then(function (r) {
      timer.done();
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = 'HTTP ' + r.status;
          if (r.status === 401 || r.status === 403) msg = '密钥无效或无权访问';
          if (r.status === 404) msg = '模型名或地址不正确';
          if (r.status === 429) msg = '触发限流';
          setStatus(id, 'error', msg); throw new Error(msg + (t ? '：' + t.slice(0, 80) : ''));
        });
      }
      return r.json().then(function (d) {
        setStatus(id, 'ready', '已连通');
        return { ok: true, msg: '已连通 · ' + (Date.now() - t0) + 'ms' };
      });
    }).catch(function (e) {
      timer.done();
      var raw = e.name === 'AbortError' ? '连接超时' : (e.message || '网络错误');
      if (!looksLikeFetchFailure(raw)) {
        setStatus(id, 'error', raw);
        return { ok: false, msg: raw };
      }
      return defer(80, function () {
        var msg = cspBlocked(req.url, 2000)
          ? cspMessage(req.url)
          : '网络不可达或该服务未开放浏览器直连（CORS）';
        setStatus(id, 'error', msg);
        return { ok: false, msg: msg, csp: /CSP/.test(msg) };
      });
    });
  }

  /* 生成表述层 */
  function generate(id, payload) {
    var base = REGISTRY.filter(function (r) { return r.id === id; })[0];
    if (!base || base.type === 'local') return Promise.reject(new Error('本地来源不经过网络'));
    /* 设备端模型：本机推理，不走网络，也不需要密钥 */
    if (base.type === 'device') return generateDevice(payload);
    var c = conf(id);
    if (needsKey(base) && !c.key) return Promise.reject(new Error('未配置密钥'));
    var gate = allow('cloud');
    if (!gate.ok) return Promise.reject(new Error(gate.msg));
    var req = buildRequest(id, payload);
    var t0 = Date.now();
    var timer = withTimeout(20000);

    return fetch(req.url, {
      method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: timer.signal
    }).then(function (r) {
      timer.done();
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = 'HTTP ' + r.status;
          if (r.status === 401 || r.status === 403) msg = '密钥无效';
          if (r.status === 429) msg = '触发限流';
          setStatus(id, 'error', msg);
          throw new Error(msg + (t ? '：' + t.slice(0, 90) : ''));
        });
      }
      return r.json().then(function (d) {
        var text = clean(parseResponse(base.shape, d));
        var latency = Date.now() - t0;
        var tk = tokensOf(base.shape, d);
        state.metrics[id] = { latency: latency, chars: text.length, tokens: tk };
        setStatus(id, 'ready', '已连通');
        save();
        return { text: text, latency: latency, tokens: tk };
      });
    }).catch(function (e) {
      timer.done();
      var raw = e.name === 'AbortError' ? '请求超时（20s）' : (e.message || '网络错误');
      if (!looksLikeFetchFailure(raw)) throw new Error(raw);
      return defer(80, function () {
        throw new Error(cspBlocked(req.url, 2000)
          ? cspMessage(req.url)
          : '网络不可达或该服务未开放浏览器直连（CORS）');
      });
    });
  }

  /* ---------- 联网检索 ---------- */
  function stripHtml(t) {
    return String(t || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function shortText(t, n) {
    var s2 = stripHtml(t);
    return s2.length > n ? s2.slice(0, n - 1) + '…' : s2;
  }

  /* ---------- 统一错误分类 ---------- */
  var ERR_KIND = {
    network: '网络不可达或跨域被拦',
    cors: '跨域被浏览器拦截',
    /* 与 cors 分开：CSP 是当前页面的策略限制，换一个打开方式即可解决 */
    csp: '被当前页面的 CSP 拦截',
    timeout: '请求超时',
    rate_limit: '触发限流',
    auth: '密钥无效或无权访问',
    notfound: '接口地址或模型名不正确',
    server: '服务端错误',
    parse: '返回内容无法解析',
    empty: '无匹配结果',
    unknown: '未知错误'
  };
  function classifyError(e) {
    /* 已经判定过（例如已识别为 CSP 拦截）就不再按 message 猜一遍 */
    if (e && e.cls && e.cls.kind) return e.cls;
    var msg = (e && e.message) || String(e || '');
    if (e && e.status) {
      if (e.status === 429) return { kind: 'rate_limit', msg: ERR_KIND.rate_limit, retryable: false, status: e.status };
      if (e.status === 401 || e.status === 403) return { kind: 'auth', msg: ERR_KIND.auth, retryable: false, status: e.status };
      if (e.status === 404) return { kind: 'notfound', msg: ERR_KIND.notfound, retryable: false, status: e.status };
      if (e.status >= 500) return { kind: 'server', msg: ERR_KIND.server, retryable: true, status: e.status };
      return { kind: 'unknown', msg: 'HTTP ' + e.status, retryable: false, status: e.status };
    }
    if (e && e.name === 'AbortError') return { kind: 'timeout', msg: ERR_KIND.timeout, retryable: true };
    if (/Failed to fetch|NetworkError|Load failed|ERR_/i.test(msg)) {
      var cors = /CORS|跨域/i.test(msg);
      return { kind: cors ? 'cors' : 'network', msg: cors ? ERR_KIND.cors : ERR_KIND.network, retryable: true };
    }
    if (/JSON|parse|Unexpected token/i.test(msg)) return { kind: 'parse', msg: ERR_KIND.parse, retryable: false };
    return { kind: 'unknown', msg: msg || ERR_KIND.unknown, retryable: false };
  }
  function httpError(status, body) {
    var e = new Error('HTTP ' + status);
    e.status = status;
    e.body = body || '';
    return e;
  }

  function fetchJSON(url, ms) {
    var timer = withTimeout(ms || 7000);
    return fetch(url, {
      signal: timer.signal, cache: 'no-store',
      headers: { Accept: 'application/json', 'Accept-Language': 'zh-CN,zh;q=0.9' }
    })
      .then(function (r) {
        timer.done();
        if (!r.ok) {
          return r.text().then(function (t) { throw httpError(r.status, t); },
            function () { throw httpError(r.status, ''); });
        }
        return r.json();
      }).catch(function (e) {
        timer.done();
        /* 检索端点同理：CSP 拦截要单独识别，否则会被当成「网络不可达」 */
        if (!looksLikeFetchFailure(e && e.message)) throw e;
        return defer(80, function () {
          if (cspBlocked(url, 2000)) {
            var ce = new Error(cspMessage(url));
            ce.cls = { kind: 'csp', msg: ERR_KIND.csp, retryable: false };
            ce.csp = true;
            throw ce;
          }
          throw e;
        });
      });
  }

  /* 中文实体 → 英文检索词（NASA / OpenAlex 只认英文）
   * 注意：空查询必须直接返回空串。
   * 之前没有这道防线，'' 会命中星表里 cn 为空的条目（catalog.js 的 Naos），
   * 导致所有检索实际都在搜同一个无关词。 */
  var PLANET_EN = { '水星': 'Mercury', '金星': 'Venus', '火星': 'Mars', '木星': 'Jupiter', '土星': 'Saturn', '天王星': 'Uranus', '海王星': 'Neptune', '月球': 'Moon', '太阳': 'Sun' };
  function enQueryFor(q) {
    var s2 = String(q == null ? '' : q).trim();
    if (!s2) return '';
    if (PLANET_EN[s2]) return PLANET_EN[s2];
    var C = root.CATALOG, K = root.KNOWLEDGE;
    if (K) {
      for (var i = 0; i < K.entries.length; i++) {
        var e = K.entries[i];
        if (!e.cn) continue;
        if (e.cn === s2 || (e.aliases || []).indexOf(s2) >= 0) return e.en || s2;
      }
    }
    if (C) {
      for (var j = 0; j < C.dso.length; j++) if (C.dso[j].cn && C.dso[j].cn === s2) return C.dso[j].id;
      for (var k = 0; k < C.stars.length; k++) if (C.stars[k].cn && C.stars[k].cn === s2) return C.stars[k].en;
      for (var m = 0; m < C.constellations.length; m++) if (C.constellations[m].cn && C.constellations[m].cn === s2) return C.constellations[m].en;
    }
    return s2;
  }

  /* ---------- 各检索端点（全部带 CORS） ----------
   * 统一返回字段（缺项为 null，不省略，便于下游判断「没有」与「未知」）：
   *   title / snippet / excerpt / url / host / date / sourceType / authors / doi / extra
   *   - snippet：展示用，截 180 字
   *   - excerpt：证据用，截 600 字（不再一刀切 180，避免关键内容被截断）
   *   - date：原始发布时间（ISO 字符串或 'YYYY-MM-DD'），无则为 null
   *   - sourceType：paper | encyclopedia | image | database
   */

  function blankItem() {
    return {
      date: null,
      /* dateKind 说明 date 的语义，避免把「影像发布」「论文发表」「词条最后编辑」
       * 混为一谈 —— 判断「最新发现」时三者含义完全不同：
       *   published  论文/文章正式发表
       *   released   机构发布的影像或新闻
       *   edited     百科词条最后编辑
       *   null       未提供时间 */
      dateKind: null,
      authors: [], doi: '', extra: {},
      excerpt: '',
      /* version：区分预印本与正式发表，'preprint' / 'published' / '' */
      version: '',
      /* uncertainty：从摘要中抽出的误差表述原文，无则空 */
      uncertainty: ''
    };
  }

  /* 从摘要里抽取误差表述（要求「保留必要的误差范围」）。
   * 只抽取原文片段，不做换算，避免在展示层引入新的数值错误。 */
  function findUncertainty(text) {
    var t = String(text || '');
    var m = t.match(/(?:[±]\s*[\d.]+(?:\s*[×x]\s*10\s*\^?\s*-?\d+)?)/) ||
      t.match(/\b(?:uncertaint(?:y|ies)|error|errors|confidence interval|scatter)\b[^.;]{0,60}/i) ||
      t.match(/[\d.]+\s*%\s*(?:error|uncertainty|uncertain)/i);
    return m ? String(m[0]).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  }

  /* 判定预印本：DOI 指向 arXiv，或标题/来源带 preprint 标记 */
  function versionOf(w, doi) {
    var d = String(doi || '').toLowerCase();
    if (/arxiv|biorxiv|medrxiv|ssrn/.test(d)) return 'preprint';
    var type = String((w && w.type) || '').toLowerCase();
    if (type === 'preprint') return 'preprint';
    if (/arxiv|preprint/i.test(String((w && w.title) || ''))) return 'preprint';
    return 'published';
  }

  /* NASA 图像与视频库：天文专用，ACAO: * */
  function nasaSearch(q) {
    var eq = enQueryFor(q);
    var u = 'https://images-api.nasa.gov/search?q=' + encodeURIComponent(eq) + '&media_type=image';
    return fetchJSON(u, 7000).then(function (d) {
      var arr = (d.collection && d.collection.items) || [];
      return arr.slice(0, 3).map(function (it) {
        var md = (it.data && it.data[0]) || {};
        var link = (it.links && it.links[0] && it.links[0].href) || '';
        var body = md.description || md.title || '';
        var o = blankItem();
        o.title = md.title || q;
        o.snippet = shortText(body, 180);
        o.excerpt = shortText(body, 600);
        o.url = 'https://images.nasa.gov/details/' + encodeURIComponent(md.nasa_id || '');
        o.host = 'images.nasa.gov';
        o.thumb = link;
        o.date = md.date_created || null;
        o.dateKind = o.date ? 'released' : null;   /* 影像发布/拍摄时间，非论文发表 */
        o.sourceType = 'image';
        o.uncertainty = findUncertainty(body);
        o.authors = md.photographer ? [md.photographer] : [];
        o.extra = { center: md.center || '', nasaId: md.nasa_id || '' };
        return o;
      }).filter(function (x) { return x.snippet; });
    });
  }

  /* OpenAlex：学术文献，ACAO: * */
  function openAlex(q) {
    var u = 'https://api.openalex.org/works?search=' + encodeURIComponent(enQueryFor(q)) + '&per-page=3';
    /* 相关度排序的默认行为即可；最新发现类问题由上层按 date 再排 */
    return fetchJSON(u, 8000).then(function (d) {
      return (d.results || []).slice(0, 3).map(function (w) {
        var abs = invAbstract(w.abstract_inverted_index);
        var authors = ((w.authorships || []).map(function (a) {
          return a && a.author && a.author.display_name;
        })).filter(Boolean);
        var o = blankItem();
        o.title = w.title || w.display_name || q;
        o.snippet = shortText(abs || (w.concepts || []).map(function (c) { return c.display_name; }).join('、'), 180);
        o.excerpt = shortText(abs, 600);
        o.url = w.doi || w.id || '';
        o.host = 'openalex.org';
        o.date = w.publication_date || (w.publication_year ? String(w.publication_year) : null);
        o.dateKind = o.date ? 'published' : null;
        o.sourceType = 'paper';
        /* doi 必须先算出：versionOf 依赖它判断是否预印本 */
        o.doi = (w.doi || '').replace(/^https?:\/\/doi\.org\//, '');
        o.version = versionOf(w, o.doi);
        o.uncertainty = findUncertainty(abs);
        o.authors = authors.slice(0, 6);
        o.extra = { citedBy: w.cited_by_count || 0, type: w.type || '', venue: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '' };
        return o;
      }).filter(function (x) { return x.snippet; });
    });
  }

  /* Semantic Scholar：学术文献检索，ACAO: * */
  function semanticScholar(q) {
    var eq = enQueryFor(q);
    var u = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' +
      encodeURIComponent(eq) + '&limit=3&fields=title,abstract,year,externalIds,url,authors,publicationDate';
    return fetchJSON(u, 8000).catch(function (e) {
      if (e && e.status === 429) {
        /* 匿名调用共享限流池，过载属常态：明确说明并让降级链继续尝试其它端点 */
        var err = new Error('HTTP 429 触发限流（匿名调用共享配额，稍后重试）');
        err.status = 429;
        throw err;
      }
      throw e;
    }).then(function (d) {
      return (d.data || []).slice(0, 3).map(function (p) {
        var ext = p.externalIds || {};
        var link = p.url || (ext.DOI ? 'https://doi.org/' + ext.DOI : '') || '';
        var o = blankItem();
        /* 年份不再拼进 title，改放 date 字段，避免标题被污染 */
        o.title = p.title || q;
        o.snippet = shortText(p.abstract || p.title || '', 180);
        o.excerpt = shortText(p.abstract, 600);
        o.url = link;
        o.host = 'semanticscholar.org';
        o.date = p.publicationDate || (p.year ? String(p.year) : null);
        o.dateKind = o.date ? 'published' : null;
        o.sourceType = 'paper';
        o.doi = ext.DOI || '';
        /* arXiv 编号存在即视为预印本 */
        o.version = ext.ArXiv ? 'preprint' : versionOf({ type: '', title: p.title }, o.doi);
        o.uncertainty = findUncertainty(p.abstract);
        o.authors = (p.authors || []).map(function (a) { return a && a.name; }).filter(Boolean).slice(0, 6);
        o.extra = { venue: p.venue || '' };
        return o;
      }).filter(function (x) { return x.snippet; });
    });
  }

  /* 维基百科 Core REST（CORS 回显 origin；部分地区不可达）
   * 超时设 5s：该域名在部分网络下完全不通，过长会拖垮整轮检索预算。 */
  function wikiCore(q) {
    var u = 'https://api.wikimedia.org/core/v1/wikipedia/zh/search/page?q=' +
      encodeURIComponent(q) + '&limit=3';
    return fetchJSON(u, 5000).then(function (d) {
      return (d.pages || []).slice(0, 3).map(function (pg) {
        var o = blankItem();
        o.title = pg.title;
        o.snippet = shortText(pg.excerpt, 180);
        o.excerpt = shortText(pg.excerpt, 600);
        o.url = 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(pg.key || pg.title);
        o.host = 'zh.wikipedia.org';
        o.date = null;                    /* Core REST 搜索不返回时间 */
        o.sourceType = 'encyclopedia';
        o.extra = { desc: pg.description || '' };
        return o;
      });
    });
  }

  /* MediaWiki Action API（部分地区不可达；返回 timestamp，可作时效依据） */
  function wikiAction(q) {
    var u = 'https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(q) + '&srlimit=3&format=json&origin=*';
    return fetchJSON(u, 5000).then(function (d) {
      var arr = (d.query && d.query.search) || [];
      return arr.slice(0, 3).map(function (it) {
        var o = blankItem();
        o.title = it.title;
        o.snippet = shortText(it.snippet, 180);
        o.excerpt = shortText(it.snippet, 600);
        o.url = 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(it.title);
        o.host = 'zh.wikipedia.org';
        o.date = it.timestamp || null;
        o.dateKind = o.date ? 'edited' : null;   /* 最后编辑时间，非发布时间 */
        o.sourceType = 'encyclopedia';
        o.extra = { edited: it.timestamp || '' };
        return o;
      });
    });
  }

  function invAbstract(idx) {
    if (!idx) return '';
    var words = [];
    Object.keys(idx).forEach(function (w) {
      idx[w].forEach(function (i) { words[i] = w; });
    });
    return words.join(' ');
  }

  /* ---------- 端点健康度、熔断与结果缓存 ---------- */
  var HEALTH = {};        /* id -> {ok, fails, cooldownUntil, lastErr, lastMs, total, success, cached} */
  /* 版本号必须随 item 结构变更一起升级：
   * v1 → v2 增加了 dateKind / version / uncertainty，
   * 若不升版，10 分钟内的旧缓存会让新字段全部缺失（时间语义消失）。 */
  var CACHE_KEY = (typeof window !== 'undefined' && window.Profile) ? window.Profile.ns('astrum.search.cache.v2') : 'astrum.search.cache.v2';
  var CACHE_TTL = 10 * 60 * 1000;
  var searchCache = null;

  function loadCache() {
    if (searchCache) return searchCache;
    try {
      var raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      searchCache = (raw && typeof raw === 'object') ? raw : {};
    } catch (e) { searchCache = {}; }
    return searchCache;
  }
  function cacheGet(q) {
    var c = loadCache()[q];
    if (!c) return null;
    if (Date.now() - c.at > CACHE_TTL) { delete loadCache()[q]; return null; }
    return c;
  }
  function cachePut(q, items, provider) {
    var c = loadCache();
    c[q] = { at: Date.now(), items: items, provider: provider };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function health(id) {
    if (!HEALTH[id]) HEALTH[id] = { ok: 0, fails: 0, cooldownUntil: 0, lastErr: '', lastKind: '', lastMs: 0, total: 0, success: 0 };
    return HEALTH[id];
  }
  function healthOk(id, ms) {
    var h = health(id);
    h.ok++; h.success++; h.total++; h.fails = 0; h.cooldownUntil = 0; h.lastMs = ms; h.lastErr = ''; h.lastKind = '';
  }
  function healthFail(id, cls, ms) {
    var h = health(id);
    h.fails++; h.total++; h.lastMs = ms; h.lastErr = cls.msg; h.lastKind = cls.kind;
    /* 连续失败 3 次进入冷却，避免每次都去打一个挂掉的端点 */
    if (h.fails >= 3) {
      h.cooldownUntil = Date.now() + 60000;
      h.fails = 0;
    }
  }
  function cooling(id) { return health(id).cooldownUntil > Date.now(); }
  function healthReport() {
    var out = [];
    Object.keys(HEALTH).forEach(function (id) {
      var h = HEALTH[id];
      out.push({
        id: id, ok: h.ok, fails: h.fails, total: h.total,
        successRate: h.total ? Math.round(h.success / h.total * 100) : null,
        lastErr: h.lastErr, lastKind: h.lastKind, lastMs: h.lastMs,
        cooling: h.cooldownUntil > Date.now(),
        cooldownLeft: Math.max(0, Math.round((h.cooldownUntil - Date.now()) / 1000))
      });
    });
    return out;
  }

  /* 端点表。types 用于按问题类型挑源（阶段 B1）。
   *   paper       学术文献（含预印本）
   *   encyclopedia 百科
   *   image       机构影像
   * 注意：priority 只决定同一类型内的尝试顺序，不再决定「谁先成功就用谁」。 */
  var ENDPOINT_CHAIN = [
    { id: 'openalex', name: 'OpenAlex', fn: openAlex, kind: '学术文献', types: ['paper'], priority: 1 },
    { id: 'nasa', name: 'NASA 图库', fn: nasaSearch, kind: '天文影像', types: ['image'], priority: 2 },
    { id: 'wikimedia', name: '维基百科', fn: wikiCore, kind: '百科条目', types: ['encyclopedia'], priority: 1 },
    { id: 'semanticscholar', name: 'Semantic Scholar', fn: semanticScholar, kind: '学术文献', types: ['paper'], priority: 2 },
    { id: 'wiki-action', name: '维基百科（备用）', fn: wikiAction, kind: '百科条目', types: ['encyclopedia'], priority: 2 }
  ];

  function endpointById(id) {
    return ENDPOINT_CHAIN.filter(function (e) { return e.id === id; })[0] || null;
  }

  /* 重试包装。
   * 关键修复：args 必须透传给 fn —— 之前 withRetry(ep.fn, 2) 直接 fn()，
   * 查询词在链路中丢失，导致所有检索实际都在搜同一个无关词。 */
  function withRetry(fn, tries, args) {
    var n = tries || 2;
    var a = args || [];
    function attempt(k) {
      var t0 = Date.now();
      return fn.apply(null, a).then(function (items) {
        return { items: items || [], ms: Date.now() - t0 };
      }).catch(function (e) {
        var cls = classifyError(e);
        /* 超时不重试：端点超时通常说明本网络到该域名不通，重试只会再耗一个超时周期
         * （原先 wiki 端点 7s 超时 + 重试 = 14s，直接吃掉整个检索预算）。 */
        if (k < n && cls.retryable && cls.kind !== 'timeout') {
          return new Promise(function (res) {
            setTimeout(res, k === 1 ? 300 : 900);
          }).then(function () { return attempt(k + 1); });
        }
        var err = new Error(cls.msg);
        err.cls = cls;
        throw err;
      });
    }
    return attempt(1);
  }

  /* 单端点单查询：返回 { ok, items, ms } 或抛错（已是分类后的错误） */
  function callEndpoint(ep, q) {
    if (cooling(ep.id)) {
      var ce = new Error('熔断冷却中');
      ce.cls = { kind: 'cooling', msg: '熔断冷却中' };
      return Promise.reject(ce);
    }
    return withRetry(ep.fn, 2, [q]).then(function (r) {
      if (!r.items.length) {
        healthFail(ep.id, { kind: 'empty', msg: ERR_KIND.empty }, r.ms);
        var ee = new Error('无匹配结果');
        ee.cls = { kind: 'empty', msg: ERR_KIND.empty };
        ee.items = [];
        ee.ms = r.ms;
        throw ee;
      }
      healthOk(ep.id, r.ms);
      /* 补上来源标识，供下游按来源去重与展示 */
      r.items.forEach(function (it) {
        it.endpoint = ep.id;
        it.endpointName = ep.name;
        if (!it.sourceType) it.sourceType = ep.types[0];
        it.query = q;
        it.fetchedAt = Date.now();
      });
      return { ok: true, items: r.items, ms: r.ms, endpoint: ep.id, name: ep.name };
    }).catch(function (err) {
      var cls = err.cls || classifyError(err);
      healthFail(ep.id, cls, 0);
      var e2 = new Error(cls.msg);
      e2.cls = cls;
      e2.endpoint = ep.id;
      e2.name = ep.name;
      throw e2;
    });
  }

  /* 兼容层：原来的「首个成功即返回」行为。
   * 保留它是为了不破坏既有调用点（app.js 的 compare 列、diagnose 等）。 */
  function search(query) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return Promise.reject(new Error('检索词为空'));
    var hit = cacheGet(q);
    if (hit) {
      setStatus('web', 'ready', '缓存命中 · ' + hit.provider);
      return Promise.resolve({ ok: true, items: hit.items, provider: hit.provider + '（缓存）', ms: 0, cached: true });
    }
    var gate = allow('search');
    if (!gate.ok) return Promise.reject(new Error(gate.msg));
    var errors = [], tried = [], i = 0;

    function step() {
      if (i >= ENDPOINT_CHAIN.length) {
        setStatus('web', 'error', '全部端点不可用');
        var e = new Error(errors.join('；') || '各端点均无结果');
        e.fatal = true;
        e.reports = healthReport();
        e.tried = tried;
        return Promise.reject(e);
      }
      var ep = ENDPOINT_CHAIN[i++];
      return callEndpoint(ep, q).then(function (r) {
        cachePut(q, r.items, r.name);
        setStatus('web', 'ready', '在线 · ' + r.name);
        return { ok: true, items: r.items, provider: r.name, ms: r.ms, cached: false };
      }).catch(function (err) {
        var cls = err.cls || classifyError(err);
        errors.push(ep.name + '：' + cls.msg);
        tried.push({ id: ep.id, name: ep.name, state: cls.kind === 'cooling' ? 'cooling' : (cls.kind === 'empty' ? 'empty' : 'failed'), kind: cls.kind, msg: cls.msg });
        return step();
      });
    }
    return step();
  }

  /* 多源聚合检索（阶段 B1 的入口）
   * 与 search() 的区别：不是「谁先成功就用谁」，而是按需并行取多个源再合并，
   * 这样才有跨源交叉验证的前提。
   *
   * opts:
   *   types       需要的来源类型数组，如 ['encyclopedia','paper']；缺省为全部
   *   perQuery    每个查询每个端点最多取几条（默认 3）
   *   budgetMs    整体时间预算（默认 9000）
   *   skipCache   忽略缓存
   *   maxCalls    端点×查询的总调用上限（默认 12）
   *
   * 返回 { items, calls, errors, truncated }
   */
  function searchMany(queries, opts) {
    opts = opts || {};
    var qs = (queries || []).map(function (x) { return String(x == null ? '' : x).trim(); })
      .filter(Boolean);
    /* 去重并保持顺序 */
    var seenQ = {}, uniq = [];
    qs.forEach(function (q) { if (!seenQ[q]) { seenQ[q] = 1; uniq.push(q); } });
    qs = uniq;
    if (!qs.length) return Promise.resolve({ items: [], calls: 0, errors: [], truncated: false });

    var wantTypes = opts.types && opts.types.length ? opts.types : null;
    var maxCalls = opts.maxCalls || 12;
    var budgetMs = opts.budgetMs || 9000;
    var t0 = Date.now();

    /* 只用与所需类型匹配的端点；同类型内按 priority 取前面的 */
    var eps = ENDPOINT_CHAIN.filter(function (ep) {
      if (!wantTypes) return true;
      return ep.types.some(function (t) { return wantTypes.indexOf(t) >= 0; });
    });
    if (!eps.length) eps = ENDPOINT_CHAIN.slice();

    var gate = allow('search');
    if (!gate.ok) {
      return Promise.resolve({ items: [], calls: 0, errors: [{ name: 'limit', msg: gate.msg }], truncated: true, budgetExhausted: true });
    }

    var items = [], errors = [], calls = 0, truncated = false;

    /* 端点之间并行，端点内部对多个查询串行（避免单域名并发被限流） */
    var tasks = eps.map(function (ep) {
      return qs.reduce(function (chain, q) {
        return chain.then(function () {
          if (calls >= maxCalls) { truncated = true; return; }
          if (Date.now() - t0 > budgetMs) { truncated = true; return; }
          if (cooling(ep.id)) {
            errors.push({ endpoint: ep.id, name: ep.name, query: q, kind: 'cooling', msg: '熔断冷却中' });
            return;
          }
          /* 缓存命中：不消耗调用配额 */
          var ck = ep.id + '|' + q;
          var cached = opts.skipCache ? null : cacheGet(ck);
          if (cached) {
            items = items.concat(cached.items);
            return;
          }
          calls++;
          return callEndpoint(ep, q).then(function (r) {
            /* 缓存：按「端点 + 查询」为键，避免多源互相污染 */
            cachePut(ck, r.items, r.name);
            items = items.concat(r.items);
          }).catch(function (e) {
            errors.push({ endpoint: ep.id, name: ep.name, query: q, kind: (e.cls && e.cls.kind) || 'unknown', msg: e.message });
          });
        });
      }, Promise.resolve());
    });

    return Promise.all(tasks).then(function () {
      setStatus('web', items.length ? 'ready' : 'error',
        items.length ? '在线 · ' + eps.map(function (e) { return e.name; }).join('/') : '全部端点不可用');
      return {
        items: items, calls: calls, errors: errors,
        truncated: truncated,
        budgetExhausted: Date.now() - t0 > budgetMs,
        ms: Date.now() - t0,
        endpoints: eps.map(function (e) { return e.id; })
      };
    });
  }

  /* ---------- 频率限制：联网检索与云端调用分别限流 ---------- */
  var LIMITS = {
    searchCooldown: 1500,     /* 两次「用户级」检索最小间隔（ms）；同一轮内部的多查询不受此限 */
    searchPerMin: 20,         /* 每分钟最多「用户级」检索次数 */
    cloudPerMin: 20           /* 每分钟最多云端调用次数 */
  };
  var rate = { searchAt: 0, searchCount: 0, searchWindow: 0, cloudCount: 0, cloudWindow: 0 };

  function allow(kind) {
    var now = Date.now();
    if (kind === 'search') {
      if (now - rate.searchWindow > 60000) { rate.searchWindow = now; rate.searchCount = 0; }
      if (now - rate.searchAt < LIMITS.searchCooldown) {
        return { ok: false, msg: '检索过于频繁，请 ' + Math.ceil((LIMITS.searchCooldown - (now - rate.searchAt)) / 1000) + ' 秒后再试' };
      }
      if (rate.searchCount >= LIMITS.searchPerMin) {
        return { ok: false, msg: '本分钟检索次数已达上限（' + LIMITS.searchPerMin + ' 次），已改用本地索引' };
      }
      rate.searchAt = now;
      rate.searchCount++;
      return { ok: true };
    }
    if (now - rate.cloudWindow > 60000) { rate.cloudWindow = now; rate.cloudCount = 0; }
    if (rate.cloudCount >= LIMITS.cloudPerMin) {
      return { ok: false, msg: '本分钟模型调用次数已达上限（' + LIMITS.cloudPerMin + ' 次）' };
    }
    rate.cloudCount++;
    return { ok: true };
  }

  /* 逐个端点体检，供界面展示「为什么连不上」 */
  function diagnose() {
    return Promise.all(ENDPOINT_CHAIN.map(function (pv) {
      var t0 = Date.now();
      if (cooling(pv.id)) {
        return Promise.resolve({
          name: pv.name, id: pv.id, ok: false, ms: 0, state: 'cooling',
          msg: '熔断冷却中，' + Math.ceil((health(pv.id).cooldownUntil - Date.now()) / 1000) + ' 秒后再试'
        });
      }
      return pv.fn('猎户座').then(function (items) {
        if (items && items.length) healthOk(pv.id, Date.now() - t0);
        else healthFail(pv.id, { kind: 'empty', msg: ERR_KIND.empty }, Date.now() - t0);
        return {
          name: pv.name, id: pv.id, ok: !!(items && items.length), ms: Date.now() - t0,
          state: items && items.length ? 'ok' : 'empty',
          msg: items && items.length ? '可用' : '无匹配结果'
        };
      }).catch(function (e) {
        var cls = e.cls || classifyError(e);
        healthFail(pv.id, cls, Date.now() - t0);
        return {
          name: pv.name, id: pv.id, ok: false, ms: Date.now() - t0, state: 'failed',
          kind: cls.kind, msg: cls.msg
        };
      });
    }));
  }

  load();

  root.Sources = {
    list: list, cloudProviders: cloudProviders, conf: conf, setConfig: setConfig, statusOf: statusOf,
    test: test, generate: generate, metrics: function (id) { return state.metrics[id] || null; },
    hasKey: function (id) { var c = conf(id); return !!(c && c.key); },
    maskKey: function (id) {
      var c = conf(id);
      if (!c || !c.key) return '';
      var k = c.key;
      return k.length <= 8 ? '••••' + k.slice(-2) : '••••••••' + k.slice(-4);
    },
    limits: LIMITS,
    health: healthReport,
    errorKinds: ERR_KIND,
    clearSearchCache: function () {
      searchCache = {};
      try { localStorage.removeItem(CACHE_KEY); } catch (e) { }
    },
    search: search, diagnose: diagnose, setStatus: setStatus, enQueryFor: enQueryFor,
    /* 设备端模型 */
    probeDevice: probeDevice, hasDeviceAI: hasDeviceAI,
    /* CSP 诊断：供界面判断「是不是宿主限制了外连」 */
    cspState: function () { return { hits: Object.keys(CSP_HITS), last: CSP_LAST }; },
    cspBlocked: cspBlocked,
    /* 多源聚合与端点信息，供 research.js 使用 */
    searchMany: searchMany, endpoints: ENDPOINT_CHAIN, endpointById: endpointById,
    healthOf: function (id) { return health(id); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
