/* ASTRUM · 界面英文词表（第四批：智能体说明 / 来源注记 / 帮助正文）
 *
 * 这批是设置面板里最长的文案：智能体职责说明、模型供应商注记、
 * 使用技巧正文与教程步骤。翻完这批，设置与帮助页在英文模式下不再夹中文。
 *
 * 键仍为中文原文；缺词条回退中文。
 */
(function (root) {
  'use strict';

  root.I18N_EN_CONTENT = {

    /* ---------- 智能体职责 ---------- */
    '把一句话拆成可执行的天文任务，决定谁上场、谁闭嘴，并守住能力边界。':
      'Turns a question into a concrete plan: who speaks, who stays quiet, and where the limits are.',
    '计算天体坐标、升落、中天与可见窗口。所有数字都由它签字。':
      'Coordinates, rise and set, culmination and visibility windows. Every number is signed off here.',
    '检索知识库与星表，只输出可追溯的事实；不确定时主动标注置信度。':
      'Searches the knowledge base and catalogues, and only states traceable facts, flagging uncertainty.',
    '处理黑洞、大爆炸、暗物质、暗能量、引力波等大尺度问题；每个结论都标注共识等级与核验来源。':
      'Black holes, the Big Bang, dark matter and energy, gravitational waves, each with consensus level and source.',
    '评估暗夜窗口、月光干扰、光污染与器材匹配，给出可执行建议。':
      'Weighs darkness window, moonlight, light pollution and gear match into concrete advice.',
    '把坐标翻译成可看的星空：投影、连星、方位标注与定位路径。':
      'Turns coordinates into a viewable sky: projection, constellations, bearings and star-hops.',
    '在专业表述与科普表述之间切换，让同一个事实找到合适的说法。':
      'Switches between specialist and plain-language wording without changing the facts.',
    '处理恒星爆发现象：变星、新星、超新星、伽马暴与中子星；区分「已观测到的」与「理论上应有的」。':
      'Variables, novae, supernovae, gamma-ray bursts and neutron stars, separating observed from predicted.',
    '关注太阳活动、耀斑、日冕物质抛射与地球磁层效应，给出观测窗口与「能否看到极光」的判断链。':
      'Solar activity, flares, CMEs and magnetospheric effects, with an aurora-visibility chain of reasoning.',
    '专门负责学术文献这一层：把中文问题转成可检索的英文术语，去 OpenAlex 与 Semantic Scholar 找原始论文，保留 DOI、作者、发表时间与预印本状态，并把证据按「支持 / 待核验」分开。':
      'Handles the literature layer: converts the question into searchable English terms, finds papers on OpenAlex and Semantic Scholar, keeps DOI, authors, date and preprint status, and splits evidence into supported and pending.',
    '在答案给出前做最后一道检查：证据条数是否支撑结论、数值是否来自星历、共识等级与核验日期是否标注、是否越界。':
      'Final gate before an answer ships: enough evidence, numbers from the ephemeris, consensus and verification dates present, no overreach.',
    '在并行对比中合并不同来源的重复事实点，保留差异与冲突，按可信度排序，不做静默合并。':
      'Merges duplicate facts across sources, keeps disagreements, orders by credibility, never merges silently.',
    '把「打开太阳系」「聚焦土星」「隐藏轨道」「放大天体」这类指令解析成结构化动作，交给视图层执行，并回报执行结果与当前状态。':
      'Parses view commands such as open the solar system, focus Saturn, hide orbits or zoom in into structured actions, then reports what happened.',

    /* ---------- 智能体参数 / 说明 ---------- */
    '可调参数：知识范围 · 专业侧重 · 回答深度 · 推断尺度': 'Parameters: scope · emphasis · depth · inference',
    '可调参数：语气风格 · 回答深度 · 知识范围 · 推断尺度': 'Parameters: tone · depth · scope · inference',
    '点左侧任意智能体可调整其语气、深度与侧重；Critic 的「证据门槛」设为严格时，证据不足的答案会被强制标注为线索而非定论。':
      'Pick any agent on the left to tune tone, depth and emphasis. With Critic set to strict, thin evidence is labelled a lead rather than a conclusion.',
    '多问几次同类问题后会自动积累，用于复用器材与承接结论。':
      'Repeated questions on the same topic accumulate, so gear and conclusions carry forward.',
    '主镜、相机与观测方式都在观测台调整；这里是同类问题的复用记录。':
      'Scope, camera and mode live in the observatory. This is the reuse history for similar questions.',

    /* ---------- 关于 ---------- */
    '天文多智能体工作台 · v1.4 · 事实层全程本地，不经网络':
      'Astronomy multi-agent workbench · v1.4 · facts computed locally, never sent out',
    '星历由本地计算，知识条目均标注来源与核验日期；宇宙学条目区分「已成共识 / 前沿研究 / 未定论」。产品不提供天气预报、实时极光、器材品牌推荐与占星内容。':
      'Ephemeris is computed locally; knowledge entries carry source and verification date; cosmology entries are marked as settled, frontier or open. No weather forecasts, live aurora, brand recommendations or astrology.',
    '多智能体的评审—回流闭环、多来源去重合并与提示词透明化借鉴了开源项目 AstroAgents（Saeedi 等，arXiv:2503.23170，ICLR 2025 Workshop，MIT License）。仅借鉴工程与流程范式，未引入其 Python 依赖，领域提示词与评分维度均按天文学场景重写。':
      'The review loop, cross-source merging and prompt transparency follow ideas from the open-source AstroAgents project (Saeedi et al., arXiv:2503.23170, ICLR 2025 Workshop, MIT License). Only the workflow pattern is borrowed; its Python dependencies are not used and all prompts and scoring are rewritten for astronomy.',
    '不展示条目数量。条目多少不等于覆盖能力，判断依据是每条结论的来源、共识等级与核验日期 —— 这些信息在答案的「依据」章节逐条标注。知识库未收录的问题，会转由联网检索取证，或明确告知无法确证。':
      'Entry counts are not shown: quantity is not coverage. Each conclusion carries its source, consensus level and verification date under Evidence. Questions outside the base go to web retrieval or are marked unconfirmed.',

    /* ---------- 来源 / 密钥 ---------- */
    '先选供应商，再填该供应商需要的参数。所有密钥只保存在本机浏览器，切换供应商不会丢失已填配置。':
      'Choose a provider, then fill in what it needs. Keys stay in this browser and switching providers does not lose them.',
    '密钥仅保存在本机浏览器，不会上传。智谱、DeepSeek、Moonshot、通义等支持浏览器直连，可直接使用；OpenAI 等不提供 CORS 的服务才需要自建代理地址。若提示「被当前页面的 CSP 拦截」，说明宿主限制了外连，请换独立浏览器标签打开本站。':
      'Keys stay in this browser and are never uploaded. Zhipu, DeepSeek, Moonshot and Qwen allow direct browser calls; providers without CORS such as OpenAI need your own proxy URL. A CSP blocked message means the host forbids outbound calls, so open this site in a standalone browser tab.',
    '提示「被当前页面的 CSP 拦截」= 宿主限制了外连，换独立浏览器标签打开本站即可；只有 OpenAI 这类不提供 CORS 的服务才需要把 Base URL 换成自建代理；「自定义」可接任何 OpenAI 兼容端点。':
      'A CSP blocked message means the host blocks outbound calls; open the site in its own tab. Only CORS-less providers such as OpenAI need a proxy Base URL. Custom accepts any OpenAI-compatible endpoint.',
    '并行向 NASA 图库、OpenAlex、Semantic Scholar 与维基百科等开放接口检索与问题相关的条目，取标题与摘要':
      'Queries NASA images, OpenAlex, Semantic Scholar and Wikipedia in parallel and takes titles and abstracts',
    '结果作为「检索结果」并入答案，附原文链接；谁先返回可用结果就用谁':
      'Results join the answer as retrieval hits with links; whichever source replies first wins',
    '若全部端点失败，通常是当前网络无法访问这些境外接口——点「检测连通」可看到每个端点的失败原因':
      'If every endpoint fails, the network cannot reach these overseas services. Check connection shows the reason per endpoint.',
    'Semantic Scholar 匿名调用有共享限流，出现 HTTP 429 属正常现象，可稍后重试':
      'Semantic Scholar throttles anonymous calls; a 429 is normal, retry later',
    'GPT 系列 · 通用表达与追问能力强，适合把参数讲成人话。':
      'GPT models · strong general phrasing and follow-ups, good at putting parameters into plain words.',
    '国内数据引用国家天文科学数据中心（NADC / China-VO）已公开发布的数据集，逐条标注数据版本、DOI/CSTR 与获取方式；FAST 科学数据等需申请获取的条目已单独标明，许可受限的数据集注明署名要求。':
      'Chinese data cites published datasets from NADC / China-VO with version, DOI/CSTR and access route; request-only sets such as FAST are marked separately, and restricted licences carry attribution terms.',
    '面板会按所选供应商动态展开需要的参数：模型版本（可下拉选预设，也可填自定义 ID）、API Key、Base URL、温度、最大输出。':
      'The panel expands the parameters the chosen provider needs: model (preset or custom ID), API key, base URL, temperature and max output.',
    '模型名默认 gpt-4o-mini，可按账号可用模型修改': 'Defaults to gpt-4o-mini; change it to a model your account can use',
    '登录 OpenAI 平台，进入 API Keys 页面创建密钥': 'Sign in to OpenAI, open API Keys and create a key',
    '展开「配置步骤」按提示创建密钥并粘贴，点「测试连接」，显示「已连通」后点「设为默认」。':
      'Expand Setup, create and paste a key, run Test connection, then choose Use as default once it is connected.',
    '打开设置 → 云端模型 · 统一配置，先在供应商选择器里挑一家（OpenAI / Anthropic / Google / Moonshot / 智谱 / 通义千问 / Mistral / Groq / xAI / 自定义）。':
      'Open Settings → Cloud models · one place to configure, then pick a provider (OpenAI, Anthropic, Google, Moonshot, Zhipu, Qwen, Mistral, Groq, xAI or Custom).',

    /* ---------- 使用技巧 ---------- */
    '「今晚在拉萨能看到什么」会自动切换到拉萨并重算星图；也可以直接在观测台检索全球 779 个城市，或输入 39.9,116.4 这样的坐标。':
      'Asking what is visible tonight in Lhasa switches to Lhasa and recomputes the chart. You can also search 779 cities in the observatory or type coordinates such as 39.9,116.4.',
    '观测台会按高度、亮度与月光干扰打分，列出当晚最值得看的 5 个目标，点任意一条即可追问怎么找。':
      'The observatory scores altitude, brightness and moonlight, lists the five best targets tonight, and any of them can be asked how to find.',
    '点该目标追问「怎么找」，答案会给定位路径、器材建议与月光干扰。':
      'Ask how to find a target and the answer gives a star-hop, gear advice and moonlight impact.',
    '点星图右上角的方框按钮进入全屏，滚轮缩放、拖拽平移；切到「全部标注」会显示恒星的中西名、深空天体编号与行星高度。':
      'Use the box button to go full screen, scroll to zoom, drag to pan; All labels shows star names, deep-sky numbers and planet altitudes.',
    '需要更细的星图，点右上角方框进入全屏，切到「全部标注」。':
      'For more detail, open the chart full screen and switch to All labels.',
    '顶栏或输入框里的来源按钮可切换表述层；事实层永远来自本地星历与知识库，切换后数字不会变。':
      'The source button in the top bar or composer switches the wording layer. Facts always come from the local ephemeris and knowledge base, so numbers never change.',
    '连续追问时可以直接说「它」「那个」，系统会用上一轮的主体继续作答，答案顶部会标注「承接上文」。':
      'In follow-ups you can say it or that one; the previous subject carries, and the answer is marked as continuing.',
    '答案末尾的「评审结论」列出证据条数、共识等级与边界声明的检查结果，标「!」的项表示存在缺口。':
      'Review at the end of each answer lists evidence count, consensus and boundary checks; a ! marks a gap.',
    '遇到未收录或时效性不足的问题，会返回边界声明并列出可回答的方向，而不是编一个答案。':
      'When a question is missing or time-sensitive, it returns a boundary note and the directions it can answer instead of inventing one.',
    '回车发送、Shift+回车换行、按 / 聚焦输入框、Esc 关闭所有浮层。':
      'Enter sends, Shift+Enter adds a line, / focuses the input, Esc closes any panel.',

    /* ---------- 教程步骤 ---------- */
    '在观测台把日期设为今晚、时刻设为 21:00，地点用 IP 定位或检索。':
      'In the observatory set the date to tonight and the time to 21:00, then locate by IP or search.',
    '切到「今晚优先」，看第一名目标的高度与峰值时刻。':
      'Switch to tonight-first and read the top target altitude and peak time.',
    '参与问题保持「全部」，把深度设为「精简」，语体设为「科普」。':
      'Keep participation at All, set depth to Brief and register to Plain language.',
    '在专家注记里写明你要的表达方式，保存。': 'Describe the tone you want in the expert notes, then save.',
    '之后每个答案末尾都会附上这个角色的补充。': 'Every later answer ends with a note from that role.',

    /* ---------- 数据 ---------- */
    '地点、时间与器材都在观测台调整；这里只保留影响计算小数位的口径。':
      'Location, time and gear live in the observatory; only precision settings remain here.',
    '问句明显偏向另一方向时临时换讲法；只影响表达，数值不变':
      'Switches wording when the question leans elsewhere. Presentation only; numbers never change.'
  };
})(typeof window !== 'undefined' ? window : this);
