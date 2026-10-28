/* ASTRUM · 界面语言（i18n）
 *
 * 范围说明：翻译**界面框架**（设置、侧栏、按钮、页签）与**答案的界面骨架**
 * （档位徽标、缺口提示、推荐问句）。不翻译知识库条目正文与天体数据：
 * 那些内容带核验日期与出处，翻译会连带破坏可追溯性——宁可保持中文。
 *
 * 用法：把待翻译的中文原文直接作为 key —— L('使用身份')。
 * 缺词条时自动回退中文，所以可以**逐步接入**，不会出现空白或 undefined。
 * 注意：由「固定片段 + 变量」拼出来的句子，整段匹配不到词表，
 * 必须在生成处把每一段分别 L() 包住（见 core/agents.js 顶部说明）。
 */
(function (root) {
  'use strict';

  var KEY = 'astrum.lang';
  var lang = 'zh';

  /* 英文词条：键是中文原文，值是英文 */
  var EN = {
    /* 页签 */
    '设置': 'Settings',
    '来源': 'Sources',
    '观测': 'Observing',
    '数据与档案': 'Data & Profiles',
    '帮助': 'Help',

    /* 分组标题 */
    '对话与表述': 'Conversation',
    '显示': 'Appearance',
    '计算口径': 'Calculation',
    '技能记录': 'Recurring patterns',
    '档案': 'Profiles',
    '历史记录': 'History',
    '数据': 'Data',
    '数据与核验': 'Data & verification',
    '运行状态': 'Runtime',
    '关于': 'About',
    '通用': 'General',
    '界面语言': 'Language',

    /* 设置行 */
    '按问题自动切换风格': 'Adapt style per question',
    '使用身份': 'Persona',
    '默认语体': 'Default register',
    '默认深度': 'Default depth',
    '显示协作链路': 'Show agent trace',
    '显示置信度': 'Show confidence',
    '显示儒略日': 'Show Julian date',
    '自动滚动到答案': 'Auto-scroll to answer',
    '星图标注': 'Sky labels',
    '大字号': 'Large text',
    '紧凑模式': 'Compact layout',
    '数值精度': 'Precision',
    '观测方式': 'Mode',
    '主镜': 'Telescope',
    '相机': 'Camera',

    /* 选项值 */
    '看星 / 拍摄': 'Observing / imaging',
    '查数据 / 读论文': 'Data / papers',
    '了解原理': 'How it works',
    '自适应': 'Adaptive',
    '专业': 'Technical',
    '科普': 'Popular',
    '精简': 'Brief',
    '标准': 'Standard',
    '详尽': 'Detailed',
    '极简': 'Minimal',
    '标注': 'Labeled',
    '密集': 'Dense',
    '目视级': 'Visual',
    '摄影级': 'Photographic',
    '肉眼': 'Naked eye',
    '双筒望远镜': 'Binoculars',
    '天文望远镜': 'Telescope',
    '天文摄影': 'Astrophotography',

    /* 数据与档案 */
    '导出全部（含对话）': 'Export all (incl. chats)',
    '导入备份': 'Import backup',
    '导出配置（不含对话与密钥）': 'Export settings (no chats/keys)',
    '导入配置': 'Import settings',
    '恢复默认': 'Reset to defaults',
    '新建档案': 'New profile',
    '重命名当前档案': 'Rename profile',
    '清空当前对话': 'Clear this chat',
    '清空全部历史': 'Clear all history',
    '本机统计': 'Local stats',

    /* 侧栏 */
    '对话': 'Chats',
    '回答来源': 'Answer source',
    '智能体': 'Agents',
    '试试这样问': 'Try asking',

    /* 答案操作 */
    '复制': 'Copy',
    '分享': 'Share',
    '反馈': 'Report',
    '云量': 'Cloud cover',
    '查询中…': 'Querying…',

    /* 侧栏对话 */
    '搜索对话': 'Search chats',
    '还没有对话': 'No chats yet',
    '没有匹配的对话': 'No matching chat',

    /* 设置 · 关于 */
    '本地优先': 'Local first',
    '星历与知识库都在本机运行，断网可用。每条结论的来源与核验日期，会在答案的「依据」中逐条标注。':
      'Ephemeris and knowledge base both run on this device and work offline. Each conclusion carries its source and verification date in the evidence section.',
    '数据与隐私': 'Data & privacy',
    '数据存在哪、怎么导出与删除，以及哪些操作会让内容离开本机。':
      'Where data lives, how to export or delete it, and which actions send content off this device.',
    '查看说明': 'Read the note',

    /* 设置小节 */
    '表达方式': 'How it speaks',
    '答案呈现': 'In the answer',
    '视觉': 'Visual',

    /* 每日前沿 */
    '前沿': 'Frontier',
    '每日前沿': 'Daily frontier',
    '最新论文与机构报道': 'Latest papers and reports',
    '尚未同步': 'Not synced yet',
    '预印本': 'Preprints',
    '机构报道': 'Reports',
    '长期阵地': 'Standing sources',
    '打开原文': 'Open source',
    '围绕它提问': 'Ask about it',
    '同步于 ': 'Synced ',
    '。内容来自公开接口，未经本项目核验，因此不参与答案推理；引用前请打开原文核对。':
      '. Pulled from public APIs and NOT verified by this project, so it does not take part in answer reasoning. Check the original before citing.',
    '还没有本地数据。构建时运行 tools/sync-daily.js 可生成；GitHub Actions 每天自动执行一次。':
      'No local data yet. Run tools/sync-daily.js at build time; GitHub Actions does it daily.',
    '研究者的博客、机构精选与爱好者论坛。这些不做自动抓取：论坛内容未经筛选，混进列表反而降低信噪比。':
      'Researcher blogs, institutional picks and amateur forums. These are not scraped: unfiltered forum content would only add noise.',

    /* 智能体角色 */
    '总控 · 意图解析与协奏': 'Conductor · intent & orchestration',
    '知识 · 事实与依据': 'Knowledge · facts & evidence',
    '宇宙学 · 尺度、起源与演化': 'Cosmology · scale, origin, evolution',
    '星历 · 位置与时间': 'Ephemeris · position & time',
    '观测 · 条件与器材': 'Observing · conditions & gear',
    '星图 · 空间定位': 'Sky map · spatial locating',
    '表达 · 语体与叙事': 'Voice · register & narrative',
    '爆发 · 变星、超新星与高能天体': 'Transients · variables, supernovae, high energy',

    /* 首屏 */
    '让每一次抬头，都有据可依。': 'Every glance upward, grounded in evidence.',
    '问一个天文问题，例如：今晚在上海能看到什么？（可拖入图片、FITS、文本）':
      'Ask an astronomy question — e.g. what can I see tonight in Shanghai? (drop images, FITS or text)',

    /* 观测台 */
    '观测台': 'Observatory',
    '观测上下文': 'Observing context',
    '实时': 'Live',
    '日期': 'Date',
    '时刻': 'Time',
    '地点': 'Location',
    '搜索全球任意地名，或输入 39.9,116.4': 'Search any place, or type 39.9,116.4',
    '手动坐标': 'Manual coordinates',
    '任意经纬度，全球可用': 'Any latitude/longitude',
    '纬度': 'Latitude',
    '经度': 'Longitude',
    '名称（可选）': 'Name (optional)',

    /* 侧栏补充 */
    '最近 12 条': 'Latest 12',
    '点击配置': 'Click to configure',
    '新建智能体': 'New agent',
    '今晚看什么': 'Tonight',
    '目标怎么找': 'Find a target',
    '黑洞与宇宙': 'Black holes',
    '前沿争议': 'Frontier debates',
    '天象科普': 'Sky events',
    '新对话': 'New chat',

    /* 通用 */
    '切换档案': 'Switch profile',
    '新建': 'New',
    '保存': 'Save',
    '取消': 'Cancel',
    '删除': 'Delete'
  };

  /* 第二、三批词表单独成文件，在这里合并。
   * 缺词条仍是回退中文，所以几批可以独立增补、互不影响。 */
  ['I18N_EN_EXTRA', 'I18N_EN_SETTINGS', 'I18N_EN_CONTENT', 'I18N_EN_ANSWER'].forEach(function (name) {
    var extra = root[name];
    if (!extra) return;
    Object.keys(extra).forEach(function (k) { EN[k] = extra[k]; });
  });

  var DICTS = { en: EN };

  function read() {
    try { return root.localStorage.getItem(KEY) || 'zh'; } catch (e) { return 'zh'; }
  }

  function init() {
    var v = read();
    lang = DICTS[v] ? v : 'zh';
    apply();
    return lang;
  }

  /* 把中文原文翻译成当前语言；没有词条就原样返回 */
  function t(s) {
    if (lang === 'zh') return s;
    var d = DICTS[lang];
    if (!d) return s;
    return Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
  }

  /* 带占位符的词条：{0} {1} 依次替换。
   *
   * 为什么不沿用「前缀 + 变量 + 后缀」的拼法：
   *   中文「在{城市}今晚几点看{目标}最好？」和英文
   *   "In {city}, when is the best time tonight to see {target}?" 变量位置不同，
   *   按前缀后缀硬拼，英文会变成 "In Beijing, best time tonight to see M42?" 这种
   *   半通不通的句子。占位符让每种语言自己排语序，代码只负责喂值。
   *
   * 键仍是中文原句（含占位符），所以 applyDom 不会误伤——带 {0} 的串不会出现在 DOM 里。 */
  function tpl(s, a, b) {
    return t(s)
      .replace(/\{0\}/g, a == null ? '' : String(a))
      .replace(/\{1\}/g, b == null ? '' : String(b));
  }

  function set(v) {
    lang = DICTS[v] ? v : 'zh';
    try { root.localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
    return lang;
  }

  /* 扫描静态标记：[data-i18n] 改文本，[data-i18n-ph] 改 placeholder。
   * 原文就写在 HTML 里（中文），翻译表以它为 key，缺失则保持原样。 */
  function applyStatic() {
    try {
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var zh = el.getAttribute('data-i18n') || el.textContent.trim();
        /* 必须无条件写回，不能只在「翻译结果与原文不同」时才写。
         * 这些元素里放的是英文兜底文案，中文模式下 t(zh) 返回的正是 zh，
         * 一旦跳过写入，页面上就会一直显示那句英文 —— 首屏标题就踩了这个坑。 */
        el.textContent = t(zh);
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        var zh = el.getAttribute('data-i18n-ph');
        el.setAttribute('placeholder', t(zh));
      });
      /* 只有图标的控件靠 aria-label 传达名称，必须跟着语言变，
       * 否则英文界面下读屏会念出一句中文。 */
      document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
        var zh = el.getAttribute('data-i18n-aria');
        el.setAttribute('aria-label', t(zh));
      });
    } catch (e) {}
  }

  /* 渲染后翻译：本项目大量用 HTML 字符串拼 DOM（答案骨架、评审块、器材名…），
   * 逐个改渲染点必然漏，所以在渲染完成后对文本节点做一次**整段精确匹配**替换。
   *
   * 只处理「整段文本等于词条键」的节点，所以：
   *   - 界面标签（距离 / 依据 / 评审结论）会被翻；
   *   - 知识条目正文（长句）不会被翻，也不会被部分替换成中英混排。
   * 幂等：英文值不是中文键，重复调用不会产生叠加。 */
  function applyDom(rootNode) {
    if (lang !== 'en') return 0;
    var host = rootNode || (typeof document !== 'undefined' ? document.body : null);
    if (!host || !document.createTreeWalker) return 0;
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    var node, count = 0;
    /* 必须跳过脚本与样式节点：TreeWalker(document.body) 也会走到 <script> 的文本，
     * 一旦匹配到词条就会改写 JS 源码 —— 页面看起来正常，行为却坏了。
     * 这个坑是我加上这一层后的第一次运行就踩到的（联网用例集体失败）。 */
    var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/;
    while ((node = walker.nextNode())) {
      var parent = node.parentNode;
      if (parent && SKIP.test(parent.nodeName)) continue;
      var raw = node.nodeValue;
      if (!raw) continue;
      var key = raw.trim();
      if (!key || EN[key] === undefined) continue;
      if (!/[\u4e00-\u9fff]/.test(key)) continue;
      node.nodeValue = (key === raw) ? EN[key] : raw.replace(key, EN[key]);
      count++;
    }
    return count;
  }

  /* <html lang> 与字体：英文用系统字体栈更合适 */
  function apply() {
    applyStatic();
    applyDom(document.body);
    try {
      document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
      document.body.classList.toggle('lang-en', lang === 'en');
    } catch (e) {}
  }

  function current() { return lang; }

  root.I18N = { init: init, t: t, tpl: tpl, set: set, current: current, applyDom: applyDom, DICTS: DICTS };
})(typeof window !== 'undefined' ? window : globalThis);
