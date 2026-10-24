/* ASTRUM · 太阳系天体数据（用于 3D 太阳系观测视图）
 * 半径 / 质量 / 自转周期 / 轴倾角 / 卫星：NASA Planetary Fact Sheet（2023 版）与各卫星表；
 * 反照率：NASA Fact Sheet 几何反照率；
 * 表面特征参数（带纹纬度、大红斑、极冠、暗斑等）：任务公开结论，见各条目 sources。
 * 位置不写在这里：行星位置直接复用 core/astro.js 的 JPL 近似根数（helio），保证与 2D 星图同源同刻。
 */
(function (root) {
  'use strict';

  var AU_KM = 149597870.7;

  var SUN = {
    key: 'sun', cn: '太阳', en: 'Sun', kind: 'star', parent: null,
    radiusKm: 695700, massKg: 1.9885e30, rotationH: 609.12, axialTilt: 7.25,
    albedo: 0, color: '#ffcf6b', glow: '#ffb347', tempC: '表面约 5,500 ℃',
    texture: 'sun', corona: true, moons: [],
    missions: ['SDO（2010–）', 'Solar Orbiter（2020–）', 'Parker Solar Probe（2018–）'],
    sources: [{ n: 'NASA Planetary Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' }]
  };

  var PLANETS = [
    {
      key: 'mercury', cn: '水星', en: 'Mercury', kind: 'planet', parent: 'sun',
      radiusKm: 2439.7, massKg: 3.3011e23, rotationH: 1407.6, axialTilt: 0.034,
      albedo: 0.142, color: '#b7b1a8', glow: '#8d867c', tempC: '−173 ~ 427 ℃',
      texture: 'mercury', moons: ['phobos_mercury'],
      missions: ['Mariner 10（1974）', 'MESSENGER（2011–2015）', 'BepiColombo（2026 抵达）'],
      sources: [{ n: 'NASA Planetary Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html' }]
    },
    {
      key: 'venus', cn: '金星', en: 'Venus', kind: 'planet', parent: 'sun',
      radiusKm: 6051.8, massKg: 4.8675e24, rotationH: -5832.5, axialTilt: 177.36,
      albedo: 0.689, color: '#eadfb4', glow: '#c9b887', tempC: '约 464 ℃',
      texture: 'venus', atmosphere: { color: 'rgba(248,222,150,0.55)', strength: 0.85, inner: 0.93 },
      moons: [],
      missions: ['麦哲伦号（1989–1994）', '金星快车（2006–2014）', 'Akatsuki（2015–2024）'],
      sources: [{ n: 'NASA Venus Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html' }]
    },
    {
      key: 'earth', cn: '地球', en: 'Earth', kind: 'planet', parent: 'sun',
      radiusKm: 6371.0, massKg: 5.97237e24, rotationH: 23.9345, axialTilt: 23.44,
      albedo: 0.434, color: '#3f6fb5', glow: '#4f86d8', tempC: '全球平均约 15 ℃',
      texture: 'earth', clouds: true,
      atmosphere: { color: 'rgba(126,186,255,0.62)', strength: 1.0, inner: 0.9 },
      moons: ['moon'],
      missions: ['Landsat / Sentinel（对地观测）', 'Sentinel-6（2020–）'],
      sources: [{ n: 'NASA Earth Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' }]
    },
    {
      key: 'mars', cn: '火星', en: 'Mars', kind: 'planet', parent: 'sun',
      radiusKm: 3389.5, massKg: 6.4171e23, rotationH: 24.6229, axialTilt: 25.19,
      albedo: 0.170, color: '#c9704f', glow: '#9c4f33', tempC: '平均 −63 ℃',
      texture: 'mars',
      atmosphere: { color: 'rgba(226,176,140,0.28)', strength: 0.42, inner: 0.96 },
      moons: ['phobos', 'deimos'],
      missions: ['MRO（2006–）', '好奇号（2012–）', 'MAVEN（2014–）', '毅力号（2021–）'],
      sources: [{ n: 'NASA Mars Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' }]
    },
    {
      key: 'jupiter', cn: '木星', en: 'Jupiter', kind: 'planet', parent: 'sun',
      radiusKm: 69911, massKg: 1.8982e27, rotationH: 9.925, axialTilt: 3.13,
      albedo: 0.538, color: '#d9bd93', glow: '#b08f63', tempC: '云顶约 −108 ℃',
      texture: 'jupiter', bands: true,
      moons: ['io', 'europa', 'ganymede', 'callisto'],
      missions: ['旅行者 1/2 号（1979）', '伽利略号（1995–2003）', '朱诺号（2016–）'],
      sources: [{ n: 'NASA Jupiter Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html' }]
    },
    {
      key: 'saturn', cn: '土星', en: 'Saturn', kind: 'planet', parent: 'sun',
      radiusKm: 58232, massKg: 5.6834e26, rotationH: 10.656, axialTilt: 26.73,
      albedo: 0.499, color: '#e3d0a4', glow: '#bda678', tempC: '云顶约 −139 ℃',
      texture: 'saturn', bands: true,
      rings: {
        innerKm: 74500, outerKm: 140220,
        divisions: [
          { name: 'C 环', innerKm: 74500, outerKm: 92000, shade: 0.35 },
          { name: 'B 环', innerKm: 92000, outerKm: 117580, shade: 1.0 },
          { name: '卡西尼缝', innerKm: 117580, outerKm: 122170, shade: 0.12 },
          { name: 'A 环', innerKm: 122170, outerKm: 136775, shade: 0.72 },
          { name: 'F 环', innerKm: 140180, outerKm: 140220, shade: 0.3 }
        ]
      },
      moons: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
      missions: ['先驱者 11 号（1979）', '旅行者 1/2 号（1980–1981）', '卡西尼-惠更斯（2004–2017）'],
      sources: [{ n: 'NASA Saturn Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html' }]
    },
    {
      key: 'uranus', cn: '天王星', en: 'Uranus', kind: 'planet', parent: 'sun',
      radiusKm: 25362, massKg: 8.6810e25, rotationH: -17.24, axialTilt: 97.77,
      albedo: 0.488, color: '#a9dde2', glow: '#7fb8c0', tempC: '约 −197 ℃',
      texture: 'uranus', bands: true,
      rings: {
        innerKm: 41800, outerKm: 51150,
        divisions: [{ name: 'ε 环', innerKm: 51149, outerKm: 51150, shade: 0.9 }]
      },
      moons: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
      missions: ['旅行者 2 号（1986）', '哈勃 / 凯克长期监测'],
      sources: [{ n: 'NASA Uranus Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranusfact.html' }]
    },
    {
      key: 'neptune', cn: '海王星', en: 'Neptune', kind: 'planet', parent: 'sun',
      radiusKm: 24622, massKg: 1.02413e26, rotationH: 16.11, axialTilt: 28.32,
      albedo: 0.442, color: '#6f8fe0', glow: '#4a66b0', tempC: '约 −201 ℃',
      texture: 'neptune', bands: true,
      moons: ['nereid', 'proteus', 'triton'],
      missions: ['旅行者 2 号（1989）', '哈勃 / 凯克长期监测'],
      sources: [{ n: 'NASA Neptune Fact Sheet', u: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html' }]
    }
  ];

  var MOONS = [
    { key: 'moon', cn: '月球', en: 'Moon', kind: 'moon', parent: 'earth', radiusKm: 1737.4, massKg: 7.342e22, rotationH: 655.72, orbitKm: 384400, periodD: 27.3217, albedo: 0.136, color: '#cfc9bb', texture: 'moon', missions: ['阿波罗（1968–1972）', 'LRO（2009–）', '嫦娥四号（2019）'] },
    { key: 'phobos', cn: '火卫一', en: 'Phobos', kind: 'moon', parent: 'mars', radiusKm: 11.27, massKg: 1.0659e16, rotationH: 7.65, orbitKm: 9376, periodD: 0.31891, albedo: 0.071, color: '#8d7f74', texture: 'rock' },
    { key: 'deimos', cn: '火卫二', en: 'Deimos', kind: 'moon', parent: 'mars', radiusKm: 6.2, massKg: 1.4762e15, rotationH: 30.31, orbitKm: 23463, periodD: 1.263, albedo: 0.068, color: '#9c8d80', texture: 'rock' },
    { key: 'io', cn: '木卫一', en: 'Io', kind: 'moon', parent: 'jupiter', radiusKm: 1821.6, massKg: 8.9319e22, rotationH: 42.46, orbitKm: 421700, periodD: 1.769, albedo: 0.63, color: '#d8c25a', texture: 'io', missions: ['旅行者 1/2 号', '伽利略号', '朱诺号'] },
    { key: 'europa', cn: '木卫二', en: 'Europa', kind: 'moon', parent: 'jupiter', radiusKm: 1560.8, massKg: 4.7998e22, rotationH: 85.22, orbitKm: 671100, periodD: 3.551, albedo: 0.67, color: '#cbb89a', texture: 'europa', missions: ['旅行者 2 号', '伽利略号', '朱诺号'] },
    { key: 'ganymede', cn: '木卫三', en: 'Ganymede', kind: 'moon', parent: 'jupiter', radiusKm: 2634.1, massKg: 1.4819e23, rotationH: 171.7, orbitKm: 1070400, periodD: 7.155, albedo: 0.43, color: '#a49b8f', texture: 'ganymede', missions: ['旅行者 1/2 号', '伽利略号', 'JUICE（2031 抵达）'] },
    { key: 'callisto', cn: '木卫四', en: 'Callisto', kind: 'moon', parent: 'jupiter', radiusKm: 2410.3, massKg: 1.0759e23, rotationH: 400.5, orbitKm: 1882700, periodD: 16.689, albedo: 0.17, color: '#7d7367', texture: 'rock' },
    { key: 'mimas', cn: '土卫一', en: 'Mimas', kind: 'moon', parent: 'saturn', radiusKm: 198.2, massKg: 3.749e19, rotationH: 22.62, orbitKm: 185539, periodD: 0.942, albedo: 0.962, color: '#cfcabd', texture: 'rock' },
    { key: 'enceladus', cn: '土卫二', en: 'Enceladus', kind: 'moon', parent: 'saturn', radiusKm: 252.1, massKg: 1.0802e20, rotationH: 32.89, orbitKm: 238040, periodD: 1.37, albedo: 1.375, color: '#eef2f6', texture: 'enceladus', missions: ['卡西尼-惠更斯（2004–2017）'] },
    { key: 'tethys', cn: '土卫三', en: 'Tethys', kind: 'moon', parent: 'saturn', radiusKm: 531.1, massKg: 6.174e20, rotationH: 45.31, orbitKm: 294619, periodD: 1.888, albedo: 1.229, color: '#e3e2dc', texture: 'rock' },
    { key: 'dione', cn: '土卫四', en: 'Dione', kind: 'moon', parent: 'saturn', radiusKm: 561.4, massKg: 1.0954e21, rotationH: 65.69, orbitKm: 377396, periodD: 2.737, albedo: 0.998, color: '#d8d5cb', texture: 'rock' },
    { key: 'rhea', cn: '土卫五', en: 'Rhea', kind: 'moon', parent: 'saturn', radiusKm: 763.8, massKg: 2.3065e21, rotationH: 108.4, orbitKm: 527108, periodD: 4.518, albedo: 0.949, color: '#d3d0c7', texture: 'rock' },
    { key: 'titan', cn: '土卫六', en: 'Titan', kind: 'moon', parent: 'saturn', radiusKm: 2574.7, massKg: 1.3452e23, rotationH: 382.7, orbitKm: 1221870, periodD: 15.945, albedo: 0.22, color: '#d99b3f', texture: 'titan', atmosphere: { color: 'rgba(255,186,92,0.6)', strength: 1.0, inner: 0.88 }, missions: ['旅行者 1/2 号', '卡西尼-惠更斯', 'Dragonfly（2034 抵达）'] },
    { key: 'iapetus', cn: '土卫八', en: 'Iapetus', kind: 'moon', parent: 'saturn', radiusKm: 734.5, massKg: 1.8056e21, rotationH: 1903.9, orbitKm: 3560840, periodD: 79.32, albedo: 0.05, color: '#8a8279', texture: 'rock' },
    { key: 'miranda', cn: '天卫五', en: 'Miranda', kind: 'moon', parent: 'uranus', radiusKm: 235.8, massKg: 6.4e19, rotationH: 33.92, orbitKm: 129390, periodD: 1.413, albedo: 0.32, color: '#a8a6a1', texture: 'rock' },
    { key: 'ariel', cn: '天卫一', en: 'Ariel', kind: 'moon', parent: 'uranus', radiusKm: 578.9, massKg: 1.353e21, rotationH: 60.48, orbitKm: 190900, periodD: 2.52, albedo: 0.39, color: '#b3b2ad', texture: 'rock' },
    { key: 'umbriel', cn: '天卫二', en: 'Umbriel', kind: 'moon', parent: 'uranus', radiusKm: 584.7, massKg: 1.172e21, rotationH: 99.46, orbitKm: 266000, periodD: 4.144, albedo: 0.21, color: '#7e7c76', texture: 'rock' },
    { key: 'titania', cn: '天卫三', en: 'Titania', kind: 'moon', parent: 'uranus', radiusKm: 788.4, massKg: 3.527e21, rotationH: 208.94, orbitKm: 435910, periodD: 8.706, albedo: 0.27, color: '#9d968b', texture: 'rock' },
    { key: 'oberon', cn: '天卫四', en: 'Oberon', kind: 'moon', parent: 'uranus', radiusKm: 761.4, massKg: 3.014e21, rotationH: 323.12, orbitKm: 583520, periodD: 13.463, albedo: 0.23, color: '#8d8377', texture: 'rock' },
    { key: 'nereid', cn: '海卫一', en: 'Nereid', kind: 'moon', parent: 'neptune', radiusKm: 170, massKg: 3.1e19, rotationH: 11.52, orbitKm: 5513818, periodD: 360.14, albedo: 0.155, color: '#9b9a95', texture: 'rock' },
    { key: 'proteus', cn: '海卫八', en: 'Proteus', kind: 'moon', parent: 'neptune', radiusKm: 210, massKg: 4.4e19, rotationH: 0.76, orbitKm: 117647, periodD: 1.122, albedo: 0.096, color: '#6f6d69', texture: 'rock' },
    { key: 'triton', cn: '海卫一', en: 'Triton', kind: 'moon', parent: 'neptune', radiusKm: 1353.4, massKg: 2.139e22, rotationH: -141.05, orbitKm: 354759, periodD: 5.877, albedo: 0.76, color: '#d6cbc0', texture: 'triton', missions: ['旅行者 2 号（1989）'] }
  ];

  /* 汇总索引 */
  var BY_KEY = {};
  var LIST = [];
  function reg(b) { BY_KEY[b.key] = b; LIST.push(b); }
  reg(SUN);
  PLANETS.forEach(reg);
  MOONS.forEach(reg);

  /* 卫星轨道方向：海卫一为逆行，其余顺行 */
  MOONS.forEach(function (m) { m.retrograde = m.periodD < 0; });

  root.SOLAR = {
    auKm: AU_KM,
    sun: SUN,
    planets: PLANETS,
    moons: MOONS,
    all: LIST,
    byKey: BY_KEY,
    moonsOf: function (parentKey) {
      return MOONS.filter(function (m) { return m.parent === parentKey; });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
