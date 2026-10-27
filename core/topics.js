/* ASTRUM · 首屏四个入口的详情页内容与渲染
 *
 * 为什么单独成模块：详情内容需要中英双语，且必须能被「按 id 加载」。
 * 路由形如 #/topic/observing —— hash 即标识，刷新、分享、后退都能回到同一页。
 *
 * 内容边界：这里只描述产品**已经能做的事**，不写能力承诺。
 * 与知识库条目一样，宁可少说，不编。
 */
(function (root) {
  'use strict';

  var TOPICS = [
    {
      id: 'observing',
      n: '01',
      zh: {
        title: '观测与星图',
        lede: '先把「今晚」定下来：几点、在哪、用什么，再决定看什么。',
        rows: [
          ['实时星历', '方位、高度、升落与中天都由本地计算，断网可用。'],
          ['今晚优先', '按高度、亮度与月光干扰打分，列出当晚最值得看的目标。'],
          ['全屏星图', '可放大拖动，切到「全部标注」看恒星中西名与深空编号。'],
          ['器材联动', '肉眼 / 双筒 / 望远镜 / 摄影四种方式，主镜与相机随之启用。']
        ],
        action: { label: '打开观测台', act: 'obs' },
        ask: '今晚在上海能看到什么？'
      },
      en: {
        title: 'Observing and sky charts',
        lede: 'Pin down tonight first: when, where and with what, then decide what to look at.',
        rows: [
          ['Live ephemeris', 'Azimuth, altitude, rise, set and culmination are computed locally, offline.'],
          ['Tonight first', 'Scores altitude, brightness and moonlight to list the best targets tonight.'],
          ['Full-screen chart', 'Zoom and pan, then switch to all labels for star names and deep-sky numbers.'],
          ['Gear linking', 'Naked eye, binoculars, telescope or imaging; scope and camera follow.']
        ],
        action: { label: 'Open the observatory', act: 'obs' },
        ask: 'What can I see tonight in Shanghai?'
      }
    },
    {
      id: 'objects',
      n: '02',
      zh: {
        title: '天体知识',
        lede: '距离、性质、演化，每条结论都带来源与核验日期。',
        rows: [
          ['覆盖范围', '深空天体、恒星、太阳系天体的基本参数与观测要点。'],
          ['来源可核', '每条结论标注出处与核验日期，答案的「依据」章节可逐条对照。'],
          ['明确不覆盖', '不做天气预报、器材品牌推荐与占星内容。'],
          ['未收录怎么办', '转由联网检索取证，或明确告知无法确证，不编答案。']
        ],
        action: { label: '提一个问题', act: 'ask', q: '猎户座大星云是什么？' },
        ask: '猎户座大星云是什么？'
      },
      en: {
        title: 'Object knowledge',
        lede: 'Distance, nature and evolution, each conclusion with a source and a verification date.',
        rows: [
          ['Coverage', 'Parameters and observing notes for deep-sky objects, stars and solar system bodies.'],
          ['Traceable', 'Every conclusion carries a source and date; the evidence section lists them.'],
          ['Out of scope', 'No weather forecasts, gear brand picks or astrology.'],
          ['Not covered', 'It goes to web retrieval, or says it cannot confirm rather than inventing an answer.']
        ],
        action: { label: 'Ask a question', act: 'ask', q: 'What is the Orion Nebula?' },
        ask: 'What is the Orion Nebula?'
      }
    },
    {
      id: 'cosmology',
      n: '03',
      zh: {
        title: '宇宙学与前沿',
        lede: '大尺度问题最容易把「猜测」说成「结论」，所以这里分级标注。',
        rows: [
          ['已成共识', '有观测交叉验证、学界普遍接受的部分。'],
          ['前沿研究', '正在争论的方向，会标出各方证据与分歧点。'],
          ['未定论', '明确说「目前不知道」，并列出需要什么观测才能回答。'],
          ['数值口径', '哈勃常数、暗能量参数等会标注所采用的测量方法与年份。']
        ],
        action: { label: '试一个前沿问题', act: 'ask', q: '暗能量到底是什么？' },
        ask: '暗能量到底是什么？'
      },
      en: {
        title: 'Cosmology and frontier',
        lede: 'Large-scale questions invite guessing, so every claim here is graded.',
        rows: [
          ['Settled', 'Cross-checked by observation and broadly accepted.'],
          ['Frontier', 'Actively debated; evidence and points of disagreement are shown.'],
          ['Open', 'Says plainly that it is unknown, and what observation would settle it.'],
          ['Numbers', 'Hubble constant and dark-energy parameters carry the method and year used.']
        ],
        action: { label: 'Try a frontier question', act: 'ask', q: 'What is dark energy?' },
        ask: 'What is dark energy?'
      }
    },
    {
      id: 'agents',
      n: '04',
      zh: {
        title: '自建智能体',
        lede: '给一个角色、几项参数与一段专家注记，它会只在你指定的话题上开口。',
        rows: [
          ['角色', '名字、符号与一句话职责，决定它在答案里的身份。'],
          ['参数', '深度、知识范围、证据门槛等可逐项调整。'],
          ['专家注记', '写清你要的表达方式，保存后每条答案末尾都会附上它的补充。'],
          ['参与范围', '可指定只参与某类问题，其余问题保持沉默。']
        ],
        action: { label: '打开智能体列表', act: 'agents' },
        ask: '用科普的方式讲讲黑洞'
      },
      en: {
        title: 'Custom agents',
        lede: 'A role, a few parameters and a note. It speaks only on the topics you assign.',
        rows: [
          ['Role', 'A name, a sigil and one line of duty define its voice in the answer.'],
          ['Parameters', 'Depth, knowledge scope and evidence threshold are adjustable.'],
          ['Expert note', 'Describe the tone you want; every later answer ends with its note.'],
          ['Scope', 'Restrict it to certain question types; it stays quiet elsewhere.']
        ],
        action: { label: 'Open the agent list', act: 'agents' },
        ask: 'Explain black holes in plain language'
      }
    }
  ];

  function lang() {
    return (root.I18N && root.I18N.current() === 'en') ? 'en' : 'zh';
  }

  function get(id) {
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].id === id) return TOPICS[i];
    }
    return null;
  }

  function copy(t) { return t[lang()] || t.zh; }

  root.Topics = { LIST: TOPICS, get: get, copy: copy, lang: lang };
})(typeof window !== 'undefined' ? window : this);
