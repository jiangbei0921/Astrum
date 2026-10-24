/* ASTRUM · 太阳系天体资料（用于星图球体与详情卡）
 * 数值来自 NASA Planetary Fact Sheet（2023 版）；卫星数为 2023 年已确认数量，
 * 木星、土星的卫星仍在持续发现，计数会变化，故在界面标注年份。
 *
 * observed 字段为「实测面貌」：只收录 NASA / ESA / JPL 等机构已公开发布的观测结论，
 * 标注来源任务与年份；未被任务直接成像或确认的内容一律不写。
 */
(function (root) {
  'use strict';

  var BODIES = {
    sun: {
      cn: '太阳', en: 'Sun', type: '恒星（G2V）', color: '#ffcf6b', glow: '#ffb347',
      diameter: '1,392,700 km', distance: '约 1 AU（1.496 亿 km）', period: '—',
      day: '约 25.4 天（赤道）', moons: '—', temp: '表面约 5,772 K',
      scale: 1.0, ring: false,
      intro: '太阳系的中心天体，占系统总质量的 99.86%。核心每秒把约 6 亿吨氢聚变为氦，光到达地球需要 8 分 20 秒。',
      observed: [
        ['光球米粒组织', 'SDO 观测显示光球由约 1000 km 尺度的对流米粒覆盖，寿命约 8–20 分钟'],
        ['黑子与活动周期', 'SDO/HMI 记录黑子数与磁通量，周期约 11 年，第 25 周期峰值在 2024–2025 年'],
        ['日冕与太阳风', 'Parker 太阳探测器 2021 年起多次穿越阿尔文面，2024 年距日约 610 万公里'],
        ['色球与日珥', 'Solar Orbiter 拍摄极区高分辨率色球像（2023）']
      ],
      missions: ['SDO（2010–）', 'Solar Orbiter（2020–）', 'Parker Solar Probe（2018–）'],
      sources: [{ n: 'NASA SDO', u: 'https://sdo.gsfc.nasa.gov/' }, { n: 'NASA Parker', u: 'https://science.nasa.gov/mission/parker-solar-probe/' }],
      updated: '2025-06'
    },
    moon: {
      cn: '月球', en: 'Moon', type: '天然卫星', color: '#e8e3d6', glow: '#cfc9bb',
      diameter: '3,474 km', distance: '平均 384,400 km', period: '27.32 天（恒星月）',
      day: '27.32 天（潮汐锁定）', moons: '—', temp: '−173 ~ 127 ℃',
      scale: 1.0, ring: false,
      intro: '地球唯一的天然卫星，自转与公转同步，因此始终以同一面朝向地球。它稳定了地轴倾角，也是潮汐的主要来源。',
      observed: [
        ['正面与背面差异', 'LRO 地形图显示背面地壳更厚、大型月海更少'],
        ['南极艾特肯盆地', 'LRO/Grail 确认直径约 2500 km、深约 13 km，是太阳系最大撞击盆地之一'],
        ['挥发分', 'LCROSS（2009）在凯布斯坑探测到水冰信号；Chandrayaan-1 谱仪证实极区水冰'],
        ['月震', '阿波罗地震仪记录深源月震，Chandrayaan-3（2023）测得近地月震活动']
      ],
      missions: ['LRO（2009–）', 'LCROSS（2009）', '嫦娥四号（2019）', '嫦娥六号（2024）', 'Chandrayaan-3（2023）'],
      sources: [{ n: 'NASA LRO', u: 'https://science.nasa.gov/mission/lro/' }, { n: 'NASA Moon', u: 'https://science.nasa.gov/moon/' }],
      updated: '2025-06'
    },
    mercury: {
      cn: '水星', en: 'Mercury', type: '类地行星', color: '#b7b1a8', glow: '#8d867c',
      diameter: '4,879 km', distance: '距日 0.39 AU', period: '88 天',
      day: '58.6 天', moons: '0', temp: '−173 ~ 427 ℃',
      scale: 0.30, ring: false,
      intro: '最靠近太阳的行星，没有真正的大气层，昼夜温差是太阳系行星中最大的。表面布满环形山，外观类似月球。',
      observed: [
        ['卡洛里盆地', 'MESSENGER 确认直径约 1550 km 的撞击盆地，内部有同心山环'],
        ['挥发分富集', 'MESSENGER 谱仪显示地表硫、钾、氯含量远高于月球，挑战「完全挥发损失」假说'],
        ['收缩证据', '全球逆冲断层弧长统计支持水星半径自形成以来收缩约 7 km'],
        ['磁场', 'MESSENGER 磁强计测得全球偶极磁场，强度约地球的 1%']
      ],
      missions: ['Mariner 10（1974）', 'MESSENGER（2011–2015）', 'BepiColombo（2026 抵达）'],
      sources: [{ n: 'NASA MESSENGER', u: 'https://science.nasa.gov/mission/messenger/' }],
      updated: '2025-06'
    },
    venus: {
      cn: '金星', en: 'Venus', type: '类地行星', color: '#eadfb4', glow: '#c9b887',
      diameter: '12,104 km', distance: '距日 0.72 AU', period: '225 天',
      day: '243 天（逆行自转）', moons: '0', temp: '约 464 ℃',
      scale: 0.52, ring: false,
      intro: '大小与地球接近，却被浓密的二氧化碳大气与硫酸云包裹，温室效应使地表比水星更热。它是夜空中最亮的行星。',
      observed: [
        ['大气超旋', '金星快车与 Akatsuki 测得云顶风速约 100 m/s，4 天绕行一周'],
        ['极区双气旋', 'Akatsuki 红外相机拍到南北极各存在一对稳定气旋（2016）'],
        ['地表雷达', '麦哲伦号（1990）雷达测高与成像覆盖 98% 地表，识别出伊师塔地、阿佛洛狄忒地'],
        ['磷化氢争议', '2020 年报告 267 GHz 磷化氢信号，后续多项观测未确认，仍属未定论']
      ],
      missions: ['麦哲伦号（1989–1994）', '金星快车（2006–2014）', 'Akatsuki（2015–2024）'],
      sources: [{ n: 'NASA Venus', u: 'https://science.nasa.gov/venus/' }, { n: 'ESA Venus Express', u: 'https://www.esa.int/Science_Exploration/Space_Science/Venus_Express' }],
      updated: '2025-06',
      caution: '磷化氢存在与否尚未有共识结论，界面按「未定论」标注。'
    },
    mars: {
      cn: '火星', en: 'Mars', type: '类地行星', color: '#c9704f', glow: '#9c4f33',
      diameter: '6,779 km', distance: '距日 1.52 AU', period: '687 天',
      day: '24.6 小时', moons: '2（火卫一、火卫二）', temp: '平均 −63 ℃',
      scale: 0.38, ring: false,
      intro: '表面氧化铁使其呈红色。拥有太阳系最高的火山奥林帕斯山与最大的峡谷水手谷，极冠由水冰与干冰组成。',
      observed: [
        ['奥林帕斯山', 'MRO/MOLA 测得高约 22 km、宽约 600 km，为太阳系已知最高火山'],
        ['水手谷', '长约 4000 km、最深约 7 km，横跨近四分之一火星周长'],
        ['古湖与三角洲', '好奇号与毅力号分别在盖尔坑、杰泽罗坑确认古湖相沉积与三角洲'],
        ['甲烷波动', '好奇号测得甲烷季节性起伏，TGO（2018–）未确认同等水平，来源仍不明'],
        ['极冠', 'HiRISE 拍摄极冠螺旋沟槽与季节性 CO₂ 霜变化']
      ],
      missions: ['MRO（2006–）', '好奇号（2012–）', 'MAVEN（2014–）', '毅力号（2021–）', 'TGO（2016–）'],
      sources: [{ n: 'NASA Mars', u: 'https://science.nasa.gov/mars/' }, { n: 'NASA Perseverance', u: 'https://science.nasa.gov/mission/mars-2020-perseverance/' }],
      updated: '2025-06'
    },
    jupiter: {
      cn: '木星', en: 'Jupiter', type: '气态巨行星', color: '#d9bd93', glow: '#b08f63',
      diameter: '139,820 km', distance: '距日 5.20 AU', period: '11.86 年',
      day: '9.93 小时', moons: '95（2023 年已确认）', temp: '云顶约 −108 ℃',
      scale: 0.72, ring: false, bands: true,
      intro: '太阳系最大的行星，质量是其余行星总和的 2.5 倍。大红斑是一个持续数百年的反气旋风暴，直径可容纳地球。',
      observed: [
        ['大红斑缩小', '哈勃（1990s 至 2020s）测得直径从约 40,000 km 缩至约 16,000 km，形态持续变化'],
        ['深层大气', '朱诺号重力探测（2017）测得条带结构延伸至约 3000 km 深'],
        ['极区气旋', '朱诺号成像到每极各 8 个多边形排列的巨型气旋（2019–2021）'],
        ['环系', '旅行者 1 号（1979）发现暗淡环系，由微流星撞击卫星产生'],
        ['磁场', '朱诺号测得磁场强度约地球的 2 万倍，且存在不对称斑块']
      ],
      missions: ['旅行者 1/2 号（1979）', '伽利略号（1995–2003）', '朱诺号（2016–）', 'JUICE（2031 抵达）'],
      sources: [{ n: 'NASA Juno', u: 'https://science.nasa.gov/mission/juno/' }, { n: 'NASA Jupiter', u: 'https://science.nasa.gov/jupiter/' }],
      updated: '2025-06'
    },
    saturn: {
      cn: '土星', en: 'Saturn', type: '气态巨行星', color: '#e3d0a4', glow: '#bda678',
      diameter: '116,460 km', distance: '距日 9.58 AU', period: '29.45 年',
      day: '10.7 小时', moons: '146（2023 年已确认）', temp: '云顶约 −139 ℃',
      scale: 0.62, ring: true,
      intro: '以壮观的环系闻名，环主要由水冰颗粒组成，厚度仅数十米到数百米。平均密度小于水，是唯一「能浮在水上」的行星。',
      observed: [
        ['北极六边形', '卡西尼号（2006–2017）拍摄北极稳定六边形急流，直径约 30,000 km'],
        ['卡西尼缝', '环结构中宽约 4800 km 的缝隙，由土卫一引力共振维持'],
        ['环的年龄', '卡西尼终场任务（2017）质量测量显示主环可能只有约 1000 万–1 亿年'],
        ['土卫二喷泉', '卡西尼号（2005）发现南极水冰羽流，含有机物与氢气，支持海底热液环境'],
        ['土卫六湖泊', '卡西尼雷达（2007）拍到北极液态甲烷/乙烷湖泊']
      ],
      missions: ['先驱者 11 号（1979）', '旅行者 1/2 号（1980–1981）', '卡西尼-惠更斯（2004–2017）', 'Dragonfly（2034 抵达）'],
      sources: [{ n: 'NASA Cassini', u: 'https://science.nasa.gov/mission/cassini/' }, { n: 'NASA Saturn', u: 'https://science.nasa.gov/saturn/' }],
      updated: '2025-06'
    },
    uranus: {
      cn: '天王星', en: 'Uranus', type: '冰巨行星', color: '#a9dde2', glow: '#7fb8c0',
      diameter: '50,724 km', distance: '距日 19.2 AU', period: '84 年',
      day: '17.2 小时', moons: '28', temp: '约 −197 ℃',
      scale: 0.44, ring: false,
      intro: '自转轴倾斜约 98°，几乎「躺着」绕太阳公转，因此两极各有长达 42 年的极昼与极夜。甲烷吸收红光使其呈青蓝色。',
      observed: [
        ['轴倾角 97.8°', '旅行者 2 号（1986）测得自转轴几乎躺在轨道平面上，成因仍不确定'],
        ['环系', '13 条暗环（1977 地掩星发现，1986 旅行者确认），含 ε 环最亮'],
        ['季节性大气变化', '凯克望远镜（2007）与哈勃观测到北半球亮度随季节变化，2033 年至分点'],
        ['内部结构', '重力场数据显示可能存在分层的水/氨/甲烷冰地幔']
      ],
      missions: ['旅行者 2 号（1986）', '凯克与哈勃长期监测', 'UOP（概念研究）'],
      sources: [{ n: 'NASA Uranus', u: 'https://science.nasa.gov/uranus/' }],
      updated: '2025-06'
    },
    neptune: {
      cn: '海王星', en: 'Neptune', type: '冰巨行星', color: '#6f8fe0', glow: '#4a66b0',
      diameter: '49,244 km', distance: '距日 30.1 AU', period: '164.8 年',
      day: '16.1 小时', moons: '16', temp: '约 −201 ℃',
      scale: 0.44, ring: false,
      intro: '距太阳最远的行星，风速可超过 2,000 km/h，是太阳系风最猛烈的世界。它是先由数学预测、后被观测证实的行星。',
      observed: [
        ['大暗斑', '旅行者 2 号（1989）拍摄到大暗斑；哈勃（1994）已消失，显示气旋在变化'],
        ['最高速风', '旅行者 2 号测得赤道风速约 2100 km/h，为太阳系已知最快'],
        ['内部热源', '辐射能量约为接收太阳能量的 2.6 倍，来源仍不完全清楚'],
        ['海卫一', '旅行者 2 号拍到氮冰火山喷发；轨道逆行，疑为捕获的柯伊伯带天体']
      ],
      missions: ['旅行者 2 号（1989）', '哈勃/凯克长期监测', 'Neptune Odyssey（概念）'],
      sources: [{ n: 'NASA Neptune', u: 'https://science.nasa.gov/neptune/' }],
      updated: '2025-06'
    }
  };

  root.BODY_INFO = BODIES;
})(typeof window !== 'undefined' ? window : globalThis);
