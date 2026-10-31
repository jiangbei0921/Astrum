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
    '长焦镜筒（1000mm f/5）': 'Telephoto scope (1000mm f/5)',

    /* ---------- 提示（toast，走 app.js 的 toast()/T 模板） ---------- */
    '坐标无效：纬度需在 −90~90，经度需在 −180~180':
      'Invalid coordinates: latitude must be between −90 and 90, longitude between −180 and 180',
    '未找到「{0}」，可直接输入经纬度（例：39.9,116.4）':
      'No match for “{0}”. Enter latitude/longitude directly (e.g. 39.9,116.4)',
    '未找到「{0}」，可从列表选择或点「坐标」手动输入':
      'No match for “{0}”. Pick from the list or use “Coordinates” to enter it manually',
    '定位超时，请手动选择地点': 'Locating timed out. Please choose a location manually',
    '「{0}」尚未配置密钥，本次仍由本地内核生成':
      '“{0}” has no API key yet; the local kernel will generate this answer',
    '已删除该条技能记录': 'Skill record deleted',
    '已清空全部技能记录': 'All skill records cleared',
    '观测清单为空': 'Observation list is empty',
    '已导出 {0} 项观测计划': 'Exported {0} observation items',
    '最多 {0} 个附件，请先移除': 'Up to {0} attachments. Remove one first',
    '超出上限，只添加前 {0} 个': 'Over the limit; added only the first {0}',
    '已添加 {0} 个附件，其中 {1} 个未能解析（已标注原因）':
      'Added {0} attachments; {1} could not be parsed (reason noted)',
    '{0} 此刻在地平线以下（高度 {1}°）': '{0} is below the horizon right now (altitude {1}°)',
    '智能体已保存': 'Agent saved',
    '密钥已保存到本机（显示时仅保留末 4 位）':
      'Key saved on this device (only the last 4 digits are shown)',
    '已清除该来源的密钥': 'Key removed for this source',
    '连接成功：{0}': 'Connected: {0}',
    '连接失败：{0}': 'Connection failed: {0}',
    '已切换默认来源：{0}': 'Default source set to {0}',
    '已切换默认来源': 'Default source updated',
    '可用端点 {0} / {1}': '{0} of {1} endpoints available',
    '全部端点不可达，将使用本地索引': 'No endpoint reachable; falling back to the local index',
    '名称无效': 'Invalid name',
    '已重命名': 'Renamed',
    '已删除档案': 'Profile deleted',
    '导出内容检测到密钥字段，已中止导出': 'Export aborted: the content contains key fields',
    '已导出配置（不含密钥）': 'Settings exported (keys excluded)',
    '配置已导入': 'Settings imported',
    '配置文件无法解析：{0}': 'Could not parse the settings file: {0}',
    '需要至少一个已连通的云端来源才能对比':
      'At least one connected cloud source is required for comparison',
    '观测清单已清空': 'Observation list cleared',
    '已切换为「{0}」，可在设置里随时更改':
      'Switched to “{0}”. You can change it anytime in Settings',
    '本机存储写入失败，刷新后这条对话可能丢失':
      'Local storage write failed; this conversation may be lost after a refresh',
    '历史记录读取失败，本次以空白对话开始':
      'Could not load history; starting with an empty conversation',
    '打开对话失败：{0}': 'Failed to open the conversation: {0}',
    '文件不是合法 JSON': 'The file is not valid JSON',
    '这不是 ASTRUM 的备份文件': 'This is not an ASTRUM backup file',
    '创建档案失败': 'Failed to create the profile',
    '写入设置失败': 'Failed to write settings',
    '已导入为档案「{0}」，正在切换': 'Imported as profile “{0}”. Switching now',
    '导入失败：{0}': 'Import failed: {0}',
    '存储未就绪': 'Storage is not ready yet',
    '已导出 {0} 个对话、{1} 条消息': 'Exported {0} conversations and {1} messages',
    '导出失败：{0}': 'Export failed: {0}',
    '已更新到 v{0}': 'Updated to v{0}',
    '清空失败：{0}': 'Failed to clear: {0}',
    'SIMBAD 响应超时（服务在境外，可能是网络不通，可稍后重试）':
      'SIMBAD timed out (the service is overseas; the network may be unreachable — try again later)',
    'SIMBAD 未找到该天体': 'SIMBAD has no entry for this object',
    '天气服务超时': 'The weather service timed out',
    '未取到{0}的天气': 'Could not get the weather for {0}',
    '已清空全部历史对话': 'All conversations cleared',
    '已清空当前对话': 'Current conversation cleared',
    '已切换到 {0}': 'Switched to {0}',
    '已切换到 {0}（{1}）': 'Switched to {0} ({1})',
    '已定位到 {0}（距坐标 {1} 公里）': 'Located {0} ({1} km from the coordinates)',
    '已按 IP 定位：{0}': 'Located by IP: {0}',
    '已按 IP 定位：{0} {1}': 'Located by IP: {0} {1}',
    '已按 IP 定位：{0}（距 {1} km）': 'Located by IP: {0} ({1} km away)',
    '定位服务超时，请手动选择地点':
      'The geolocation service timed out. Please choose a location manually',
    '定位服务被网络策略拦截，请手动选择地点':
      'Geolocation is blocked by the network policy. Please choose a location manually',
    'IP 定位不可用，请手动选择地点':
      'IP geolocation is unavailable. Please choose a location manually',
    '请输入包含文字或数字的内容': 'Enter text or numbers',
    '提问已截断到 {0} 字': 'Question truncated to {0} characters',
    '超过 {0} 字，请缩短': 'Over {0} characters. Please shorten it',
    '已打开太阳系观测视图。': 'Opened the solar system view.',
    '已切换到「{0}」视角。': 'Switched to the “{0}” view.',
    '视角已重置。': 'View reset.',
    '时间推进已暂停。': 'Time progression paused.',
    '时间推进已恢复。': 'Time progression resumed.',
    '轨道已显示。': 'Orbits shown.',
    '轨道已隐藏。': 'Orbits hidden.',
    '标签已显示。': 'Labels shown.',
    '标签已隐藏。': 'Labels hidden.',
    '天体统一放大系数已调整为 ×{0}（直径比例不变）。':
      'Body scale set to ×{0} (diameter ratios unchanged).',
    '指令执行失败：{0}': 'Command failed: {0}',
    '（距 {0} km）': '({0} km away)'
  };
})(typeof window !== 'undefined' ? window : this);
