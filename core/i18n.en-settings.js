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
    '自适应布局': 'Adaptive layout',
    '初始化固定；运行中按输入行数、对话数量与窗口宽度调密度，条件消失即回退':
      'Fixed at startup; during use it adjusts density by input lines, chat count and window width, and reverts when the condition clears',
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
    '入口详情': 'Overview',
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
      'Every conclusion comes with evidence and a consensus level. Unverified parts are marked, and this never substitutes for professional observation or research.',

    /* ---------- 外观（主题） ---------- */
    '外观': 'Appearance',
    '主题': 'Theme',
    '浅色': 'Light',
    '深色': 'Dark',
    '跟随系统': 'System',
    '深色适合夜间观测与暗环境；选「跟随系统」会随操作系统的外观自动切换，无需刷新。':
      'Dark suits night observing and low-light rooms. “System” follows your OS appearance and switches without a reload.',

    /* ---------- 数据与档案 / 来源 / 技能记录 ---------- */
    '全部设置': 'All settings',
    '返回设置分类': 'Back to settings categories',
    '数据与核验': 'Data and verification',
    '核验日期': 'Verified on',
    '数值来自论文或机构发布，未采用二手转述':
      'Numbers come from papers or institutional releases, never second-hand summaries',
    '宇宙学参数': 'Cosmological parameters',
    '暗能量演化约束': 'Dark energy constraints',
    'M87* 阴影与质量': 'M87* shadow and mass',
    '人马座 A* 质量': 'Sagittarius A* mass',
    '流星雨与日月食年度表': 'Annual meteor shower and eclipse tables',
    '系外行星 6,354 颗': '6,354 known exoplanets',
    '全球 779 个地点坐标与时区': 'Coordinates and time zones for 779 places worldwide',

    '本机已保存 {0} 轮 · 存储：{1}': 'Saved on this device: {0} turns · storage: {1}',
    'localStorage（降级）': 'localStorage (fallback)',
    '不可用': 'Unavailable',

    '云端模型 · 统一配置': 'Cloud models · shared settings',
    '不可复算星历': 'Ephemeris not reproducible',
    '密钥创建入口：': 'Get a key:',
    '待测试': 'Not tested yet',
    '把 sk- 开头的密钥粘贴到下方输入框': 'Paste your sk- key into the field below',
    '点「测试连接」，显示已连通后再「设为默认」':
      'Click “Test connection”, then “Set as default” once it shows connected',

    '技能记录': 'Reusable patterns',
    '{0} 条': '{0} items',

    /* ---------- 智能体名册里的属性名 ---------- */
    '可调参数：{0}': 'Tunable: {0}',    '专业领域': 'Domain',
    '器材倾向': 'Gear bias',
    '回答深度': 'Answer depth',
    '知识范围': 'Knowledge scope',
    '证据门槛': 'Evidence bar',
    '专业侧重': 'Specialism',
    '推断尺度': 'Inference range',
    '星图风格': 'Chart style',
    '语气风格': 'Tone',

    /* ---------- 问题反馈 ---------- */
    '问题反馈': 'Send feedback',
    '把问题与脱敏诊断信息发给 ASTRUM 维护团队': 'Send an issue and redacted diagnostics to the ASTRUM team',
    '如果你在使用 ASTRUM 时遇到错误、数据异常、研究结果不准确，或者有功能改进建议，可以在这里向开发团队反馈。':
      'If you hit an error, a data anomaly, an inaccurate research result, or have an improvement idea, report it to the development team here.',
    '反馈渠道': 'Feedback channel',
    '当前为开源项目，暂以邮件接收反馈。内容由你确认后才会打开邮件客户端，ASTRUM 不会自动发送。':
      'This open-source project currently receives feedback by email. Your mail client opens only after you confirm; ASTRUM never sends automatically.',
    '打开问题反馈': 'Open feedback form',
    '反馈不会自动上传任何内容；只有你点「生成反馈邮件」并确认后，才会生成邮件草稿。':
      'Nothing is uploaded automatically. A mail draft is created only after you click “Generate feedback email” and confirm.',
    '反馈问题': 'Report issue',
    '本次任务可能遇到了异常': 'This task may have hit an anomaly',
    '本次研究任务可能遇到了异常，是否将问题反馈给 ASTRUM 开发团队？我们可以帮你整理相关错误信息，减少手动描述。':
      'This research task may have hit an anomaly. Send it to the ASTRUM team? We can assemble the relevant error details so you do not have to describe them manually.',
    '检测到': 'Detected',
    '暂时忽略': 'Ignore for now',
    '已忽略本次提示，不会再次打断你。': 'Ignored. This prompt will not interrupt you again.',
    '本次反馈关联的上下文': 'Context linked to this feedback',
    '当前问题': 'Current question',
    '回答摘录': 'Answer excerpt',
    '消息 ID': 'Message ID',
    '任务 ID': 'Task ID',
    '相关 Agent': 'Related agents',
    '相关工具': 'Related tools',
    '相关来源': 'Related sources',
    '只收集当前问题与回答的最小上下文，不附加历史对话。':
      'Only the current question and answer are collected; no chat history is attached.',
    '将附加以下脱敏信息': 'The following redacted details will be attached',
    '任务 ID、错误代码、执行步骤、版本、浏览器与操作系统；已过滤密钥、Token、Cookie、Session 与本地路径。':
      'Task ID, error code, execution steps, version, browser and OS. Keys, tokens, cookies, sessions and local paths are filtered out.',
    '查看将要发送的完整内容': 'View exactly what will be sent',
    '确认反馈内容': 'Confirm feedback',
    '反馈编号': 'Feedback ID',
    '反馈类型': 'Feedback type',
    '收件人': 'Recipient',
    '诊断信息': 'Diagnostics',
    '已附加（脱敏）': 'Attached (redacted)',
    '未附加': 'Not attached',
    '邮件主题': 'Email subject',
    '邮件正文': 'Email body',
    '反馈邮件已准备好，请在邮件客户端中检查内容并主动发送。ASTRUM 不会在未经确认的情况下自动发送邮件。':
      'The feedback email is ready. Check it in your mail client and send it yourself. ASTRUM never sends mail without your confirmation.',
    '诊断报告不会自动成为附件。请先下载，再在邮件客户端中手动添加：':
      'The diagnostic report is not attached automatically. Download it first, then add it manually in your mail client:',
    '邮件内容较长（约 {0} 字符），可能超过部分邮件客户端或浏览器的 URL 限制。请使用「复制反馈内容」或「下载诊断报告」后在邮件客户端中新建邮件。':
      'This email is long (about {0} characters) and may exceed some mail clients’ or browsers’ URL limit. Use “Copy feedback” or “Download diagnostics”, then compose the email in your mail client.',
    '确认并打开邮件客户端': 'Confirm and open mail client',
    '已尝试打开邮件客户端。请检查内容并主动发送；ASTRUM 不会自动发送，也不会把打开客户端当作发送成功。':
      'Tried to open your mail client. Check the content and send it yourself; ASTRUM neither sends automatically nor treats opening the client as success.',
    '再次打开邮件客户端': 'Open mail client again',
    '内容过长，未打开邮件客户端。请复制反馈内容或下载诊断报告后手动发送。':
      'Content is too long, so the mail client was not opened. Copy the feedback or download diagnostics and send it manually.',
    '未能打开邮件客户端。请复制反馈内容或下载诊断报告后，在任意邮件客户端中手动发送。':
      'Could not open a mail client. Copy the feedback or download diagnostics, then send it from any mail app.',
    '复制反馈内容': 'Copy feedback',
    '下载诊断报告': 'Download diagnostics',
    '返回修改': 'Back to edit',
    '关闭': 'Close',
    '已恢复上次未提交的反馈草稿。': 'Restored your unsent feedback draft.',
    '请选择反馈类型': 'Choose a feedback type',
    '必填。选择最接近的一类即可。': 'Required. Pick the closest type.',
    '问题标题': 'Issue title',
    '必填。写清楚哪个天体、哪篇论文或哪一步出错。':
      'Required. Name the object, paper or step that went wrong.',
    '一句话概括问题': 'Summarize the issue in one line',
    '详细描述': 'Details',
    '必填。请勿粘贴 API Key、Token 或 Cookie。':
      'Required. Do not paste API keys, tokens or cookies.',
    '发生了什么？你期望看到什么？': 'What happened? What did you expect?',
    '复现步骤': 'Reproduction steps',
    '选填。能稳定复现的步骤最有帮助。': 'Optional. Reproducible steps are the most useful.',
    '预期结果': 'Expected result',
    '选填。': 'Optional.',
    '你期望得到的正确结果或行为': 'The correct result or behavior you expected',
    '实际结果': 'Actual result',
    '实际看到的结果或行为': 'The result or behavior you actually saw',
    '联系邮箱': 'Contact email',
    '选填。不填写也可以生成反馈邮件；填写后便于维护团队回信。':
      'Optional. Leave it blank and you can still generate the email; fill it in so the team can reply.',
    '附加脱敏诊断信息': 'Attach redacted diagnostics',
    '默认不附加。勾选后可在发送前查看完整内容。':
      'Off by default. When checked, you can review the full content before sending.',
    '生成反馈邮件': 'Generate feedback email',
    '取消': 'Cancel',
    '反馈内容尚未生成邮件，确定清除草稿吗？':
      'This feedback has not been turned into an email yet. Clear the draft?',
    '反馈草稿已保存在本机，可再次打开继续填写':
      'Draft saved on this device. Open the form again to continue.',
    '反馈模块未加载，无法生成反馈': 'The feedback module did not load, so feedback cannot be generated.',
    '反馈功能当前已关闭': 'Feedback is currently disabled.',
    '诊断信息尚未生成': 'Diagnostics have not been generated yet.',
    '诊断报告已下载（已脱敏）': 'Diagnostic report downloaded (redacted).',
    '下载失败，请尝试复制反馈内容': 'Download failed. Try copying the feedback instead.',
    '反馈内容校验失败': 'Feedback validation failed.',
    '反馈邮件已生成，请确认后再发送': 'Feedback email generated. Review and confirm before sending.',
    '反馈邮件生成失败：{0}': 'Could not generate the feedback email: {0}',
    '{0} 个失败步骤 / {1} 条事件': '{0} failed steps / {1} events',
    '论文 {0} · 证据 {1} · Claim {2} · 缺口 {3}': 'Papers {0} · evidence {1} · claims {2} · gaps {3}',
    '任务异常反馈': 'Task anomaly report',
    '请填写问题标题': 'Enter an issue title',
    '问题标题不能超过 80 字': 'Issue title must be 80 characters or fewer',
    '请填写详细描述': 'Enter a detailed description',
    '详细描述不能超过 2000 字': 'Details must be 2,000 characters or fewer',
    '复现步骤不能超过 1000 字': 'Reproduction steps must be 1,000 characters or fewer',
    '预期结果不能超过 800 字': 'Expected result must be 800 characters or fewer',
    '实际结果不能超过 800 字': 'Actual result must be 800 characters or fewer',
    '联系邮箱格式不正确': 'Contact email format is invalid',
    '系统内部错误': 'Internal system error',
    'Agent 执行错误': 'Agent execution error',
    '外部服务错误': 'External service error',
    '用户配置错误': 'User configuration error',
    '数据解析错误': 'Data parsing error',
    '研究质量问题': 'Research quality issue',
    'Bug / 功能异常': 'Bug / functional issue',
    '研究结果不准确': 'Inaccurate research result',
    '天体数据或参数错误': 'Object data or parameter error',
    '搜索或论文检索问题': 'Search or paper retrieval issue',
    'PDF 文献解析问题': 'PDF parsing issue',
    'Agent 执行问题': 'Agent execution issue',
    '界面与交互问题': 'UI or interaction issue',
    '功能建议': 'Feature suggestion',
    '其他问题': 'Other issue'
  };
})(typeof window !== 'undefined' ? window : this);
