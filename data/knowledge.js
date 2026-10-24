/* ASTRUM · 天文知识库（离线快照）
 * 每条记录包含：结构化事实 / 观测要点 / 专业表述 / 科普表述 / 来源 / 时效等级 / 置信度
 * freshness: static(百年尺度不变) | annual(年度事件表) | ephemeris(需实时星历) | realtime(需在线更新)
 */
(function (root) {
  'use strict';

  var E = [
    /* ---------------- 深空天体 ---------------- */
    {
      id: 'm42', type: 'object', cn: '猎户座大星云', en: 'Orion Nebula', m: 'M42',
      aliases: ['m42', '猎户座大星云', '猎户星云', 'orion nebula', 'ngc1976'],
      tag: '深空', visual: 'm42',
      summary: '距离地球最近的巨型恒星形成区之一，位于猎户座「佩剑」中部，肉眼可见为朦胧光斑。',
      facts: [
        ['距离', '约 1344 光年'],
        ['直径', '约 24 光年'],
        ['类型', 'H II 区 / 发射星云'],
        ['视星等', '4.0（肉眼可见）'],
        ['恒星形成', '内含 trapezium 四合星，照亮整个星云']
      ],
      observe: [
        '用双筒望远镜即可看到核心与外围气体的层次；小口径望远镜可辨 Trapezium 四合星',
        '无月夜、远离城市灯光时，肉眼可见为模糊光斑，望远镜下呈现青绿色',
        'UHC 或 OIII 滤镜可提升对比度，但会压暗整体亮度'
      ],
      pro: 'M42 是距离太阳系约 400 pc 的巨分子云复合体中的 H II 区，电离源为 θ¹ Orionis 聚星；其视向速度与猎户 OB1 协会一致，属于同一恒星形成事件。',
      pop: '在猎户座腰带下方挂着的那串「小星星」中间，有一团正在孕育新恒星的气体云——它就是 M42。用双筒望远镜看，像一团被月光照亮的薄雾。',
      sources: [{ n: 'NASA/IPAC Extragalactic Database', u: 'https://ned.ipac.caltech.edu/' }, { n: 'Messier 星表（SEDS）', u: 'https://messier.seds.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm31', type: 'object', cn: '仙女座星系', en: 'Andromeda Galaxy', m: 'M31',
      aliases: ['m31', '仙女座星系', '仙女星系', 'andromeda', 'ngc224'],
      tag: '深空', visual: 'm31',
      summary: '距离约 254 万光年的旋涡星系，是本星系群中质量最大的成员，也是肉眼可见的最远天体之一。',
      facts: [
        ['距离', '约 254 万光年（约 780 kpc）'],
        ['直径', '约 22 万光年'],
        ['类型', 'SA(s)b 旋涡星系'],
        ['视星等', '3.4（暗夜下肉眼可见）'],
        ['运动', '以约 110 km/s 向银河系接近']
      ],
      observe: [
        '必须避开光污染：城市中几乎不可见，郊区需用双筒扫视仙女座 μ 星附近',
        '肉眼所见只是明亮的核球，旋臂需要长焦或摄影才能显现',
        '最佳季节为秋季前半夜，高度较高'
      ],
      pro: 'M31 的造父变星测距（Hubble, 1923）确立了河外星系的存在；其与银河系预计在约 4.5 Gyr 后开始并合，形成巨椭圆星系。',
      pop: '你抬头能看到的最远的东西，可能就是它：250 万年前发出的光，今晚才落到你的眼睛里。它比我们银河系还大，正慢慢朝我们飘过来。',
      sources: [{ n: 'NASA/IPAC NED', u: 'https://ned.ipac.caltech.edu/' }, { n: 'IAU 星系命名规范', u: 'https://www.iau.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm45', type: 'object', cn: '昴星团', en: 'Pleiades', m: 'M45',
      aliases: ['m45', '昴星团', '昴宿星团', '七姐妹', 'pleiades'],
      tag: '深空', visual: 'm45',
      summary: '金牛座内的年轻疏散星团，肉眼可见 6–7 颗蓝白色恒星，是辨识冬季星空的最佳路标之一。',
      facts: [
        ['距离', '约 444 光年'],
        ['年龄', '约 1 亿年'],
        ['成员', '以 B 型主序星为主，含大量褐矮星'],
        ['视星等', '1.6'],
        ['视直径', '约 110 角分（约 3.6 个满月）']
      ],
      observe: [
        '肉眼即可分辨核心 6–7 颗；双筒望远镜下可见数十颗并带淡蓝色星云状包裹',
        '低倍率、大视场是观赏关键，高倍会超出视野',
        '冬季每晚可见，是测试肉眼极限星等的常用目标'
      ],
      pro: 'M45 与毕星团同属金牛座 OB2 协会方向，其成员星的锂丰度与自转分布是星团年龄标定的重要样本。',
      pop: '中国古代把它叫「昴宿」，日本叫「昴（Subaru）」。试试你能数出几颗——视力好的人能数到七颗以上，所以它也叫「七姐妹」。',
      sources: [{ n: 'SIMBAD 天文数据库', u: 'http://simbad.u-strasbg.fr/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm13', type: 'object', cn: '武仙座球状星团', en: 'Hercules Cluster', m: 'M13',
      aliases: ['m13', '武仙座球状星团', 'hercules cluster'],
      tag: '深空', visual: 'm13',
      summary: '北天最亮的球状星团，约含数十万颗恒星，是小口径望远镜下的经典目标。',
      facts: [
        ['距离', '约 2.22 万光年'],
        ['年龄', '约 116 亿年'],
        ['视星等', '5.8'],
        ['视直径', '约 20 角分'],
        ['恒星数', '约 30 万颗量级']
      ],
      observe: [
        '城市中需 80mm 以上口径；郊区双筒可见为模糊小球',
        '中倍率（100× 以上）才能分辨边缘单颗恒星',
        '最佳季节为春末夏初，位于武仙座「梯形」西侧'
      ],
      pro: 'M13 的赫罗图转折点与球状星团年龄–金属丰度关系使其成为银河系晕族星族的标定对象；1974 年 Arecibo 曾向其发送无线电讯息。',
      pop: '它是一个「恒星的蜂巢」：几十万颗太阳挤在一个球里。你看到的每个光点，都是一颗太阳。',
      sources: [{ n: 'SEDS Messier 数据库', u: 'https://messier.seds.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm57', type: 'object', cn: '环状星云', en: 'Ring Nebula', m: 'M57',
      aliases: ['m57', '环状星云', 'ring nebula'],
      tag: '深空', visual: 'm57',
      summary: '天琴座内的行星状星云，中心是一颗白矮星，外形如烟圈，是理解恒星死亡结局的直观样本。',
      facts: [
        ['距离', '约 2570 ± 90 光年（Gaia 视差）'],
        ['视星等', '8.8'],
        ['视直径', '约 1.4 角分'],
        ['类型', '行星状星云'],
        ['中心星', '白矮星，表面温度约 12 万 K']
      ],
      observe: [
        '小口径下像一个暗淡的「小甜甜圈」，需 100× 以上倍率',
        '城市光害下几乎不可见，需 OIII 滤镜辅助',
        '位于天琴座 β–γ 连线约 1/3 处'
      ],
      pro: 'M57 是经典的行星状星云，其环状结构源于 AGB 后星风与快速星风的相互作用；中心白矮星有效温度处于行星状星云核演化早期。',
      pop: '一颗和太阳差不多的恒星临终时，会把外层气体轻轻吹散，露出中间的白点——那就是它留下的核心。M57 就是这样一个「烟圈」。',
      sources: [{ n: 'Hubble Messier 目录', u: 'https://www.nasa.gov/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm51', type: 'object', cn: '涡状星系', en: 'Whirlpool Galaxy', m: 'M51',
      aliases: ['m51', '涡状星系', 'whirlpool'],
      tag: '深空', visual: 'm51',
      summary: '猎犬座内正面朝向的旋涡星系，正与伴星系 NGC 5195 相互作用，是业余摄影的经典目标。',
      facts: [
        ['距离', '约 2300 万光年'],
        ['视星等', '8.4'],
        ['类型', 'SA(s)bc 旋涡星系（ interacting ）'],
        ['发现', '1773 年 Messier 收录；1845 年 Rosse 首次辨认旋涡结构']
      ],
      observe: [
        '需 150mm 以上口径与暗夜；摄影远比目视效果好',
        '找到大熊座斗柄末端后向西南偏移约 3.5°',
        '与 NGC 5195 同框时可见「桥」的连接结构'
      ],
      pro: 'M51 是人类首个被确认具有旋涡结构的星系，其与 NGC 5195 的潮汐相互作用触发了旋臂中的恒星形成。',
      pop: '它是人类第一次「看清」旋涡形状的星系——1845 年，一位伯爵用自制的巨大望远镜画下了它。',
      sources: [{ n: 'NASA/IPAC NED', u: 'https://ned.ipac.caltech.edu/' }],
      confidence: 0.92, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm8', type: 'object', cn: '礁湖星云', en: 'Lagoon Nebula', m: 'M8',
      aliases: ['m8', '礁湖星云', 'lagoon nebula'],
      tag: '深空', visual: 'm8',
      summary: '人马座内明亮的发射星云，位于银河中心方向，是夏季银河观光路线的核心目标。',
      facts: [
        ['距离', '约 4100 光年'],
        ['视星等', '6.0'],
        ['视直径', '约 90 × 40 角分'],
        ['类型', '发射星云 + 疏散星团 NGC 6530']
      ],
      observe: [
        '暗夜下肉眼可见为银河中的亮斑；双筒即可看到形状',
        'UHC 滤镜显著提升对比度',
        '与 M20 三叶星云在同一低倍视场内'
      ],
      pro: 'M8 位于人马座 OB1 协会，其电离源为 Herschel 36 等 O 型星；星云内的暗礁（dark lane）是致密尘埃带。',
      pop: '夏天的银河最亮那一段里，有一片发着微光的「潟湖」。用双筒望远镜扫过去，能看到它和旁边的三叶星云一起浮在星海里。',
      sources: [{ n: 'SEDS', u: 'https://messier.seds.org/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'm104', type: 'object', cn: '草帽星系', en: 'Sombrero Galaxy', m: 'M104',
      aliases: ['m104', '草帽星系', 'sombrero'],
      tag: '深空', visual: 'm104',
      summary: '室女座方向的侧向旋涡星系，明显的尘埃带使其形似草帽，中心存在超大质量黑洞。',
      facts: [
        ['距离', '约 3100 万光年'],
        ['视星等', '8.0'],
        ['类型', 'SA(s)a 旋涡星系'],
        ['黑洞', '中心黑洞质量约 10 亿倍太阳质量量级']
      ],
      observe: [
        '中等口径下可见细长的「帽檐」与中央亮核',
        '需较高倍率与稳定视宁度',
        '春季前半夜位于室女座与乌鸦座之间'
      ],
      pro: 'M104 的核球异常明亮且尘埃带近乎侧向，其核区动力学测量是早期超大质量黑洞质量测定的重要样本。',
      pop: '一顶飘在宇宙里的墨西哥草帽：中间是鼓起的帽顶，周围是斜斜的帽檐。',
      sources: [{ n: 'NASA/IPAC NED', u: 'https://ned.ipac.caltech.edu/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'ngc5139', type: 'object', cn: '半人马ω星团', en: 'Omega Centauri', m: 'NGC 5139',
      aliases: ['ngc5139', '半人马ω', 'omega centauri', 'ω星团'],
      tag: '深空', visual: 'ngc5139',
      summary: '银河系最大最亮的球状星团，视星等 3.9，中国南方地区可见。',
      facts: [
        ['距离', '约 1.7 万光年'],
        ['视星等', '3.9'],
        ['质量', '约 400 万倍太阳质量'],
        ['恒星数', '约 1000 万颗量级']
      ],
      observe: [
        '北纬 40° 以南才容易观测，中国南方低空可见',
        '肉眼为模糊星点，双筒即可分辨外围恒星',
        '可能是被银河系吞并的矮星系残余'
      ],
      pro: 'ω Cen 的多星族现象与较大质量使其被广泛认为是一个被剥离的矮星系核，而非典型球状星团。',
      pop: '如果银河系是个城市，它就是城市边上最热闹的老社区——上千万颗恒星挤在一起。',
      sources: [{ n: 'SIMBAD', u: 'http://simbad.u-strasbg.fr/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11'
    },

    /* ---------------- 星座 ---------------- */
    {
      id: 'orion', type: 'constellation', cn: '猎户座', en: 'Orion', abbr: 'Ori',
      aliases: ['猎户座', '猎户', 'orion', '参宿', '冬季大三角'],
      tag: '星座', visual: 'orion',
      summary: '冬季星空的中心星座，腰带三星几乎人人可辨，是入门定位的最佳起点。',
      facts: [
        ['位置', '天赤道附近，全球可见'],
        ['主星', '参宿四（红超巨星）、参宿七（蓝超巨星）'],
        ['标志', '腰带三星（参宿一、二、三）与佩剑'],
        ['深空', 'M42 猎户座大星云、M78'],
        ['季节', '北半球冬季前半夜最显著'],
        ['参宿四距离', '约 550 光年，但不同方法给出 400–720 光年（未定论）']
      ],
      observe: [
        '先找三颗等距排列的腰带星，再向两侧延伸识别四肢',
        '佩剑中央的模糊光斑即 M42',
        '参宿四颜色偏橙红，与蓝白参宿七形成鲜明对比'
      ],
      pro: '猎户座主体属猎户 OB1 协会，参宿四为半规则变星（周期约 400 天叠加长期变暗事件），参宿七为 B8 Ia 型蓝超巨星。',
      pop: '冬天的夜空里最好认的星座。中间三颗排成一条直线的星星是它的腰带，腰带上挂着一把剑，剑中间那团模糊的光就是恒星诞生地。',
      sources: [{ n: 'IAU 星座表', u: 'https://www.iau.org/public/themes/constellations/' }],
      confidence: 0.96, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'uma', type: 'constellation', cn: '大熊座（北斗七星）', en: 'Ursa Major', abbr: 'UMa',
      aliases: ['大熊座', '北斗', '北斗七星', 'ursa major', 'big dipper', '指极星'],
      tag: '星座', visual: 'uma',
      summary: '北斗七星是北天最著名的星群，斗口两星连线指向北极星，是夜间辨向的基本工具。',
      facts: [
        ['位置', '北天，中国大部分地区全年可见'],
        ['主星', '天枢、天璇、天玑、天权、玉衡、开阳、摇光'],
        ['辨向', '天璇→天枢连线延长约 5 倍指向北极星'],
        ['特色', '开阳是著名的双星系统']
      ],
      observe: [
        '斗柄指向随季节变化：春指东、夏指南、秋指西、冬指北',
        '用「指极星」法在 1 分钟内找到北极星',
        '开阳旁有暗星 Alcor，是测试视力的传统目标'
      ],
      pro: '北斗七星属大熊座移动星群（Ursa Major Moving Group），其中五颗具有共同的自行与空间速度；天枢、天璇是指极星。',
      pop: '七颗星组成一把勺子。把勺口那两颗星连线延长五倍，就能找到北极星——这是人类用了几千年的「天然指南针」。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/public/themes/constellations/' }],
      confidence: 0.96, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'cas', type: 'constellation', cn: '仙后座', en: 'Cassiopeia', abbr: 'Cas',
      aliases: ['仙后座', 'cassiopeia', 'w形星座'],
      tag: '星座', visual: 'cas',
      summary: '由五颗亮星组成 W（或 M）形的拱极星座，秋季夜间可用于寻找北极星。',
      facts: [
        ['位置', '北天拱极星座'],
        ['主星', '王良四、王良一、策、阁道三、阁道二'],
        ['用途', '与北斗分居北极星两侧，可互补辨向'],
        ['深空', '双星团、心脏星云方向']
      ],
      observe: [
        'W 形开口朝向北极星方向，可作辅助定位',
        '秋季北斗低垂时，仙后座是更好的指北参照',
        '双筒可见大量疏散星团'
      ],
      pro: '仙后座位于银河系盘面方向，星场密集；其 ε 星为蓝白巨星，是北天重要的分光双星观测目标。',
      pop: '一个横躺在天上的「W」，是仙后座的王冠。秋天北斗七星贴在地平线上不好找时，就看它。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.94, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'cygnus', type: 'constellation', cn: '天鹅座', en: 'Cygnus', abbr: 'Cyg',
      aliases: ['天鹅座', 'cygnus', '夏季大三角', '天津四'],
      tag: '星座', visual: 'cygnus',
      summary: '沿银河展开的十字形星座，天津四与织女一、河鼓二构成夏季大三角。',
      facts: [
        ['位置', '北天银河带内'],
        ['主星', '天津四（α，约 2600 光年，极高光度）'],
        ['标志', '夏季大三角顶点之一'],
        ['特殊天体', '天鹅座 X-1（首个被广泛承认的恒星级黑洞候选）']
      ],
      observe: [
        '夏季夜晚头顶附近，十字架沿银河伸直',
        '天津四是夏季大三角中最靠北的顶点',
        '银河在此处极为密集，适合低倍扫描'
      ],
      pro: '天津四为 A2 Ia 型超巨星，绝对星等约 −8.4；天鹅座 X-1 为高质量 X 射线双星，其致密星为黑洞。',
      pop: '一只张开翅膀的天鹅，正沿着银河飞。它的尾巴就是天津四——夏天晚上抬头最亮的那几颗之一。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.94, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'crux', type: 'constellation', cn: '南十字座', en: 'Crux', abbr: 'Cru',
      aliases: ['南十字', '南十字座', 'crux', 'southern cross'],
      tag: '星座', visual: 'cru',
      summary: '全天最小的星座，长轴延长约 4.5 倍可指向南天极，是南半球辨向的关键。',
      facts: [
        ['位置', '南天，约赤纬 −60°'],
        ['面积', '全天 88 星座中最小'],
        ['主星', '十字架二、十字架一、十字架三、δ Cru'],
        ['可见性', '中国北纬 25° 以南地区可在低空看到']
      ],
      observe: [
        '长轴（十字架二→十字架一）延长约 4.5 倍找南天极',
        '南十字旁有「煤袋星云」，肉眼可见的暗区',
        '中国华南地区春末夏初低空可见，需开阔南方地平线'
      ],
      pro: 'Crux 由原半人马座划分而来，是 88 星座中面积最小者；其 ε 星（十字架三）为著名的双星与色彩对比目标。',
      pop: '南半球的「北斗七星」。澳大利亚、新西兰的国旗上都有它。如果你在中国南方，春天夜里往正南低空看，也许能看到。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'pegasus', type: 'constellation', cn: '飞马座', en: 'Pegasus', abbr: 'Peg',
      aliases: ['飞马座', 'pegasus', '秋季四边形'],
      tag: '星座', visual: 'peg',
      summary: '秋季星空的标志——由四颗亮星组成的「秋季四边形」，是秋季定位的起点。',
      facts: [
        ['位置', '北天秋季星座'],
        ['主星', '室宿一、室宿二、壁宿一、壁宿二'],
        ['标志', '秋季四边形（Great Square）'],
        ['深空', 'M15 球状星团、史蒂芬五重星系方向']
      ],
      observe: [
        '四边形近似正方形，边长约 15°，直观易认',
        '四边形西侧即仙女座，可顺势找到 M31',
        '秋季前半夜位于南方高空'
      ],
      pro: '飞马座四边形由 α、β、γ Peg 与 α And 共同构成，是秋季星空最重要的几何参照。',
      pop: '秋天的夜空有一个巨大的「方框」，那就是飞马的身体。顺着方框的一角往外找，就能一路找到仙女座星系。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },

    /* ---------------- 天文现象 ---------------- */
    {
      id: 'perseids', type: 'phenomenon', cn: '英仙座流星雨', en: 'Perseids',
      aliases: ['英仙座流星雨', 'perseids', '8月流星雨', '流星雨'],
      tag: '现象', visual: 'perseids',
      summary: '每年 8 月中旬极大的北半球三大流星雨之一，ZHR 约 100，母体为斯威夫特–塔特尔彗星。',
      facts: [
        ['极大', '每年 8 月 12–13 日前后'],
        ['ZHR', '约 100（近年有波动）'],
        ['母体', '109P/Swift-Tuttle 彗星'],
        ['辐射点', '英仙座，北半球后半夜升高'],
        ['活跃期', '约 7 月 17 日 – 8 月 24 日']
      ],
      observe: [
        '后半夜至黎明前最佳，辐射点高度越高流星越多',
        '肉眼、躺椅、宽视野，无需望远镜',
        '避开月光：满月前后观测效果显著下降',
        '城市灯光会淹没暗流星，尽量去郊区'
      ],
      pro: '英仙座流星雨的母体 109P/Swift-Tuttle 周期约 133 年，其尘埃带模型（如 Jenniskens 模型）可预测峰值时刻与流量起伏，实际 ZHR 受木星摄动影响存在年际差异。',
      pop: '每年八月，地球会穿过一颗彗星留下的碎屑带。这些碎屑以每秒 59 公里的速度撞进大气，划出一道道亮线——这就是英仙座流星雨，一年中最适合许愿的夜晚之一。',
      sources: [
        { n: 'IMO 国际流星组织', u: 'https://www.imo.net/' },
        { n: 'NASA Meteor Shower 日历', u: 'https://science.nasa.gov/solar-system/meteors-meteorites/' }
      ],
      confidence: 0.9, freshness: 'annual', updated: '2025-11'
    },
    {
      id: 'geminids', type: 'phenomenon', cn: '双子座流星雨', en: 'Geminids',
      aliases: ['双子座流星雨', 'geminids', '12月流星雨'],
      tag: '现象', visual: 'geminids',
      summary: '每年 12 月中旬极大的流星雨，ZHR 可达 150，母体为小行星 3200 Phaethon，流星速度较慢、亮度高。',
      facts: [
        ['极大', '每年 12 月 13–14 日前后'],
        ['ZHR', '约 150（近年多次接近或超过）'],
        ['母体', '小行星 3200 Phaethon'],
        ['特点', '流星速度约 35 km/s，较慢、色偏白黄，火流星多']
      ],
      observe: [
        '辐射点在双子座，前半夜即升起，整夜可观测',
        '冬季注意保暖，躺卧观测最佳',
        '肉眼观测，无需设备；摄影用广角 + 长曝光'
      ],
      pro: '双子座流星雨的母体为岩质小行星 3200 Phaethon，其尘埃释放机制仍存争议（热裂解 vs 潮汐破碎），是研究岩质母体流星群的關鍵样本。',
      pop: '十二月的流星雨冠军。它的「妈妈」不是彗星，而是一颗小行星——这在流星雨里相当少见。而且它下半夜几乎整晚都在，不用熬夜到黎明。',
      sources: [{ n: 'IMO', u: 'https://www.imo.net/' }],
      confidence: 0.9, freshness: 'annual', updated: '2025-11'
    },
    {
      id: 'quadrantids', type: 'phenomenon', cn: '象限仪流星雨', en: 'Quadrantids',
      aliases: ['象限仪流星雨', 'quadrantids', '1月流星雨'],
      tag: '现象', visual: 'quadrantids',
      summary: '每年 1 月初极大的流星雨，ZHR 约 120，峰值持续时间极短（数小时），母体可能为 2003 EH1。',
      facts: [
        ['极大', '每年 1 月 3–4 日前后'],
        ['ZHR', '约 120'],
        ['母体', '2003 EH1（可能的彗星残骸）'],
        ['特点', '峰值窄，仅数小时，易错过']
      ],
      observe: [
        '峰值窗口很短，需精确对准时刻',
        '北半球冬季，辐射点在牧夫座北部，后半夜升高',
        '月光影响大，需查当日月相'
      ],
      pro: '象限仪流星雨的峰值宽度仅约数小时，其母体 2003 EH1 可能是碎裂彗星 C/1490 Y1 的残核。',
      pop: '新年的第一场流星雨，但它的「爆发」只持续几个小时——像一场很快结束的烟花。',
      sources: [{ n: 'IMO', u: 'https://www.imo.net/' }],
      confidence: 0.88, freshness: 'annual', updated: '2025-11'
    },
    {
      id: 'solar-eclipse', type: 'phenomenon', cn: '日食', en: 'Solar Eclipse',
      aliases: ['日食', '日全食', '日环食', '日偏食', 'solar eclipse', '全食带'],
      tag: '现象', visual: 'eclipse',
      summary: '月球运行至太阳与地球之间并遮挡日面。全食带内可见日冕，是最壮观的天象之一，但必须使用合规滤光设备。',
      facts: [
        ['类型', '全食、环食、偏食、全环食'],
        ['2026-02-17', '日环食（南极洲一带）'],
        ['2026-08-12', '日全食（格陵兰、冰岛、西班牙等地）'],
        ['2027-08-02', '日全食（埃及、沙特等地，全食时长可达 6 分以上）'],
        ['安全', '必须使用 ISO 12312-2 认证滤光片，禁止肉眼直视']
      ],
      observe: [
        '全食带内才可见日冕与「钻石环」，带外仅见偏食',
        '提前确认天气与交通，全食仅持续数分钟',
        '偏食阶段也绝不可裸眼观看，需专用日食眼镜或巴德膜',
        '不要用普通墨镜、X 光片、烟熏玻璃替代'
      ],
      pro: '日食的发生要求朔望与黄白交点重合（食季）。2026-08-12 全食带经过北大西洋、冰岛与西班牙，最大食分约 1.03，全食时长约 2 分 18 秒。',
      pop: '月亮走到太阳前面，把太阳整个挡住几分钟——天突然黑下来，星星出现，太阳周围露出一圈银色光晕。这是地球上最震撼的景象之一，但一定要戴专业日食眼镜看。',
      sources: [
        { n: 'NASA Eclipse 网站（五千年日食目录）', u: 'https://eclipse.gsfc.nasa.gov/' },
        { n: '时间与日期（食甚表）', u: 'https://www.timeanddate.com/eclipse/' }
      ],
      confidence: 0.85, freshness: 'annual', updated: '2025-11',
      caution: '未来日期与全食带路径必须以最新星历/官方发布为准，本地库仅为年度概览。'
    },
    {
      id: 'lunar-eclipse', type: 'phenomenon', cn: '月食', en: 'Lunar Eclipse',
      aliases: ['月食', '月全食', '月偏食', '红月亮', '血月', 'lunar eclipse'],
      tag: '现象', visual: 'eclipse',
      summary: '月球进入地球本影或半影而变暗。全食阶段月面呈暗红色，源于地球大气对阳光的折射与散射。',
      facts: [
        ['类型', '半影月食、偏食、全食'],
        ['2026-03-03', '月全食（东亚、大洋洲、美洲部分地区可见）'],
        ['2026-08-28', '月偏食'],
        ['颜色', '全食时呈铜红至暗褐，取决于大气尘埃与火山气溶胶'],
        ['安全性', '肉眼直接观看完全安全']
      ],
      observe: [
        '肉眼即可，双筒可看细节（月海对比度增强）',
        '全食阶段持续数十分钟，可完整观察颜色变化',
        '无需滤镜，与日食的安全要求相反'
      ],
      pro: '月全食的红化由地球大气瑞利散射与折射共同造成：蓝光被散射殆尽，红光经大气折射进入本影。丹戎（Danjon）分级用于描述全食亮度。',
      pop: '月亮走进地球的影子，却不会完全消失——地球大气像一圈透镜，把夕阳的红光折射到月面上，于是月亮变成暗红色。这就是「红月亮」。',
      sources: [{ n: 'NASA Eclipse', u: 'https://eclipse.gsfc.nasa.gov/' }],
      confidence: 0.85, freshness: 'annual', updated: '2025-11',
      caution: '未来月食时刻与可见区域需按最新星历复核。'
    },
    {
      id: 'conjunction', type: 'phenomenon', cn: '行星合相', en: 'Conjunction',
      aliases: ['合相', '行星合', 'conjunction', '行星连珠', '伴月'],
      tag: '现象', visual: 'planets',
      summary: '两颗或多颗天体在天球上视位置接近的现象。合相是视角效应，并非真实空间接近。',
      facts: [
        ['定义', '赤经或黄经相近（常见判据：黄经相同）'],
        ['常见', '行星合月、金星合木星等'],
        ['本质', '视线方向接近，实际距离可能相差数亿公里'],
        ['观测', '低倍望远镜或肉眼即可，常出现在黄昏/黎明低空']
      ],
      observe: [
        '黄昏或黎明时西方/东方低空，需开阔地平线',
        '合相角度小于 1° 时可用双筒同框观赏',
        '行星合月时注意月相与地照'
      ],
      pro: '合相的判定基于黄经差或赤经差，与「最小角距」（appulse）不同；行星连珠（大合）为多颗行星集中于较小黄经范围的现象，视觉上并不成一直线。',
      pop: '两颗亮星在天上「靠在一起」，其实它们隔着几亿公里，只是正好在同一个方向。就像远处两盏路灯看起来挨着。',
      sources: [{ n: 'IMCCE 星历服务', u: 'https://www.imcce.fr/' }],
      confidence: 0.88, freshness: 'ephemeris', updated: '2025-11',
      caution: '具体合相时刻与角距必须实时计算，本地库不提供预测值。'
    },
    {
      id: 'aurora', type: 'phenomenon', cn: '极光', en: 'Aurora',
      aliases: ['极光', '北极光', 'aurora', 'kp指数'],
      tag: '现象', visual: 'aurora',
      summary: '太阳风带电粒子沿地磁场线进入高层大气，激发氧、氮原子发光。可见范围与地磁活动强度（Kp 指数）相关。',
      facts: [
        ['高度', '约 90–400 km'],
        ['颜色', '绿色（氧，557.7 nm）、红色（氧，630 nm）、蓝紫（氮）'],
        ['强度指标', 'Kp 指数 0–9；Kp≥5 为地磁暴'],
        ['太阳活动', '第 25 太阳活动周高峰约在 2024–2026 年'],
        ['我国可见', '强地磁暴时黑龙江漠河、新疆阿勒泰等地有记录']
      ],
      observe: [
        '需远离光污染、朝北开阔视野、无月光干扰',
        '相机长曝光比肉眼更容易捕捉弱极光',
        '关注 Kp 预报与太阳风参数（Bz 南向有利）'
      ],
      pro: '极光卵（auroral oval）随 Kp 指数向低纬扩展；亚暴期间西向电急流与场向电流增强，对应可见光 outburst。',
      pop: '太阳吹来的「风」撞上地球的磁场，被引到南北极上空，撞到空气分子上就发光了——像地球戴上了一顶会呼吸的光环。',
      sources: [{ n: 'NOAA SWPC', u: 'https://www.swpc.noaa.gov/' }, { n: 'SpaceWeatherLive', u: 'https://www.spaceweatherlive.com/' }],
      confidence: 0.85, freshness: 'realtime', updated: '2025-11',
      caution: '极光预报为概率性短期预报，需实时数据源。'
    },

    /* ---------------- 概念与方法 ---------------- */
    {
      id: 'moon-phase', type: 'concept', cn: '月相成因', en: 'Lunar Phase',
      aliases: ['月相', '为什么月亮会变', '阴晴圆缺', '满月', '新月', '月亮形状', 'moon phase'],
      tag: '概念', visual: 'moon',
      summary: '月相变化源于日、地、月相对位置改变导致可见被照亮半球比例变化，周期约 29.53 天。',
      facts: [
        ['周期', '朔望月 29.53 天（恒星月 27.32 天）'],
        ['本质', '月球始终有一半被太阳照亮，我们看到的是可见比例'],
        ['顺序', '新月 → 蛾眉月 → 上弦 → 盈凸 → 满月 → 亏凸 → 下弦 → 残月'],
        ['上弦月', '黄昏出现在南方天空，午夜落下'],
        ['满月', '日落时升起，日出时落下']
      ],
      observe: [
        '上弦月是观测月面环形山的最佳时机（明暗交界线附近立体感最强）',
        '满月适合看整体地貌，但对比度最低',
        '用双筒观察月面即可看到主要环形山与月海'
      ],
      pro: '月相角由日月黄经差决定，照明比例 k = (1 − cos i)/2，其中 i 为相位角；朔望月与恒星月之差来自地球公转的补偿。',
      pop: '月亮自己不会发光，它只是反射太阳光。它永远有一半是亮的，只是我们看的角度在变，所以有时是圆的，有时是弯的。',
      sources: [{ n: 'NASA Moon Phases', u: 'https://science.nasa.gov/moon/moon-phases/' }],
      confidence: 0.96, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'seasons', type: 'concept', cn: '四季星空与季节变化', en: 'Seasonal Sky',
      aliases: ['四季星空', '为什么星星会变', '季节变化', '地球公转', '季节'],
      tag: '概念',
      summary: '地球绕日公转使夜半球朝向的星空方向逐月改变，因此不同季节看到的主要星座不同。',
      facts: [
        ['原因', '地球公转导致夜半球朝向变化，而非恒星本身移动'],
        ['周期', '恒星年约 365.256 天；星空每天提前约 4 分钟升起'],
        ['春夜', '狮子座、室女座、大熊座'],
        ['夏夜', '天蝎座、人马座、夏季大三角'],
        ['秋夜', '飞马座四边形、仙女座、仙后座'],
        ['冬夜', '猎户座、大犬座、金牛座、双子座']
      ],
      observe: [
        '同一星座在同一时刻的位置每月西移约 30°',
        '换季时用「标志星座」建立方向感最高效',
        '北极星全年不动，可作为固定参照'
      ],
      pro: '恒星周日运动与周年运动叠加：恒星时每日超前约 3 分 56 秒，导致同一恒星中天时刻逐日提前，一年累积一个整周。',
      pop: '不是星星在换，是我们自己在绕太阳转。就像坐在旋转木马上，每转一段，看到的前方风景就变了。',
      sources: [{ n: 'NASA', u: 'https://science.nasa.gov/' }],
      confidence: 0.94, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'magnitude', type: 'concept', cn: '视星等', en: 'Apparent Magnitude',
      aliases: ['星等', '视星等', 'magnitude', '几等星'],
      tag: '概念',
      summary: '衡量天体视亮度的对数标度：数值越小越亮，每差 5 等亮度相差 100 倍。',
      facts: [
        ['定义', 'm = −2.5 log₁₀(E) + C'],
        ['参考', '天狼星 −1.46，织女一 0.03，肉眼极限约 6'],
        ['规律', '每差 1 等，亮度比约 2.512 倍'],
        ['注意', '视星等不等于真实光度（绝对星等）']
      ],
      observe: ['用已知星等的星作参照，可估计观测极限星等', '城市中肉眼极限常只有 3–4 等'],
      pro: '视星等为对数光度标度，零点由 Vega 系统或 AB 星等系统定义；绝对星等 M 与视星等 m 通过距离模数 m − M = 5 log₁₀(d) − 5 联系。',
      pop: '星星的「亮度分数」，数字越小越亮。天狼星是 −1.46 分，你肉眼能看到的暗星大约是 6 分。差 5 分，亮度差 100 倍。',
      sources: [{ n: 'IAU 光度标准', u: 'https://www.iau.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'lightyear', type: 'concept', cn: '光年与天文距离', en: 'Light Year',
      aliases: ['光年', '天文单位', '秒差距', 'light year', '距离单位'],
      tag: '概念',
      summary: '光年是天文学中的距离单位，等于光在真空中一年走过的距离，约 9.46 万亿公里。',
      facts: [
        ['1 光年', '9.4607 × 10¹² km'],
        ['1 天文单位（AU）', '约 1.496 亿 km（日地平均距离）'],
        ['1 秒差距（pc）', '约 3.26 光年'],
        ['最近恒星', '南门二系统约 4.37 光年']
      ],
      observe: ['观测遥远天体即观测其过去：仙女座星系的光走了 254 万年'],
      pro: '光年由儒略年（365.25 d）与真空光速 c = 299792458 m/s 定义；秒差距源于周年视差 1 角秒的距离，1 pc = 648000/π AU。',
      pop: '光年不是时间，是距离。光跑一年的距离。所以你看到的天狼星，是它 8.6 年前的样子。',
      sources: [{ n: 'IAU 单位规范', u: 'https://www.iau.org/' }],
      confidence: 0.97, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'light-pollution', type: 'concept', cn: '光污染与波特尔等级', en: 'Bortle Scale',
      aliases: ['光污染', '波特尔', 'bortle', '观测条件', '暗夜'],
      tag: '观测',
      summary: '波特尔暗天等级以 1–9 级衡量夜空亮度，直接决定肉眼极限星等与深空天体可见度。',
      facts: [
        ['Bortle 1', '极暗，肉眼极限 7.6–8.0 等，银河结构清晰'],
        ['Bortle 4–5', '郊区/乡村过渡，极限约 6.1–6.5 等'],
        ['Bortle 7–8', '城市郊区，极限 4.5–5.0 等'],
        ['Bortle 9', '市中心，极限约 4.0 等，仅见少数亮星']
      ],
      observe: [
        '同一目标在不同 Bortle 等级下的观感差异极大，需在建议中标注前提',
        '使用光污染地图（如 Light Pollution Atlas）预先评估',
        '月光是另一种「光污染」，满月可使等效等级上升 2–3 级'
      ],
      pro: '波特尔等级（Bortle, 2001）综合天空亮度、可见星数、银河与黄道光可见度分级；定量对应天空亮度 mag/arcsec² 约 21.99（B1）至 <17.5（B9）。',
      pop: '天黑得够不够彻底，决定了你能看到多少星星。国际暗夜协会把夜空分成 9 级，1 级是「黑到能看见自己的影子」，9 级是「市中心，只剩几颗星」。',
      sources: [{ n: 'Sky & Telescope（Bortle 原文）', u: 'https://skyandtelescope.org/' }],
      confidence: 0.92, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'dark-adapt', type: 'concept', cn: '暗适应与红光照明', en: 'Dark Adaptation',
      aliases: ['暗适应', '红光', '夜视', 'dark adaptation'],
      tag: '观测',
      summary: '人眼在黑暗中约需 20–30 分钟恢复视杆细胞敏感度，任何白光都会使其部分重置。',
      facts: [
        ['时间', '完全暗适应约 20–40 分钟'],
        ['破坏', '一次白光可使暗适应损失 50% 以上'],
        ['对策', '使用红光手电（波长 > 600 nm）'],
        ['辅助', '双眼轮流观测、避免吸烟与疲劳']
      ],
      observe: ['到场后先闭眼或远离光源 15 分钟再开始观测', '手机屏幕调至最低亮度并开红色滤镜'],
      pro: '暗适应涉及视紫红质再生与瞳孔扩张，视杆细胞在 20° 偏心视角处密度最高，故暗弱目标应使用「侧视法」（averted vision）。',
      pop: '刚到黑暗里什么都看不见，等二十分钟，眼睛才会「开机」。这时候千万别开手机白屏——一切要重来。',
      sources: [{ n: 'AAS 观测指南', u: 'https://aas.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'seeing', type: 'concept', cn: '视宁度与透明度', en: 'Seeing & Transparency',
      aliases: ['视宁度', '透明度', 'seeing', '大气稳定度'],
      tag: '观测',
      summary: '视宁度决定星像抖动程度（影响高倍观测），透明度决定暗弱天体的可见度（影响深空观测）。',
      facts: [
        ['视宁度', '以角秒表示，1–2″ 为良好，>3″ 不利于行星观测'],
        ['透明度', '受水汽、尘埃、气溶胶影响'],
        ['关系', '两者可相互独立：通透但抖动，或稳定但有薄雾'],
        ['判断', '用北极星衍射环或裸眼星点闪烁程度快速评估']
      ],
      observe: [
        '行星/双星需要良好视宁度；星云/星系需要高透明度',
        '避开屋顶、柏油路面等热源附近',
        '目标高度低于 30° 时大气扰动显著增强'
      ],
      pro: '视宁度由大气折射率湍流（Kolmogorov 谱）决定，Fried 参数 r₀ 与相干长度相关；透明度则与大气消光系数（mag/airmass）相关。',
      pop: '「抖动」和「通透」是两件事：前者决定星星是不是糊成一团，后者决定暗的东西能不能看见。',
      sources: [{ n: 'AAS', u: 'https://aas.org/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'polaris', type: 'concept', cn: '北极星为什么几乎不动', en: 'Polaris',
      aliases: ['北极星', '勾陈一', 'polaris', '为什么不动'],
      tag: '概念',
      summary: '北极星几乎位于北天极方向，地球自转时它只在极小范围内移动，因此成为北天定位基准。',
      facts: [
        ['身份', '小熊座 α（勾陈一），约 2.0 等'],
        ['距离', '约 430 光年'],
        ['现状', '距北天极约 0.65°，仍有小幅度周日运动'],
        ['变化', '岁差使天极在 26000 年周期内移动，约 12000 年后织女一附近将成为极星']
      ],
      observe: ['长时间曝光会看到北极星画一个小圈，其他星画大圈', '用指极星法定位后，可作为赤道仪对极参考'],
      pro: '地轴岁差（precession）周期约 25772 年，天极沿黄极画圆；当前极星为 α UMi，公元前 3000 年约为天龙座 α（右枢）。',
      pop: '因为地球自转的轴正好指向它附近，所以整片星空绕着它转，它却几乎不动。古人靠它认方向，就是这个道理。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'blackhole', type: 'concept', cn: '黑洞', en: 'Black Hole',
      aliases: ['黑洞', '事件视界', 'black hole', '人马座A*', 'Sgr A*', 'M87*', '银心黑洞', '银河系中心的黑洞', '银河系中心黑洞'],
      tag: '宇宙', status: 'established',
      openQuestion: '黑洞信息悖论尚未解决：落入黑洞的信息是否最终守恒、以何种形式返回，量子引力理论尚无定论。',
      summary: '引力强到连光也无法逃逸的天体，由事件视界界定。银河系中心存在超大质量黑洞人马座 A*（4.297×10⁶ 太阳质量）。',
      facts: [
        ['事件视界', '史瓦西半径 r_s = 2GM/c²'],
        ['人马座 A*', '(4.297 ± 0.012) × 10⁶ 太阳质量（GRAVITY 2022）'],
        ['M87*', '(6.5 ± 0.7) × 10⁹ 太阳质量（EHT 2019）'],
        ['首张照片', 'M87*：2019-04-10 公布；人马座 A*：2022-05-12 公布'],
        ['诺奖', '2020 年诺贝尔物理学奖（黑洞的形成与银河系中心致密天体）']
      ],
      evidence: [
        'Sgr A* 周边恒星轨道（S2 等）的长期天体测量，拟合出致密质量（GRAVITY 2022）',
        'EHT 在 1.3 mm 波段成像黑洞阴影，尺度与质量预言一致（M87* 2019、Sgr A* 2022）',
        '引力波并合事件（GW150914 等）直接确认恒星级黑洞的存在',
        'X 射线双星的光谱与光变揭示致密天体的质量分布'
      ],
      observe: ['黑洞本身不可见，观测依赖吸积盘、喷流与引力效应', '人马座 A* 位于人马座方向，需射电望远镜与干涉阵列'],
      pro: '事件视界望远镜（EHT）通过甚长基线干涉在 1.3 mm 波段达到约 20 微角秒分辨率，直接成像黑洞阴影。',
      pop: '一个引力陷阱：掉进去的东西，连光都出不来。我们看到的「黑洞照片」，其实是它周围发光物质围成的圈，中间那个黑影才是它。',
      sources: [
        { n: 'GRAVITY Collaboration 2022, A&A 657, L12', u: 'https://www.aanda.org/articles/aa/full_html/2022/12/aa44548-22/aa44548-22.html' },
        { n: 'EHT Collaboration 2019, ApJL 875, L1', u: 'https://iopscience.iop.org/article/10.3847/2041-8213/ab0ec7' },
        { n: 'EHT 合作组官网', u: 'https://eventhorizontelescope.org/' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'exoplanet', type: 'concept', cn: '系外行星', en: 'Exoplanet',
      aliases: ['系外行星', 'exoplanet', '凌星法', '外星行星'],
      tag: '概念',
      summary: '太阳系以外围绕其他恒星运行的行星，主要通过凌星法与视向速度法发现。',
      facts: [
        ['数量', '截至 2026-08-20，NASA Exoplanet Archive 确认 6,354 颗'],
        ['方法', '凌星法（亮度周期下降）、视向速度法（光谱多普勒摆动）'],
        ['代表', '51 Pegasi b（1995，首个主序星系外行星）、TRAPPIST-1 系统'],
        ['探测', 'Kepler、TESS、JWST 大气光谱']
      ],
      observe: ['凌星法需要连续高精度测光，业余可用 CMOS + 望远镜做光变曲线', '重点关注已知凌星行星的预测时刻'],
      pro: '凌星深度 (ΔF/F) ≈ (R_p/R_*)²，结合视向速度可导出密度；透射光谱用于大气成分反演。',
      pop: '别的太阳周围也有行星。我们怎么知道？看星星会不会周期性地「眨一下」——那是行星从它前面经过。',
      sources: [{ n: 'NASA Exoplanet Archive', u: 'https://exoplanetarchive.ipac.caltech.edu/' }],
      confidence: 0.9, freshness: 'realtime', updated: '2025-11',
      caution: '行星数量为动态数据，本地快照可能滞后，需以 NASA Exoplanet Archive 为准。'
    },
    {
      id: 'milkyway', type: 'concept', cn: '银河与银心', en: 'Milky Way',
      aliases: ['银河', '银心', 'milky way', '银河系'],
      tag: '概念',
      summary: '银河是我们从内部看到的银河系盘面，银心位于人马座方向，距离约 2.6 万光年。',
      facts: [
        ['直径', '约 10 万光年（恒星盘）'],
        ['银心距离', '约 2.6 万光年'],
        ['银心方向', '人马座 / 天蝎座之间'],
        ['最佳季节', '北半球夏季，银河最亮段在头顶'],
        ['暗带', '尘埃带遮挡星光，形成「大裂缝」']
      ],
      observe: [
        '需要 Bortle 4 以下暗夜才可见结构',
        '用双筒沿银河扫描可看到大量星团与暗带',
        '夏季人马座方向最亮，冬季相反方向较暗'
      ],
      pro: '银河系为棒旋星系（SBbc），太阳位于猎户臂附近，距银心约 8.2 kpc；银盘恒星密度与星际尘埃共同形成可见光波段的结构。',
      pop: '银河不是云，是星星。我们住在银河系里面，从一个侧面看出去，就看到一条横跨天空的光带。夏天最壮观的银河，就在人马座那一段。',
      sources: [{ n: 'NASA', u: 'https://science.nasa.gov/' }],
      confidence: 0.94, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'meteor-vs', type: 'concept', cn: '流星、流星体与陨石', en: 'Meteoroid / Meteor / Meteorite',
      aliases: ['流星', '流星体', '陨石', 'meteor', '火流星'],
      tag: '概念',
      summary: '太空中的小块岩石为流星体，进入大气发光为流星，落到地面为陨石。三者是同一物体的不同阶段。',
      facts: [
        ['流星体', '太空中的固体颗粒或小块岩石'],
        ['流星', '进入大气烧蚀发光的现象（高度约 80–120 km）'],
        ['陨石', '未烧尽落到地表的残体'],
        ['火流星', '亮度超过 −4 等的流星']
      ],
      observe: ['流星观测用肉眼 + 宽视野，记录方向与亮度可贡献科学数据', '陨石搜寻需专业判断，不可盲目捡拾'],
      pro: '流星辐射点由地球运动方向与流星体群轨道共同决定；流星光谱可反演烧蚀成分与速度。',
      pop: '流星不是「星星掉下来」，是一颗小石子以每秒几十公里撞进大气，烧起来了。',
      sources: [{ n: 'IMO', u: 'https://www.imo.net/' }],
      confidence: 0.93, freshness: 'static', updated: '2025-11'
    },
    {
      id: 'equipment', type: 'concept', cn: '观测器材选择', en: 'Equipment Guide',
      aliases: ['器材', '入门设备', '买什么望远镜', '望远镜怎么选', '双筒望远镜推荐', '天文望远镜选购'],
      tag: '观测',
      summary: '入门优先级为：双筒 > 大口径便携望远镜 > 高倍率小口径。口径决定集光力，稳定性决定有效倍率。',
      facts: [
        ['双筒 7×50 / 10×50', '最通用的入门设备，适合银河、星团、彗星'],
        ['80–100mm 折射', '行星与月面细节，便携'],
        ['150–200mm 道布森', '深空目视性价比最高'],
        ['赤道仪', '深空摄影必需，需对极轴']
      ],
      observe: [
        '先买双筒 + 星图，再考虑望远镜',
        '口径优先于倍率；「高倍廉价套装」通常不可用',
        '城市观测优先考虑便携性（能带出去才有意义）'
      ],
      pro: '集光力 ∝ D²，理论分辨率 ≈ 116″/D(mm)（道斯极限）；实际有效倍率上限约 2×D(mm)，受视宁度限制。',
      pop: '别一上来就买最大最贵的。一副 10×50 的双筒，能让你看一整年都不腻。',
      sources: [{ n: 'Sky & Telescope 器材指南', u: 'https://skyandtelescope.org/' }],
      confidence: 0.9, freshness: 'static', updated: '2025-11', verified: '2026-10'
    },
    /* ================= 宇宙学（共识等级已标注） ================= */
    {
      id: 'bigbang', type: 'concept', cn: '大爆炸宇宙学', en: 'Big Bang Cosmology',
      aliases: ['大爆炸', '宇宙起源', '宇宙年龄', '宇宙的年龄', '宇宙多大', '宇宙有多大', '宇宙多少岁', 'big bang', '宇宙学', '标准宇宙模型', 'LCDM'],
      tag: '宇宙', status: 'established',
      summary: '现行标准宇宙模型：宇宙在过去处于极高温高密状态，此后持续膨胀并冷却，年龄约 137.97 亿年（Planck 2018）。',
      facts: [
        ['宇宙年龄', '13.797 ± 0.023 Gyr（Planck 2018，ΛCDM）'],
        ['当前膨胀率', 'H₀ = 67.36 ± 0.54 km/s/Mpc（Planck 2018）'],
        ['组分', '暗能量 68.5%、暗物质 26.5%、重子物质 4.9%'],
        ['微波背景温度', '2.7255 K（黑体谱，偏差 < 1/10000）'],
        ['复合时刻', '约大爆炸后 38 万年（红移 z ≈ 1100）'],
        ['轻元素丰度', '按质量约 75% 氢、25% 氦（原初核合成预言）']
      ],
      evidence: [
        '星系普遍红移且距离越远退行越快（哈勃–勒梅特定律）',
        '宇宙微波背景的 2.7 K 黑体谱与声学峰结构（Planck）',
        '原初核合成预言的氢、氦、氘丰度与观测吻合',
        '宇宙时间膨胀：高红移超新星光变按 (1+z) 展宽'
      ],
      observe: [
        '业余无法直接观测，但可用光谱测量遥远星系红移作为间接体验',
        '微波背景需射电/毫米波观测（Planck、WMAP、ACT、SPT）',
        '宇宙年龄的独立交叉检验：最古老球状星团年龄约 130 亿年'
      ],
      pro: '平坦 ΛCDM 模型用 6 个参数（Ωb h²、Ωc h²、100θMC、τ、ln(10¹⁰As)、ns）即可在 Mpc 至视界尺度、逾 100 亿年时间内拟合 CMB、BAO、超新星与结构增长数据；Planck 2018 给出的重子密度 Ωb h² = 0.02237 ± 0.00015，物质密度 Ωm = 0.3153 ± 0.0073。',
      pop: '宇宙不是「在某个点炸开」，而是空间本身在过去更小、更热、更密，然后一直膨胀、冷却到今天。我们看到的远处星系，其实是它们年轻时的样子。',
      sources: [
        { n: 'Planck Collaboration 2018, A&A 641, A6（ESA）', u: 'https://www.aanda.org/articles/aa/full_html/2020/09/aa33910-18/aa33910-18.html' },
        { n: 'NASA Universe / Big Bang', u: 'https://science.nasa.gov/universe/the-big-bang/' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'cmb', type: 'concept', cn: '宇宙微波背景', en: 'Cosmic Microwave Background',
      aliases: ['宇宙微波背景', '微波背景', 'CMB', '宇宙背景辐射', '最后散射面'],
      tag: '宇宙', status: 'established',
      summary: '大爆炸后约 38 万年宇宙复合时释放的辐射，今天被红移到微波波段，温度 2.7255 K，是宇宙最早的「照片」。',
      facts: [
        ['温度', '2.72548 ± 0.00057 K（COBE/FIRAS 定标）'],
        ['各向异性', '温度涨落量级约 10⁻⁵'],
        ['释放时刻', '大爆炸后约 38 万年，红移 z ≈ 1100'],
        ['声学峰', '第一峰对应空间曲率近乎平坦（Ωk ≈ 0）'],
        ['探测史', '1965 年偶然发现（Penzias & Wilson），1989 COBE，2009–2013 Planck']
      ],
      evidence: [
        '黑体谱精度极高，支持热平衡起源',
        '声学峰位置与幅度同时约束曲率、重子与暗物质密度',
        '极化与透镜重建独立验证 ΛCDM 参数'
      ],
      observe: [
        '地面毫米波望远镜（ACT、SPT）与卫星（Planck）观测',
        '旧式模拟电视的「雪花」中有极小比例来自 CMB'
      ],
      pro: 'CMB 功率谱的第一声学峰位于 ℓ ≈ 220，直接给出角直径距离与平坦性；第三峰对重子密度敏感。Planck 2018 由 TT,TE,EE+lowE+lensing 得到的 ns = 0.9649 ± 0.0042，接近但偏离 Harrison–Zel\'dovich 标度不变谱。',
      pop: '这是宇宙 38 万岁时的「婴儿照」。它今天已经冷却到只有 2.7 K，成了充满整个宇宙的微波噪声——老电视的雪花里就藏着它。',
      sources: [
        { n: 'Planck Collaboration 2018, A&A 641, A6', u: 'https://www.aanda.org/articles/aa/full_html/2020/09/aa33910-18/aa33910-18.html' },
        { n: 'Fixsen 2009, ApJ 707, 916（COBE/FIRAS）', u: 'https://iopscience.iop.org/article/10.1088/0004-637X/707/2/916' }
      ],
      confidence: 0.97, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'darkmatter', type: 'concept', cn: '暗物质', en: 'Dark Matter',
      aliases: ['暗物质', 'dark matter', '冷暗物质', 'WIMP', '缺失质量'],
      tag: '宇宙', status: 'established',
      openQuestion: '暗物质的粒子本质仍未确定：WIMP、轴子、惰性中微子、原初黑洞等候选均未被确证，也未被排除。',
      summary: '不发光、不与电磁力作用的物质，约占宇宙物质总量的 85%。其引力效应已被多手段确证，但粒子本质仍未知。',
      facts: [
        ['密度', 'Ωc h² = 0.1200 ± 0.0012（Planck 2018）'],
        ['占比', '约占宇宙总能量 26.5%，占物质总量约 85%'],
        ['证据', '星系旋转曲线、星系团速度弥散、引力透镜、CMB 第三峰'],
        ['候选', 'WIMP、轴子、惰性中微子、原初黑洞'],
        ['探测现状', '直接探测（XENONnT、LZ）与对撞机均尚无确证信号']
      ],
      evidence: [
        '星系外围旋转速度不随半径下降（Rubin 等，1970s）',
        '子弹星系团中引力中心与气体中心分离（2006）',
        'CMB 声学峰要求大量无压暗物质'
      ],
      observe: [
        '不可直接目视；只能通过引力效应间接观测',
        '弱引力透镜巡天（DES、Euclid）绘制暗物质分布'
      ],
      pro: '在 ΛCDM 中，暗物质必须是「冷」的（自由流长度短）才能促成自下而上的结构形成；其无压特性由 CMB 声学峰相对高度与星系团质量函数共同约束。',
      pop: '宇宙里有一种东西，看不见、摸不着，也不发光，但它的引力把星系拉在一起。我们能确认它存在，却还不知道它到底是什么。',
      sources: [
        { n: 'Planck Collaboration 2018, A&A 641, A6', u: 'https://www.aanda.org/articles/aa/full_html/2020/09/aa33910-18/aa33910-18.html' },
        { n: 'NASA Science: Dark Matter', u: 'https://science.nasa.gov/universe/dark-matter-dark-energy/' }
      ],
      confidence: 0.95, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'darkenergy', type: 'concept', cn: '暗能量', en: 'Dark Energy',
      aliases: ['暗能量', 'dark energy', '宇宙加速膨胀', '宇宙学常数', 'w0wa'],
      tag: '宇宙', status: 'emerging',
      openQuestion: '暗能量是否真是恒定的宇宙学常数（w = −1），还是随时间演化？DESI DR2（2025）给出偏离迹象，但 2026 年的 Lyα 全形状分析又偏向 ΛCDM，尚未定论。',
      summary: '驱动宇宙加速膨胀的未知成分，约占宇宙总能量 68.5%。其存在已成共识，但物理本质与是否随时间演化仍在争论。',
      facts: [
        ['占比', 'ΩΛ = 0.6847 ± 0.0073（Planck 2018）'],
        ['发现', '1998 年通过 Ia 型超新星测距发现加速膨胀（2011 年诺奖）'],
        ['状态方程', 'ΛCDM 假设 w = −1；DESI DR2 拟合偏好 w₀ > −1、wa < 0'],
        ['DESI DR2 显著性', 'BAO+CMB 相对 ΛCDM 约 3.1σ；加入超新星后 2.8–4.2σ'],
        ['最新进展', '2026 年 DESI Lyα 全形状结果向 ΛCDM 回摆，争论未息']
      ],
      evidence: [
        '高红移 Ia 型超新星比预期更暗，要求加速膨胀',
        'CMB 与 BAO 联合要求约 68% 的负压成分',
        'DESI 对膨胀历史与结构增长的联合约束'
      ],
      observe: [
        '需大型巡天（DESI、Euclid、Rubin/LSST）与超新星观测',
        '业余层面不可直接观测'
      ],
      pro: 'w₀waCDM 参数化下，DESI DR2 BAO 与 CMB 联合偏好 w₀ > −1、wa < 0 的解，优于 ΛCDM 约 3.1σ；但该偏好对超新星样本选择敏感（2.8–4.2σ），且 2026 年 Lyα 全形状测量的中心值向 ΛCDM 移动。因此目前应表述为「存在偏离迹象」，而非「已发现演化暗能量」。',
      pop: '宇宙不但在膨胀，而且越胀越快。推动这件事的东西叫暗能量——我们给了它名字，占了宇宙 68%，却完全不知道它是什么。',
      sources: [
        { n: 'DESI Collaboration 2025, Phys. Rev. D 112, 083515', u: 'https://doi.org/10.1103/tr6y-kpc6' },
        { n: 'DESI DR2 Lyα full-shape 结果（2026）', u: 'https://www.desi.lbl.gov/' }
      ],
      confidence: 0.8, freshness: 'realtime', updated: '2026-10', verified: '2026-10',
      caution: '本条属于前沿研究：结论随新数据快速变化，界面数值为 2026-10 快照，引用时须注明来源与日期。'
    },
    {
      id: 'hubble-tension', type: 'concept', cn: '哈勃张力', en: 'Hubble Tension',
      aliases: ['哈勃张力', 'hubble tension', '哈勃常数', 'H0', '宇宙膨胀率', '膨胀率争议'],
      tag: '宇宙', status: 'emerging',
      openQuestion: '早期宇宙推断值（67.4）与近邻测量值（73.0）差异约 9%，显著性约 5σ。是未知系统误差，还是需要新物理？目前没有共识。',
      summary: '用宇宙微波背景推断的膨胀率与用近邻宇宙距离阶梯测得的值不一致，是当代宇宙学最尖锐的未解问题之一。',
      facts: [
        ['早期宇宙', 'H₀ = 67.36 ± 0.54 km/s/Mpc（Planck 2018）'],
        ['近邻阶梯', 'H₀ = 73.04 ± 1.04（SH0ES 2022）；73.49 ± 0.93（JWST 校准，2025）'],
        ['替代测量', 'TRGB 法 70.39 ± 1.22（CCHP 2025）；JAGB 法 67.80 ± 2.17'],
        ['显著性', 'Planck 与 SH0ES 之间约 5σ'],
        ['候选解释', '早期暗能量、额外相对论自由度、修改引力，或未被识别的系统误差']
      ],
      evidence: [
        'JWST 复核造父变星测光，排除「星群混淆」这一主要系统误差（2024，约 8σ）',
        '时间延迟透镜类星体独立测量偏向高值',
        '不同近邻方法（造父/TRGB/JAGB）彼此仍有分歧'
      ],
      observe: ['需 HST/JWST 与地面巡天数据，非目视可及'],
      pro: '张力不能用单一「测量错误」轻易消解：JWST 在近红外复核造父变星后与 HST 一致（平均差 −0.01 ± 0.03 mag），但 CCHP 用 TRGB/JAGB 得到接近 Planck 的值。因此当前证据指向「至少一方存在未识别系统误差，或早期宇宙物理不完备」，两种可能均未被排除。',
      pop: '同一个宇宙，两种量法算出两个膨胀速度，而且越测越精确、差距却不肯消失。这就是哈勃张力——目前没有人能确定谁错了。',
      sources: [
        { n: 'Riess et al. 2022, ApJL 934, L7（SH0ES）', u: 'https://iopscience.iop.org/article/10.3847/2041-8213/ac5c5b' },
        { n: 'Freedman et al. 2025, ApJ 985, 203（CCHP）', u: 'https://iopscience.iop.org/article/10.3847/1538-4357/adb829' },
        { n: 'Planck Collaboration 2018, A&A 641, A6', u: 'https://www.aanda.org/articles/aa/full_html/2020/09/aa33910-18/aa33910-18.html' }
      ],
      confidence: 0.72, freshness: 'realtime', updated: '2026-10', verified: '2026-10',
      caution: '本条为活跃争议：不同团队的数值与显著性表述存在差异，任何单一数字都不应被当作定论。'
    },
    {
      id: 'inflation', type: 'concept', cn: '宇宙暴胀', en: 'Cosmic Inflation',
      aliases: ['暴胀', '宇宙暴胀', 'inflation', '原初引力波', 'B模'],
      tag: '宇宙', status: 'emerging',
      openQuestion: '暴胀的直接证据（原初引力波 B 模极化）尚未被探测；暴胀模型众多，其物理机制没有唯一答案。',
      summary: '假设宇宙极早期经历了一次指数式膨胀，可解释视界问题、平坦性问题与各向异性起源，但缺乏直接证据。',
      facts: [
        ['提出', '1980 年代初（Guth、Linde 等）'],
        ['解释的问题', '视界问题、平坦性问题、单极子问题、原初扰动谱'],
        ['关键预言', '近标度不变、略微红倾的标量谱（ns ≈ 0.965，已观测支持）'],
        ['未决', '张量标量比上限 r < 0.036（BICEP/Keck+Planck，95% 置信）'],
        ['现状', '间接支持强，直接证据缺失']
      ],
      evidence: [
        'CMB 声学峰给出的近平坦性与 ns < 1 与暴胀预言一致',
        '原初扰动近似高斯、近标度不变',
        '尚无原初 B 模极化探测'
      ],
      observe: ['CMB B 模极化观测（BICEP、LiteBIRD 计划）', '非目视可及'],
      pro: 'Planck 2018 测得 ns = 0.9649 ± 0.0042，与最简单的单场慢滚暴胀预言一致；但 r 的上限持续压低，已排除大量大张力模型。缺少 B 模证据意味着暴胀仍是「最成功的假设」而非「已证实的理论」。',
      pop: '大爆炸之前，宇宙可能经历过一次「瞬间膨胀」，把空间拉平、把温度抹匀。这个想法非常成功，但我们还没找到它留下的直接指纹。',
      sources: [
        { n: 'BICEP/Keck Collaboration 2021, PRL 127, 151301', u: 'https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.127.151301' },
        { n: 'Planck Collaboration 2018, A&A 641, A6', u: 'https://www.aanda.org/articles/aa/full_html/2020/09/aa33910-18/aa33910-18.html' }
      ],
      confidence: 0.65, freshness: 'realtime', updated: '2026-10', verified: '2026-10',
      caution: '暴胀是理论框架而非已确证事实；本条标注为前沿研究。'
    },
    {
      id: 'multiverse', type: 'concept', cn: '多重宇宙', en: 'Multiverse',
      aliases: ['多重宇宙', '平行宇宙', 'multiverse', '人择原理', '弦论景观'],
      tag: '宇宙', status: 'speculative',
      openQuestion: '多重宇宙目前没有可证伪的观测预言，属于推测性框架，不应与已观测证实的理论并列。',
      summary: '某些暴胀或弦论模型预言存在大量彼此因果隔绝的「子宇宙」。该想法在数学上自然，但目前无法检验。',
      facts: [
        ['来源', '永恒暴胀、弦论景观、量子力学多世界诠释'],
        ['支持论点', '暴胀一旦开始难以整体结束，可能不断产生子宇宙'],
        ['核心困难', '其他宇宙原则上不可观测，缺乏可证伪预言'],
        ['学术态度', '作为理论可能性被讨论，不作为已确立的科学结论']
      ],
      evidence: ['无直接观测证据', '部分模型可留下宇宙学印记（如泡壁碰撞），但尚未探测到'],
      observe: ['目前无可行观测方案'],
      pro: '多重宇宙的讨论属于理论物理的推测性延伸：它可能由暴胀动力学自然导出，但缺乏独立可检验预言，因此在科学哲学上常被质疑其可证伪性。科普表述中不应与 ΛCDM、暗物质等已观测支持的理论等同对待。',
      pop: '有些理论说，我们的宇宙只是无数个宇宙中的一个。听起来很浪漫，但目前为止，没有任何办法去证实它——所以它更像一个猜想，而不是一个结论。',
      sources: [
        { n: 'IAU / NASA 科普口径：区分理论与推测', u: 'https://science.nasa.gov/universe/' }
      ],
      confidence: 0.35, freshness: 'static', updated: '2026-10', verified: '2026-10',
      caution: '本条为未定论的推测性内容，仅用于说明「科学边界在哪里」，不可作为事实引用。'
    },
    {
      id: 'stellardeath', type: 'concept', cn: '恒星演化与超新星', en: 'Stellar Evolution',
      aliases: ['恒星演化', '超新星', '白矮星', '中子星', '红巨星', '钱德拉塞卡极限', '恒星死亡'],
      tag: '宇宙', status: 'established',
      summary: '恒星由引力坍缩与核聚变平衡支撑；燃料耗尽后依质量走向白矮星、中子星或黑洞。',
      facts: [
        ['太阳结局', '约 50 亿年后进入红巨星，抛出行星状星云，留下白矮星'],
        ['分岔质量', '约 8 倍太阳质量为是否引发核心坍缩的粗略门槛'],
        ['白矮星上限', '钱德拉塞卡极限约 1.4 太阳质量'],
        ['超新星', '核心坍缩型（II 型）与热核爆炸型（Ia 型）'],
        ['重元素来源', '中子星并合与超新星是金、铂等重元素的主要产地']
      ],
      evidence: [
        '赫罗图上的演化轨迹与星团年龄序列',
        '1987A 超新星的中微子爆发与后续观测',
        '白矮星质量分布在天体测量中的上限'
      ],
      observe: [
        'M57 环状星云是行星状星云阶段的直观样本',
        'M1 蟹状星云是 1054 年超新星的遗迹，双筒可见'
      ],
      pro: '主序寿命近似 t ∝ M^(−2.5)；核心坍缩超新星的能量主要经由中微子释放（SN 1987A 探测到约 20 个中微子事件），可见光仅占极小比例。Ia 型超新星因亮度一致而被用作标准烛光，也是发现暗能量的关键工具。',
      pop: '恒星靠「烧」维持自己不塌。燃料烧完，引力就赢了——小的变成白矮星，中等的炸成超新星留下中子星，最大的塌成黑洞。你身上的重元素，大多来自这些爆炸。',
      sources: [
        { n: 'NASA Science: Stars', u: 'https://science.nasa.gov/universe/stars/' },
        { n: 'IAU 恒星演化科普', u: 'https://www.iau.org/public/themes/' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'gravitational-wave', type: 'concept', cn: '引力波', en: 'Gravitational Waves',
      aliases: ['引力波', 'gravitational wave', 'LIGO', '中子星并合', 'GW150914'],
      tag: '宇宙', status: 'established',
      summary: '加速运动的巨大质量在时空中激起的涟漪。2015 年首次直接探测，开启了非电磁波段的天文学。',
      facts: [
        ['首次探测', 'GW150914，2015-09-14 观测，2016-02-11 公布'],
        ['源头', '两个约 36 与 29 太阳质量的黑洞并合，形成约 62 太阳质量'],
        ['能量', '约 3 个太阳质量以引力波形式释放'],
        ['里程碑', 'GW170817 中子星并合，同时观测到电磁对应体'],
        ['诺奖', '2017 年诺贝尔物理学奖']
      ],
      evidence: [
        '两台 LIGO 探测器相隔 7 毫秒收到同一信号',
        '波形与数值相对论预言的黑洞并合模板吻合',
        'GW170817 的引力波与伽马暴、光学余晖同时同向'
      ],
      observe: ['需激光干涉探测器（LIGO/Virgo/KAGRA），非目视可及', '第三代探测器（爱因斯坦望远镜、Cosmic Explorer）在规划中'],
      pro: 'GW150914 的啁啾信号频率从约 35 Hz 升至 250 Hz，应变幅度约 10⁻²¹，与 410 Mpc 处 62 M☉ 残余黑洞的并合一致。引力波与电磁波联合观测（多信使天文学）由此成为标准手段。',
      pop: '两个黑洞撞在一起，会把时空本身震出涟漪。2015 年，人类第一次「听」到了这个声音——从此天文学不只靠看。',
      sources: [
        { n: 'LIGO/Virgo 2016, PRL 116, 061102（GW150914）', u: 'https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.116.061102' },
        { n: 'LIGO Scientific Collaboration', u: 'https://www.ligo.org/' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10', verified: '2026-10'
    },
    {
      id: 'early-galaxies', type: 'concept', cn: '早期宇宙与 JWST 深场', en: 'Early Galaxies',
      aliases: ['早期星系', 'JWST 深场', '深场', '宇宙黎明', '高红移星系'],
      tag: '宇宙', status: 'emerging',
      openQuestion: 'JWST 发现的高红移星系数量与亮度高于多数模型预期，是否意味着星系形成效率、初始质量函数或宇宙学需要修正，尚无定论。',
      summary: 'JWST 在红移 z > 10 处发现大量明亮星系，把「宇宙黎明」的观测边界推进到宇宙诞生后约 3 亿年。',
      facts: [
        ['最深记录', 'JADES-GS-z14-0，z = 14.32（2024，NIRSpec 确认）'],
        ['时间', '对应大爆炸后约 2.9 亿年'],
        ['观测手段', '近红外光谱红移确认 + 多波段测光'],
        ['争议', '早熟星系的数量与亮度挑战星系形成模型'],
        ['现状', '数据快速累积，理论解释仍在调整']
      ],
      evidence: [
        'NIRSpec 光谱确认的莱曼断裂与发射线',
        '多台望远镜独立复核排除低红移污染',
        '与 ΛCDM 框架下的半解析/流体模拟比较'
      ],
      observe: ['需空间望远镜深场观测，非目视可及'],
      pro: 'z = 14.32 对应的宇宙年龄约 2.9 亿年；在如此早期出现质量约 10⁸–10⁹ M☉ 的星系，要求早期恒星形成效率高于传统假设，或存在此前未计入的反馈/初始质量函数效应。目前更可能是星系形成物理需修正，而非宇宙学参数被推翻。',
      pop: '韦布望远镜看到了宇宙只有几亿岁时就已成形的星系，比很多人预期的更早、更亮。这不一定是「宇宙学错了」，更可能是我们低估了早期星系的本事。',
      sources: [
        { n: 'Carniani et al. 2024, Nature（JADES-GS-z14-0）', u: 'https://www.nature.com/articles/s41586-024-07860-9' },
        { n: 'NASA JWST 科学成果', u: 'https://science.nasa.gov/mission/webb/' }
      ],
      confidence: 0.78, freshness: 'realtime', updated: '2026-10', verified: '2026-10',
      caution: '本条为快速演进领域，记录数与红移纪录可能在数月内更新。'
    },


    {
      id: 'sun-structure', type: 'concept', cn: '太阳的结构与活动', en: 'The Sun',
      aliases: ['太阳', '太阳黑子', '太阳活动周期', '日珥', '太阳耀斑'],
      tag: '天体', status: 'established',
      summary: '太阳是一颗 G2V 型主序星，核心靠氢核聚变供能，表面活动以约 11 年为周期起伏。',
      facts: [
        ['半径', '约 69.6 万公里（109 个地球半径）'],
        ['表面温度', '约 5772 K'],
        ['核心温度', '约 1500 万 K'],
        ['年龄', '约 46 亿年，剩余主序寿命约 50 亿年'],
        ['活动周期', '约 11 年，黑子与耀斑同步起伏']
      ],
      observe: ['绝不可用肉眼或未加滤镜的望远镜直视太阳', '黑子需用巴德膜或专用太阳望远镜观测'],
      pro: '太阳能量来自质子—质子链，每秒约 6 亿吨氢聚变为氦，质量亏损以 E=mc² 转为辐射；日冕温度反而高达百万 K，这一「日冕加热问题」仍未完全解决。',
      pop: '太阳是一颗普通的恒星，只是离我们最近。它每秒烧掉六亿吨氢，光要走 8 分 20 秒才到地球。',
      sources: [{ n: 'NASA Sun Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'tidal-locking', type: 'concept', cn: '月球为什么总是一面朝我们', en: 'Tidal Locking',
      aliases: ['潮汐锁定', '月球背面', '月亮为什么一面朝我们', '月球背面有什么'],
      tag: '天体', status: 'established',
      summary: '月球自转周期与绕地公转周期相同（约 27.3 天），因此始终以同一面朝向地球；背面并非「永远黑暗」。',
      facts: [
        ['自转周期', '27.32 天，与恒星月相同'],
        ['成因', '地球潮汐力长期拖拽，使自转与公转同步'],
        ['背面光照', '同样有昼夜交替，约 14 天白天、14 天黑夜'],
        ['可见比例', '因天平动，累计可见约 59% 的月面'],
        ['首次着陆', '2019 年嫦娥四号首次软着陆月球背面']
      ],
      observe: ['连续几天同一时刻拍摄月亮，可看出天平动导致的轻微摆动'],
      pro: '潮汐锁定是潮汐耗散的终态：地球对月球潮汐隆起施加力矩，使自转角动量转移至轨道，最终自转周期等于轨道周期。冥王星—卡戎同样是双锁定系统。',
      pop: '月亮不是「不转」，而是转得刚好让我们只看得到一面。就像两个人手拉手转圈，你永远只看到对方的脸。',
      sources: [{ n: 'NASA Moon Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'eclipse-frequency', type: 'concept', cn: '为什么不是每月都有日月食', en: 'Eclipse Seasons',
      aliases: ['为什么不是每个月都有日食', '为什么不是每个月都有月食', '为什么不是每月都有月食', '为什么不是每个月都有日食', '日月食频率', '月食频率', '黄白交角', '食季'],
      tag: '现象', status: 'established',
      summary: '月球轨道相对黄道倾斜约 5.1°，只有朔或望恰好发生在黄白交点附近时才会发生日月食。',
      facts: [
        ['黄白交角', '约 5.1°'],
        ['发生条件', '朔/望与交点重合，称「食季」'],
        ['频率', '每年至少 2 次日食，日月食合计 4–7 次'],
        ['食季间隔', '约 173 天'],
        ['可见范围', '日食带窄（最宽约 270 km），月食可见范围广']
      ],
      observe: ['日食需在食带内才见全食，月食则半个地球都能看到'],
      pro: '交点线因月球轨道进动每 18.6 年绕行一周，食季因此每年提前约 19 天；沙罗周期（6585.3 天）是日月食重复的经典周期。',
      pop: '月亮绕地球的轨道是「斜」的，大多数时候影子从上方或下方掠过，只有三者排成一条直线时才会上演日月食。',
      sources: [{ n: 'NASA Eclipse Web Site', u: 'https://eclipse.gsfc.nasa.gov/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'tides', type: 'concept', cn: '潮汐', en: 'Tides',
      aliases: ['潮汐', '涨潮', '退潮', '大潮', '小潮', '引潮力'],
      tag: '概念', status: 'established',
      summary: '潮汐主要由月球引潮力造成，太阳叠加影响；朔望时形成大潮，上下弦时形成小潮。',
      facts: [
        ['主因', '月球引潮力约为太阳的 2.2 倍'],
        ['周期', '半日潮约 12 小时 25 分'],
        ['大潮', '朔与望时日月引潮力叠加'],
        ['小潮', '上下弦时相互抵消一部分'],
        ['潮差', '开阔海岸约 1 米，湾口可达 10 米以上']
      ],
      observe: ['潮汐时刻表由当地海岸地形决定，不能用天文潮直接替代'],
      pro: '引潮力是引力场的梯度效应，与距离三次方成反比；因此虽然太阳质量远大于月球，起主要作用的仍是月球。',
      pop: '月亮把地球靠近它的一面「拉起来」，背面则因惯性鼓起，于是每天两次涨落。',
      sources: [{ n: 'NOAA Tides & Currents', u: 'https://tidesandcurrents.noaa.gov/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'sky-blue', type: 'concept', cn: '天空为什么是蓝的', en: 'Rayleigh Scattering',
      aliases: ['天空为什么是蓝色', '天空为什么是蓝的', '瑞利散射', '日落为什么是红的', '晚霞'],
      tag: '概念', status: 'established',
      summary: '大气分子对短波光的瑞利散射与波长四次方成反比，蓝光被散射得最多；日落时路径变长，红橙光占优。',
      facts: [
        ['机制', '瑞利散射，强度与 λ⁴ 成反比'],
        ['蓝光散射', '约比红光强 5.5 倍（450 nm 对比 650 nm）'],
        ['日落变红', '阳光穿过更厚大气，蓝光被散射殆尽'],
        ['天空不发紫', '人眼对紫光敏感度低，部分紫光被臭氧吸收']
      ],
      observe: ['火山喷发或沙尘后晚霞更红，因气溶胶增强长波透过'],
      pro: '瑞利散射截面与 λ⁻⁴ 成正比，仅适用于粒径远小于波长的分子；当气溶胶粒径接近波长时转为米氏散射，天空会发白。',
      pop: '空气分子把蓝光「弹」得到处都是，所以抬头满眼是蓝。傍晚阳光要穿过更厚的大气，蓝光被弹没了，只剩红橙。',
      sources: [{ n: 'NASA Science', u: 'https://science.nasa.gov/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'twinkle', type: 'concept', cn: '星星为什么会闪', en: 'Atmospheric Twinkling',
      aliases: ['星星为什么会闪', '星星闪烁', '为什么星星一闪一闪', '闪烁'],
      tag: '观测', status: 'established',
      summary: '恒星是点光源，星光穿过湍流大气时被不断折射，亮度与位置快速抖动；行星视面较大，闪烁不明显。',
      facts: [
        ['原因', '大气湍流导致的折射率起伏'],
        ['恒星', '点光源，闪烁明显'],
        ['行星', '视面较大，闪烁被平均掉'],
        ['影响', '视宁度差时高倍观测失效']
      ],
      observe: ['行星几乎不闪，是夜空中辨别行星的实用技巧'],
      pro: '闪烁幅度与大气相干长度相关；自适应光学通过波前传感与变形镜实时补偿，可把点扩散函数恢复到衍射极限。',
      pop: '星光穿过晃动的空气，就像透过水面看东西。行星是个「小圆盘」，很多束光互相抵消，所以不太闪。',
      sources: [{ n: 'AAS 观测指南', u: 'https://aas.org/' }],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'star-color', type: 'concept', cn: '恒星的颜色与温度', en: 'Stellar Color',
      aliases: ['星星为什么有颜色', '恒星颜色', '星星颜色', '恒星温度'],
      tag: '天体', status: 'established',
      summary: '恒星颜色由表面温度决定：蓝白最热（约 3 万 K），红橙最冷（约 3 千 K），光谱型序列为 OBAFGKM。',
      facts: [
        ['序列', 'O B A F G K M，温度由高到低'],
        ['蓝色', '约 10000–40000 K'],
        ['白色', '约 7500–10000 K'],
        ['黄色（太阳）', '约 5700–6000 K'],
        ['红色', '约 3000–4000 K']
      ],
      observe: ['参宿七偏蓝、参宿四偏红，是同一星座内的鲜明对比'],
      pro: '颜色反映连续谱的维恩峰值位置；光谱型还由吸收线强度细化，与温度、光度共同构成赫罗图。',
      pop: '星星的颜色就是它的「体温计」：蓝的发烫，红的偏凉。太阳是黄白色的，属于中等温度。',
      sources: [{ n: 'NASA Science: Stars', u: 'https://science.nasa.gov/universe/stars/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'constellation-count', type: 'concept', cn: '星座一共有多少个', en: 'Constellations',
      aliases: ['星座有多少个', '八十八星座', '88星座', '星座怎么划分'],
      tag: '星座', status: 'established',
      summary: '国际天文联合会把全天划分为 88 个官方星座，边界在 1930 年统一划定，全天无缝覆盖。',
      facts: [
        ['数量', '88 个（IAU 官方）'],
        ['边界', '1930 年依 IAU 决议划定'],
        ['最大', '长蛇座（约 1303 平方度）'],
        ['最小', '南十字座（约 68 平方度）'],
        ['中国体系', '三垣二十八宿，与西方体系不同']
      ],
      observe: ['星座边界是坐标线，不是星连线的形状'],
      pro: 'IAU 星座是天空的分区而非图形，任何天体都可用所属星座描述；北斗七星这类星连线并不等于星座。',
      pop: '星座就像天上的「行政区」，一共 88 个，每个方向都能归到某一个星座里。',
      sources: [{ n: 'IAU Constellations', u: 'https://www.iau.org/public/themes/constellations/' }],
      confidence: 0.98, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'zodiac', type: 'concept', cn: '黄道十二宫与黄道星座', en: 'Zodiac',
      aliases: ['黄道十二宫', '十二星座', '星座运势', '黄道', '蛇夫座'],
      tag: '星座', status: 'established',
      summary: '黄道是太阳一年在天球上的视路径；十二宫是古代均分的 12 段，而黄道实际穿过 13 个星座，包括蛇夫座。',
      facts: [
        ['黄道', '太阳周年视运动的路径'],
        ['十二宫', '每宫 30°，起于春分点'],
        ['实际星座', '13 个，含蛇夫座'],
        ['岁差', '春分点每 72 年西移 1°，宫与星座已错位约一个月'],
        ['区别', '宫是坐标分区，星座是实际天区']
      ],
      observe: ['可查证某日太阳位于哪个星座，与「星座日期」通常相差一个月'],
      pro: '由于地轴岁差，春分点已从白羊座移到双鱼座；占星使用的宫位是固定坐标框架，与真实星座位置无关。',
      pop: '「我是白羊座」说的是古代把黄道切成 12 块，不是太阳真的在白羊座。地轴慢慢摆动，现在的位置早就对不上了。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10',
      caution: '本条仅解释天文事实；占星预测不属于天文学范畴，本产品不提供。'
    },
    {
      id: 'seasons-cause', type: 'concept', cn: '四季是怎么形成的', en: 'Seasons',
      aliases: ['四季成因', '为什么有四季', '地轴倾角', '为什么夏天热'],
      tag: '概念', status: 'established',
      summary: '四季由地轴相对公转轨道面倾斜约 23.44° 造成：太阳高度角与日照时长随季节变化，而非日地距离变化。',
      facts: [
        ['地轴倾角', '约 23.44°'],
        ['近日点', '1 月初（约 1.471 亿公里）'],
        ['远日点', '7 月初（约 1.521 亿公里）'],
        ['北半球夏至', '约 6 月 21 日，太阳直射北回归线'],
        ['关键', '日照角度与时长，而非距离']
      ],
      observe: ['北半球夏季反而接近远日点，可直接反驳「离太阳近所以热」的误解'],
      pro: '太阳高度角决定单位面积辐射通量，日照时长决定积分时间；两者叠加造成季节温差，海陆分布与环流再加以调制。',
      pop: '不是因为地球离太阳远近，而是因为地轴是斜的。夏天太阳升得高、照得久，自然更热。',
      sources: [{ n: 'NASA Science', u: 'https://science.nasa.gov/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'solar-system', type: 'concept', cn: '太阳系的行星与分类', en: 'Solar System',
      aliases: ['太阳系', '八大行星', '行星顺序', '类地行星', '气态巨行星', '冰巨星'],
      tag: '天体', status: 'established',
      summary: '太阳系有八颗行星：水金地火为岩质行星，木土为气态巨行星，天海为冰巨星；此外还有矮行星、卫星与小天体。',
      facts: [
        ['顺序', '水星、金星、地球、火星、木星、土星、天王星、海王星'],
        ['岩质行星', '水金地火，体积小、密度高'],
        ['气态巨行星', '木星、土星，以氢氦为主'],
        ['冰巨星', '天王星、海王星，含水、氨、甲烷冰'],
        ['矮行星', '冥王星、谷神星、阅神星等']
      ],
      observe: ['傍晚或黎明可依次看到水星、金星、火星、木星、土星', '行星几乎不闪烁，可与恒星区分'],
      pro: '行星按轨道半径分为内行星与外行星，雪线（约 2.7 AU）外挥发性物质可凝结，是巨行星形成的分界；柯伊伯带与奥尔特云是短周期与长周期彗星的储库。',
      pop: '太阳系像一个套娃：四颗小石头星、两颗大气体星、两颗冰巨星，外面还撒着一圈碎石和冰块。',
      sources: [{ n: 'NASA Solar System', u: 'https://science.nasa.gov/solar-system/' }],
      confidence: 0.98, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'planet-round', type: 'concept', cn: '天体为什么都是球形', en: 'Hydrostatic Equilibrium',
      aliases: ['为什么星球是圆的', '天体为什么是球形', '球形原因', '流体静力平衡'],
      tag: '概念', status: 'established',
      summary: '当自引力超过物质强度，天体在流体静力平衡下趋于球形；小天体引力不足，多为不规则形状。',
      facts: [
        ['门槛', '直径约 400–600 km（冰质天体更小）'],
        ['机制', '自引力使物质向质心坍缩'],
        ['非完美球', '自转导致赤道隆起（地球扁率约 1/298）'],
        ['例外', '小行星、彗核多为不规则形状']
      ],
      observe: ['小行星的形状需探测器或掩星观测才能确定'],
      pro: 'IAU 对矮行星的定义即包含「达到流体静力平衡」这一条；行星自转产生的扁率与内部密度分布共同决定其实际形状。',
      pop: '引力像一只从四面八方按下去的手，把大块物质捏成球。小石头引力太弱，捏不动，所以长得奇形怪状。',
      sources: [{ n: 'IAU 行星定义（2006）', u: 'https://www.iau.org/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'asteroid-belt', type: 'concept', cn: '小行星带', en: 'Asteroid Belt',
      aliases: ['小行星带', '小行星', '谷神星', '柯克伍德空隙'],
      tag: '天体', status: 'established',
      summary: '火星与木星之间 2.2–3.2 AU 的小天体密集区，总质量仅约月球的 4%，成员之间平均距离极大。',
      facts: [
        ['位置', '2.2–3.2 天文单位'],
        ['最大成员', '谷神星（直径约 940 km，矮行星）'],
        ['总质量', '约月球的 4%'],
        ['空隙', '柯克伍德空隙由木星轨道共振清空'],
        ['数量', '已编号小行星超过 60 万颗']
      ],
      observe: ['最亮的灶神星可达 5.1 等，暗夜肉眼勉强可见'],
      pro: '小行星带并非「密集碎石场」，成员平均间距达数十万公里；其形成受木星引力扰动的抑制，未能聚合成行星。',
      pop: '电影里穿越小行星带要闪避，现实里你几乎看不到第二颗——它们离得太远了。',
      sources: [{ n: 'NASA Asteroids', u: 'https://science.nasa.gov/asteroids-comets-and-meteors/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'kuiper-belt', type: 'concept', cn: '柯伊伯带与海外天体', en: 'Kuiper Belt',
      aliases: ['柯伊伯带', '海外天体', '奥尔特云', '阅神星', '鸟神星'],
      tag: '天体', status: 'established',
      summary: '海王星轨道外 30–50 AU 的冰质小天体带，冥王星、阅神星等矮行星位于此处；更远处是球壳状奥尔特云。',
      facts: [
        ['范围', '约 30–50 天文单位'],
        ['成员', '冥王星、阅神星、鸟神星、妊神星'],
        ['性质', '以水冰、甲烷冰、氨冰为主'],
        ['奥尔特云', '约 2000–100000 AU，长周期彗星来源'],
        ['发现', '1992 年首个柯伊伯带天体 1992 QB1']
      ],
      observe: ['冥王星需 200mm 以上口径才可能看到约 14 等的暗点'],
      pro: '柯伊伯带分为经典带、共振带与散射盘；其动态结构记录了海王星迁移历史，是行星迁移模型的关键证据。',
      pop: '太阳系的「后院」：一堆冰疙瘩在黑暗里慢慢绕圈，冥王星只是其中最大的一块。',
      sources: [{ n: 'NASA Kuiper Belt', u: 'https://science.nasa.gov/solar-system/kuiper-belt/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'pluto', type: 'concept', cn: '冥王星为什么被降级', en: 'Pluto',
      aliases: ['冥王星', '冥王星为什么不是行星', '行星定义', '矮行星'],
      tag: '天体', status: 'established',
      summary: '2006 年 IAU 通过新行星定义，要求「清空轨道附近区域」；冥王星因与柯伊伯带天体共享轨道，被归为矮行星。',
      facts: [
        ['时间', '2006 年 8 月 IAU 大会决议'],
        ['三条标准', '绕日、达到流体静力平衡、清空轨道邻域'],
        ['冥王星', '满足前两条，未清空轨道'],
        ['质量', '约为月球的 1/6'],
        ['探测', '2015 年新视野号飞掠，发现氮冰平原与冰山']
      ],
      observe: ['冥王星视星等约 14.5，需较大口径望远镜'],
      pro: '「清空轨道」以轨道邻域质量比衡量，冥王星所在区域总质量远超自身；阅神星质量略大于冥王星的发现直接推动了重新定义。',
      pop: '不是「被开除」，而是人类把行星的标准写得更清楚了。冥王星身边还有一大堆同伴，它没能「独占一条道」。',
      sources: [{ n: 'IAU 2006 行星定义', u: 'https://www.iau.org/news/pressreleases/detail/iau0603/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'comet-tail', type: 'concept', cn: '彗尾为什么背向太阳', en: 'Comet Tails',
      aliases: ['彗星', '彗尾', '彗星尾巴', '彗星为什么有尾巴', '哈雷彗星'],
      tag: '天体', status: 'established',
      summary: '彗尾由太阳风与辐射压把尘埃和离子推离彗核形成，因此始终背向太阳，与彗星运动方向无关。',
      facts: [
        ['组成', '尘埃尾（黄白、弯曲）与离子尾（蓝色、笔直）'],
        ['驱动力', '辐射压与太阳风'],
        ['方向', '背向太阳，与运动方向无关'],
        ['彗核', '冰与尘埃混合的「脏雪球」，直径数公里'],
        ['著名', '哈雷彗星周期约 76 年，下次回归 2061 年']
      ],
      observe: ['彗星亮度预报不确定性大，需临近时再确认', '暗夜与双筒是观测大彗星的最佳组合'],
      pro: '离子尾沿太阳风磁力线取向，速度可达数百 km/s；尘埃尾因颗粒惯性大而滞后于轨道，形成弯曲结构。',
      pop: '彗尾不是被「风吹」出来的烟，而是太阳的光和粒子把彗星的气尘推走。所以它永远朝着远离太阳的方向。',
      sources: [{ n: 'NASA Comets', u: 'https://science.nasa.gov/comets/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'galaxy-types', type: 'concept', cn: '星系的类型', en: 'Galaxy Classification',
      aliases: ['星系分类', '哈勃序列', '旋涡星系', '椭圆星系', '不规则星系'],
      tag: '宇宙', status: 'established',
      summary: '哈勃序列把星系分为椭圆星系、旋涡星系与不规则星系，形态差异与角动量、并合历史相关。',
      facts: [
        ['椭圆星系', 'E0–E7，按扁率细分，年老恒星为主'],
        ['旋涡星系', 'Sa–Sc，含核球、盘与旋臂，有棒者为 SB'],
        ['不规则星系', '无明显结构，多为矮星系'],
        ['我们的银河系', '棒旋星系 SBbc'],
        ['演化', '形态并非单向序列，并合可改变类型']
      ],
      observe: ['M31 为旋涡、M87 为椭圆、M82 为星暴/不规则，可作三类样本'],
      pro: '哈勃序列（1926）是形态描述而非演化路径；现代观测表明星系形态受角动量、并合历史与反馈共同影响。',
      pop: '星系大致分三种长相：圆球、风车、以及一团乱。银河系是个带棒的风车。',
      sources: [{ n: 'NASA Galaxies', u: 'https://science.nasa.gov/universe/galaxies/' }],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'milkyway-stars', type: 'concept', cn: '银河系有多少恒星', en: 'Milky Way Stars',
      aliases: ['银河系有多少恒星', '银河系恒星数量', '银河系多大', '银河系质量'],
      tag: '宇宙', status: 'established',
      summary: '银河系约有 1000 亿至 4000 亿颗恒星，恒星盘直径约 10 万光年，太阳距银心约 2.6 万光年。',
      facts: [
        ['恒星数', '约 1000 亿–4000 亿颗（估算区间）'],
        ['盘直径', '约 10 万光年'],
        ['太阳位置', '距银心约 2.6 万光年（8.2 kpc）'],
        ['总质量', '约 1.5 万亿太阳质量（含暗物质）'],
        ['中心', '人马座 A*，约 430 万太阳质量']
      ],
      observe: ['夏季人马座方向的银河最亮，那是看向银心的方向'],
      pro: '恒星计数依赖初始质量函数外推与盘/核球模型；总质量则由旋转曲线与矮卫星运动学约束，其中暗物质占大部分。',
      pop: '几千亿颗星星，你一辈子也数不完。我们看到的银河，只是从内部看到的一条光带。',
      sources: [{ n: 'NASA Galaxies', u: 'https://science.nasa.gov/universe/galaxies/' }],
      confidence: 0.9, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'local-group', type: 'concept', cn: '本星系群', en: 'Local Group',
      aliases: ['本星系群', '本星系团', '仙女座与银河系', '星系群'],
      tag: '宇宙', status: 'established',
      summary: '银河系与仙女座星系为首的星系群，成员约 80 个以上，直径约 1000 万光年，受引力束缚。',
      facts: [
        ['主要成员', '银河系、仙女座星系（M31）、三角座星系（M33）'],
        ['成员数', '约 80 个以上，多为矮星系'],
        ['直径', '约 1000 万光年'],
        ['运动', '银河系与 M31 相互接近，约 45 亿年后并合'],
        ['上级结构', '室女座超星系团 / 拉尼亚凯亚']
      ],
      observe: ['南半球可见大小麦哲伦云，是本星系群内的卫星星系'],
      pro: '本星系群是受引力束缚但未完全弛豫的系统；Gaia 数据表明 M31 将在约 45 亿年后与银河系开始并合。',
      pop: '我们和仙女座星系住在同一个「小区」里，邻居不多，但会慢慢靠拢，最后合并成一个更大的星系。',
      sources: [{ n: 'NASA Galaxies', u: 'https://science.nasa.gov/universe/galaxies/' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'redshift', type: 'concept', cn: '红移与宇宙膨胀', en: 'Redshift',
      aliases: ['红移', '宇宙学红移', '多普勒红移', '哈勃定律'],
      tag: '宇宙', status: 'established',
      summary: '遥远星系的光谱向红端移动，红移量随距离增大，是宇宙膨胀的直接观测证据。',
      facts: [
        ['定义', 'z =（观测波长 − 发射波长）/ 发射波长'],
        ['哈勃定律', 'v 约等于 H₀ 乘距离（低红移近似）'],
        ['宇宙学红移', '由空间膨胀造成，非运动多普勒效应'],
        ['纪录', 'JWST 已确认 z 约 14 的星系'],
        ['应用', '红移巡天绘制宇宙大尺度结构']
      ],
      observe: ['业余可用低分辨率光谱仪测量明亮类星体或星系的红移'],
      pro: '宇宙学红移满足 1+z 等于尺度因子之比，与多普勒效应在低红移下近似但物理来源不同；高红移处的距离需依赖宇宙学模型换算。',
      pop: '光在旅途中被「拉长」了，颜色偏红。拉得越多，说明它走得越久、越远。',
      sources: [{ n: 'NASA/ESA Hubble', u: 'https://science.nasa.gov/universe/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'universe-end', type: 'concept', cn: '宇宙会怎么结束', en: 'Ultimate Fate',
      aliases: ['宇宙的结局', '宇宙会怎么结束', '热寂', '大撕裂', '大坍缩'],
      tag: '宇宙', status: 'emerging',
      openQuestion: '结局取决于暗能量的本质：恒定宇宙学常数指向热寂，若状态方程小于 −1 则可能大撕裂。暗能量是否演化尚未确定。',
      summary: '在标准模型下，宇宙将加速膨胀、恒星熄灭，最终趋向极低温的「热寂」；其他结局取决于暗能量性质。',
      facts: [
        ['热寂', '持续膨胀，熵最大化，温度趋近绝对零度'],
        ['大撕裂', '若暗能量随时间增强'],
        ['大坍缩', '若膨胀最终反向（当前观测不支持）'],
        ['恒星时代', '约 10¹⁴ 年后恒星形成停止'],
        ['黑洞蒸发', '约 10¹⁰⁰ 年后超大质量黑洞蒸发']
      ],
      observe: ['无法观测验证，只能通过暗能量状态方程约束推断'],
      pro: 'ΛCDM 下宇宙趋向 de Sitter 相，未来以指数膨胀为主；结局讨论高度依赖状态方程的外推，属于模型推演而非既定事实。',
      pop: '最可能的结局不是「爆炸」，而是「慢慢冷掉」：星星一颗颗熄灭，宇宙变成一片漆黑而稀薄的空间。',
      sources: [{ n: 'Planck 2018 / ΛCDM', u: 'https://www.aanda.org/' }],
      confidence: 0.55, freshness: 'static', updated: '2026-10',
      caution: '本条为模型推演，非观测事实。'
    },
    {
      id: 'fermi', type: 'concept', cn: '费米悖论与外星生命', en: 'Fermi Paradox',
      aliases: ['费米悖论', '外星人', '外星生命', '地外文明', '德雷克公式'],
      tag: '宇宙', status: 'speculative',
      openQuestion: '至今没有任何地外生命的确证证据；「他们在哪」仍属推测，包括稀有地球、大过滤器、探测不足等假说。',
      summary: '宇宙尺度与年龄都极大，理论上文明应已遍布银河系，但我们没有发现任何确证迹象——这就是费米悖论。',
      facts: [
        ['现状', '无任何地外生命的确证证据'],
        ['系外行星', '已确认超过 6,300 颗，宜居带候选众多'],
        ['德雷克公式', '估算文明数量的框架，参数不确定性极大'],
        ['假说', '稀有地球、大过滤器、文明寿命短、探测不足'],
        ['探测', '射电搜寻（SETI）与生物标志物光谱']
      ],
      observe: ['系外行星大气光谱（如 JWST）是寻找生物标志物的主要途径'],
      pro: '费米悖论是概率与观测的张力，而非观测结论；德雷克公式各项（尤其是文明寿命）缺乏独立约束，不能据此断言「存在/不存在」。',
      pop: '宇宙这么大、这么老，按理说应该有别的文明。可我们什么都没听到。这个「安静」本身就是最大的谜。',
      sources: [{ n: 'NASA Exoplanets', u: 'https://science.nasa.gov/exoplanets/' }],
      confidence: 0.4, freshness: 'static', updated: '2026-10',
      caution: '本条为未定论议题，任何「外星人存在/不存在」的断言都超出当前证据。'
    },
    {
      id: 'habitable-zone', type: 'concept', cn: '宜居带', en: 'Habitable Zone',
      aliases: ['宜居带', '适居带', '液态水带', '超级地球', '类地行星'],
      tag: '宇宙', status: 'established',
      summary: '恒星周围可维持液态水存在的轨道范围，边界随恒星光度与大气模型变化，不等于「一定宜居」。',
      facts: [
        ['定义', '行星表面可维持液态水的轨道区间'],
        ['太阳系', '约 0.95–1.37 AU（保守估计）'],
        ['保守/乐观', '取决于大气成分与云反馈假设'],
        ['局限', '未考虑潮汐加热、大气逃逸、磁场'],
        ['代表', 'TRAPPIST-1 系统多颗行星位于宜居带附近']
      ],
      observe: ['宜居带只是筛选条件之一，大气光谱才是关键证据'],
      pro: '宜居带边界由辐射收支与温室效应模型给出，不同假设下可相差数十个百分点；M 型矮星的潮汐锁定与耀斑活动会显著影响实际宜居性。',
      pop: '「不冷不热、水能是液态」的那一圈轨道。但落在这圈里，不代表真的有水、有大气、有生命。',
      sources: [{ n: 'NASA Exoplanet Archive', u: 'https://exoplanetarchive.ipac.caltech.edu/' }],
      confidence: 0.9, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'telescope-types', type: 'concept', cn: '望远镜的类型', en: 'Telescope Types',
      aliases: ['望远镜类型', '折射望远镜', '反射望远镜', '折反望远镜', '牛顿式', '马卡'],
      tag: '观测', status: 'established',
      summary: '天文望远镜分折射、反射与折反三类；口径决定集光力与分辨率，反射式在大口径上性价比最高。',
      facts: [
        ['折射式', '镜筒封闭、免维护，但有色差、大口径昂贵'],
        ['反射式', '无色差、大口径便宜，需定期校准光轴'],
        ['折反式', '体积紧凑，适合行星与便携观测'],
        ['关键参数', '口径优先于焦距，焦距优先于倍率'],
        ['有效倍率', '约两倍口径（毫米）为上限']
      ],
      observe: ['先买双筒再考虑望远镜；城市观测优先考虑便携'],
      pro: '理论分辨率受衍射限制（道斯极限约 116 角秒除以口径毫米数），实际受视宁度制约；集光力与口径平方成正比，是深空观测的首要指标。',
      pop: '望远镜的核心不是「能放多大」，而是「能收多少光」。口径越大，看到的越暗、越细。',
      sources: [{ n: 'Sky & Telescope', u: 'https://skyandtelescope.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'equatorial-mount', type: 'concept', cn: '赤道仪与跟踪', en: 'Equatorial Mount',
      aliases: ['赤道仪', '跟踪', '对极轴', '经纬仪', 'goto'],
      tag: '观测', status: 'established',
      summary: '赤道仪的一个轴与地轴平行，抵消地球自转即可让目标保持在视场中；经纬仪结构简单但需双轴同时修正。',
      facts: [
        ['原理', '极轴平行地轴，绕极轴匀速转动抵消自转'],
        ['对极轴', '北半球指向北极星附近，精度决定跟踪质量'],
        ['经纬仪', '结构简单，但存在场旋，不适合长曝光'],
        ['GoTo', '内置星表与电机，可自动指向'],
        ['精度', '摄影级需角秒级对极与导星']
      ],
      observe: ['目视用经纬仪足够；深空摄影必须赤道仪加导星'],
      pro: '跟踪误差主要来自对极偏差、周期误差与大气折射；长曝光需导星相机实时修正，否则星点拖线。',
      pop: '地球在转，赤道仪就「反着转」，让目标定在视野里不动。拍深空照片，没有它几乎不可能。',
      sources: [{ n: 'Sky & Telescope', u: 'https://skyandtelescope.org/' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'astrophotography', type: 'concept', cn: '天文摄影入门', en: 'Astrophotography',
      aliases: ['天文摄影', '星空摄影', '银河怎么拍', '深空摄影', '叠加'],
      tag: '观测', status: 'established',
      summary: '天文摄影分广角星空、深空与行星三类；核心是足够曝光、稳定跟踪与多帧叠加降噪。',
      facts: [
        ['广角', '大光圈广角加三脚架，遵循 500 法则避免拖线'],
        ['深空', '赤道仪跟踪加多张叠加（亮场、暗场、平场）'],
        ['行星', '高倍加视频抽帧叠加（幸运成像）'],
        ['关键', '总曝光时间与信噪比，而非单张参数'],
        ['后期', '叠加、拉伸、去梯度、色彩校准']
      ],
      observe: ['避开月光与光污染；Bortle 4 以下效果显著提升', '先从银河与星轨练手，再进入深空'],
      pro: '信噪比随叠加帧数平方根提升；深空需扣除暗电流与平场不均，行星成像则依赖视宁度窗口内的短曝光抽帧。',
      pop: '拍星空不是「一次拍好」，而是拍几十上百张，再用软件叠成一张。耐心比器材更重要。',
      sources: [{ n: 'NASA APOD', u: 'https://apod.nasa.gov/' }],
      confidence: 0.9, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'star-trails', type: 'concept', cn: '星轨是怎么拍的', en: 'Star Trails',
      aliases: ['星轨', '星轨怎么拍', '星星轨迹', '延时'],
      tag: '观测', status: 'established',
      summary: '长时间固定机位拍摄，地球自转使恒星在画面上划出弧线；朝北可拍同心圆，朝东或西则成斜线。',
      facts: [
        ['原理', '地球自转造成的周日视运动'],
        ['方法', '长曝光单张，或数百张短曝光叠加'],
        ['朝向', '正北可见绕北极星的同心圆'],
        ['曝光', '单张 20–30 秒，ISO 800–1600，光圈 f/2.8'],
        ['注意', '电池与结露是长时拍摄的主要障碍']
      ],
      observe: ['月亮太亮会冲淡星轨，选新月前后', '用间隔拍摄更安全，可随时中止'],
      pro: '星轨长度对应曝光时长与赤纬：靠近天极的轨迹短，赤道附近最长；叠加法可避免长时间曝光的热噪与电池限制。',
      pop: '不是星星在跑，是地球在转。相机不动，拍上半小时，星星就画出了圆弧。',
      sources: [{ n: 'NASA APOD', u: 'https://apod.nasa.gov/' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'time-standards', type: 'concept', cn: '时区、UTC 与儒略日', en: 'Time Standards',
      aliases: ['时区', 'UTC', '世界时', '儒略日', 'JD', '地方时', '夏令时'],
      tag: '概念', status: 'established',
      summary: '天文计算使用世界时与儒略日；本地时刻需叠加时区偏移，跨夏令时地区还要叠加夏令时。',
      facts: [
        ['UTC', '基于原子时，通过闰秒与地球自转保持接近'],
        ['时区', '以经度 15 度为基准划分，实际边界由各国规定'],
        ['儒略日', '从公元前 4713 年起算的连续日数，天文通用'],
        ['本地时', 'UTC 加时区偏移（可能含夏令时）'],
        ['换算', 'JD 等于 Unix 时间除以 86400 再加 2440587.5']
      ],
      observe: ['观测记录务必注明时区，否则时刻无法复核'],
      pro: '儒略日以正午为日界，简化了跨夜的观测记录；现代星历多用地球时，与 UTC 相差约 69 秒（2026 年）。',
      pop: '天文台不用「北京时间」记时间，而是用一个连续不断的天数，避免换算混乱。',
      sources: [{ n: 'IERS / IAU 时间规范', u: 'https://www.iers.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'lunar-calendar', type: 'concept', cn: '农历与二十四节气', en: 'Chinese Calendar',
      aliases: ['农历', '阴历', '二十四节气', '闰月', '朔望月', '节气'],
      tag: '概念', status: 'established',
      summary: '农历是阴阳合历：月份按朔望月（29.53 天）排，年长通过闰月与回归年对齐；节气按太阳黄经每 15 度划分。',
      facts: [
        ['朔望月', '29.5306 天'],
        ['平年', '12 个月约 354 天'],
        ['闰月', '19 年 7 闰，使平均年长接近回归年'],
        ['节气', '太阳黄经每 15 度一个，共 24 个'],
        ['岁首', '以正月初一为春节']
      ],
      observe: ['春节日期在 1 月 21 日至 2 月 20 日之间浮动'],
      pro: '农历采用定朔定气：月首为朔，节气按太阳黄经确定；无中气之月置闰，是其与纯阴历的根本区别。',
      pop: '农历既看月亮（月份），也看太阳（节气），所以要用闰月把两者凑齐——这就是为什么春节每年日期都不一样。',
      sources: [{ n: '紫金山天文台历算', u: 'http://www.pmo.cas.cn/' }],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'chinese-asterism', type: 'concept', cn: '三垣二十八宿', en: 'Chinese Asterisms',
      aliases: ['三垣二十八宿', '二十八宿', '中国古代星座', '中国古代的星座', '中国星座', '星官', '紫微垣'],
      tag: '星座', status: 'established',
      summary: '中国古代把星空分为三垣（紫微、太微、天市）与二十八宿，另有数百个星官，与西方 88 星座体系不同。',
      facts: [
        ['三垣', '紫微垣、太微垣、天市垣'],
        ['二十八宿', '沿黄道与赤道划分的 28 个区域'],
        ['四象', '东方苍龙、北方玄武、西方白虎、南方朱雀'],
        ['星官', '约有 283 个星官、1464 颗星'],
        ['差异', '按星官与行政区划组织，而非几何分区']
      ],
      observe: ['牛郎织女、北斗、参宿等名称均来自中国星官体系'],
      pro: '二十八宿是不等分的赤道分区，起始宿与距度随年代变化；三垣以北极附近为中心，反映以中原观测者为中心的宇宙观。',
      pop: '古人把天空当成一个国家来管理：中间是皇宫（紫微垣），外面是官府与市场，再往外是二十八个「州」。',
      sources: [{ n: '中国科学院 / 古代星图', u: 'http://www.pmo.cas.cn/' }],
      confidence: 0.9, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'southern-sky', type: 'concept', cn: '南半球的星空', en: 'Southern Sky',
      aliases: ['南半球星空', '南天', '南十字', '大小麦哲伦云', '南天极'],
      tag: '星座', status: 'established',
      summary: '南半球看不到北极星，却拥有南十字、半人马座、大小麦哲伦云与银河最亮的银心段。',
      facts: [
        ['南天极', '附近无亮星，需靠南十字长轴指向'],
        ['南十字', '长轴延长约 4.5 倍指向南天极'],
        ['特有', '大小麦哲伦云、船底座大星云、南十字'],
        ['银河', '人马座—天蝎座方向最亮，南半球高悬'],
        ['中国可见', '北纬 25 度以南可低空看到南十字']
      ],
      observe: ['中国南方春季低空可见南十字与半人马 ω 星团'],
      pro: '南天极附近缺乏亮星，历史上南半球导航依赖南十字与麦哲伦云；大麦哲伦云距离约 16 万光年，是本星系群内的卫星星系。',
      pop: '南半球的人看不到北极星，但他们有南十字和两团「云」——那其实是两个星系。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'hawking-radiation', type: 'concept', cn: '霍金辐射', en: 'Hawking Radiation',
      aliases: ['霍金辐射', '黑洞蒸发', '黑洞会消失吗', '信息悖论'],
      tag: '宇宙', status: 'emerging',
      openQuestion: '霍金辐射尚未被观测证实；黑洞信息悖论仍未解决，量子引力理论尚无定论。',
      summary: '量子场论预言黑洞会以热辐射缓慢蒸发，温度与质量成反比；恒星级黑洞温度远低于宇宙微波背景，目前实际在吸热。',
      facts: [
        ['温度', '与质量成反比，太阳质量黑洞约 6×10⁻⁸ K'],
        ['寿命', '与质量三次方成正比，恒星级黑洞远超宇宙年龄'],
        ['现状', '未被观测证实'],
        ['悖论', '蒸发是否破坏信息，尚无共识'],
        ['提出', '霍金 1974 年']
      ],
      observe: ['无法直接观测，属于理论预言'],
      pro: '霍金温度对恒星质量黑洞远低于微波背景温度 2.7 K，因此当前净效果是吸收而非蒸发；原初小黑洞可能正在蒸发，但尚未探测到。',
      pop: '黑洞不是永生的，它会在极长时间里慢慢「漏」出能量。只不过对普通黑洞来说，这个过程慢到荒谬。',
      sources: [{ n: 'Hawking 1974, Nature', u: 'https://www.nature.com/' }],
      confidence: 0.6, freshness: 'static', updated: '2026-10',
      caution: '本条为理论预言，实验尚未验证。'
    },
    {
      id: 'lensing', type: 'concept', cn: '引力透镜', en: 'Gravitational Lensing',
      aliases: ['引力透镜', '爱因斯坦环', '微引力透镜', '强透镜'],
      tag: '宇宙', status: 'established',
      summary: '前景天体的引力弯曲背景光线，形成弧、环或多重像；弱透镜用于测绘暗物质，微透镜用于发现系外行星。',
      facts: [
        ['类型', '强透镜、弱透镜、微透镜'],
        ['验证', '1919 年日食观测证实光线偏折'],
        ['应用', '测量暗物质分布、哈勃常数、系外行星'],
        ['现象', '爱因斯坦环、四重像、巨弧'],
        ['尺度', '星系团可产生数十角秒的弧']
      ],
      observe: ['需大望远镜与巡天数据，业余可拍摄较亮的透镜弧'],
      pro: '偏折角与质量成正比、与冲击参数成反比；强透镜可反演质量分布，弱透镜通过形状相关统计约束宇宙学参数。',
      pop: '大质量天体像一块放大镜，把后面的星系拉成弧形。我们看不见暗物质，但能通过它「扭曲」的光看到它。',
      sources: [{ n: 'NASA/ESA Hubble', u: 'https://science.nasa.gov/universe/' }],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'retrograde', type: 'concept', cn: '行星逆行', en: 'Retrograde Motion',
      aliases: ['行星逆行', '水星逆行', '火星逆行', '逆行'],
      tag: '现象', status: 'established',
      summary: '行星在天空中周期性地「倒退」移动，是地球与行星公转速度差造成的视运动，并非行星真的反向。',
      facts: [
        ['成因', '地球公转速度与行星不同，产生视差式倒退'],
        ['火星周期', '约每 26 个月逆行一次，持续约 2 个月'],
        ['水星', '每年逆行 3–4 次，每次约 3 周'],
        ['本质', '视运动，非真实反向'],
        ['历史', '托勒密本轮曾用于解释']
      ],
      observe: ['逆行期间行星亮度与位置变化明显，可连续数周记录'],
      pro: '逆行是内外行星几何关系的必然结果，用日心模型可自然解释；占星中的「水逆」说法与此无关，不具天文学依据。',
      pop: '不是行星倒着走，是你坐的车超车时，旁边那辆车看起来在后退。',
      sources: [{ n: 'NASA Solar System', u: 'https://science.nasa.gov/solar-system/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10',
      caution: '本条仅解释视运动机制，不涉及占星。'
    },
    {
      id: 'space-telescopes', type: 'concept', cn: '哈勃与韦布的区别', en: 'Space Telescopes',
      aliases: ['哈勃望远镜', '韦布望远镜', '哈勃和韦布的区别', '哈勃和韦布有什么区别', '哈勃与韦布', '哈勃和韦布区别', 'JWST', '空间望远镜'],
      tag: '观测', status: 'established',
      summary: '哈勃以可见光与紫外为主、口径 2.4 米；韦布以红外为主、口径 6.5 米，位于日地 L2 点，专攻早期宇宙与大气光谱。',
      facts: [
        ['哈勃', '1990 年发射，2.4 米，可见/紫外/近红外'],
        ['韦布', '2021 年发射，6.5 米分段镜，0.6–28 微米红外'],
        ['位置', '韦布位于日地 L2，距地约 150 万公里'],
        ['优势', '红外可穿透尘埃，看到高红移星系'],
        ['成果', '深场、系外行星大气、恒星形成区']
      ],
      observe: ['两者都不做目视观测，数据公开可下载'],
      pro: '红外优势来自红移与尘埃消光：高红移星系的光被移到红外，且红外受尘埃消光更小；L2 的低温与遮阳板使探测器可被动冷却。',
      pop: '哈勃像「可见光的眼睛」，韦布像「热成像的眼睛」，专门看更远、更冷、被尘埃挡住的东西。',
      sources: [{ n: 'NASA JWST / Hubble', u: 'https://science.nasa.gov/mission/webb/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'star-naming', type: 'concept', cn: '星星是怎么命名的', en: 'Star Names',
      aliases: ['星星命名', '恒星命名', '拜耳命名', '弗兰斯蒂德', '买星星命名'],
      tag: '概念', status: 'established',
      summary: '亮星多用拜耳字母（α、β）加星座名，或弗兰斯蒂德序号；国际天文联合会是唯一有权正式命名天体的机构。',
      facts: [
        ['拜耳', '1603 年，希腊字母按亮度排序（有例外）'],
        ['弗兰斯蒂德', '数字编号，按赤经顺序'],
        ['变星', '专用命名（如 RR Lyrae）'],
        ['IAU', '2016 年起整理并公布官方星名'],
        ['商业命名', '不具备科学效力']
      ],
      observe: ['星图上的 α Ori 即猎户座 α，中文名参宿四'],
      pro: '拜耳命名在同一星座内按亮度分配，但受历史与分区影响并不严格；现代大巡天使用坐标标识作为唯一索引。',
      pop: '星星的名字有一套国际规则。花钱「买一颗星命名」只是纪念品，天文界并不承认。',
      sources: [{ n: 'IAU 星名工作组', u: 'https://www.iau.org/public/themes/naming/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'm87-shadow-2019', type: 'concept', cn: '人类首张黑洞照片', en: 'M87 Black Hole Image',
      aliases: ['黑洞照片', 'M87', '事件视界望远镜', 'EHT', '第一张黑洞', 'm87 黑洞'],
      tag: '前沿', status: 'established',
      summary: '2019 年事件视界望远镜（EHT）合作组发布 M87* 黑洞阴影照片，首次直接呈现黑洞事件视界附近的射电辐射结构。',
      facts: [
        ['时间', '2019 年 4 月 10 日发布'],
        ['目标', 'M87 星系中心超大质量黑洞 M87*'],
        ['质量', '约 65 亿倍太阳质量'],
        ['波段', '1.3 毫米射电波'],
        ['望远镜', '全球 8 台毫米波望远镜组网'],
        ['意义', '验证了广义相对论对阴影直径的预言']
      ],
      observe: ['业余设备无法分辨黑洞阴影，但可在 EHT 官网下载原始数据与图像'],
      pro: '阴影的角直径 ~42 微角秒，由视界尺度与黑洞质量、距离共同决定；亮环的不对称性源于吸积盘多普勒增亮与相对论性聚束。',
      pop: '2019 年，人类第一次「看见」黑洞：不是直接拍黑洞本体，而是拍到它周围炽热气体围成的亮环和中间暗影。',
      sources: [{ n: 'EHT Collaboration', u: 'https://eventhorizontelescope.org/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'gw150914-2015', type: 'concept', cn: '首次探测到引力波', en: 'GW150914',
      aliases: ['引力波', 'GW150914', 'LIGO', '双黑洞并合', '第一次引力波'],
      tag: '前沿', status: 'established',
      summary: '2015 年 9 月 14 日 LIGO 首次直接探测到双黑洞并合产生的引力波，开启了引力波天文学时代。',
      facts: [
        ['时间', '2015 年 9 月 14 日 09:50 UTC'],
        ['源', '距离约 13 亿光年的双黑洞并合'],
        ['质量', '约 36 倍与 29 倍太阳质量并合为 62 倍太阳质量黑洞'],
        ['信号', '持续约 0.2 秒，频率 35–250 Hz'],
        ['能量', '约 3 倍太阳质量以引力波形式释放'],
        ['诺贝尔奖', '2017 年授予 Weiss、Barish 与 Thorne']
      ],
      observe: ['引力波无法肉眼或普通望远镜观测，可关注 LIGO/Virgo 公开警报'],
      pro: 'GW150914 的波形与广义相对论数值模拟高度一致，证实了时空涟漪的存在，并为黑洞质量与自旋分布提供了新约束。',
      pop: '两个黑洞相撞时，把相当于三颗太阳的质量变成时空涟漪。LIGO 用激光「听到」了这声来自 13 亿年前的巨响。',
      sources: [{ n: 'LIGO Scientific Collaboration', u: 'https://www.ligo.org/' }],
      confidence: 0.98, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'voyager-interstellar-2012', type: 'concept', cn: '旅行者一号进入星际空间', en: 'Voyager 1 Interstellar',
      aliases: ['旅行者一号', '星际空间', 'voyager 1', '旅行者号'],
      tag: '探测', status: 'established',
      summary: '2012 年旅行者一号成为首个进入星际空间的人造探测器，携带着记录地球声音的「金唱片」飞向太阳系外。',
      facts: [
        ['发射', '1977 年 9 月 5 日'],
        ['越界', '2012 年 8 月 25 日穿越日球层顶'],
        ['距离', '截至 2020 年已超过 220 亿公里（约 150 AU）'],
        ['速度', '约 17 km/s'],
        ['任务', '外行星飞掠后进入星际任务'],
        ['现状', '电力衰减，预计 2025 年后逐渐关闭科学仪器']
      ],
      observe: ['旅行者号肉眼不可见；位置数据在 NASA 实时公开'],
      pro: '日球层顶是太阳风与星际介质压力平衡边界；旅行者 1 号等离子体数据确认了该边界的跨越。',
      pop: '它飞了 35 年，终于冲出太阳风的「气泡」，进入恒星之间的空间，带着我们的声音继续漂流。',
      sources: [{ n: 'NASA Voyager', u: 'https://voyager.jpl.nasa.gov/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'pluto-demotion-2006', type: 'concept', cn: '冥王星为什么被降级', en: 'Pluto Demotion',
      aliases: ['冥王星降级', '矮行星', '九大行星', '冥王星不是行星', 'IAU 2006'],
      tag: '概念', status: 'established',
      summary: '2006 年国际天文学联合会重新定义行星，冥王星因未能清空轨道附近天体而被归类为矮行星。',
      facts: [
        ['时间', '2006 年 8 月 24 日 IAU 大会决议'],
        ['行星定义', '绕太阳运行、呈流体静力平衡、清空轨道邻域'],
        ['冥王星问题', '柯伊伯带中存在质量相当的阋神星等天体'],
        ['新分类', '矮行星'],
        ['争议', '部分行星科学家认为该定义过于粗糙']
      ],
      observe: ['冥王星视星等约 14.3，需中等以上望远镜与暗空'],
      pro: '清空轨道的判据本质上是天体在太阳系形成过程中动态演化的结果；矮行星与行星在地质上可能有相似性，分类仍有讨论空间。',
      pop: '冥王星不是被「开除」，而是被归到了更合适的「矮行星」家族。就像把一颗大土豆和一群小土豆分到一个筐里。',
      sources: [{ n: 'IAU', u: 'https://www.iau.org/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'new-horizons-pluto-2015', type: 'concept', cn: '新视野号飞掠冥王星', en: 'New Horizons Pluto Flyby',
      aliases: ['新视野号', '新视野号冥王星', 'New Horizons', '冥王星近照'],
      tag: '探测', status: 'established',
      summary: '2015 年 7 月 14 日 NASA 新视野号探测器首次近距离飞掠冥王星，揭示了其复杂的地质与大气。',
      facts: [
        ['飞掠时间', '2015 年 7 月 14 日'],
        ['最近距离', '约 12,500 公里'],
        ['发现', '斯普尼克平原、水冰山脉、蓝色雾霾大气'],
        ['直径', '约 2376 公里'],
        ['卫星', '冥卫一卡戎等 5 颗已知卫星'],
        ['后续', '2019 年飞掠柯伊伯带天体 Arrokoth']
      ],
      observe: ['地面望远镜无法分辨冥王星表面细节，新视野号数据是主要来源'],
      pro: '冥王星展示活跃的地质活动与氮冰循环，挑战了「矮行星必然死寂」的假设；Arrokoth 的接触双星形态为吸积理论提供了直接样本。',
      pop: '我们给冥王星拍了第一张高清证件照：有心形冰原、高山和薄雾。它比我们以为的更有趣。',
      sources: [{ n: 'NASA New Horizons', u: 'https://science.nasa.gov/mission/new-horizons/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'accelerating-universe-1998', type: 'concept', cn: '宇宙加速膨胀的发现', en: 'Accelerating Universe',
      aliases: ['加速膨胀', '暗能量发现', '宇宙加速', '1998 超新星', 'Riess', 'Perlmutter'],
      tag: '前沿', status: 'established',
      summary: '1998 年两个超新星团队通过高红移 Ia 型超新星发现宇宙膨胀在加速，由此提出暗能量的存在。',
      facts: [
        ['团队', 'High-z SN Search Team 与 Supernova Cosmology Project'],
        ['方法', 'Ia 型超新星作为标准烛光测距'],
        ['结果', '遥远超新星比预期更暗，暗示膨胀加速'],
        ['诺贝尔奖', '2011 年授予 Perlmutter、Schmidt 与 Riess'],
        ['能量占比', '暗能量约占宇宙总能量密度的 68%']
      ],
      observe: ['需要大口径望远镜与长时间曝光拍摄高红移超新星'],
      pro: '加速膨胀意味着状态方程参数 w ≈ −1，与宇宙学常数 Λ 一致；后续 CMB、重子声学振荡与超新星的联合约束进一步确认了 ΛCDM。',
      pop: '宇宙不仅在变大，而且越变越快。这就像把皮球往上扔，它却越飞越快——必然有什么在推它，我们叫它暗能量。',
      sources: [{ n: 'Nobel Prize / NASA', u: 'https://science.nasa.gov/astrophysics/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'exoplanet-51peg-1995', type: 'concept', cn: '第一颗围绕类太阳恒星的系外行星', en: '51 Pegasi b',
      aliases: ['51 Pegasi b', '飞马座51b', '第一颗系外行星', ' Mayor', 'Queloz'],
      tag: '探测', status: 'established',
      summary: '1995 年 Mayor 与 Queloz 发现 51 Pegasi b，这是首颗围绕类太阳恒星运行的系外行星，开启了系外行星时代。',
      facts: [
        ['时间', '1995 年 10 月发表'],
        ['方法', '径向速度法（多普勒法）'],
        ['周期', '约 4.23 天'],
        ['质量', '约 0.46 倍木星质量'],
        ['类型', '热木星，轨道距离极近'],
        ['诺贝尔奖', '2019 年授予 Mayor 与 Queloz']
      ],
      observe: ['该星肉眼不可见，需用分光技术测量恒星视向速度摆动'],
      pro: '径向速度法通过恒星谱线的周期性多普勒位移推断行星质量与轨道；51 Peg b 的发现说明热木星可存在于极近轨道，挑战了行星形成模型。',
      pop: '1995 年，天文学家在一颗类似太阳的恒星旁发现了一颗巨大行星。它离恒星非常近，一年只有 4 天。',
      sources: [{ n: 'NASA Exoplanet Exploration', u: 'https://science.nasa.gov/exoplanets/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'hubble-launch-1990', type: 'concept', cn: '哈勃空间望远镜', en: 'Hubble Space Telescope',
      aliases: ['哈勃望远镜', 'HST', 'Hubble', '哈勃发射'],
      tag: '探测', status: 'established',
      summary: '1990 年发射的哈勃空间望远镜摆脱了大气扰动，在近 30 年里彻底改变了恒星、星系与宇宙学的研究。',
      facts: [
        ['发射', '1990 年 4 月 24 日由发现号航天飞机部署'],
        ['口径', '2.4 米'],
        ['轨道', '约 540 公里高度'],
        ['早期问题', '主镜球差，1993 年修复后恢复设计分辨率'],
        ['代表成果', '深场、超深场、宇宙加速膨胀、系外行星大气'],
        ['继任', '詹姆斯·韦布空间望远镜']
      ],
      observe: ['哈勃数据公开，可在 MAST 档案库检索'],
      pro: '哈勃在紫外–近红外波段提供稳定衍射极限成像，其深场通过长时间曝光揭示了高红移星系形态与宇宙恒星形成史。',
      pop: '它飘在地球大气层外，用 30 年时间拍下无数张改变教科书的照片。没有它，我们对宇宙的年龄和大小认识会晚很多年。',
      sources: [{ n: 'NASA Hubble', u: 'https://science.nasa.gov/mission/hubble/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'cobe-1989', type: 'concept', cn: 'COBE 卫星与 CMB 黑体谱', en: 'COBE CMB',
      aliases: ['COBE', '宇宙背景探测者', 'CMB 黑体谱', '宇宙微波背景', '1992 CMB'],
      tag: '探测', status: 'established',
      summary: '1989 年 COBE 卫星首次精确测量宇宙微波背景辐射的黑体谱，并在 1992 年发现温度涨落，为大爆炸理论提供了关键证据。',
      facts: [
        ['发射', '1989 年 11 月 18 日'],
        ['发现者', 'Smoot 与 Mather 获 2006 年诺贝尔物理学奖'],
        ['温度', '2.725 K，符合黑体辐射谱'],
        ['涨落', '约 10^-5 量级'],
        ['意义', '验证大爆炸，为结构形成提供种子']
      ],
      observe: ['CMB 需射电望远镜或专用卫星探测，肉眼不可见'],
      pro: 'COBE FIRAS 数据显示 CMB 光谱与 2.725 K 黑体几乎完全一致，排除了稳态宇宙等替代模型；DMR 数据给出大尺度各向异性。',
      pop: 'COBE 证明了宇宙微波背景不是普通的热辐射，而是大爆炸留下的余晖，而且里面藏着后来形成星系和星团的微小起伏。',
      sources: [{ n: 'NASA COBE', u: 'https://lambda.gsfc.nasa.gov/product/cobe/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'cmb-discovery-1965', type: 'concept', cn: '宇宙微波背景的发现', en: 'CMB Discovery',
      aliases: ['宇宙微波背景发现', 'Penzias Wilson', '1965 CMB', '背景辐射'],
      tag: '探测', status: 'established',
      summary: '1965 年 Penzias 与 Wilson 意外发现来自全天的微波背景辐射，被视为大爆炸宇宙学的决定性证据之一。',
      facts: [
        ['时间', '1965 年'],
        ['设备', '贝尔实验室 20 英尺号角天线'],
        ['温度', '约 3 K'],
        ['噪声来源', '来自宇宙各向同性的微波辐射'],
        ['诺贝尔奖', '1978 年授予 Penzias 与 Wilson']
      ],
      observe: ['可用小型射电望远镜或卫星数据感知'],
      pro: 'CMB 的各向同性、黑体谱和大角尺度特征与热大爆炸模型预期一致；其发现终结了稳态宇宙学的统治地位。',
      pop: '两位工程师调试天线时，发现无论指向哪里都有消除不掉的「噪声」。那正是大爆炸留下的余晖，标志着现代宇宙学的开端。',
      sources: [{ n: 'Nobel Prize', u: 'https://www.nobelprize.org/prizes/physics/1978/summary/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'kepler-mission', type: 'concept', cn: '开普勒任务', en: 'Kepler Mission',
      aliases: ['开普勒望远镜', 'Kepler', '开普勒卫星', '凌星法'],
      tag: '探测', status: 'established',
      summary: '2009 年发射的开普勒空间望远镜通过凌星法发现了数千颗系外行星，首次给出银河系行星数量的统计估计。',
      facts: [
        ['发射', '2009 年 3 月 6 日'],
        ['方法', '凌星法：测量恒星亮度周期性下降'],
        ['发现', '超过 2600 颗确认行星'],
        ['结论', '银河系内行星比恒星更多'],
        ['后续', 'K2 任务延续至 2018 年']
      ],
      observe: ['业余可尝试测量已知的亮星凌星（如 HD 189733）'],
      pro: '开普勒通过长期测光获得行星半径与轨道；统计上大多数恒星都有行星，类地行星在宜居带中亦不少见。',
      pop: '它盯住一片天区看了好几年，捕捉行星从恒星前面经过时引起的微弱变暗。结果告诉我们：几乎每颗恒星都可能有行星。',
      sources: [{ n: 'NASA Kepler', u: 'https://science.nasa.gov/mission/kepler/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'trappist-1-2017', type: 'concept', cn: 'TRAPPIST-1 行星系统', en: 'TRAPPIST-1',
      aliases: ['TRAPPIST-1', 'Trappist', '七颗类地行星', 'TRAPPIST'],
      tag: '探测', status: 'established',
      summary: '2017 年天文学家宣布在 39 光年外的超冷矮星 TRAPPIST-1 周围发现 7 颗类地行星，其中多颗位于宜居带。',
      facts: [
        ['距离', '约 39 光年'],
        ['恒星', '超冷红矮星，质量约 0.09 倍太阳'],
        ['行星', '7 颗，大小与地球相近'],
        ['宜居带', 'e、f、g 三颗可能允许液态水存在'],
        ['观测', ' Spitzer 与地基望远镜联合凌星观测']
      ],
      observe: ['TRAPPIST-1 肉眼不可见，需中型望远镜'],
      pro: 'TRAPPIST-1 是研究类地行星大气的理想目标；JWST 已对其进行透射光谱观测，寻找大气成分。',
      pop: '39 光年外有颗小红星，围着 7 颗地球大小的行星。它们挤得很近，如果站在其中一颗上看，邻居会像月亮一样大。',
      sources: [{ n: 'NASA Exoplanet', u: 'https://science.nasa.gov/exoplanets/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'apollo-11-1969', type: 'concept', cn: '阿波罗 11 号登月', en: 'Apollo 11',
      aliases: ['阿波罗11', '登月', '尼尔阿姆斯特朗', '月球登陆', '1969 登月'],
      tag: '探测', status: 'established',
      summary: '1969 年 7 月 20 日阿波罗 11 号实现人类首次载人登月，Armstrong 与 Aldrin 在月面停留约 21.5 小时。',
      facts: [
        ['日期', '1969 年 7 月 20 日'],
        ['宇航员', 'Armstrong、Aldrin、Collins'],
        ['着陆点', '静海'],
        ['月面活动', '约 2.5 小时舱外活动'],
        ['带回样品', '约 21.5 公斤月球岩石'],
        ['后续', '阿波罗 12–17 号共 6 次成功登月']
      ],
      observe: ['可用小型望远镜观看登月遗址附近，但无法分辨遗迹'],
      pro: '阿波罗带回的月样通过同位素定年将月球年龄锁定在约 45 亿年，并支持大碰撞起源说。',
      pop: '1969 年，人类第一次踏上另一颗天体。阿姆斯特朗说：「这是个人的一小步，却是人类的一大步。」',
      sources: [{ n: 'NASA Apollo', u: 'https://www.nasa.gov/history/apollo-11/' }],
      confidence: 0.98, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'iss-1998', type: 'concept', cn: '国际空间站', en: 'International Space Station',
      aliases: ['国际空间站', 'ISS', '空间站', '载人航天'],
      tag: '探测', status: 'established',
      summary: '国际空间站自 1998 年开始在轨组装，是长期在轨的载人空间实验室，也是夜空中最亮的人造天体之一。',
      facts: [
        ['首个模块', '1998 年 11 月发射曙光号'],
        ['轨道', '约 400 公里，倾角 51.6°'],
        ['常驻人员', '通常 7 人'],
        ['视星等', '最亮可达 −5.9 等'],
        ['科学成果', '微重力物理、人体生理学、地球观测']
      ],
      observe: ['肉眼可见为快速移动的亮点，可用 Heavens-Above 查过境时间'],
      pro: 'ISS 的轨道参数使其在黄昏前后被阳光照亮时，可在地面肉眼观测；其亮度取决于太阳能电池板朝向与相位角。',
      pop: '如果你看到天空中有一颗很亮的「星星」在快速移动，那很可能是国际空间站。它在 400 公里高处绕着地球跑。',
      sources: [{ n: 'NASA ISS', u: 'https://www.nasa.gov/international-space-station/' }],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'chelyabinsk-meteor-2013', type: 'concept', cn: '车里雅宾斯克陨石事件', en: 'Chelyabinsk Meteor',
      aliases: ['车里雅宾斯克', '俄罗斯陨石', '2013 陨石', '火流星'],
      tag: '现象', status: 'established',
      summary: '2013 年 2 月 15 日一颗约 17–20 米的小行星在俄罗斯车里雅宾斯克上空爆炸，造成约 1600 人受伤，是近代规模最大的撞击事件之一。',
      facts: [
        ['时间', '2013 年 2 月 15 日'],
        ['尺寸', '约 17–20 米，质量约 1.1 万吨'],
        ['能量', '爆炸当量约 50 万吨 TNT'],
        ['高度', '约 30 公里空中解体'],
        ['伤亡', '约 1600 人，多因碎玻璃受伤'],
        ['预警', '事发前未被探测到']
      ],
      observe: ['类似事件无法预测，可通过全天监测网提高预警能力'],
      pro: '该事件属于阿波罗型近地小行星；其进入角、速度与空爆高度符合 10 米级石质小行星的典型物理模型。',
      pop: '一颗房子大小的小行星在俄罗斯上空爆炸，冲击波震碎了无数窗户。它提醒我们：地球并非真空中的孤岛。',
      sources: [{ n: 'NASA JPL', u: 'https://cneos.jpl.nasa.gov/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'solar-eclipse-2017', type: 'concept', cn: '2017 年美国日全食', en: '2017 Total Solar Eclipse',
      aliases: ['2017 日全食', '美国日全食', 'Great American Eclipse'],
      tag: '现象', status: 'established',
      summary: '2017 年 8 月 21 日的日全食横贯美国本土，是自 1918 年以来首次从西岸到东岸跨越美国的大陆日全食。',
      facts: [
        ['日期', '2017 年 8 月 21 日'],
        ['全食带', '从美国俄勒冈到南卡罗来纳'],
        ['最长全食', '约 2 分 40 秒'],
        ['观测人数', '估计数千万人观看'],
        ['科学价值', '日冕、日珥与重力偏折验证']
      ],
      observe: ['日全食需用巴德膜或专用日食眼镜；全食阶段可用肉眼直接观看日冕'],
      pro: '此次日全食为公众科普与大气/日冕研究提供了难得机会；全食带内观测条件与天气密切相关。',
      pop: '一条黑暗的影子从美国西海岸跑到东海岸，数千万人停下工作抬头看太阳被月亮完全遮住。那是 2017 年最壮观的天象。',
      sources: [{ n: 'NASA Eclipse', u: 'https://science.nasa.gov/eclipses/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'comet-neowise-2020', type: 'concept', cn: '新智彗星 NEOWISE', en: 'Comet NEOWISE',
      aliases: ['新智彗星', 'NEOWISE', 'C/2020 F3', '2020 彗星'],
      tag: '现象', status: 'established',
      summary: '2020 年 3 月发现的 C/2020 F3（NEOWISE）彗星于 7 月成为肉眼可见的大彗星，北半球观测条件极佳。',
      facts: [
        ['发现', '2020 年 3 月 27 日 by NEOWISE 卫星'],
        ['近日点', '2020 年 7 月 3 日，距日约 0.29 AU'],
        ['亮度', '肉眼可见，约 1–2 等'],
        ['周期', '约 6700 年'],
        ['特征', '两条彗尾：尘埃尾与离子尾']
      ],
      observe: ['2020 年 7 月北半球傍晚西方低空肉眼可见，双筒望远镜效果尤佳'],
      pro: 'NEOWISE 的彗核直径约 5 公里，其亮度爆发由近日点挥发驱动；尘埃尾受辐射压弯曲，离子尾沿太阳风方向伸展。',
      pop: '2020 年夏天，一颗彗星拖着长长的尾巴出现在傍晚的天空。很多人拿起手机拍到了它，是多年来最亮的大彗星之一。',
      sources: [{ n: 'NASA NEOWISE', u: 'https://science.nasa.gov/mission/neowise/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'supernova-1987a', type: 'concept', cn: '超新星 1987A', en: 'SN 1987A',
      aliases: ['1987A', '超新星 1987A', '大麦哲伦云超新星', 'SN1987A'],
      tag: '现象', status: 'established',
      summary: '1987 年大麦哲伦云中爆发的 SN 1987A 是近代最接近的超新星，首次探测到超新星中微子，为恒星坍缩模型提供了关键证据。',
      facts: [
        ['时间', '1987 年 2 月 23 日'],
        ['位置', '大麦哲伦云，距地球约 16.8 万光年'],
        ['前身星', '蓝超巨星 Sanduleak −69° 202'],
        ['中微子', 'Kamiokande 与 IMB 探测到约 25 个中微子'],
        ['亮度', '最亮约 2.9 等'],
        ['遗迹', '现在可观测到膨胀的三环结构']
      ],
      observe: ['位于南天，需南半球或低纬度观测；现已需大望远镜'],
      pro: 'SN 1987A 确认了 II 型超新星由大质量恒星核坍缩触发；中微子 burst 与光信号的时间差验证了恒星坍缩基本时标。',
      pop: '1987 年，南半球的人们用肉眼看到一颗「新」恒星。它其实是一颗巨大恒星死亡时的爆炸，还送来了第一批超新星中微子。',
      sources: [{ n: 'NASA Hubble', u: 'https://science.nasa.gov/mission/hubble/science/sn-1987a/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'crab-nebula-1054', type: 'concept', cn: '蟹状星云与 1054 年超新星', en: 'Crab Nebula Supernova',
      aliases: ['蟹状星云', '1054 超新星', '天关客星', '客星'],
      tag: '现象', status: 'established',
      summary: '1054 年中国宋代天文学家记录的「天关客星」就是形成蟹状星云的超新星爆发，其中心留下了一颗脉冲星。',
      facts: [
        ['记录', '中国北宋《宋会要》等记载「客星出天关东南」'],
        ['可见期', '白天可见约 23 天，夜间可见约 653 天'],
        ['距离', '约 6500 光年'],
        ['遗迹', '蟹状星云 M1'],
        ['中心', '蟹状星云脉冲星，每秒自转约 30 圈']
      ],
      observe: ['M1 是梅西耶星表第一号，冬季北方夜空可用望远镜观测'],
      pro: '蟹状星云是研究超新星遗迹与脉冲星风星云相互作用的理想实验室；其膨胀速率与 1054 年记录一致。',
      pop: '近千年前，中国天文学家记录了一颗突然变亮的客星。今天我们称它为蟹状星云，中心还住着一颗飞速自转的中子星。',
      sources: [{ n: 'NASA Chandra', u: 'https://chandra.harvard.edu/photo/0052/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'oort-cloud', type: 'concept', cn: '奥尔特云', en: 'Oort Cloud',
      aliases: ['奥尔特云', 'Oort cloud', '彗星的故乡'],
      tag: '概念', status: 'established',
      summary: '奥尔特云是包围太阳系的球形彗星云团，被认为是长周期彗星的来源地，距离太阳约 2000–100000 AU。',
      facts: [
        ['提出', '1950 年由 Jan Oort 提出'],
        ['范围', '约 2000–100000 AU'],
        ['组成', '数十亿颗冰质小天体'],
        ['证据', '长周期彗星轨道特征'],
        ['未直接成像', '目前尚无直接观测证据']
      ],
      observe: ['无法直接观测，通过长周期彗星轨道推断'],
      pro: '奥尔特云是太阳系早期剩余物质的引力束缚残留；其球形分布反映了形成后受银河系潮汐与近距离恒星扰动的长期演化。',
      pop: '如果把太阳系比作一个小区，奥尔特云就是小区外围一片极其稀疏的「冰库」，偶尔甩出一块冰，就成了我们看到的彗星。',
      sources: [{ n: 'NASA Solar System', u: 'https://science.nasa.gov/solar-system/' }],
      confidence: 0.90, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'fast-radio-bursts', type: 'concept', cn: '快速射电暴', en: 'Fast Radio Bursts',
      aliases: ['快速射电暴', 'FRB', '射电暴'],
      tag: '前沿', status: 'emerging',
      summary: '快速射电暴是毫秒级、极其明亮的射电瞬变现象，2007 年首次发现；部分可重复爆发，起源仍是前沿课题。',
      facts: [
        ['首次发现', '2007 年由 Lorimer 等人分析 Parkes 数据发现'],
        ['特征', '毫秒级，能量可达太阳数天总输出'],
        ['重复源', 'FRB 121102 于 2016 年确认重复'],
        ['定位', '部分定位到宿主星系'],
        ['候选机制', '磁星耀发、中子星并合等']
      ],
      observe: ['需大型射电望远镜，业余无法直接接收'],
      pro: 'FRB 的色散量可用于探测星系际电子柱密度；其爆发机制尚未统一，磁星模型对重复暴解释较好。',
      pop: '宇宙中偶尔会闪过几毫秒极强的射电波。我们不知道它们具体是什么，但已经能定位到它们所在的星系。',
      sources: [{ n: 'CHIME / Nature', u: 'https://www.nature.com/subjects/fast-radio-bursts' }],
      confidence: 0.88, freshness: 'active', updated: '2026-10',
      openQuestion: 'FRB 的完整能源机制与重复性起源仍在研究中。'
    },
    {
      id: 'neutron-star', type: 'concept', cn: '中子星', en: 'Neutron Star',
      aliases: ['中子星', 'neutron star', '致密星体'],
      tag: '概念', status: 'established',
      summary: '中子星是大质量恒星超新星爆发后留下的致密核心，直径约 20 公里，质量接近太阳，一茶匙物质可达数亿吨。',
      facts: [
        ['密度', '约 10^17 kg/m^3'],
        ['直径', '约 20 公里'],
        ['质量', '约 1.4–2 倍太阳质量'],
        ['形成', 'II 型超新星坍缩核心'],
        ['观测', '脉冲星、X 射线双星']
      ],
      observe: ['脉冲星可用射电望远镜观测，部分 X 射线双星可用 X 射线卫星'],
      pro: '中子星由简并中子压力支撑，接近托尔曼-奥本海默-沃尔科夫极限；其 crust 与超流核为极端物理提供了天然实验室。',
      pop: '一颗恒星爆炸后，核心被压成直径只有城市大小、密度大得不可思议的球。转得快的中子星会像灯塔一样发射射电脉冲。',
      sources: [{ n: 'NASA', u: 'https://science.nasa.gov/astrophysics/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'magnetar', type: 'concept', cn: '磁星', en: 'Magnetar',
      aliases: ['磁星', 'magnetar', '软伽马重复体'],
      tag: '概念', status: 'established',
      summary: '磁星是一类磁场极强（10^14–10^15 高斯）的中子星，能释放剧烈的 X 射线与伽马射线暴。',
      facts: [
        ['磁场', '比地球磁场强数万亿倍'],
        ['类型', '软伽马重复体 SGR、反常 X 射线脉冲星AXP'],
        ['能量来源', '磁场衰变与 crust 形变'],
        ['距离', '多数位于银河系内'],
        ['影响', '2004 年 SGR 1806-20 耀发曾影响地球电离层']
      ],
      observe: ['需 X 射线与伽马射线望远镜'],
      pro: '磁星的超强磁场导致持续的磁层扭曲与耀发；其爆发能量来自磁场释放而非吸积或自转减速。',
      pop: '磁星是宇宙中磁场最强的天体。如果把一颗磁星放在月球位置，它会擦掉地球上所有信用卡的磁条。',
      sources: [{ n: 'NASA / Swift', u: 'https://science.nasa.gov/mission/swift/' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'pulsar', type: 'concept', cn: '脉冲星', en: 'Pulsar',
      aliases: ['脉冲星', 'pulsar', '中子星脉冲'],
      tag: '概念', status: 'established',
      summary: '脉冲星是高速自转的中子星，其磁轴辐射束周期性扫过地球，像宇宙灯塔一样精确。',
      facts: [
        ['发现', '1967 年由 Bell 与 Hewish 发现'],
        ['周期', '毫秒至数秒'],
        ['精度', '部分脉冲星计时精度堪比原子钟'],
        ['应用', '检验引力波、导航、测定星际介质'],
        ['诺贝尔奖', '1974 年授予 Hewish']
      ],
      observe: ['需射电望远镜，部分也可在 X 射线波段观测'],
      pro: '脉冲星的周期变化可用于探测低频引力波背景；双脉冲星系统提供了广义相对论最精密的检验之一。',
      pop: '脉冲星就像宇宙的钟表：一颗中子星飞快自转，把射电束一次次扫过地球，我们收到极有规律的「滴答」。',
      sources: [{ n: 'Jodrell Bank', u: 'https://www.jb.man.ac.uk/pulsar/' }],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'bortle-scale', type: 'concept', cn: '波特尔暗空分类', en: 'Bortle Scale',
      aliases: ['波特尔', 'Bortle', '光害等级', '暗空等级'],
      tag: '观测', status: 'established',
      summary: '波特尔等级把夜空亮度分为 1–9 级，1 级为最暗原始天空，9 级为市中心天空，是天文爱好者评估观测地的常用标准。',
      facts: [
        ['提出', '2001 年由 John Bortle 提出'],
        ['1 级', '肉眼可见约 7 等星，银河极亮'],
        ['4 级', '郊区，银河仍可见但细节损失'],
        ['7–9 级', '城市，仅能看亮星与行星'],
        ['测量', '可用 SQM 亮度计定量']
      ],
      observe: ['选择 Bortle 1–3 级地点可获得最佳深空与银河摄影效果'],
      pro: '波特尔等级基于肉眼可见最暗星等、黄道光和银河可见度综合评定；与 SQM 读数有对应关系但并非线性。',
      pop: '想拍银河？先看波特尔等级：市区 8–9 级基本没戏，开车到郊区 3–4 级，银河就出来了。',
      sources: [{ n: 'Sky & Telescope', u: 'https://skyandtelescope.org/' }],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'choosing-first-telescope', type: 'concept', cn: '第一台天文望远镜怎么选', en: 'First Telescope',
      aliases: ['入门望远镜', '第一台望远镜', '望远镜选购', '新手望远镜'],
      tag: '观测', status: 'established',
      summary: '新手选镜应优先考虑口径、便携性与目标：双筒望远镜适合扫视星座，牛顿反射镜性价比高，折射镜维护简单。',
      facts: [
        ['口径优先', '相同条件下口径越大集光力越强'],
        ['双筒', '7×50 或 10×50 适合星座、银河、星团'],
        ['反射镜', '牛顿式性价比高，适合深空'],
        ['折射镜', '维护少，适合行星与月球'],
        ['折反', '便携但价格较高'],
        ['赤道仪', '跟踪摄影必需，目视可先用经纬仪']
      ],
      observe: ['先用双筒熟悉星空，再根据需要升级望远镜'],
      pro: '集光力与分辨率随口径增大；但对初学者，易用性与暗空可达性往往比口径更重要。',
      pop: '不要一上来就买最大口径。先问问自己要看什么、能去哪儿看，以及愿不愿意扛着它出门。双筒往往比大镜更实用。',
      sources: [{ n: 'Sky & Telescope', u: 'https://skyandtelescope.org/' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'meteor-shower-basics', type: 'concept', cn: '流星雨观测指南', en: 'Meteor Showers',
      aliases: ['流星雨', '英仙座流星雨', '双子座流星雨', '象限仪座流星雨'],
      tag: '观测', status: 'established',
      summary: '流星雨是地球穿过彗星遗留尘埃带时，大量流星看似从天空中某一点（辐射点）射出的现象。',
      facts: [
        ['三大流星雨', '象限仪座、英仙座、双子座'],
        ['英仙座', '8 月 12–13 日左右，ZHR 约 100'],
        ['双子座', '12 月 13–14 日左右，ZHR 约 150'],
        ['最佳时间', '午夜后至黎明前，无月暗夜'],
        ['观测方式', '躺平目视，无需望远镜']
      ],
      observe: ['选择开阔、暗空地点，保暖，给眼睛 20 分钟暗适应'],
      pro: 'ZHR 是在理想条件下每小时可见流星数；实际观测受光害、天气、辐射点高度与月球影响显著。',
      pop: '看流星雨不需要望远镜，躺着用眼睛就行。关键在于远离灯光、保持耐心，以及别玩手机让眼睛适应黑暗。',
      sources: [{ n: 'IMO', u: 'https://www.imo.net/' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },

    /* ============================================================
       NADC（国家天文科学数据中心 / China-VO）公开数据条目
       数据均来自 nadc.china-vo.org 已公开发布的数据集页面，
       标注 DOI/CSTR 与获取方式；FAST 系列需邮件申请，已明确注明。
       ============================================================ */
    {
      id: 'lamost-survey', type: 'concept', cn: '郭守敬望远镜光谱巡天', en: 'LAMOST Survey',
      aliases: ['LAMOST', '郭守敬望远镜', '国科大', '光谱巡天', '大天区多目标光纤光谱天文望远镜'],
      tag: '巡天', status: 'established',
      summary: 'LAMOST 是我国自主研制的 500 米口径有效口径口径光谱巡天望远镜，现役光谱获取率居世界首位，NADC 为其提供从原始数据到产品数据归档、发布、在线分析的全生命周期服务。',
      facts: [
        ['口径', '有效口径 3.6–4.9 米，固定指向式'],
        ['定位', '世界光谱获取率最高的望远镜之一'],
        ['数据发布', 'DR8–DR14 多次数据发布，NADC 收录 71 个相关数据集'],
        ['数据规模', '每版发布包含低分辨率与中分辨率光谱及恒星参数星表'],
        ['标识', '各数据版本带 DOI 与 CSTR 双标识'],
        ['获取方式', '公开下载（NADC 资源页与官方发布站）']
      ],
      observe: ['光谱巡天数据体量极大，业余可从公开数据中取样做研究练习'],
      pro: 'LAMOST 采用反射式修正望远镜加主动变形镜，可同时完成上千条光纤光谱；其恒星参数与化学丰度产品支撑了银河系演化与系外行星研究。',
      pop: '它一次能同时看住几千个天体的「指纹」，是国产的「光谱之王」，观测数据由国家天文科学数据中心统一管理。',
      sources: [{ n: 'NADC · LAMOST 数据集', u: 'https://nadc.china-vo.org/res/resource' }, { n: 'LAMOST 官方', u: 'http://www.lamost.org' }],
      confidence: 0.94, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'lamost-dr14', type: 'concept', cn: 'LAMOST 第 14 次数据发布', en: 'LAMOST DR14',
      aliases: ['LAMOST DR14', 'LAMOST 第14次数据发布', 'DR14'],
      tag: '巡天', status: 'established',
      summary: 'NADC 已收录 LAMOST 第 14 次数据发布第 0 版及配套产品，为研究提供最新一轮公开光谱样本。',
      facts: [
        ['版本', 'DR14 v0（第 14 次数据发布）'],
        ['内容', '低分辨率与中分辨率光谱、恒星参数与化学丰度星表'],
        ['发布', '经 NADC 统一发布，带 DOI / CSTR'],
        ['获取方式', '公开下载']
      ],
      observe: ['下载后可自行绘制光谱能量分布、比对 Hα 特征'],
      pro: 'DR 系列版本号以 DR + 顺序号表示，v0 为首次发布、后续为修订版；引用时须写明具体版本与数据处理流水线。',
      pop: '每次「数据发布」就像更新一次大合照：老照片修好瑕疵，又补进新拍的一部分。',
      sources: [{ n: 'NADC · LAMOST DR14', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.92, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'fast-hi-survey', type: 'concept', cn: 'FAST 中性氢巡天与开放运行', en: 'FAST HI Survey',
      aliases: ['FAST', '中国天眼', '500米口径球面射电望远镜', '中性氢巡天', 'FASHI'],
      tag: '设施', status: 'established',
      summary: '500 米口径球面射电望远镜 FAST 是世界最大单口径、最灵敏的射电望远镜，2016 年落成、2020 年通过国家验收，NADC 为其提供数据管理、归档与分析支撑；其部分科学数据需向 FAST 数据中心申请。',
      facts: [
        ['口径', '500 米，主动反射面'],
        ['落成 / 验收', '2016 年 9 月落成，2020 年 1 月通过国家验收'],
        ['数据量', 'NADC 收录 FAST 相关数据集 29 个（含 FAST 科学数据第 26 批）'],
        ['中性氢巡天', 'FASHI DR1 / DR2；中国天眼中性氢巡天已发布第二次数据'],
        ['获取方式', 'FAST 科学数据需邮件联系 fastdc@nao.cas.cn 申请'],
        ['配套服务', 'NADC 提供数据管理、传输、归档、备份与数据挖掘支撑']
      ],
      observe: ['业余无法直接观测 FAST，但可用其数据做脉冲星与谱线研究'],
      pro: 'FAST 的灵敏度与频率覆盖使中性氢测速、脉冲星计时与氢谱线搜寻达到前所未有的深度；数据体量巨大，需专线式归档与联合挖掘。',
      pop: '「中国天眼」把 300 副反射面拼成一只 500 米的大碗，能听见宇宙里极其微弱的中性氢信号。',
      sources: [{ n: 'NADC · FAST 数据', u: 'https://nadc.china-vo.org/res/resource' }, { n: 'FAST 官方', u: 'https://fast.bao.ac.cn' }],
      confidence: 0.94, freshness: 'active', updated: '2026-10',
      caution: 'FAST 科学数据需向 FAST 数据中心申请后获取，并非全部直链下载。'
    },
    {
      id: 'cpta-pulsar-timing', type: 'concept', cn: 'CPTA 脉冲星测时阵列', en: 'CPTA',
      aliases: ['CPTA', '脉冲星测时阵列', '脉冲星计时', 'PTA', '纳赫兹引力波'],
      tag: '探测', status: 'emerging',
      summary: 'CPTA 利用 FAST 与云南等台的射电望远镜组成脉冲星测时阵列，通过纳赫兹级脉冲到达时间抖动搜寻纳赫兹引力波，目前处于持续观测与数据分析阶段。',
      facts: [
        ['组成', '以 FAST 为核心的多台站脉冲星测时阵列'],
        ['数据', 'CPTA DR1 已在 NADC 发布'],
        ['目标', '纳赫兹引力波背景与超大质量双黑洞并合'],
        ['难度', '计时精度需达到纳秒量级，系统误差需精确建模'],
        ['获取方式', '公开发布 / 联系申请']
      ],
      observe: ['数据处理依赖专用软件，个人难以复现'],
      pro: '脉冲星计时阵列的残余时间残差中若存在特定空间相关分量，即为纳赫兹引力波的候选信号；当前结论仍属前沿探索阶段。',
      pop: '把几十台射电望远镜当成一个巨大的秒表，盯着宇宙深处快速转动的中子星；如果它们「一起慢下来」，就说明有看不见的引力波穿过。',
      sources: [{ n: 'NADC · CPTA 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.86, freshness: 'active', updated: '2026-10',
      openQuestion: '纳赫兹引力波背景是否存在及其频谱形状仍是前沿未决问题。'
    },
    {
      id: 'gaia-dr3', type: 'concept', cn: '盖亚第三次数据释放', en: 'Gaia DR3',
      aliases: ['Gaia', '盖亚', 'Gaia DR3', '盖亚卫星', '欧洲空间局盖亚'],
      tag: '巡天', status: 'established',
      summary: 'ESA 的 Gaia 天体测量卫星第三次数据释放把天体测量、星表与低分辨率光谱归档整合发布，NADC 提供其镜像与衍生星表，涵盖约 14.7 亿颗恒星。',
      facts: [
        ['机构', '欧洲空间局 ESA'],
        ['规模', '约 14.7 亿颗恒星的星表'],
        ['内容', '天体测量位置与视差、测光、低分辨率光谱（BP/RP）'],
        ['衍生产品', 'Gaia EDR3 距离星表等，NADC 收录 7 个相关数据集'],
        ['许可', '部分衍生产品（如 Gaia-ESO）需 CC BY 4.0 并致谢 ESO'],
        ['获取方式', '公开下载 / 镜像']
      ],
      observe: ['可用 Gaia 视差与自行差做自行运动筛选，业余也能复现简单版本'],
      pro: 'Gaia DR3 的视差精度使银河系三维结构研究进入统计时代；其自行与光度变源是发现新天体的主要渠道之一。',
      pop: '盖亚卫星在天空里反复给十几亿颗星星「量身高」，靠视差算出它们离我们有多远，连成银河系的立体地图。',
      sources: [{ n: 'NADC · Gaia 数据', u: 'https://nadc.china-vo.org/res/resource' }, { n: 'ESA Gaia', u: 'https://www.cosmos.esa.int/web/gaia' }],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'gaia-distance-catalog', type: 'concept', cn: 'Gaia 距离星表与银河系测绘', en: 'Gaia Distance Catalog',
      aliases: ['Gaia 距离星表', 'EDR3', '银河系测绘', '视差距离'],
      tag: '巡天', status: 'established',
      summary: '基于 Gaia EDR3 视差构建的距离星表给出数十亿颗源的银河系三维位置，是绘制银河系结构与暗物质分布的重要基础。',
      facts: [
        ['数据基础', 'Gaia EDR3 视差与自行'],
        ['成果', '银河系螺旋结构、盘厚标尺、晕星族分布'],
        ['衍生星表', 'NADC 提供镜像与衍生距离星表'],
        ['获取方式', '公开下载']
      ],
      observe: ['结合巡天望远镜自行可做二维视线速度样本'],
      pro: '视差距离对消光与光度演化敏感，距离估计需联合恒星模型，否则会系统性偏置。',
      pop: '这批数据等于给银河系做了一次 CT，把「看到的星」换算成「真实的距离」。',
      sources: [{ n: 'NADC · Gaia 衍生星表', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'mwisp-galactic-plane', type: 'concept', cn: '银河画卷 MWISP', en: 'MWISP Survey',
      aliases: ['银河画卷', 'MWISP', '分子谱线巡天', 'CO 巡天', '银河系尘埃'],
      tag: '巡天', status: 'established',
      summary: '银河画卷是针对银河系银道面的 ¹²CO/¹³CO/C¹⁸O 分子谱线巡天，第一次数据释放已在 NADC 公开，含 FITS 数据、云源表与配套 Python 包 Mwispy。',
      facts: [
        ['波段', '分子谱线（¹²CO J=1-0 等）'],
        ['范围', '银河系银道面'],
        ['数据', 'FITS 数据集 + 云源表 + Mwispy 工具包'],
        ['标识', 'DOI 10.57760/sciencedb.27351（ScienceDB 平台）'],
        ['获取方式', '公开下载'],
        ['科学目标', '银河系大尺度结构、分子云形成与恒星诞生区']
      ],
      observe: ['CO 谱线在毫米波段，可用小型射电望远镜做区域性巡天'],
      pro: '银河画卷采用大天区面阵与位置频率同时覆盖的观测策略，可在单次观测中同时获得大量视线方向的多普勒信息，显著提高效率。',
      pop: '它用「宇宙冷气灶的香味」——一氧化碳分子谱线——把银河系里所有的气体云连成一张立体地图。',
      sources: [{ n: 'NADC · 银河画卷 MWISP', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'lhaaso-gamma-catalog', type: 'concept', cn: 'LHAASO 伽马射线源表', en: 'LHAASO Catalog',
      aliases: ['LHAASO', '高海拔宇宙线观测站', '伽马射线源', '射电星'],
      tag: '探测', status: 'established',
      summary: 'LHAASO（高海拔宇宙线观测站）在青藏高原上以平方公里级阵列探测超高能伽马射线，NADC 收录其首个源表，包含 90 个高显著源。',
      facts: [
        ['阵列', '平方公里级切伦科夫阵列 +  Shower 阵列'],
        ['首个源表', '收录 90 个伽马源'],
        ['能段', '甚高能伽马射线'],
        ['获取方式', '公开下载（DOI + CSTR）'],
        ['配套', 'NADC 另收录其论文数据与软件']
      ],
      observe: ['肉眼与普通设备无法观测甚高能伽马射线'],
      pro: '源表样本量受曝光与显著性阈值限制，后续数据释放会持续更新源数与谱型；源关联需与多波段数据联合分析。',
      pop: '它像一座高原上的「宇宙射线雨量计」，记录来自最剧烈天体事件的高能光子，把它们钉在星图上。',
      sources: [{ n: 'NADC · LHAASO 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.92, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'chandra-xray-csc', type: 'concept', cn: '钱德拉 X 射线源表', en: 'Chandra CSC',
      aliases: ['钱德拉', 'Chandra', 'X射线源表', 'CSC', 'X 射线天文学'],
      tag: '探测', status: 'established',
      summary: '钱德拉 X 射线天文台的最深源表（CSC v2.0）整合历次观测的 X 射线源并给出能谱与时序性质，NADC 提供完整镜像数据。',
      facts: [
        ['卫星', '钱德拉 X 射线天文台'],
        ['源表版本', 'CSC v2.0'],
        ['内容', '源表、事件表、图像与灵敏度图'],
        ['获取方式', '公开下载（镜像）'],
        ['波段', '0.5–7 keV 为主']
      ],
      observe: ['需 X 射线望远镜，业余不可及'],
      pro: 'X 射线源表是研究吸积、激变与超大质量黑洞最系统的编目之一；交叉匹配时需注意光学/射电联动的多波段证认。',
      pop: '这是「高能宇宙的星表」：记录黑洞、 neutron 星和星系团里炽热气体的辐射指纹。',
      sources: [{ n: 'NADC · Chandra 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'erosita-de-dr1', type: 'concept', cn: 'eROSITA 全天 X 射线巡天', en: 'eROSITA DR1',
      aliases: ['eROSITA', 'eROSITA-DE', 'Spektr-RG', '全天X射线巡天'],
      tag: '探测', status: 'established',
      summary: 'eROSITA 是俄罗斯 SRG 天文台上的 X 射线全天巡天仪，第一次数据释放（eROSITA-DE DR1）在 NADC 提供公开镜像。',
      facts: [
        ['仪器', 'eROSITA（Spektr-RG 天文台）'],
        ['类型', '全天成像巡天，四象限拼接'],
        ['发布', 'eROSITA-DE DR1'],
        ['获取方式', '公开下载（镜像）'],
        ['灵敏度', '在 0.5–2 keV 硬 X 射线段灵敏度领先']
      ],
      observe: ['需 X 射线望远镜'],
      pro: '全天巡天避免扫描漏源，可同时给出源表与全天强度图；对 eROSITA 增强数据需结合去除掩星效应的处理流程。',
      pop: '它像给整片天空拍 X 光片，一次性把成千上万个「发着高能光的天体」编成目录。',
      sources: [{ n: 'NADC · eROSITA 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.90, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'euclid-q1', type: 'concept', cn: '欧几里得 Q1 快速数据释放', en: 'Euclid Q1',
      aliases: ['Euclid', '欧几里得', '欧几里得望远镜', 'Q1 数据', '弱引力透镜巡天'],
      tag: '巡天', status: 'established',
      summary: '欧几里得空间望远镜首次快速数据释放（Q1）提供图像、光度红移与光谱星表，是弱引力透镜与暗宇宙研究的重要公开数据，NADC 提供镜像。',
      facts: [
        ['任务', '欧几里得（ESA），弱引力透镜与暗宇宙'],
        ['数据量', '图像 + 光度红移 + 光谱星表'],
        ['获取方式', '公开下载（镜像，参考 IRSA 用户指南）'],
        ['相关数据集', 'AI-ready Galaxy Zoo Euclid 形态标注集等衍生产品']
      ],
      observe: ['数据为专业巡天级，业余可参与众包标注类公民科学'],
      pro: '欧几里得以 15000 平方度视场做弱透镜测量，配合光度红移切割抑制线内污染；形态标注的深度学习模型正成为形态分类标准工具。',
      pop: '它用「引力透镜」当透镜，把遥远星系拉成细长弧线，从而量出暗物质的分布。',
      sources: [{ n: 'NADC · Euclid 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.90, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'ast3-2-supernova', type: 'concept', cn: 'AST3-2 超新星巡天数据', en: 'AST3-2 SN Survey',
      aliases: ['AST3-2', '安第斯望远镜', '超新星巡天', '安第斯巡天'],
      tag: '巡天', status: 'established',
      summary: '位于西藏羊八井的 1 米口径安第斯望远镜（AST3）开展的深场超新星巡天，其 AST3-2 数据释放在 NADC 公开，包含 22,576 张图像与约 770 万条光变曲线。',
      facts: [
        ['望远镜', 'AST3（1 米，羊八井观测站）'],
        ['数据规模', '22,576 张图像 + 约 770 万条光变曲线'],
        ['发布', 'AST3-2 2016 超新星巡天数据发布'],
        ['获取方式', '公开下载（DOI + CSTR）'],
        ['目标', '暗弱超新星搜寻与光变曲线库']
      ],
      observe: ['数据可用于变星分类算法验证，业余可参与差分测流练习'],
      pro: '高海拔、低视宁度抑制的野外观测站适合深场巡天；此类小口径深场数据在暂现源发现中具有高性价比。',
      pop: '一台一米的小望远镜加上一整夜的自动拍摄，攒出了几百万条亮度曲线，里面藏着不少「突然变亮」的天体。',
      sources: [{ n: 'NADC · AST3-2 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.91, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'ztf-time-domain', type: 'concept', cn: 'ZTF 时域巡天', en: 'ZTF DR21',
      aliases: ['ZTF', '兹威基瞬态巡天', '时域巡天', 'Zwicky Transient Facility', '暂现源'],
      tag: '巡天', status: 'established',
      summary: 'ZTF 用装在山上的广域相机每两夜扫视一次全天，DR21 数据已在 NADC 公开，是变星、暂现源与小行星发现的核心数据源。',
      facts: [
        ['相机', '广域巡天相机（约 47 平方度/次）'],
        ['发布', 'ZTF DR21 及其图像数据'],
        ['获取方式', '公开下载（镜像，原始数据由 IRSA 发布）'],
        ['产出', '变星、暂现源、小行星与超新星候选'],
        ['配套', 'SkyMapper DR2/DR4 主星表可作交叉参考']
      ],
      observe: ['变星与超新星候选可由业余望远镜跟踪确认'],
      pro: '时域巡天的核心是广视场 + 高 cadence：快速重访才能捕捉秒到小时尺度的变化，ZTF 的公开 DR21 使独立变星研究门槛大幅降低。',
      pop: '它每隔两晚就把整片天空拍一遍，专门抓那些「上一张还在，这一张突然变了」的天体。',
      sources: [{ n: 'NADC · ZTF 数据', u: 'https://nadc.china-vo.org/res/resource' }, { n: 'IRSA ZTF', u: 'https://irsa.ipac.cal.edu' }],
      confidence: 0.92, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'psp-citizen-supernova', type: 'concept', cn: '中国天眼公众科学超新星发现', en: 'PSP Supernova Discoveries',
      aliases: ['公众科学', 'PSP', 'China-VO 公众科学平台', '公众超新星', '超新星发现'],
      tag: '科普', status: 'emerging',
      summary: 'NADC 运营的 China-VO 公众科学平台（PSP）组织公众用望远镜数据搜寻超新星，2026 年 8 月中下旬即发现两颗超新星，显示公众参与时域科学的力量。',
      facts: [
        ['平台', 'China-VO 公众科学平台（NADC 运营）'],
        ['成果', '2026 年 8 月中下旬 PSP 发现两颗超新星'],
        ['方法', '基于巡天图像差分，由志愿者筛选候选体'],
        ['意义', '扩大搜索时间覆盖，降低漏检率'],
        ['入口', 'nadc.china-vo.org/citizenscience']
      ],
      observe: ['公众可参与候选体人工确认与光变曲线检查'],
      pro: '时域搜索的瓶颈在于人眼筛选效率；志愿者对差分图像的人工判别可显著提高完备率，是公民科学在高强度数据流中的典型有效分工。',
      pop: '你不需要专业设备也能参与：把两晚的巡天图叠在一起，差出一颗「突然冒出来」的星星，就是在帮忙找超新星。',
      sources: [{ n: 'NADC 公众科学', u: 'https://nadc.china-vo.org/citizenscience' }, { n: 'NADC 文章', u: 'https://nadc.china-vo.org/article' }],
      confidence: 0.85, freshness: 'realtime', updated: '2026-10'
    },
    {
      id: 'plate-digitization', type: 'concept', cn: '中国天文底片数字化', en: 'Astronomical Plate Archive',
      aliases: ['天文底片', '底片数字化', '底片库', '历史观测资料', '照相底片'],
      tag: '档案', status: 'established',
      summary: '国家科技基础性工作专项「天文底片数字化」用高精度扫描仪把国家天文台、紫金山天文台、上海天文台、云南天文台等 1901–1999 年的历史底片扫描成数字图像与星表，NADC 提供公开数据。',
      facts: [
        ['时间跨度', '1901–1999 年'],
        ['规模', '15,696 张底片，覆盖 5 个台站 9 台望远镜'],
        ['产品', '图像数据 + 天体测量星表 + 单次曝光测光星表 + 变星候选体'],
        ['获取方式', '公开下载（DOI + CSTR）'],
        ['意义', '为变星历史、望远镜指向系统与长期基线研究提供原始记录']
      ],
      observe: ['测光星表可用于回溯历史光变曲线，研究变星长期变化'],
      pro: '历史底片是唯一覆盖早期望远镜指向与大气透明度的长基线资料；数字化后的天体测量与测光产品可与现代巡天做交叉验证。',
      pop: '一百年间人类用底片记下的星空，现在被逐张扫成了数字文件——相当于把老相册变成了可检索的数据库。',
      sources: [{ n: 'NADC · 天文底片库', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'solar-archive-history', type: 'concept', cn: '太阳物理历史数据与标准化', en: 'Solar Physics Archive',
      aliases: ['太阳物理历史数据', '手绘黑子图', '太阳黑子历史', '太阳数据标准化', '太阳磁场历史'],
      tag: '太阳', status: 'established',
      summary: 'NADC 收录的太阳物理历史数据集包含手绘黑子图、太阳磁场与速度场、射电流量等，并配套建立基于国际标准的太阳物理数据标准化报告。',
      facts: [
        ['数据类型', '手绘黑子图、太阳磁场、速度场、射电流量等'],
        ['标准化', '建立基于国际标准的太阳物理数据标准化报告'],
        ['获取方式', '公开下载（DOI + CSTR）'],
        ['用途', '太阳活动周期长基线研究与气候相关讨论的数据基础'],
        ['关联', '与太阳物理历史事件（如 1859 年卡林顿事件）可对照']
      ],
      observe: ['业余可自行做连续黑子数记录，与历史数据拼接'],
      pro: '手绘黑子图虽是二维投影，但经过定标与去投影后可长期拼接；标准化报告使不同台站数据具备可比性，是太阳活动周期长基线研究的关键。',
      pop: '这些手绘图是一百多年「太阳黑子日记」，每张纸上都是一个黑点位置记录，拼起来能看出太阳的「情绪周期」。',
      sources: [{ n: 'NADC · 太阳物理历史数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.90, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'domestic-telescopes', type: 'concept', cn: '国内核心地基观测设施', en: 'Domestic Ground Telescopes',
      aliases: ['兴隆2.16米', '丽江2.4米', 'NVST', '新真空太阳望远镜', '国内望远镜', '地基望远镜'],
      tag: '设施', status: 'established',
      summary: '兴隆 2.16 米、丽江 2.4 米、抚仙湖 1 米新真空太阳望远镜等国内核心地基望远镜，由 NADC 提供时间申请、数据管理、传输、归档、备份与融合的统一服务。',
      facts: [
        ['兴隆 2.16 米', '国内经典光学望远镜，长期承担观测与教学任务'],
        ['丽江 2.4 米', '云南高海拔暗夜台址，视宁度与红外条件好'],
        ['NVST', '抚仙湖 1 米新真空太阳望远镜，观测太阳磁场与色球'],
        ['服务', 'NADC 提供时间申请、数据全生命周期管理与数据融合'],
        ['获取方式', '公开数据集（部分需通过观测申请）']
      ],
      observe: ['可通过公开数据或观测申请参与专业级数据产出'],
      pro: '高海拔台址在视宁度、红外透过率与夜天光上优于平原台址；统一的数据管理服务使多台站数据可联合分析。',
      pop: '这些是国内天文学的主干「望远镜班底」，NADC 像它们的总管，统一排班、归档数据。',
      sources: [{ n: 'NADC · 地基望远镜数据服务', u: 'https://nadc.china-vo.org/' }],
      confidence: 0.90, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'slr-ccs', type: 'concept', cn: '卫星激光测距与地心参数', en: 'Satellite Laser Ranging',
      aliases: ['卫星激光测距', 'SLR', 'CCSLR', '长春站', '地心坐标'],
      tag: '测量', status: 'established',
      summary: '卫星激光测距以激光脉冲测量近地卫星距离，精度达厘米级，是确定地球自转、参考系与地心坐标的独立手段；NADC 收录 CCDLR DR1–DR4 数据。',
      facts: [
        ['技术', '向卫星发射激光脉冲并测量往返时间'],
        ['精度', '厘米量级'],
        ['站点', 'CCSLR 长春站 60 cm 望远镜，DR1–DR4'],
        ['作用', '地球自转参数、地心坐标与参考系实现'],
        ['获取方式', '公开下载（DOI + CSTR）']
      ],
      observe: ['业余激光测距难度极高，通常由专业台站完成'],
      pro: 'SLR 与 VLBI 共同提供地球自转与参考系参数，跨越 30 年以上的连续观测对长期地球自转变化与地壳运动研究不可替代。',
      pop: '用激光「量地球到卫星有多远」，误差只有几厘米——靠这个，我们才能知道地球自转得有多稳。',
      sources: [{ n: 'NADC · CCDLR 数据', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.91, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'guo-shoujing-legacy', type: 'concept', cn: '大科学装置的「全生命周期数据服务」', en: 'NADC Data Lifecycle Service',
      aliases: ['全生命周期服务', '数据全生命周期', '大科学装置数据管理', '数据融合'],
      tag: '设施', status: 'established',
      summary: 'NADC 的核心模式是为大科学装置提供「原始数据传输—归档—备份—产品数据归档—发布—共享—在线分析—数据融合」的全链条服务，把装置产出变成可长期复用的数据资产。',
      facts: [
        ['服务对象', 'LAMOST、FAST、国内核心地基望远镜、天文底片项目'],
        ['链条', '传输 → 归档 → 备份 → 产品归档 → 发布 → 共享 → 在线分析 → 数据融合'],
        ['标识', '统一采用 DOI + CSTR 双标识'],
        ['平台统计', '注册用户 46,862；数据下载 44692.61 万次；下载总量 575 TB'],
        ['目标', '支撑数据驱动的科研、教学与公众应用']
      ],
      observe: ['数据服务模式可被个人研究者直接受益：申请、下载、复现一站式完成'],
      pro: '大科学装置的产出通常已达 TB–PB 量级，全生命周期服务把「数据产出」转化为「可复现、可引用的科研资产」，是数据基础设施层的关键设计。',
      pop: '这就像给天文数据建了一条「从实验室到货架再到书桌」的高速公路，全流程有人管、有人找、有人引用。',
      sources: [{ n: 'NADC 首页 · 经典服务案例', u: 'https://nadc.china-vo.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'tian-guan-svom-herbans', type: 'concept', cn: '天关、SVOM 与慧眼的联合观测', en: 'TianGuan SVOM HEAO Joint Observations',
      aliases: ['天关', '爱因斯坦探针', 'SVOM', '慧眼卫星', '高能卫星联合观测', '短伽马暴'],
      tag: '前沿', status: 'emerging',
      summary: '2026 年 10 月 NADC 报道天关卫星、SVOM 与慧眼卫星联合观测到短伽马暴事件，体现我国高能天文多卫星协同观测的能力，相关结论仍属前沿成果。',
      facts: [
        ['时间', '2026 年 10 月报道'],
        ['卫星', '天关（爱因斯坦探针）、SVOM、慧眼'],
        ['目标', '短伽马暴等高能瞬变事件'],
        ['意义', '多卫星不同视场联合覆盖，提高事件定位能力'],
        ['性质', '前沿观测成果，细节以官方发布为准']
      ],
      observe: ['高能瞬变事件需卫星联合观测与快速跟进'],
      pro: '短伽马暴持续时间极短，定位依赖多台不同视场卫星的联合触发与快速姿态调整；多星座协同可显著提升定位率与定位精度。',
      pop: '这几颗卫星像分布在不同角落的接力听诊器，同时听到一声短促的「咔哒」，就能把源头定位得更准。',
      sources: [{ n: 'NADC 新闻', u: 'https://nadc.china-vo.org/article' }],
      confidence: 0.82, freshness: 'realtime', updated: '2026-10',
      openQuestion: '该次事件的具体参数与后续多波段跟进结果需以各卫星任务团队的正式论文为准。'
    },
    {
      id: 'lamost-gaia-long-period', type: 'concept', cn: 'LAMOST 与 Gaia 联合搜寻长周期变星', en: 'LAMOST + Gaia Long-period Variables',
      aliases: ['LAMOST Gaia 联合', '长周期变星', '搜寻特殊天体', '银道面变星'],
      tag: '前沿', status: 'emerging',
      summary: '2026 年 10 月 NADC 报道，依托 LAMOST 光谱与 Gaia 天体测量数据搜寻长周期变星与特殊天体的工作取得进展。',
      facts: [
        ['时间', '2026 年 10 月报道'],
        ['数据组合', 'LAMOST 光谱 + Gaia 天体测量'],
        ['目标', '长周期变星与特殊变星搜寻'],
        ['方法优势', '光谱给出物理参数，测光给出周期，两者互补'],
        ['性质', '进行中的研究工作，样本与结论持续更新']
      ],
      observe: ['长周期变星（天到年级）需要长期基线测光'],
      pro: '长周期变星的周期跨度可达数年，Gaia 多 epoch 测光提供了难得的长期基线，结合 LAMOST 光谱可直接给出光谱型与金属丰度。',
      pop: '有些星星要几个月才「喘」一次气；这活儿正好交给 Gaia 长期盯着，再用光谱确认它到底是什么。',
      sources: [{ n: 'NADC 新闻', u: 'https://nadc.china-vo.org/article' }],
      confidence: 0.82, freshness: 'realtime', updated: '2026-10',
      openQuestion: '样本量与完备性仍在推进中，最终统计结果需以正式论文为准。'
    },
    {
      id: 'solar-fishbone-pattern', type: 'concept', cn: '太阳「鱼骨状」结构', en: 'Solar Fishbone Structure',
      aliases: ['鱼骨状', '太阳鱼骨', '云南天文台', '太阳磁结构', '日面结构发现'],
      tag: '太阳', status: 'emerging',
      summary: '2026 年 10 月 NADC 报道云南天文台科研人员揭示了太阳上的「鱼骨状」结构，为日面磁场的精细拓扑研究提供新线索。',
      facts: [
        ['时间', '2026 年 10 月报道'],
        ['单位', '云南天文台'],
        ['对象', '日面磁结构 / 鱼骨状形态'],
        ['方法', '基于高分辨率太阳磁场与光球观测数据'],
        ['性质', '新发现，解释模型仍在建立']
      ],
      observe: ['业余可用太阳望远镜观察日面活动区（需专用滤镜）'],
      pro: '日面磁流结构的形态学分类可约束磁通管模型；新形态的发现通常需要更高时间分辨率与多波段同时观测加以确认。',
      pop: '在太阳表面发现像鱼骨一样的花纹，说明太阳的「磁场血管」比我们想象的更复杂。',
      sources: [{ n: 'NADC 新闻', u: 'https://nadc.china-vo.org/article' }],
      confidence: 0.80, freshness: 'realtime', updated: '2026-10',
      openQuestion: '该结构的稳定性、物理成因与普适性仍待更多观测与理论工作确认。'
    },
    {
      id: 'china-vo-standards', type: 'concept', cn: '天文数据标识与标准规范', en: 'Data Standards and Identifiers',
      aliases: ['DOI', 'CSTR', '数据标识', '标准规范', 'IAU SOFA', 'GoFA', '数据标准'],
      tag: '规范', status: 'established',
      summary: 'NADC 对所有发布数据集统一分配 DOI 与 CSTR 双标识，并推动太阳物理数据标准化；其收录的 GoFA 是 IAU SOFA 天文标准算法库的 Go 语言实现，含 247 个标准算法。',
      facts: [
        ['标识', 'DOI（国际）+ CSTR（国家科技资源标识）双标识'],
        ['标准化', '太阳物理数据标准化报告基于国际标准制定'],
        ['GoFA', 'IAU SOFA 的 Go 实现（基于 SOFA 2023-10-11），247 个标准算法'],
        ['SOFA 覆盖', '时间尺度、地球自转、恒星时、岁差、章动、极移、参考系转换'],
        ['获取方式', '公开访问（GitHub / pkg.go.dev）'],
        ['机构', 'IAU、IVOA 为相关标准与规范的国际来源']
      ],
      observe: ['业余亦可使用 SOFA/GoFA 做高精度时间与坐标换算'],
      pro: '坐标与时间参考系的换算（岁差、章动、极移）精度直接决定观测记录的可比对性；SOFA 提供了可复现的标准实现，避免各系统自造轮子。',
      pop: '同一颗星，不同年代、不同仪器记的坐标为什么对不上？答案就在岁差、章动这些「标准尺子」里，SOFA 就是那套尺子的说明书。',
      sources: [{ n: 'NADC · 标准规范', u: 'https://nadc.china-vo.org/' }, { n: 'IAU SOFA', u: 'https://www.iaus.org/' }],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'spectrum-line-survey', type: 'concept', cn: '光谱巡天与恒星物理参数', en: 'Spectral Surveys & Stellar Parameters',
      aliases: ['恒星参数', '光谱型', '化学丰度', '光谱能量分布', '恒星分类'],
      tag: '观测', status: 'established',
      summary: '大规模光谱巡天通过测量谱线强度推算恒星的表面温度、重力、光度、金属丰度与年龄，是把「看起来的星」变成「可计算的天体物理参数」的关键。',
      facts: [
        ['可测参数', '有效温度、表面重力、金属丰度、自转速度'],
        ['推断量', '半径、质量、年龄、距离（结合视差）'],
        ['数据来源', 'LAMOST、Gaia BP/RP 光谱等'],
        ['衍生产品', 'NADC 收录 LAMOST 恒星参数星表、Gaia XP 衍生星表等'],
        ['方法', '合成光谱拟合与机器学习两条路线并行']
      ],
      observe: ['可用业余光谱仪拍摄亮星光谱，估算温度与谱型'],
      pro: '参数估计存在系统误差：大气模型、丰度依赖与训练样本选择都会引入偏差，跨巡天合并时需统一标定。',
      pop: '光谱相当于恒星的「条形码」，扫一遍就能读出它的温度、重量和金属含量。',
      sources: [{ n: 'NADC · 光谱数据产品', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.92, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'fiber-hao-dib-interstellar', type: 'concept', cn: '星际弥散带与恒星光谱中的分子特征', en: 'Diffuse Interstellar Bands',
      aliases: ['弥散星际带', 'DIB', '5780', '星际尘埃消光', '恒星光谱中的分子'],
      tag: '观测', status: 'emerging',
      summary: '弥散星际带是恒星光谱中一系列 unidentified 的宽吸收特征，来源至今仍有争议；NADC 收录了基于 LAMOST 低分辨率光谱对 5780、5797 与 6614 Å 三条弥散带的测量星表。',
      facts: [
        ['观测特征', '多个未知载体产生的宽吸收带，最强在 5780 Å 附近'],
        ['NADC 数据', 'LAMOST LRS DR10 中 5780、5797、6614 Å 弥散带测量星表'],
        ['统计价值', '可示踪视线方向的星际尘埃与气体柱密度'],
        ['争议', '承载分子身份尚未确定，属前沿未决问题'],
        ['获取方式', '公开下载（DOI + CSTR）']
      ],
      observe: ['需高信噪比光谱，业余难以可靠测量'],
      pro: 'DIB 强度与星际消光和尘埃性质相关，但其载体的化学身份至今未确定，属于典型的「可精确测量但机制未解」问题。',
      pop: '恒星光谱里有些「墨迹」，位置固定却不认识是谁画的——测量它们能画出银河系的尘埃地图。',
      sources: [{ n: 'NADC · DIB 测量星表', u: 'https://nadc.china-vo.org/res/resource' }],
      confidence: 0.85, freshness: 'active', updated: '2026-10',
      openQuestion: '弥散带承载分子的具体身份仍无定论。'
    },

    /* ---------------- 著名恒星（补充：此前仅有星表条目，无知识条目） ---------------- */
    {
      id: 'sirius', type: 'object', cn: '天狼星', en: 'Sirius', m: 'α CMa',
      aliases: ['天狼星', 'sirius', '天狼', 'dog star', 'α cma', '大犬座α'],
      tag: '天体',
      summary: '夜空中最亮的恒星，大犬座 α，距地球 8.6 光年，是一对「主序星 + 白矮星」的双星系统。',
      facts: [
        ['距离', '8.6 光年（2.64 秒差距）'],
        ['视星等', '−1.46（全天最亮恒星）'],
        ['主星', 'A1V 主序星，表面温度约 9,940 K'],
        ['伴星天狼星 B', '白矮星，是人类发现的第一颗白矮星'],
        ['公转周期', '约 50 年']
      ],
      observe: [
        '冬季北半球最易辨认：沿猎户座腰带三星向左下方延长即可找到',
        '低空时因大气折射会剧烈闪烁并出现彩色闪动，那是大气效应，不是恒星本身变化',
        '天狼星 B 与主星亮度差约 10 个星等，业余望远镜难以分辨'
      ],
      pro: '天狼星 A 属于主序 A1V，光度约 25 L☉；伴星 B 为 DA2 型白矮星，质量约 1.02 M☉ 却只有地球大小，其表面重力由引力红移测得，是检验白矮星物态方程的重要样本。',
      pop: '冬天夜空最亮的那颗星就是天狼星。它其实有两个成员：一个亮的主星，和一个只有地球那么大、却和太阳差不多重的「白矮星」残骸，两者绕行一圈要 50 年。',
      sources: [
        { n: 'SIMBAD · Sirius', u: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=Sirius' },
        { n: 'NASA · Star Facts', u: 'https://science.nasa.gov/universe/stars/' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'betelgeuse', type: 'object', cn: '参宿四', en: 'Betelgeuse', m: 'α Ori',
      aliases: ['参宿四', 'betelgeuse', '猎户座α', 'α ori'],
      tag: '天体',
      summary: '猎户座肩部的红超巨星，半径约为太阳的 700 倍以上，已进入演化末期，未来会以超新星爆发结束。',
      facts: [
        ['距离', '约 550–650 光年（方法间存在分歧：548 / 643 / 724 光年）'],
        ['光谱型', 'M1–M2 Ia-ab 红超巨星'],
        ['半径', '约 700–900 太阳半径（随脉动变化）'],
        ['质量', '约 15–20 太阳质量（估计）'],
        ['2019–2020 大变暗', '视星等降至约 +1.6，主因是抛出的尘埃遮挡，而非爆发前兆']
      ],
      observe: [
        '冬季猎户座「右肩」，呈明显的橙红色，与左下角蓝白色的参宿七形成颜色对比',
        '肉眼可辨颜色，但亮度有半规则变化（约 400 天主周期），不要以单次目视为准',
        '未来十万年量级内可能爆发，但具体时间无法预测，任何「即将爆发」的说法都不可信'
      ],
      pro: '参宿四的距离长期存在系统性分歧：依巴谷与 VLA 给出约 643 光年，ALMA/e-MERLIN 给出 724 光年，Joyce 等（2020）基于多种建模给出约 548 光年。由于它是变星且角直径极大，Gaia 因亮星饱和未能提供有效视差，这是距离难以收敛的直接原因。',
      pop: '猎户座肩膀上那颗偏红亮的星就是参宿四。它已经是一颗「老恒星」，将来会爆炸成超新星——不过这个「将来」可能是几万年以后，现在完全不用担心。',
      sources: [
        { n: 'SIMBAD · Betelgeuse', u: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=Betelgeuse' },
        { n: 'NASA · Hubble Betelgeuse', u: 'https://science.nasa.gov/missions/hubble/' }
      ],
      confidence: 0.9, freshness: 'active', updated: '2026-10',
      openQuestion: '距离仍有 550–724 光年的分歧，直接影响半径与演化阶段的判断。'
    },
    {
      id: 'antares', type: 'object', cn: '心宿二', en: 'Antares', m: 'α Sco',
      aliases: ['心宿二', 'antares', '天蝎座α', 'α sco', '大火'],
      tag: '天体',
      summary: '天蝎座心脏位置的红超巨星，中国古称「大火」，是夏夜最容易辨认的红色亮星之一。',
      facts: [
        ['距离', '约 550 光年（约 170 秒差距）'],
        ['光谱型', 'M1.5 Iab 红超巨星'],
        ['半径', '约 680 太阳半径'],
        ['质量', '约 12–16 太阳质量'],
        ['伴星', 'Antares B，B2.5 V 蓝白色主序星，与主星角距约 2.5″']
      ],
      observe: [
        '夏季南方低空，位于天蝎座「心脏」，颜色明显偏红',
        '与心宿二 B 的角距约 2.5 角秒，需要较好视宁度与小口径以上望远镜才能分开',
        '中国古籍中的「大火」即指此星，《诗经》「七月流火」描述其西沉'
      ],
      pro: '心宿二是天蝎-半人马 OB 协会成员，属于年轻的恒星形成区，与太阳不在同一演化阶段。其质量损失率约 10⁻⁶ M☉/yr 量级，抛出的物质形成周围的气壳，是研究红超巨星质量损失与星际介质增丰的重要目标。',
      pop: '夏天的南方天空有一颗很红的亮星，古人叫它「大火」。它比太阳大得多，如果放在太阳的位置，表面会一直延伸到火星轨道附近。',
      sources: [
        { n: 'SIMBAD · Antares', u: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=Antares' },
        { n: 'NASA · Stars', u: 'https://science.nasa.gov/universe/stars/' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },

    /* ---------------- 深空天体（补充星表中已有但缺知识条目的目标） ---------------- */
    {
      id: 'm16', type: 'object', cn: '鹰状星云', en: 'Eagle Nebula', m: 'M16',
      aliases: ['m16', '鹰状星云', 'eagle nebula', 'ngc6611', '创生之柱'],
      tag: '深空', visual: 'm16',
      summary: '巨蛇座的恒星形成区与疏散星团复合体，因哈勃拍摄的「创生之柱」而广为人知。',
      facts: [
        ['距离', '约 5,700 光年'],
        ['编号', 'M16 / NGC 6611'],
        ['类型', 'H II 区 + 疏散星团'],
        ['标志结构', '创生之柱（Pillars of Creation），长约数光年'],
        ['成像史', '1995 年哈勃首拍，2014 年重拍，2022 年 JWST 红外成像']
      ],
      observe: [
        '属于夏季天体，在巨蛇座尾部，需要较暗的天空',
        '小口径望远镜可见星云与星团的混合体，柱状结构需要较大口径与滤镜',
        'UHC 滤镜可提升对比度；摄影时建议长曝光叠加'
      ],
      pro: '鹰状星云的电离源是 NGC 6611 星团中的 O 型星，其紫外辐射与星风正在侵蚀分子云，形成指向电离源的柱状结构。柱内存在致密云核与年轻星体（YSO），是研究「辐射驱动内爆」与恒星形成反馈的经典目标。',
      pop: '哈勃那张著名的「创生之柱」照片就来自这里。那些高耸的气体柱里正在诞生新的恒星，同时又被附近大质量恒星的强光慢慢侵蚀掉。',
      sources: [
        { n: 'NASA · Hubble / Webb M16', u: 'https://science.nasa.gov/mission/hubble/' },
        { n: 'SEDS Messier · M16', u: 'https://messier.seds.org/m/m016.html' }
      ],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'm20', type: 'object', cn: '三叶星云', en: 'Trifid Nebula', m: 'M20',
      aliases: ['m20', '三叶星云', 'trifid nebula', 'ngc6514'],
      tag: '深空', visual: 'm20',
      summary: '人马座中少见的「三合一」天体：发射星云、反射星云与暗星云在同一视线上叠加，形成三叶状外观。',
      facts: [
        ['距离', '约 5,200 光年'],
        ['编号', 'M20 / NGC 6514'],
        ['类型', '发射星云 + 反射星云 + 暗星云'],
        ['电离源', 'HD 164492 等年轻 O 型星'],
        ['成因', '暗尘埃带将亮区切成三块，故得名「三叶」']
      ],
      observe: [
        '夏季人马座方向，与礁湖星云 M8 相距不远，可同晚观测',
        '暗带需要较大口径与良好透明度，小口径下容易只看到一团亮斑',
        '摄影时能同时呈现红色（发射）与蓝色（反射）两部分，是最能体现「颜色差异来源」的目标之一'
      ],
      pro: 'M20 的红色部分为 Hα 复合辐射，来自被 O 型星电离的氢；蓝色部分为尘埃散射星光的反射星云，呈连续谱。分割两者的暗带是致密分子云，其消光使背景亮区形成明显的分叶结构。三类星云共存使它成为讲解「星云分类」的直观样本。',
      pop: '同一个目标里同时有三种星云：会发红光的、会把星光反射成蓝色的、还有挡住光的黑色尘埃带。一条黑带把亮区切成三瓣，所以叫三叶星云。',
      sources: [
        { n: 'SEDS Messier · M20', u: 'https://messier.seds.org/m/m020.html' },
        { n: 'NASA · Nebulae', u: 'https://science.nasa.gov/universe/nebulae/' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'm33', type: 'object', cn: '三角座星系', en: 'Triangulum Galaxy', m: 'M33',
      aliases: ['m33', '三角座星系', 'triangulum galaxy', 'ngc598'],
      tag: '深空', visual: 'm33',
      summary: '本星系群第三大成员，正面朝向地球的螺旋星系，是肉眼可见的最远天体之一。',
      facts: [
        ['距离', '约 273 万光年'],
        ['直径', '约 6 万光年'],
        ['恒星数', '约 400 亿（低于银河系的千亿量级）'],
        ['类型', 'SA(s)cd 无棒螺旋星系'],
        ['特殊地位', '本星系群第三大，可能通过引力与 M31 相互作用']
      ],
      observe: [
        '极暗天空下可见为模糊斑块，是肉眼可见的最远天体之一，但需要极佳条件',
        '低表面亮度，城市光污染下几乎不可见；双筒望远镜是最合适的工具',
        '秋季三角座方向，可从仙女座星系沿「V」形星链找到'
      ],
      pro: 'M33 的低表面亮度源于其较小的质量和较大的盘尺度，使其在小口径下极难观测。它拥有大量 H II 区与年轻星团，是研究星系内恒星形成的重要近邻；其与 M31 的引力关系及是否为本星系群成员之一，与「本星系群质量评估」问题相关。',
      pop: '它是我们星系群里排第三的成员，距离约 273 万光年。理论上肉眼能看到，但它太「散」了——光摊在很大一片天空上，所以实际上很难看见。',
      sources: [
        { n: 'NASA/IPAC Extragalactic Database', u: 'https://ned.ipac.caltech.edu/' },
        { n: 'SEDS Messier · M33', u: 'https://messier.seds.org/m/m033.html' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'm82', type: 'object', cn: '雪茄星系', en: 'Cigar Galaxy', m: 'M82',
      aliases: ['m82', '雪茄星系', 'cigar galaxy', 'ngc3034'],
      tag: '深空', visual: 'm82',
      summary: '大熊座方向的星暴星系，正以远高于银河系的速率形成新恒星，中心有强烈的气体外流。',
      facts: [
        ['距离', '约 1,200 万光年'],
        ['编号', 'M82 / NGC 3034'],
        ['类型', 'Irr-II 星暴星系（边缘朝向观测者）'],
        ['星暴率', '约 10 太阳质量/年（银河系约 1–2）'],
        ['特殊结构', '中心垂直盘面的「超风」（superwind）与射电/ X 射线外流']
      ],
      observe: [
        '与 M81 波德星系角距约 0.5°，可在同一视野内对比观测',
        '小口径下呈细长条状，暗带明显；中心细节需要较大口径',
        '春季大熊座方向，适合与 M81 组成「星系对」观测目标'
      ],
      pro: 'M82 的星暴由与 M81 的近距交会触发，潮汐扰动使气体向中心汇聚。其星暴率约 10 M☉/yr，集中于中心数百秒差距内，产生大量超新星与强星风，形成沿盘面法向延伸数千光年的超风，是研究「星系反馈」的最近样本。',
      pop: '它和旁边的 M81 星系擦肩而过时被「搅」了一下，气体挤到中心，于是疯狂地产星。中心的风把物质吹出星系外，像一支冒烟的雪茄。',
      sources: [
        { n: 'NASA/IPAC Extragalactic Database', u: 'https://ned.ipac.caltech.edu/' },
        { n: 'SEDS Messier · M82', u: 'https://messier.seds.org/m/m082.html' }
      ],
      confidence: 0.93, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'm27', type: 'object', cn: '哑铃星云', en: 'Dumbbell Nebula', m: 'M27',
      aliases: ['m27', '哑铃星云', 'dumbbell nebula', 'ngc6853'],
      tag: '深空', visual: 'm27',
      summary: '狐狸座的行星状星云，是第一个被发现的行星状星云，中心有一颗白矮星。',
      facts: [
        ['距离', '约 1,360 光年'],
        ['编号', 'M27 / NGC 6853'],
        ['类型', '行星状星云'],
        ['中心星', '白矮星，表面温度约 85,000 K'],
        ['年龄', '约 3,000–4,000 年（膨胀时标）']
      ],
      observe: [
        '夏季狐狸座，双筒望远镜即可见明显的「哑铃」或「苹果核」形状',
        'OIII 滤镜能显著提升对比度，是行星状星云的常用手段',
        '视面较大且表面亮度较高，适合作为行星状星云的入门观测目标'
      ],
      pro: '行星状星云是类太阳恒星在渐近巨星支后抛出包层、露出核心白矮星所形成的电离气体壳。M27 的「哑铃」形态源于赤道方向密度较高、极向膨胀更快的几何结构，其中心白矮星的高温辐射提供了电离源。这类天体的元素丰度记录了恒星内部的核合成产物。',
      pop: '它不是行星，而是类太阳恒星临终时吐出的一层气体壳。中心的恒星已经缩成白矮星，用紫外光把这层气体点亮成荧光色。',
      sources: [
        { n: 'SEDS Messier · M27', u: 'https://messier.seds.org/m/m027.html' },
        { n: 'NASA · Planetary Nebulae', u: 'https://science.nasa.gov/universe/nebulae/' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },

    /* ---------------- 太阳系现象 ---------------- */
    {
      id: 'comet', type: 'phenomenon', cn: '彗星的分类与来源', en: 'Comet Classification',
      aliases: ['彗星的分类', '彗星来源', '短周期彗星', '长周期彗星', '彗核', '彗发', '奥尔特云彗星'],
      tag: '现象',
      summary: '由冰、尘埃与岩石组成的太阳系小天体，靠近太阳时升华出彗发与彗尾。',
      facts: [
        ['结构', '彗核（冰与尘埃的「脏雪球」）+ 彗发 + 尘埃尾 + 离子尾'],
        ['分类', '短周期（< 200 年，多来自柯伊伯带）/ 长周期（来自奥尔特云）'],
        ['典型尺寸', '彗核直径多在数百米至数十千米'],
        ['哈雷彗星', '周期约 76 年，下次回归 2061 年'],
        ['彗尾方向', '始终背向太阳，由太阳风与辐射压造成，与运动方向无关']
      ],
      observe: [
        '多数彗星亮度难以预测，发现初期的预报常偏乐观，应以临近时的实测为准',
        '双筒望远镜比高倍望远镜更适合扫视大面积彗发与彗尾',
        '避开月光与城市光污染，选择透明度高的夜晚'
      ],
      pro: '彗核是太阳系形成时的「时间胶囊」，保留原始挥发分。其活动由日心距驱动：约 3–5 AU 开始升华 H₂O，更近时 CO₂、CO 等更易挥发的成分参与，导致亮度与形态在数周内剧烈变化，这也是亮度预报不确定性的物理来源。',
      pop: '彗星像一个脏雪球。靠近太阳时冰变成气，裹住核心形成「彗发」，再被太阳风吹出一条长长的尾巴——尾巴永远背对太阳，所以它可能是「倒着飞」的。',
      sources: [
        { n: 'NASA · Comets', u: 'https://science.nasa.gov/solar-system/comets/' },
        { n: 'IAU Minor Planet Center', u: 'https://www.minorplanetcenter.net/' }
      ],
      confidence: 0.95, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'neo', type: 'phenomenon', cn: '近地天体', en: 'Near-Earth Object',
      aliases: ['近地天体', 'neo', 'near-earth object', '潜在威胁天体', 'pha'],
      tag: '现象',
      summary: '轨道可与地球轨道接近或相交的小行星与彗星，是行星防御的主要监测对象。',
      facts: [
        ['定义', '近日距 ≤ 1.3 AU 的小行星或彗星'],
        ['分类', '阿莫尔型 / 阿波罗型 / 阿滕型（按轨道与地球关系）'],
        ['潜在威胁天体', '直径 ≥ 140 m 且最小轨道交会距离 ≤ 0.05 AU'],
        ['监测', 'IAU  MPC 汇总观测，NASA CNEOS 计算撞击概率'],
        ['首次主动防御试验', 'DART 于 2022-09 撞击 Dimorphos，成功改变其轨道周期']
      ],
      observe: [
        '绝大多数近地小行星极暗，需专业望远镜与精确星历才能拍到',
        '业余可用长焦叠加拍摄较亮的近地天体，位置需从 MPC 获取最新星历',
        '不要采信「某日将撞击地球」的自媒体说法，以 CNEOS Sentry 与 ESA NEOCC 为准'
      ],
      pro: '近地天体的撞击风险评估依赖轨道测定精度与雅可比矩阵传播，误差随观测弧长增加而收敛。DART 任务首次验证了动能撞击可使小天体轨道周期产生可测变化（Dimorphos 周期缩短约 32 分钟），为行星防御提供了实测依据。',
      pop: '它们就是可能靠近地球的小行星和彗星。天文学家会持续跟踪，算出未来几十年的轨道。目前没有任何已知天体在近期构成实质威胁——网上的「撞击预警」基本都是误读。',
      sources: [
        { n: 'NASA CNEOS', u: 'https://cneos.jpl.nasa.gov/' },
        { n: 'ESA NEO Coordination Centre', u: 'https://neo.ssa.esa.int/' }
      ],
      confidence: 0.95, freshness: 'realtime', updated: '2026-10'
    },
    {
      id: 'mars-opposition', type: 'phenomenon', cn: '火星冲日', en: 'Mars Opposition',
      aliases: ['火星冲日', 'mars opposition', '火星大冲', '冲日'],
      tag: '现象',
      summary: '火星与太阳分处地球两侧、黄经相差 180° 的时刻，此时火星整夜可见且距离最近。',
      facts: [
        ['会合周期', '约 780 天（2 年 50 天左右）'],
        ['距离范围', '约 5,500 万 – 1 亿千米（取决于是否接近近日点）'],
        ['大冲', '约每 15–17 年一次，火星位于近日点附近，距离可近至 5,600 万千米'],
        ['最近一次大冲', '2018-07，距离约 5,760 万千米'],
        ['2020 年冲日', '2020-10-13，距离约 6,200 万千米']
      ],
      observe: [
        '冲日前后数周是最佳观测窗口，此时火星视直径最大、整夜可见',
        '视直径仅约 15–25 角秒，需要 150 倍以上放大才能看清极冠与暗区',
        '大气视宁度比口径更关键，建议等待火星高度较高时观测'
      ],
      pro: '冲日距离的差异由火星轨道的偏心率（约 0.093）造成：冲日若发生在火星近日点附近（近日点经度与冲日位置对齐），距离显著缩短，视直径可从约 14″ 增至约 25″。这一几何关系以约 15–17 年的周期重复。',
      pop: '火星冲日就是地球「超车」火星的时刻：两者距离最近，火星整夜挂在天上。每隔约 2 年一次，其中距离特别近的「大冲」要等 15 年以上。',
      sources: [
        { n: 'NASA · Mars', u: 'https://science.nasa.gov/mars/' },
        { n: 'JPL Horizons', u: 'https://ssd.jpl.nasa.gov/horizons/' }
      ],
      confidence: 0.96, freshness: 'ephemeris', updated: '2026-10'
    },
    {
      id: 'venus-transit', type: 'phenomenon', cn: '金星凌日', en: 'Transit of Venus',
      aliases: ['金星凌日', 'transit of venus', '凌日'],
      tag: '现象',
      summary: '金星从太阳圆面前方经过的罕见天象，成对出现、间隔超过一个世纪，历史上曾用于测量日地距离。',
      facts: [
        ['发生规律', '按 8 年 + 105.5 年 + 8 年 + 121.5 年的周期成对出现'],
        ['最近一次', '2012-06-06'],
        ['下一次', '2117-12 与 2125-12'],
        ['历史意义', '18–19 世纪的凌日观测（尤其是 1761/1769）首次较准确给出天文单位'],
        ['观测安全', '必须使用合格的太阳滤镜，肉眼或未加滤镜的望远镜直视会造成永久损伤']
      ],
      observe: [
        '只能用专用太阳滤镜或投影法观测，严禁直视',
        '全程持续数小时，凌入与凌出阶段可见「黑滴效应」（大气与光学共同造成）',
        '下一次要等到 2117 年，不存在「错过再等几年」的情况'
      ],
      pro: '金星凌日之所以罕见，是因为金星轨道相对黄道倾斜约 3.4°，只有在其下合时恰好位于黄道面附近才会遮挡日面。1761/1769 年的全球联合观测利用不同地点的视差与凌日持续时间差异推算日地距离，是早期国际协作科学的典范。',
      pop: '金星从太阳前面经过，看起来像太阳脸上的一个小黑点。这事极其罕见——成对出现，两对之间隔一百多年。上一次是 2012 年，下一次要等到 2117 年。',
      sources: [
        { n: 'NASA · Venus Transit', u: 'https://science.nasa.gov/venus/' },
        { n: 'ESA · Transits', u: 'https://www.esa.int/Science_Exploration/Space_Science' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'sunspot-flare', type: 'phenomenon', cn: '太阳耀斑与空间天气', en: 'Solar Flares and Space Weather',
      aliases: ['耀斑分级', 'x级耀斑', 'm级耀斑', '太阳活动周', '太阳风暴', 'solar flare class', '卡林顿事件'],
      tag: '太阳',
      summary: '太阳光球上的强磁场区（黑子）与磁能释放（耀斑），随约 11 年的活动周起伏。',
      facts: [
        ['黑子温度', '约 3,800–4,500 K，低于周围光球约 5,800 K，故显暗'],
        ['活动周', '约 11 年（极性翻转完整周期约 22 年）'],
        ['耀斑分级', 'A / B / C / M / X，每级相差 10 倍；X 级为大耀斑'],
        ['典型释放', 'X 级耀斑可在数分钟内释放 10²⁵ J 量级能量'],
        ['历史事件', '1859 年卡林顿事件：最强记录的地磁效应，电报系统受扰']
      ],
      observe: [
        '必须使用巴德膜等专用太阳滤镜，或使用投影法；绝不可用肉眼、墨镜、曝光胶片直视',
        '黑子在中低纬度成群出现，随自转约 27 天移动，可连续多日追踪',
        '耀斑本身在可见光下不易看到，通常以 Hα 或 X 射线监测数据为准'
      ],
      pro: '黑子是磁通量管穿过光球形成的区域，本影温度约 4,000 K、半影约 5,000 K，与光球的温差由磁压抑制对流造成。耀斑能量来自日冕磁场的重联，粒子沿开放磁力线逃逸形成太阳高能粒子事件，是空间天气预报的核心对象。',
      pop: '黑子不是「洞」，而是磁场压住了热量，所以那块地方比周围凉一些、看起来就黑一些。耀斑是磁场突然「打结松开」时释放的能量，强度大到会影响卫星和电网。',
      sources: [
        { n: 'NASA · Solar Dynamics Observatory', u: 'https://science.nasa.gov/mission/sdo/' },
        { n: 'NOAA SWPC', u: 'https://www.swpc.noaa.gov/' }
      ],
      confidence: 0.95, freshness: 'realtime', updated: '2026-10'
    },
    {
      id: 'geomagnetic-storm', type: 'phenomenon', cn: '地磁暴', en: 'Geomagnetic Storm',
      aliases: ['地磁暴', '磁暴', 'geomagnetic storm', 'g1-g5 磁暴', '极光爆发'],
      tag: '现象',
      summary: '太阳风与日冕物质抛射冲击地球磁层引发的全球磁场扰动，常伴随极光向低纬扩展。',
      facts: [
        ['分级', 'G1（Kp5）到 G5（Kp9），由 NOAA 按 Kp 指数划分'],
        ['成因', '日冕物质抛射（CME）或高速太阳风流与磁层耦合'],
        ['极光扩展', 'G4–G5 时极光可南压至北纬 40° 甚至更低'],
        ['技术影响', '卫星轨道衰减、导航误差、高频通信中断、电网地磁感应电流'],
        ['近期强事件', '2024-05 出现 G5 级磁暴，多地低纬度地区报告极光']
      ],
      observe: [
        '极光预测看 Kp 预报与 Bz 分量（南向有利于耦合），不要只看「太阳爆发了」',
        '中低纬看极光需要极暗天空与朝北的清晰低空视野，肉眼多为暗红色弥漫光',
        '航班与电网受影响属正常现象，个人无需特殊防护'
      ],
      pro: '地磁暴的能量输入取决于 IMF 的 Bz 分量与太阳风动压：持续南向 Bz 会增强磁层顶重联，把能量注入环电流，使 Dst 指数显著下降。G5 级对应 Dst 可达 −400 nT 量级，此时极光椭圆扩展至中纬，卫星大气阻力骤增，需轨道机动规避。',
      pop: '太阳抛出一大团带电物质撞上地球磁场，磁场被「摇」了一下——这就是地磁暴。它的副产品是极光被推到更低纬度，所以有时南方也能看到。',
      sources: [
        { n: 'NOAA SWPC · Geomagnetic Storms', u: 'https://www.swpc.noaa.gov/phenomena/geomagnetic-storms' },
        { n: 'ESA · Space Weather', u: 'https://www.esa.int/Safety_Security/Space_Weather' }
      ],
      confidence: 0.94, freshness: 'realtime', updated: '2026-10'
    },
    /* ---------------- 核心概念补充（此前缺失的基础原理） ---------------- */
    {
      id: 'hr-diagram', type: 'concept', cn: '赫罗图', en: 'Hertzsprung–Russell Diagram',
      aliases: ['赫罗图', 'hr图', 'hr diagram', 'hertzsprung-russell', '颜色-星等图'],
      tag: '概念',
      summary: '以温度（或光谱型）为横轴、光度（或绝对星等）为纵轴的恒星分类图，是理解恒星演化阶段的基本工具。',
      facts: [
        ['提出', '1911 年赫茨普龙、1913 年罗素分别独立提出'],
        ['横轴', '表面温度或光谱型（高温在左、低温在右）'],
        ['纵轴', '光度或绝对星等（上亮下暗）'],
        ['主要区带', '主序带、巨星支、超巨星支、白矮星区'],
        ['读图要点', '同一颗星在演化中会在图上移动，位置直接反映其半径与产能方式']
      ],
      observe: [
        '它不是「观测装置」图，而是统计分类图，需要大量恒星样本才有意义',
        '判断恒星类型时，颜色比亮度更可靠：颜色直接对应温度',
        '太阳位于主序中段（G2V），因此主序也叫「矮星序」'
      ],
      pro: '赫罗图本质是恒星物理的「相图」：主序对应核心氢燃烧、半径由质量决定；离开主序后进入巨星支，核心收缩、包层膨胀、表面温度下降而光度上升，因此向右上移动。等时线与演化轨迹的拟合是测定星团年龄与距离的主要手段。',
      pop: '把成千上万颗恒星按「温度」和「亮度」画成散点图，会发现它们不是随便分布的——大多数集中在一条对角线上，叫主序。这张图是理解恒星一生的地图。',
      sources: [
        { n: 'ESA · Gaia HR Diagram', u: 'https://www.cosmos.esa.int/web/gaia' },
        { n: 'NASA · Stars', u: 'https://science.nasa.gov/universe/stars/' }
      ],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'spectral-class', type: 'concept', cn: '恒星光谱分类', en: 'Stellar Spectral Classification',
      aliases: ['光谱分类', 'spectral class', 'obaFGKM', 'o型星', 'm型星', '巴尔末线'],
      tag: '概念',
      summary: '按吸收线特征把恒星分为 O、B、A、F、G、K、M 七型（及褐矮星的 L、T、Y），本质是温度序列。',
      facts: [
        ['序列', 'O → B → A → F → G → K → M（温度由高到低）'],
        ['温度范围', 'O 型可 > 30,000 K；M 型约 2,400–3,700 K'],
        ['褐矮星', 'L、T、Y 型，温度更低，不发生稳定氢聚变'],
        ['太阳', 'G2V（V 表示主序）'],
        ['历史', '哈佛分类（以吸收线强度）后经约基斯修订为温度序列']
      ],
      observe: [
        '业余可用低分辨率光谱或窄带测光粗略区分光谱型，直接目视只能看颜色',
        '颜色判型有局限：星际尘埃会使恒星偏红（红化），需修正',
        '「OBAFGKM」记忆口诀：Oh Be A Fine Girl/Guy, Kiss Me'
      ],
      pro: '光谱型序列由电离态与激发温度决定：O 型有强 He II 吸收线，A 型以氢巴尔末线最强，G 型出现 Ca II H/K 线，M 型以 TiO 分子带为主。光谱型与光度级（I–V）组合成二维分类，可进一步约束半径与演化阶段。',
      pop: '天文学家按「颜色和光谱里的暗线」给恒星排队，从最热的蓝色 O 型到最冷的红色 M 型，就是 OBAFGKM 七个字母。太阳属于中间的 G 型。',
      sources: [
        { n: 'SIMBAD · Spectral Types', u: 'https://simbad.u-strasbg.fr/simbad/' },
        { n: 'NASA · Stellar Spectra', u: 'https://science.nasa.gov/universe/stars/' }
      ],
      confidence: 0.97, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'kepler-laws', type: 'concept', cn: '开普勒三定律', en: "Kepler's Laws of Planetary Motion",
      aliases: ['开普勒定律', '开普勒三定律', 'kepler laws', '轨道定律', '面积定律', '周期定律'],
      tag: '概念',
      summary: '描述行星绕日运动的三条经验定律：椭圆轨道、等面积速度、周期与半长轴的三次方关系。',
      facts: [
        ['第一定律', '行星沿椭圆轨道运行，太阳位于一个焦点'],
        ['第二定律', '行星与太阳连线在相等时间扫过相等面积（近日点快、远日点慢）'],
        ['第三定律', 'P² ∝ a³（P 以年、a 以 AU 为单位时 P² = a³）'],
        ['提出', '1609（前两条）与 1619（第三条）年，开普勒基于第谷的观测数据'],
        ['适用范围', '也适用于卫星、双星与系外行星，需把质量项计入推广形式']
      ],
      observe: [
        '第三定律可直接用于估算：知道周期就能算轨道半长轴，反之亦然',
        '严格形式为 P² = 4π²a³/[G(M+m)]，忽略伴星质量时才是 P² = a³（太阳系近似）',
        '轨道偏心率决定季节长度差异，地球 e≈0.0167，影响很小'
      ],
      pro: '开普勒定律是牛顿万有引力定律的几何推论。第三定律的精确形式 P² = 4π²a³/(G(M+m)) 是测定天体质量的基础方法：观测双星周期与半长轴即可反解总质量，这也是系外行星视向速度法与天体测量法的物理基础。',
      pop: '三条规律：行星走椭圆；靠近太阳时跑得快；离太阳越远，绕一圈越久——而且「远」和「久」之间有精确的数学关系。',
      sources: [
        { n: 'NASA · Orbits and Kepler', u: 'https://science.nasa.gov/resource/orbits-and-keplers-laws/' },
        { n: 'JPL · Solar System Dynamics', u: 'https://ssd.jpl.nasa.gov/' }
      ],
      confidence: 0.98, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'standard-candle', type: 'concept', cn: '标准烛光与距离阶梯', en: 'Standard Candles and the Distance Ladder',
      aliases: ['标准烛光', '距离阶梯', 'standard candle', 'distance ladder', '造父变星测距', '周光关系', 'ia型超新星测距'],
      tag: '测量',
      summary: '通过「已知内禀亮度」的天体反推距离的方法体系，逐级接力构成从近邻到宇宙边缘的距离阶梯。',
      facts: [
        ['基本原理', '由视亮度与绝对亮度之差求距离：m − M = 5·lg(d) − 5'],
        ['第一级', '三角视差（Gaia 测量至数十万光年量级）'],
        ['第二级', '造父变星周光关系（Leavitt 1912 发现，周期越长越亮）'],
        ['第三级', 'Ia 型超新星（峰值亮度近一致，可测至数十亿光年）'],
        ['第四级', '红移与哈勃定律（z 与距离的关系，用于极远宇宙）']
      ],
      observe: [
        '这不是观测技巧，而是定标体系；每一级都要用前一级校准',
        '「哈勃张力」正是不同校准路径给出的 H₀ 不一致导致的',
        '看到「距离多少亿光年」时，应追问它用的是哪一级标尺'
      ],
      pro: '距离阶梯的核心风险是系统误差的逐级放大：视差零点、造父变星的金属丰度依赖、Ia 型超新星的光度演化修正，都会沿链条传递。当前不同路径给出的哈勃常数相差约 5σ（约 67 与约 73 km/s/Mpc），是宇宙学最受关注的具体分歧之一。',
      pop: '想知道远处有多远，得找「亮度已知」的灯。近处用视差量，中距离用会规律脉动的造父变星，更远用 Ia 型超新星。一级校准一级，像爬梯子。',
      sources: [
        { n: 'NASA · Cosmic Distance Ladder', u: 'https://science.nasa.gov/universe/' },
        { n: 'ESA · Hubble Constant', u: 'https://www.esa.int/Science_Exploration/Space_Science' }
      ],
      confidence: 0.95, freshness: 'active', updated: '2026-10',
      openQuestion: '不同测距路径给出的哈勃常数不一致（哈勃张力），原因尚未定论。'
    },
    {
      id: 'quasar-agn', type: 'concept', cn: '类星体与活动星系核', en: 'Quasars and Active Galactic Nuclei',
      aliases: ['类星体', '活动星系核', 'quasar', 'agn', '赛弗特星系', 'blazar'],
      tag: '宇宙',
      summary: '由中心超大质量黑洞吸积释放巨大能量的星系核心，类星体是其最亮的一类。',
      facts: [
        ['首个确认', '3C 273（1963 年，施密特识别出其红移 z≈0.158）'],
        ['产能机制', '超大质量黑洞吸积盘 + 相对论喷流，效率可远高于核聚变'],
        ['典型光度', '可达 10⁴⁶–10⁴⁷ erg/s，超过整个星系的恒星总和'],
        ['统一模型', '差异主要来自观测视角（吸积盘、宽线区、尘埃环、喷流的方向）'],
        ['与宿主关系', '中心黑洞质量与核球速度弥散存在 M–σ 关系']
      ],
      observe: [
        '类星体在光学上呈「点状」，与恒星难区分，需靠光谱红移或颜色判别',
        '部分亮类星体可用业余望远镜拍到，但要证认必须看光谱',
        '「闪烁」多为大气与仪器效应，不代表天体本身变化'
      ],
      pro: '活动星系核的统一模型把赛弗特、类星体、射电星系、blazar 归为同一类系统的不同视角：宽线区来自高速绕转的云团，窄线区来自较远低速气体，射电噪与喷流方向决定是否出现相对论聚束。类星体的高红移分布为宇宙学提供了大尺度结构探针。',
      pop: '类星体看起来像一颗星，其实是整个星系中心在发光——那里的超大质量黑洞在「吃东西」，释放的能量比整个星系所有恒星加起来还多。',
      sources: [
        { n: 'NASA · Active Galaxies', u: 'https://science.nasa.gov/universe/galaxies/' },
        { n: 'SIMBAD · 3C 273', u: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=3C+273' }
      ],
      confidence: 0.94, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'exoplanet-method', type: 'concept', cn: '系外行星探测方法', en: 'Exoplanet Detection Methods',
      aliases: ['系外行星探测', '视向速度法', '直接成像', '天体测量法', 'exoplanet detection'],
      tag: '探测',
      summary: '通过恒星亮度、光谱位移、引力透镜或直接成像间接/直接发现系外行星的方法体系。',
      facts: [
        ['凌星法', '行星遮挡恒星使亮度周期性微降（地球视角约 0.01% 量级）'],
        ['视向速度法', '恒星被行星牵引产生光谱周期位移，可给出质量下限'],
        ['微引力透镜', '行星引力短暂放大背景恒星，适合发现远距离冷行星'],
        ['直接成像', '遮挡恒星后拍摄行星，适合大轨道、年轻、自发光行星'],
        ['天体测量法', '测量恒星在天球上的微小轨迹摆动']
      ],
      observe: [
        '凌星法给出半径，视向速度法给出质量，两者结合才能得密度',
        '凌星必须轨道几乎正对视线，因此统计上有选择效应',
        '业余可参与凌星测光（如 TESS 后续观测、系外行星凌星计时）'
      ],
      pro: '各方法的选择效应不同：凌星偏向短周期大半径行星，视向速度偏向大质量行星，微引力透镜偏向中距离冷行星，直接成像偏向大轨道年轻行星。因此「已知系外行星的分布」是多种偏差叠加后的结果，不能直接等同于真实分布。JWST 的透射光谱进一步给出大气成分约束。',
      pop: '行星太小太暗，很难直接看到。所以天文学家改用「间接证据」：看恒星有没有周期性变暗（行星挡光）、有没有被拉得轻微晃动（行星牵引），甚至利用引力透镜。',
      sources: [
        { n: 'NASA Exoplanet Archive', u: 'https://exoplanetarchive.ipac.caltech.edu/' },
        { n: 'NASA · Exoplanets', u: 'https://science.nasa.gov/exoplanets/' }
      ],
      confidence: 0.96, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'equatorial-coords', type: 'concept', cn: '赤道坐标系', en: 'Equatorial Coordinate System',
      aliases: ['赤道坐标', '赤经', '赤纬', 'ra dec', 'equatorial coordinates', 'j2000', '历元'],
      tag: '观测',
      summary: '以天赤道为基准的坐标系统，用赤经与赤纬定位天体，是星表与望远镜指向的通用语言。',
      facts: [
        ['赤经 RA', '沿天赤道计量，单位时/分/秒，24h 对应 360°（1h = 15°）'],
        ['赤纬 Dec', '相对天赤道的角距离，+90° 为北天极'],
        ['常用历元', 'J2000.0（2000 年 1 月 1.5 日），旧星表可能用 B1950'],
        ['与地平坐标区别', '赤道坐标不随观测地与时刻变化；地平坐标（方位/高度）随时间和地点变化'],
        ['岁差影响', '春分点缓慢移动，跨历元比较坐标必须做岁差改正']
      ],
      observe: [
        '望远镜赤道仪的对极轴就是让机械轴与天极对齐，从而用 RA/Dec 直接指向',
        '手机星图给出的坐标多为 J2000 或「当前历元」，混用会带来约 0.3°/25 年的偏差',
        '天体的「升起方位」属于地平坐标，不能直接用赤经判断'
      ],
      pro: '赤道坐标是惯性参考系的球面表达：RA 沿赤道计量、Dec 垂直于赤道，因此恒星坐标在短期内近似固定，只受岁差、章动、自行影响。星表通常标注历元与参考架（如 ICRS），跨星表匹配时若忽略历元差异，会引入与时间成正比的系统偏移。',
      pop: '天上有套「经纬度」：赤经像经度、赤纬像纬度。它不随你在地球上哪个位置、几点钟而变，所以星图用它来给天体编号定位。',
      sources: [
        { n: 'SIMBAD · Coordinate Systems', u: 'https://simbad.u-strasbg.fr/simbad/' },
        { n: 'IAU · ICRS', u: 'https://www.iau.org/' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'nucleosynthesis', type: 'concept', cn: '元素合成', en: 'Nucleosynthesis',
      aliases: ['元素合成', '核合成', 'nucleosynthesis', 'r过程', 's过程', '大爆炸核合成', '重元素起源'],
      tag: '概念',
      summary: '宇宙中各种元素的形成途径：大爆炸核合成、恒星内部聚变、超新星与中子星并合中的快中子俘获。',
      facts: [
        ['大爆炸核合成', '宇宙最初几分钟生成 H、He 与微量 Li，氢约 75%、氦约 25%（质量比）'],
        ['恒星核合成', '主序氢聚变 → 氦；大质量恒星继续燃烧 C、Ne、O、Si，最终形成铁核'],
        ['s 过程', '慢中子俘获，发生在 AGB 星，生成到铅、铋一带的重元素'],
        ['r 过程', '快中子俘获，需爆发环境，生成金、铂、铀等最重元素'],
        ['r 过程站点', '中子星并合是已获观测支持的主要站点（GW170817 的光谱证据）']
      ],
      observe: [
        '「超新星制造了所有重元素」是过度简化：相当部分来自中子星并合与 AGB 星',
        '铁以后的元素无法靠聚变放能生成，必须依赖中子俘获或爆炸环境',
        '光谱中的元素丰度是推断天体内部过程的主要观测依据'
      ],
      pro: '核合成把天体物理与核物理连接起来：铁峰元素来自超新星爆炸时的准平衡过程，r 过程需要极高的中子丰度与短时标，其站点长期争论，GW170817 的千新星辐射与后续光谱为「中子星并合是主要 r 过程站点」提供了直接证据。锂丰度问题（宇宙锂问题）仍未完全解决。',
      pop: '你身体里的碳来自恒星内部，铁来自超新星，金和铂很可能来自中子星相撞。元素周期表其实是一部天体事件史。',
      sources: [
        { n: 'NASA · Origin of Elements', u: 'https://science.nasa.gov/universe/' },
        { n: 'ESA · GW170817', u: 'https://www.esa.int/Science_Exploration/Space_Science' }
      ],
      confidence: 0.94, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'grb', type: 'concept', cn: '伽马射线暴', en: 'Gamma-Ray Burst',
      aliases: ['伽马射线暴', '伽马暴', 'gamma-ray burst', 'grb', '长伽马暴', 'grb 221009a'],
      tag: '前沿',
      summary: '宇宙中最剧烈的瞬变现象之一，在数秒至数百秒内释放极高能量，分为长暴与短暴两类。',
      facts: [
        ['发现', '1967 年由 Vela 军事卫星偶然发现，1973 年公开'],
        ['分类', '长暴（> 2 秒，大质量恒星坍缩）/ 短暴（< 2 秒，致密天体并合）'],
        ['能量', '各向同性等效能量可达 10⁵⁴ erg 量级（若喷流聚束，真实能量低得多）'],
        ['最亮记录', 'GRB 221009A（2022-10-09），被称为 BOAT（史上最亮）'],
        ['余辉', 'X 射线、光学、射电余辉用于定位与宿主星系证认']
      ],
      observe: [
        '伽马射线无法从地面直接观测，需空间望远镜触发；光学余辉可用地面望远镜跟进',
        '业余观测者能参与的是余辉光学测光，不是伽马射线本身',
        '「伽马暴将毁灭地球」属误读：能束极窄且距离极远'
      ],
      pro: '长暴起源于大质量恒星核心坍缩形成的黑洞-吸积系统，伴随超新星；短暴起源于双中子星或中子星-黑洞并合。喷流以接近光速外扩，内部激波产生伽马辐射，与外部介质作用产生余辉。GRB 221009A 的极端亮度对标准余辉模型构成挑战，其喷流结构与能量仍有讨论。',
      pop: '宇宙里最猛烈的「闪光」：几秒钟内放出的能量比太阳一辈子还多。长的大多是大质量恒星塌缩，短的大多是两颗中子星撞在一起。',
      sources: [
        { n: 'NASA · Gamma-Ray Bursts', u: 'https://science.nasa.gov/universe/glossary/' },
        { n: 'NASA Swift', u: 'https://swift.gsfc.nasa.gov/' }
      ],
      confidence: 0.93, freshness: 'active', updated: '2026-10'
    },
    {
      id: 'gw-detection', type: 'concept', cn: '引力波探测原理', en: 'Gravitational Wave Detection',
      aliases: ['引力波探测', '激光干涉', '干涉仪', 'gw detection', '引力波应变'],
      tag: '探测',
      summary: '用激光干涉仪测量时空应变（相对长度变化）来探测引力波，应变幅度在 10⁻²¹ 量级。',
      facts: [
        ['原理', '迈克尔逊干涉：引力波使两臂长度发生反相微小变化'],
        ['典型尺度', 'LIGO 臂长 4 km，等效测量精度远小于质子尺度'],
        ['首次探测', 'GW150914（2015-09-14），双黑洞并合，2017 年获诺贝尔物理学奖'],
        ['典型信号', '频率约 35–250 Hz 的「啁啾」，应变峰值约 10⁻²¹'],
        ['多信使', 'GW170817 双中子星并合同时观测到引力波与电磁对应体']
      ],
      observe: [
        '引力波不是「声音」，「啁啾」只是频率随时间上升的波形描述',
        '地面干涉仪受地震与人类活动噪声影响，需要极低噪声环境与多重降噪',
        '空间计划（LISA）将探测更低频段，对应超大质量黑洞并合'
      ],
      pro: '干涉仪测量的是两臂长度差的相对变化 h = ΔL/L。由于 h 极小，需用功率 recycling、压缩光、隔震悬挂等技术压制量子与热噪声。地面探测器受「镜子热噪声」与「地震墙」限制，低频段需转到空间（LISA）与脉冲星计时阵列（纳赫兹）。',
      pop: '引力波经过时会把空间「拉长一点、压扁一点」。LIGO 用两束激光在 4 公里长的管道里比对长度，精度高到能测出比质子还小的变化——2015 年第一次测到了。',
      sources: [
        { n: 'LIGO · Detections', u: 'https://www.ligo.org/' },
        { n: 'NASA · Gravitational Waves', u: 'https://science.nasa.gov/universe/' }
      ],
      confidence: 0.96, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'telescope-optics', type: 'concept', cn: '望远镜分辨率与集光力', en: 'Telescope Resolution and Light Grasp',
      aliases: ['分辨率', '集光力', '瑞利判据', '极限星等', 'resolution', '望远镜口径'],
      tag: '观测',
      summary: '口径同时决定分辨细节的能力与收集光线的能力，是望远镜最核心的两个指标。',
      facts: [
        ['瑞利判据', 'θ ≈ 1.22 λ / D（弧度），D 为口径'],
        ['常见近似', '道斯极限约 116 / D(mm) 角秒，或 4.56 / D(英寸) 角秒'],
        ['集光力', '与口径平方成正比，200 mm 约为 50 mm 的 16 倍'],
        ['极限星等', '约 2 + 5·lg(D(mm))（经验式，受天空亮度影响很大）'],
        ['实际限制', '地面观测常受视宁度限制，大气抖动可能让大口径优势打折']
      ],
      observe: [
        '分辨率看口径，但实际清晰度先看视宁度：城市与低空目标常被大气限制',
        '集光力决定能看到多暗，分辨率决定能分开多近，两者不能互相替代',
        '「最大有效放大率」约等于口径毫米数的 2 倍，超过只会更糊'
      ],
      pro: '分辨率受衍射与大气共同限制：衍射极限由 D 决定，而地面视宁度（典型 1–3″）常成为瓶颈，这就是「自适应光学」与「幸运成像」存在的理由。集光力决定信噪比，对表面亮度低的目标（如 M33）比放大倍率更重要。',
      pop: '口径越大，两件事同时变强：看得更暗（收集更多光），看得更细（分辨更近的两点）。但地面观测还受空气抖动影响，所以「大」不等于「一定清楚」。',
      sources: [
        { n: 'NASA · Telescopes', u: 'https://science.nasa.gov/universe/telescopes/' },
        { n: 'ESO · Adaptive Optics', u: 'https://www.eso.org/public/teles-instr/' }
      ],
      confidence: 0.95, freshness: 'static', updated: '2026-10'
    },
    {
      id: 'darkmatter-detect', type: 'concept', cn: '暗物质探测方法', en: 'Dark Matter Detection',
      aliases: ['暗物质探测', '暗物质证据', '直接探测', '星系旋转曲线', 'dark matter detection'],
      tag: '探测',
      summary: '通过引力效应、宇宙学观测与地下实验寻找暗物质的三条路径：间接、天体物理与直接探测。',
      facts: [
        ['引力证据', '星系旋转曲线平坦（Rubin 等）、星系团速度弥散、强/弱引力透镜'],
        ['宇宙学证据', 'CMB 功率谱、大尺度结构形成、原初核合成'],
        ['占比', '约 26.8% 的宇宙能量密度（普朗克 2018）'],
        ['直接探测', '地下液氙/液氩探测器寻找核反冲（XENONnT、LZ 等）'],
        ['间接探测', '寻找暗物质湮灭/衰变的伽马、中微子、宇宙线信号']
      ],
      observe: [
        '暗物质不发光也不吸收光，无法用望远镜「看到」，只能通过引力效应推断',
        '直接探测至今未有确认信号，实验给出的是质量-截面排除线',
        '「暗物质不存在、只是引力理论要改」仍是竞争假设（MOND 等），但面临 CMB 与星系团的挑战'
      ],
      pro: '暗物质的证据是多重且相互独立的：旋转曲线要求额外的质量分布，CMB 声学峰的相对高度要求无压物质，星系团碰撞（如 Bullet Cluster）中引力中心与气体分离则难以用修改引力解释。直接探测的零结果不断压缩 WIMP 参数空间，推动轴子、暗光子等更轻的候选。',
      pop: '暗物质看不见，但它的引力在「拽」着星系转。天文学家用了三种办法找它：看星系的转动、看宇宙早期的微波背景、在地下深处等着它撞上原子核。至今还没抓到。',
      sources: [
        { n: 'NASA · Dark Matter', u: 'https://science.nasa.gov/universe/dark-matter-dark-energy/' },
        { n: 'ESA · Planck', u: 'https://www.esa.int/Science_Exploration/Space_Science/Planck' }
      ],
      confidence: 0.93, freshness: 'active', updated: '2026-10',
      openQuestion: '暗物质的粒子本质仍未确定，直接探测尚无确认信号。'
    },
    {
      id: 'neutrino-astronomy', type: 'concept', cn: '中微子天文学', en: 'Neutrino Astronomy',
      aliases: ['中微子天文学', '中微子探测', 'icecube', '超级神冈', 'neutrino astronomy', '太阳中微子问题'],
      tag: '探测',
      summary: '用几乎不与物质作用的中微子观测天体内部过程，是穿透尘埃与 Plasma 的唯一直接窗口。',
      facts: [
        ['首次太阳中微子探测', '1968 年 Davis 的氯实验，探测到的数量仅为理论约 1/3'],
        ['太阳中微子问题', '由 SNO（2001–2002）证实中微子振荡解决，证明中微子有质量'],
        ['超新星中微子', 'SN 1987A 被 Kamiokande II、IMB、Baksan 同时探测到约 24 个事件'],
        ['IceCube', '南极 1 km³ 冰中探测器，2013 年首次报告高能天体物理中微子'],
        ['银河系中微子', 'IceCube 于 2023 年报告银河系盘面中微子辐射证据']
      ],
      observe: [
        '中微子探测需要巨大体积与极低本底，个人无法参与，但公开数据可用于教学',
        '超新星中微子会比光提前数小时到达（因穿越包层时被延迟的是光子）',
        '中微子振荡证明三种味之间互相转换，是超出标准模型物理的实证'
      ],
      pro: '中微子只在弱作用与引力下参与，因此能直接从恒星核心、超新星爆发与活动星系核逃逸。SN 1987A 的中微子比光学光早约 3 小时到达，与「中微子先逃逸、激波后突破包层」的模型一致。IceCube 的 TeV–PeV 事件通过方向与能量重建寻找河外源，是「多信使天文学」的一极。',
      pop: '中微子几乎能穿过一切，所以它能从恒星最深处直接跑出来。1987 年一颗超新星爆发时，中微子比光早到了几个小时——这是人类第一次「看见」恒星塌缩的核心。',
      sources: [
        { n: 'IceCube Neutrino Observatory', u: 'https://icecube.wisc.edu/' },
        { n: 'NASA · Neutrino Astronomy', u: 'https://science.nasa.gov/universe/' }
      ],
      confidence: 0.93, freshness: 'active', updated: '2026-10'
    },

  ];


  /* 共识等级：established 已成共识 / emerging 前沿研究 / speculative 未定论 */
  E.forEach(function (e) {
    if (!e.status) e.status = 'established';
    if (!e.verified) e.verified = '2026-10';
  });

  var byId = {};
  E.forEach(function (e) { byId[e.id] = e; });

  root.KNOWLEDGE = { entries: E, byId: byId };
})(typeof window !== 'undefined' ? window : globalThis);
