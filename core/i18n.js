/* ASTRUM · 界面语言（i18n）
 *
 * 范围说明：只翻译**界面框架**（设置、侧栏、按钮、页签），不翻译生成的答案、
 * 知识库条目与天体数据。那些内容有几百条文案且带引用，机器翻译会破坏事实的
 * 可追溯性——宁可保持中文，也不给出一个半译的答案。
 *
 * 用法：把待翻译的中文原文直接作为 key —— L('使用身份')。
 * 缺词条时自动回退中文，所以可以**逐步接入**，不会出现空白或 undefined。
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
        var out = t(zh);
        if (out !== zh) el.textContent = out;
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        var zh = el.getAttribute('data-i18n-ph');
        el.setAttribute('placeholder', t(zh));
      });
    } catch (e) {}
  }

  /* <html lang> 与字体：英文用系统字体栈更合适 */
  function apply() {
    applyStatic();
    try {
      document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'zh-CN');
      document.body.classList.toggle('lang-en', lang === 'en');
    } catch (e) {}
  }

  function current() { return lang; }

  root.I18N = { init: init, t: t, set: set, current: current, DICTS: DICTS };
})(typeof window !== 'undefined' ? window : globalThis);
