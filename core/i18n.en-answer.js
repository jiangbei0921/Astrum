/* ASTRUM · 界面英文词表（第五批：答案骨架）
 *
 * 这一批补的是「答案里由代码拼出来的界面文案」：
 * 档位徽标、等待动画、身份卡、边界档的三行缺口与推荐问句。
 *
 * 为什么它需要单独一批、并且要在 core/agents.js 里加 L()：
 *   这些句子在生成答案时就被写死成中文字面量，而且大多是「固定片段 + 变量」的拼接，
 *   整段永远匹配不到词表，所以 applyDom 那层兜底也救不了它们。
 *   解法只能是回到生成处，把固定片段用 L() 包起来，让每一段各自能命中。
 *
 * 边界仍然清楚：**知识库条目正文不在这里**。正文带核验日期与出处，
 * 翻译会连带改掉可追溯性，那是另一个决定，不夹在这批里做。
 */
(function (root) {
  'use strict';

  root.I18N_EN_ANSWER = {
    /* ---------- 档位徽标：这个答案是算的、查的，还是解释的 ---------- */
    '本地计算 · 可复算': 'Local compute · reproducible',
    '外部数据 · 附出处': 'External data · sourced',
    '本地知识库 · 有出处': 'Local knowledge base · cited',
    '无可靠依据': 'No reliable basis',
    '无需检索': 'No retrieval needed',
    '本地星历 + 知识库': 'Local ephemeris + knowledge base',

    /* ---------- meta 行与等待动画 ---------- */
    '本地引擎': 'Local engine',
    '核验 ': 'Verified ',
    '核验事实 · 调用 ': 'Verifying facts · calling ',
    'Muse 解析意图 · 调度智能体': 'Muse reading intent · dispatching agents',

    /* ---------- 身份卡（首次进入时问「你主要想做什么」） ---------- */
    '先告诉我你主要想做什么': 'First, what are you mainly here to do?',
    '只影响默认的讲解方式与推荐，随时可改，也不影响任何数值。':
      'Only sets the default explanation style and suggestions. Change it anytime; it never affects any number.',
    '器材、视场、今晚窗口优先': 'Gear, field of view, tonight’s window first',
    '数值、出处、可跑查询优先': 'Numbers, sources, runnable queries first',
    '概念、成因、通俗讲解优先': 'Concepts, causes, plain explanations first',
    '先跳过': 'Skip for now',

    /* ---------- 边界档：说清「不知道」比编一个更像样 ---------- */
    '边界判定': 'Boundary check',
    '无匹配实体 · 无匹配意图': 'No entity match · no intent match',
    '知识库与星表命中': 'Knowledge base and catalog hits',
    '零命中': 'no hits',
    '本地没有这个问题的依据。': 'The local store has nothing to back this question.',
    '缺什么': 'What’s missing',
    '去哪拿': 'Where to get it',
    '我能做': 'What I can do',
    '今晚适合看什么？': 'What is worth observing tonight?',
    '猎户座大星云怎么找？': 'How do I find the Orion Nebula?',
    '为什么会有月相变化？': 'Why does the Moon show phases?',

    /* ---------- 答案段落骨架：标题、注记、星图跳转 ---------- */
    '观测建议': 'Observing tips',
    '银心 Sgr A*': 'Galactic centre Sgr A*',
    '在实时星图中查看「{0}」': 'View {0} on the live sky map',
    '按 {0}（Bortle {1}）计算': 'Computed for {0} (Bortle {1})',

    /* ---------- 推荐追问（含变量的三条，用占位符让英文自己排语序） ---------- */
    '这条结论有没有争议？': 'Is this conclusion disputed?',
    '还有哪些常见误解？': 'What are the common misconceptions?',
    '用一句话讲给孩子听？': 'Explain it to a child in one sentence?',
    '今晚在北京能看到什么？': 'What can I see in Beijing tonight?',
    '什么是「视星等」？': 'What is apparent magnitude?',
    '英仙座流星雨什么时候看最好？': 'When is the best time for the Perseids?',
    '在{0}今晚几点看{1}最好？': 'In {0}, when is the best time tonight to see {1}?',
    '{0}用双筒望远镜能看到什么？': 'What can binoculars show of {0}?',
    '它的光走了多久才到地球？': 'How long has its light been travelling?',

    /* ---------- 城市名 ----------
     * 城市是 core/agents.js 里的固定枚举（33 个），不是会随星表更新的数据，
     * 所以放词表是安全的。北京/上海/广州/拉萨 已在第二批词表里，这里不重复。 */
    '深圳': 'Shenzhen',
    '成都': 'Chengdu',
    '重庆': 'Chongqing',
    '西安': "Xi'an",
    '南京': 'Nanjing',
    '杭州': 'Hangzhou',
    '武汉': 'Wuhan',
    '昆明': 'Kunming',
    '丽江': 'Lijiang',
    '乌鲁木齐': 'Urumqi',
    '哈尔滨': 'Harbin',
    '漠河': 'Mohe',
    '三亚': 'Sanya',
    '青岛': 'Qingdao',
    '厦门': 'Xiamen',
    '长沙': 'Changsha',
    '郑州': 'Zhengzhou',
    '沈阳': 'Shenyang',
    '呼和浩特': 'Hohhot',
    '西宁': 'Xining',
    '贵阳': 'Guiyang',
    '福州': 'Fuzhou',
    '兰州': 'Lanzhou',
    '东京': 'Tokyo',
    '首尔': 'Seoul',
    '新加坡': 'Singapore',
    '悉尼': 'Sydney',
    '奥克兰': 'Auckland',
    '伦敦': 'London',

    /* ---------- 缺口文案（按问句线索分五档） ---------- */
    '本地知识库只有 160 条通用条目，没有收录具体论文的最新测量值。':
      'The local knowledge base holds 160 general entries; it does not index latest measurements from individual papers.',
    'NASA ADS（ui.adsabs.harvard.edu）按关键词检索，或 arXiv astro-ph 预印本；拿到 DOI 后可回来核对数值与单位。':
      'Search NASA ADS (ui.adsabs.harvard.edu) by keyword, or the arXiv astro-ph preprints. With the DOI in hand, come back and check the numbers and units here.',
    '贴一段论文摘要或数据表给我，我可以按已有事实做比对，并标出与本地数据的差异。':
      'Paste an abstract or a data table and I can compare it against the stored facts, flagging where it departs from local data.',

    '本地没有原始观测数据，也不做图像处理与拟合。':
      'There is no raw observation data here, and no image processing or fitting either.',
    'MAST / IRSA / ZTF 归档按坐标检索；星表级别的问题走 SIMBAD 或 VizieR。':
      'Query the MAST / IRSA / ZTF archives by coordinates; catalog-level questions go to SIMBAD or VizieR.',
    '如果你有 FITS 文件，直接拖进来——我能读出目标、坐标、曝光与滤镜，并定位到星图。':
      'If you have a FITS file, drop it in — I can read the target, coordinates, exposure and filter, then locate it on the sky map.',

    '本地是离线快照，没有实时气象与空间天气数据。':
      'This is an offline snapshot: no live weather or space-weather data.',
    '云量与 seeing 看 Open-Meteo 或天文台站预报；地磁活动看 NOAA SWPC 的 Kp 指数。':
      'For cloud cover and seeing, check Open-Meteo or an observatory forecast; for geomagnetic activity, the NOAA SWPC Kp index.',
    '我可以先按你的地点和时间算出目标的可观测窗口与月亮干扰，天气那一项你对照一下即可。':
      'I can still compute the observable window and moonlight interference for your location and time; you only need to check the weather item yourself.',

    '本地星表是 J2000 快照，未覆盖全部源，也没有测光与分光数据。':
      'The local catalog is a J2000 snapshot: it does not cover every source and carries no photometric or spectroscopic data.',
    'SIMBAD（名称解析）、VizieR（星表）、Gaia 归档（TAP/ADQL）都能按坐标或名称查到权威值。':
      'SIMBAD (name resolution), VizieR (catalogs) and the Gaia archive (TAP/ADQL) all return authoritative values by coordinate or name.',
    '把天体名或坐标给我，我先用本地星表给退化值，并明确标出哪些字段缺失。':
      'Give me a name or coordinates: I will return a degraded value from the local catalog and mark exactly which fields are missing.',

    '本地知识库与星表都没有命中这个问法。':
      'Neither the knowledge base nor the catalog matched this question.',
    '换一个更具体的问法（给出天体名、时间、地点或坐标）通常就能命中；涉及专业结论时需要外部文献库。':
      'A more specific question — with an object name, time, place or coordinates — usually hits. Professional conclusions need an external literature source.',
    '告诉我你想解决的具体问题（比如「想拍什么」「想核对哪个数值」），我按可算/可查的路径拆一遍。':
      'Tell me the concrete problem (say, what you want to shoot, or which number you want to check) and I will break it into computable and lookup paths.'
  };
})(typeof window !== 'undefined' ? window : this);
