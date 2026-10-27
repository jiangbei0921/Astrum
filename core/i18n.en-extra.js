/* ASTRUM · 界面英文词表（第二批）
 *
 * 为什么单独一个文件：core/i18n.js 里的 EN 只覆盖设置面板与外壳；
 * 这个文件补的是**答案骨架、评审块、观测台、器材名、首屏能力卡**等
 * 由 HTML 字符串拼出来的文案。
 *
 * 约定不变：**键是界面上出现的中文原文**，值是英文；缺词条则保持中文。
 * 加载顺序：本文件在 core/i18n.js 之前加载，由 i18n.js 合并进 EN。
 */
(function (root) {
  'use strict';

  root.I18N_EN_EXTRA = {

    /* ---------- 顶栏 / 侧栏 / 首屏 ---------- */
    '天文多智能体': 'Astronomy multi-agent',
    '观测台': 'Observatory',
    '跳到主内容': 'Skip to content',
    '主档案': 'Main profile',
    '＋ 新建档案': '+ New profile',
    '新建档案': 'New profile',
    '搜索对话': 'Search chats',
    'ASTRUM 内核': 'ASTRUM Core',
    '本地': 'Local',
    '云端': 'Cloud',
    '本机': 'On device',

    '观测与星图': 'Observing and sky charts',
    '方位、高度、升落与最佳窗口': 'Azimuth, altitude, rise and set, best window',
    '天体知识': 'Object knowledge',
    '距离、性质、演化，附来源与时效': 'Distance, nature, evolution, with source and date',
    '宇宙学与前沿': 'Cosmology and frontier',
    '黑洞、暗能量，标注共识等级': 'Black holes, dark energy, consensus level',
    '自建智能体': 'Custom agents',
    '定义角色、参数与专家注记': 'Roles, parameters and expert notes',

    /* ---------- 智能体角色 ---------- */
    '太阳 · 日面活动与空间天气': 'Sun · activity and space weather',
    '文献 · 论文检索与证据评估': 'Literature · papers and evidence',
    '评审 · 证据强度与时效核验': 'Review · strength and recency',
    '编目 · 多来源去重与合并': 'Catalog · dedupe and merge',
    '领航 · 太阳系视图与视角操作': 'Navigator · solar system view',
    '星图 · 空间定位': 'Sky map · spatial locating',

    /* ---------- 答案骨架 ---------- */
    '依据': 'Evidence',
    '表述': 'Wording',
    '检索过程': 'Retrieval',
    '步': 'steps',
    '本地计算 · 可复算': 'Local compute · reproducible',
    '证据复核': 'Evidence check',
    '解析意图': 'Parse intent',
    '检索知识库': 'Search knowledge base',
    '计算星历': 'Compute ephemeris',
    '评估观测条件': 'Assess conditions',
    '生成星图': 'Render sky chart',
    '组织表述': 'Compose wording',
    '本地知识库条目': 'Local knowledge entry',
    '原文': 'Source',

    /* 评审块 */
    '评审结论': 'Review',
    '存在缺口': 'Gaps found',
    '证据条数': 'Evidence items',
    '数值可复算': 'Numbers reproducible',
    '共识等级': 'Consensus',
    '边界声明': 'Boundary note',
    '置信度': 'Confidence',
    '缺失': 'Missing',
    '公认': 'Established',
    '长期稳定': 'Long-term stable',
    '均衡门槛：常规问答标准。': 'Balanced threshold: standard Q&A.',

    /* 操作条 */
    '复制': 'Copy',
    '重新编辑': 'Edit again',
    '分享': 'Share',
    '反馈': 'Report',

    /* 输入区 / 来源 */
    '单一来源': 'Single source',
    '并行对比': 'Side by side',
    '事实层由本地核验': 'Facts verified locally',
    '结论可追溯到星历计算或文献；不确定处会明确标注，不编造。附件只在本机解析。':
      'Conclusions trace back to ephemeris computation or literature; uncertainty is labelled, never invented. Attachments are parsed on this device.',

    /* ---------- 观测台 ---------- */
    '观测上下文': 'Observing context',
    '城市': 'City',
    '坐标': 'Coordinates',
    '方式': 'Type',
    '肉眼': 'Naked eye',
    '双筒望远镜': 'Binoculars',
    '天文望远镜': 'Telescope',
    '天文摄影': 'Astrophotography',
    '主镜': 'Scope',
    '相机': 'Camera',
    'IP 定位不可用，请手动选择地点': 'IP location unavailable. Pick a place manually.',

    /* ---------- 观测延伸 ---------- */
    '观测延伸': 'Observing notes',
    '最佳窗口': 'Best window',
    '当前方位': 'Current position',
    '峰值时刻': 'Peak time',
    '月光干扰': 'Moon interference',
    '器材': 'Gear',
    '定位路径': 'Star hop',
    '要点': 'Key points',
    '可视化': 'Visualization',
    '方位等距投影': 'Azimuthal equidistant',

    /* ---------- 事实标签 ---------- */
    '距离': 'Distance',
    '直径': 'Diameter',
    '类型': 'Type',
    '视星等': 'Visual magnitude',
    '恒星形成': 'Star formation',

    /* ---------- 器材 ---------- */
    '7×50 双筒': '7x50 binoculars',
    '10×50 双筒': '10x50 binoculars',
    '15×70 双筒': '15x70 binoculars',
    '80mm f/7 折射': '80mm f/7 refractor',
    '102mm f/7 折射': '102mm f/7 refractor',
    '130/650 牛顿 f/5': '130/650 Newtonian f/5',
    '150/750 牛顿 f/5': '150/750 Newtonian f/5',
    '200/1000 牛顿 f/5': '200/1000 Newtonian f/5',
    '200/1200 牛顿 f/6': '200/1200 Newtonian f/6',
    'C8 施卡 203/2032 f/10': 'C8 SCT 203/2032 f/10',
    '90mm 马卡 1250 f/13.9': '90mm Mak 1250 f/13.9',
    '135mm f/2 定焦': '135mm f/2 prime',
    '200mm f/2.8 定焦': '200mm f/2.8 prime',
    'APS-C 单反（如 2600/533）': 'APS-C DSLR (e.g. 2600/533)',
    '全画幅单反（如 6D/5D）': 'Full-frame DSLR (e.g. 6D/5D)',
    'M43 微单': 'M43 mirrorless',
    '广角 + 改机（135mm f/2）': 'Wide + modded camera (135mm f/2)',

    /* ---------- 地点 ---------- */
    '北京': 'Beijing',
    '上海': 'Shanghai',
    '广州': 'Guangzhou',
    '拉萨': 'Lhasa'
  };
})(typeof window !== 'undefined' ? window : this);
