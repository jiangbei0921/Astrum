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
    '拉萨': 'Lhasa',

    /* ---------- 观测台：卡片标题、图例、按钮 ---------- */
    '实时星图': 'Live sky chart',
    '目标目录': 'Target list',
    '观测清单': 'Observing plan',
    '今晚优先': 'Tonight’s picks',
    '月相与暗夜': 'Moon and darkness',
    '太阳系观测': 'Solar system view',
    '恒星': 'Stars',
    '行星': 'Planets',
    '星座': 'Constellations',
    '地面视角 · 点击放大': 'Ground view · click to zoom',
    '梅西耶': 'Messier',
    '深空': 'Deep sky',
    '导出计划单': 'Export plan',
    '清空': 'Clear',
    '本地': 'Local',
    '加入观测清单': 'Add to plan',
    '使用该坐标': 'Use this coordinate',
    '该分类暂无条目': 'Nothing in this category',
    '待升': 'not yet risen',
    '地平线下': 'below horizon',
    '清单为空：在目标目录点「＋」，或在今晚优先里加入':
      'Plan is empty: tap ＋ in the target list, or add from tonight’s picks',
    '事实层始终由本地星历与知识库核验':
      'The fact layer is always verified against local ephemeris and the knowledge base',
    '切换来源不会改变任何数值': 'Switching sources never changes any number',
    '南纬为负、西经为负。例如：南半球 −33.87, 151.21；西经 −74.0。':
      'South latitude and west longitude are negative. Example: southern hemisphere −33.87, 151.21; west longitude −74.0.',

    /* 计数与高度（含变量，走 I18N.tpl） */
    '{0} 个目标': '{0} targets',
    '{0} 个 · 此刻可见 {1}': '{0} objects · {1} above horizon',
    '{0} 项': '{0} items',
    '高 {0}°': 'alt {0}°',

    /* ---------- 月相名（core/astro.js 的 PHASES） ---------- */
    '新月': 'New Moon',
    '蛾眉月': 'Waxing Crescent',
    '上弦月': 'First Quarter',
    '盈凸月': 'Waxing Gibbous',
    '满月': 'Full Moon',
    '亏凸月': 'Waning Gibbous',
    '下弦月': 'Last Quarter',
    '残月': 'Waning Crescent',
    '月相': 'Phase',
    '照亮': 'Illumination',
    '暗夜': 'Dark window',
    '月升落': 'Moonrise / set',

    /* ---------- 太阳系天体（core/astro.js 的 PLANETS） ---------- */
    '太阳': 'Sun',
    '月球': 'Moon',
    '水星': 'Mercury',
    '金星': 'Venus',
    '地球': 'Earth',
    '火星': 'Mars',
    '木星': 'Jupiter',
    '土星': 'Saturn',
    '天王星': 'Uranus',
    '海王星': 'Neptune',

    /* ---------- 深空天体类型（目标目录的副标题用） ---------- */
    '旋涡星系': 'Spiral galaxy',
    '椭圆星系': 'Elliptical galaxy',
    '球状星团': 'Globular cluster',
    '疏散星团': 'Open cluster',
    '发射星云': 'Emission nebula',
    '反射星云': 'Reflection nebula',
    '行星状星云': 'Planetary nebula',
    '超新星遗迹': 'Supernova remnant',
    '星暴星系': 'Starburst galaxy',

    /* ---------- 全屏星图与太阳系视图 ---------- */
    '星空全图': 'Full sky chart',
    '拖动环顾天空 · 滚轮缩放 · 悬停看名称 · 点击天体查看资料 · 上方天体条可直接定位 · Esc 关闭':
      'Drag to look around · scroll to zoom · hover for names · click a body for details · use the strip above to jump · Esc to close',
    /* 键里的分隔符是全角空格（U+3000），照抄 HTML 原文——半角空格匹配不到 */
    '点=恒星　菱形=深空天体　球体=行星　淡点=银河星场（示意）　虚线圈=地平线下　右下=你所在的地球':
      'dot = star　diamond = deep-sky object　sphere = planet　faint dots = Milky Way field (schematic)　dashed arc = below horizon　lower right = your Earth',
    '全部标注': 'Label all',
    '标准标注': 'Standard labels',

    '正在生成天体贴图与轨道…': 'Building body textures and orbits…',
    '拖动旋转 · 滚轮缩放 · 滑杆调天体放大 · 双击进入近景 · 1/2/3 切层级 · Tab 切换天体 · Esc 关闭':
      'Drag to rotate · scroll to zoom · slider to enlarge bodies · double-click for close-up · 1/2/3 for levels · Tab to cycle bodies · Esc to close',
    '标签': 'Labels',
    '真实等比': 'True scale',
    '轨道': 'Orbits',
    '暂停': 'Pause',
    '放大': 'Magnify',
    '特写': 'Close-up',
    '近景': 'Near view',
    '全系': 'All planets',
    '1 天/秒': '1 day/s',
    '10 天/秒': '10 days/s',
    '1 年/秒': '1 year/s',

    /* ---------- 坐标面板与来源弹层 ---------- */
    '时区（UTC 偏移）': 'Time zone (UTC offset)',
    '默认按经度估算，跨时区或使用夏令时的地区请手动指定。':
      'Estimated from longitude by default; set it manually for regions with other time zones or daylight saving.',
    '配置密钥': 'Configure key',
    '来源、显示与数据核验': 'Sources, display and data verification',
    '总控': 'Orchestrator',

    /* ---------- 器材名（data/gear.js 的 name） ---------- */
    '手机长焦（约 135mm 等效）': 'Phone telephoto (~135mm equiv.)',
    '长焦镜筒（1000mm f/5）': 'Telephoto scope (1000mm f/5)'
  };
})(typeof window !== 'undefined' ? window : this);
