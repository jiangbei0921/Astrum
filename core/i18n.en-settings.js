/* ASTRUM · 界面英文词表（第三批：设置 / 来源 / 帮助 / 数据 / 智能体）
 *
 * 为什么又开一个文件：前两批是「外壳 + 答案骨架」，这批是设置面板里
 * 由 HTML 字符串直接拼出来的行标题、说明、帮助卡与教程。
 *
 * 键仍是界面上出现的中文原文。缺词条回退中文，不会空白。
 */
(function (root) {
  'use strict';

  root.I18N_EN_SETTINGS = {

    /* ---------- 智能体（侧栏显示为「Name · 中文名」，英文下只留名字） ---------- */
    'Muse · 缪斯': 'Muse',
    'Vega · 织女': 'Vega',
    'Cosmos · 宇宙': 'Cosmos',
    'Kepler · 开普勒': 'Kepler',
    'Horizon · 地平': 'Horizon',
    'Orion · 猎户': 'Orion',
    'Lyra · 天琴': 'Lyra',
    'Nova · 新星': 'Nova',
    'Helios · 赫利俄斯': 'Helios',
    'Scholar · 研读': 'Scholar',
    'Critic · 评议': 'Critic',
    'Curator · 编目': 'Curator',
    'Navigator · 领航': 'Navigator',

    /* ---------- 设置 · 通用 ---------- */
    '界面文字会切换；答案与知识库内容仍为中文。':
      'Switches the interface language. Answer text and the knowledge base stay in Chinese.',
    '中文': 'Chinese',
    '了解天文': 'Learning astronomy',
    '查数据 / 读论文': 'Reading data and papers',
    '拍摄与观测': 'Imaging and observing',
    '观测台中的 JD 时间戳': 'Julian date in the observatory panel',
    '在答案顶部展示参与的智能体': 'Show which agents took part, above each answer',
    '适合投屏或视力不便时使用': 'For projectors or low vision',
    '减小行距与内边距': 'Tighten line height and padding',
    '问句明显偏向另一方向时临时换讲法；只影响表达，数值不变':
      'Switch wording when the question clearly leans another way. Presentation only; numbers never change.',
    '地点、时间与器材都在观测台调整；这里只保留影响计算小数位的口径。':
      'Location, time and gear live in the observatory. Only precision settings remain here.',
    '观测台中的 JD 时间戳': 'Julian date in the observatory panel',

    /* ---------- 设置 · 来源 ---------- */
    '来源与密钥': 'Sources and keys',
    '离线内核': 'Offline core',
    '可用 · 无需配置': 'Ready, no setup',
    '联网检索': 'Web retrieval',
    '联网可用': 'Available online',
    '需联网': 'Needs network',
    '需密钥': 'Needs a key',
    '未配置密钥': 'No key configured',
    '设为默认': 'Use as default',
    '测试连接': 'Test connection',
    '检测连通': 'Check connection',
    '工作方式': 'How it works',
    '配置步骤': 'Setup',
    '模型版本': 'Model',
    '最大输出': 'Max output',
    '温度': 'Temperature',
    'tokens · 输出段落长度上限': 'tokens, max length of a reply',
    '自定义模型名…': 'Custom model name',
    '清除': 'Clear',
    '自定义': 'Custom',
    '智谱': 'Zhipu',
    '通义千问': 'Qwen',
    'DeepSeek': 'DeepSeek',
    '月之暗面': 'Moonshot',
    '事实层（星历与知识库）不受检索影响': 'Facts (ephemeris and knowledge base) are unaffected by retrieval',
    '不可达时自动回退本地索引，并在答案中标注「本地索引」':
      'Falls back to the local index when unreachable, and labels it in the answer',

    /* ---------- 数据与档案 ---------- */
    '数据与核验': 'Data and verification',
    '数据与边界': 'Data and limits',
    '新建档案': 'New profile',
    '重命名当前档案': 'Rename current profile',
    '清空当前对话': 'Clear this chat',
    '清空全部历史': 'Clear all history',
    '恢复默认': 'Restore defaults',
    '导入备份': 'Import backup',
    '导入配置': 'Import settings',
    '导出全部（含对话）': 'Export all (with chats)',
    '导出配置（不含对话与密钥）': 'Export settings (no chats, no keys)',
    '导出为 JSON 备份，可在另一台设备导入还原。': 'Exports a JSON backup you can import on another device.',
    '技能记录': 'Skill history',
    '核验日期': 'Verified',
    '当前：主档案（默认档案，沿用原有数据，无需迁移）':
      'Current: Main profile (default; existing data is reused, no migration needed)',
    '本机已保存 0 轮 · 存储：不可用': 'No rounds saved · storage unavailable',
    '本机统计：问过 0 次（仅存本地，不上传）': 'Local stats: 0 questions (stored on this device, never uploaded)',

    /* ---------- 帮助 ---------- */
    '能帮你做什么': 'What it can do',
    '使用技巧': 'Tips',
    '配套教程': 'Tutorials',
    '智能体阵容': 'Agent roster',
    '知识库口径': 'Knowledge base scope',
    '本地优先': 'Local first',
    '数据与隐私': 'Data and privacy',

    /* 帮助卡（标题 + 说明） */
    '观测与星图': 'Observing and sky charts',
    '方位、高度、升落与最佳窗口；星图可一键全屏放大，查看全部标注。':
      'Azimuth, altitude, rise and set, best window. Expand the chart to full screen for every label.',
    '天体知识': 'Object knowledge',
    '距离、性质、演化，附来源与时效标签；每条结论都标注出处与核验日期。':
      'Distance, nature and evolution, each with a source and a verification date.',
    '宇宙学与前沿': 'Cosmology and frontier',
    '黑洞、暗能量、哈勃张力，标注共识等级与仍需回答的问题。':
      'Black holes, dark energy, the Hubble tension, with consensus level and open questions.',
    '自建智能体': 'Custom agents',
    '定义角色、参数与专家注记，可指定参与哪类问题。':
      'Define a role, parameters and expert notes, and choose which questions it joins.',

    /* 使用技巧标题 */
    '先说地点，再问问题': 'Name the place first',
    '用「今晚优先」代替漫无目的': 'Use tonight-first instead of browsing',
    '星图放大看细节': 'Expand the chart for detail',
    '换来源只换说法，不换数字': 'Switching sources changes wording, not numbers',
    '上下文会承接': 'Context carries over',
    '每个答案都有评审': 'Every answer is reviewed',
    '不会答就说不会': 'It says so when it cannot answer',
    '快捷键': 'Keyboard shortcuts',

    /* 教程标题 */
    '① 五分钟做一份今晚观测计划': '1 · A five-minute plan for tonight',
    '② 接入一个云端模型': '2 · Connect a cloud model',
    '③ 用自定义智能体讲给孩子听': '3 · A custom agent for kids',
    '切到「今晚优先」，看第一名目标的高度与峰值时刻。':
      'Switch to tonight-first and read the top target altitude and peak time.',
    '左侧点「新建智能体」，点「儿童科普」快速模板。':
      'Pick New agent on the left, then the kids-science template.',
    '在专家注记里写明你要的表达方式，保存。':
      'Describe the tone you want in the expert notes, then save.',
    '之后每个答案末尾都会附上这个角色的补充。':
      'Every later answer ends with a note from that role.',

    /* ---------- 关于 ---------- */
    '星历与知识库都在本机运行，断网可用。每条结论的来源与核验日期，会在答案的「依据」中逐条标注。':
      'Ephemeris and knowledge base both run on this device and work offline. Each conclusion carries its source and verification date in the evidence section.',
    '数据存在哪、怎么导出与删除，以及哪些操作会让内容离开本机。':
      'Where data lives, how to export or delete it, and which actions send content off this device.',
    '查看说明': 'Read the note',
    '不展示条目数量。条目多少不等于覆盖能力，判断依据是每条结论的来源、共识等级与核验日期。这些信息在答案的「依据」章节逐条标注。知识库未收录的问题，会转由联网检索取证，或明确告知无法确证。':
      'Entry counts are not shown: quantity is not coverage. What matters is each conclusion source, consensus level and verification date, all listed under Evidence. Questions outside the knowledge base go to web retrieval, or are explicitly marked as unconfirmed.',
    '所有结论都附带依据与共识等级；未证实的部分会明确标注，不代替专业观测与研究结论。':
      'Every conclusion comes with evidence and a consensus level. Unverified parts are marked, and this never substitutes for professional observation or research.'
  };
})(typeof window !== 'undefined' ? window : this);
