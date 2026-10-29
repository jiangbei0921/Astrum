/* ASTRUM · 静态星表数据层
 * 坐标系：J2000.0；ra 单位=小时，dec 单位=度，mag=视星等
 * 数据来源：Yale Bright Star Catalogue / IAU 星座边界 / Messier 星表（离线快照）
 * 注意： constellations.lines 为示意连线（stick figure），非 IAU 官方边界
 */
(function (root) {
  'use strict';

  /* [key, en, cn, bayer, con, ra(h), dec(deg), mag] */
  var RAW = [
    ['sirius','Sirius','天狼星','α','CMa',6.75248,-16.7161,-1.46],
    ['canopus','Canopus','老人星','α','Car',6.39920,-52.6957,-0.74],
    ['arcturus','Arcturus','大角星','α','Boo',14.26103,19.1824,-0.05],
    ['rigilkent','Rigil Kentaurus','南门二','α','Cen',14.65994,-60.8354,-0.27],
    ['vega','Vega','织女一','α','Lyr',18.61565,38.7837,0.03],
    ['capella','Capella','五车二','α','Aur',5.27814,45.9980,0.08],
    ['rigel','Rigel','参宿七','β','Ori',5.24230,-8.2016,0.13],
    ['procyon','Procyon','南河三','α','CMi',7.65515,5.2250,0.34],
    ['achernar','Achernar','水委一','α','Eri',1.62856,-57.2367,0.46],
    ['betelgeuse','Betelgeuse','参宿四','α','Ori',5.91953,7.4070,0.50],
    ['hadar','Hadar','马腹一','β','Cen',14.06373,-60.3730,0.61],
    ['altair','Altair','河鼓二','α','Aql',19.84639,8.8683,0.77],
    ['acrux','Acrux','十字架二','α','Cru',12.44331,-63.0991,0.77],
    ['aldebaran','Aldebaran','毕宿五','α','Tau',4.59868,16.5093,0.85],
    ['spica','Spica','角宿一','α','Vir',13.41989,-11.1613,0.98],
    ['antares','Antares','心宿二','α','Sco',16.49013,-26.4320,1.09],
    ['pollux','Pollux','北河三','β','Gem',7.75526,28.0262,1.14],
    ['fomalhaut','Fomalhaut','北落师门','α','PsA',22.96084,-29.6222,1.16],
    ['deneb','Deneb','天津四','α','Cyg',20.69053,45.2803,1.25],
    ['mimosa','Mimosa','十字架三','β','Cru',12.79535,-59.6888,1.25],
    ['regulus','Regulus','轩辕十四','α','Leo',10.13953,11.9672,1.35],
    ['adhara','Adhara','弧矢七','ε','CMa',6.97723,-28.9721,1.50],
    ['castor','Castor','北河二','α','Gem',7.57668,31.8883,1.58],
    ['shaula','Shaula','尾宿八','λ','Sco',17.56014,-37.1038,1.62],
    ['gacrux','Gacrux','十字架一','γ','Cru',12.51944,-57.1132,1.63],
    ['bellatrix','Bellatrix','参宿五','γ','Ori',5.41885,6.3497,1.64],
    ['elnath','Elnath','五车五','β','Tau',5.43820,28.6075,1.65],
    ['miaplacidus','Miaplacidus','南船五','β','Car',9.22006,-69.7172,1.67],
    ['alnilam','Alnilam','参宿二','ε','Ori',5.60356,-1.2019,1.69],
    ['alnair','Alnair','鹤一','α','Gru',22.13722,-46.9610,1.74],
    ['alioth','Alioth','玉衡','ε','UMa',12.90046,55.9598,1.77],
    ['alnitak','Alnitak','参宿一','ζ','Ori',5.67931,-1.9426,1.77],
    ['mirfak','Mirfak','天船三','α','Per',3.40538,49.8612,1.79],
    ['dubhe','Dubhe','天枢','α','UMa',11.06213,61.7510,1.79],
    ['wezen','Wezen','弧矢一','δ','CMa',7.13986,-26.3932,1.83],
    ['kausaustralis','Kaus Australis','箕宿三','ε','Sgr',18.40287,-34.3846,1.85],
    ['alkaid','Alkaid','摇光','η','UMa',13.79234,49.3133,1.86],
    ['sargas','Sargas','尾宿五','θ','Sco',17.62209,-42.9978,1.86],
    ['avior','Avior','海石一','ε','Car',8.37523,-59.5095,1.86],
    ['menkalinan','Menkalinan','五车三','β','Aur',5.99215,44.9474,1.90],
    ['atria','Atria','三角形三','α','TrA',16.81106,-69.0277,1.91],
    ['alhena','Alhena','井宿三','γ','Gem',6.62853,16.3993,1.93],
    ['peacock','Peacock','孔雀十一','α','Pav',20.42746,-56.7351,1.94],
    ['mirzam','Mirzam','军市一','β','CMa',6.37833,-17.9559,1.98],
    ['alphard','Alphard','星宿一','α','Hya',9.45979,-8.6586,1.98],
    ['polaris','Polaris','北极星','α','UMi',2.53030,89.2641,1.98],
    ['hamal','Hamal','娄宿三','α','Ari',2.11952,23.4624,2.00],
    ['diphda','Diphda','土司空','β','Cet',0.72649,-17.9866,2.04],
    ['nunki','Nunki','斗宿四','σ','Sgr',18.92109,-26.2967,2.05],
    ['menkent','Menkent','库楼三','θ','Cen',14.11140,-36.3700,2.06],
    ['alpheratz','Alpheratz','壁宿二','α','And',0.13979,29.0904,2.06],
    ['saiph','Saiph','参宿六','κ','Ori',5.79594,-9.6696,2.07],
    ['kochab','Kochab','帝','β','UMi',14.84509,74.1555,2.08],
    ['algieba','Algieba','轩辕十二','γ','Leo',10.33287,19.8415,2.08],
    ['rasalhague','Rasalhague','侯','α','Oph',17.58224,12.5600,2.08],
    ['mirach','Mirach','奎宿九','β','And',1.16218,35.6206,2.06],
    ['algol','Algol','大陵五','β','Per',3.13615,40.9556,2.12],
    ['denebola','Denebola','五帝座一','β','Leo',11.81766,14.5720,2.14],
    ['navi','Navi','策','γ','Cas',0.94514,60.7167,2.15],
    ['naos','Naos','','ζ','Pup',8.05974,-40.0031,2.21],
    ['aspidiske','Aspidiske','海石二','ι','Car',9.28484,-59.2753,2.21],
    ['suhail','Suhail','','λ','Vel',9.13327,-43.4326,2.21],
    ['alphecca','Alphecca','贯索四','α','CrB',15.57813,26.7147,2.23],
    ['mizar','Mizar','开阳','ζ','UMa',13.39875,54.9254,2.23],
    ['sadr','Sadr','天津一','γ','Cyg',20.37047,40.2567,2.23],
    ['schedar','Schedar','王良四','α','Cas',0.67511,56.5373,2.24],
    ['eltanin','Eltanin','天棓四','γ','Dra',17.94344,51.4889,2.24],
    ['mintaka','Mintaka','参宿三','δ','Ori',5.53344,-0.2991,2.25],
    ['caph','Caph','王良一','β','Cas',0.15288,59.1498,2.27],
    ['izar','Izar','梗河一','ε','Boo',14.74978,27.0742,2.37],
    ['enif','Enif','危宿三','ε','Peg',21.73643,9.8750,2.38],
    ['scheat','Scheat','室宿二','β','Peg',23.06290,28.0828,2.42],
    ['markab','Markab','室宿一','α','Peg',23.07935,15.2053,2.49],
    ['merak','Merak','天璇','β','UMa',11.03069,56.3824,2.37],
    ['phecda','Phecda','天玑','γ','UMa',11.89718,53.6948,2.44],
    ['megrez','Megrez','天权','δ','UMa',12.25709,57.0326,3.31],
    ['algenib','Algenib','壁宿一','γ','Peg',0.22060,15.1836,2.83],
    ['ruchbah','Ruchbah','阁道三','δ','Cas',1.43026,60.2353,2.68],
    ['segin','Segin','阁道二','ε','Cas',1.90657,63.6701,3.38],
    ['zubeneschamali','Zubeneschamali','氐宿四','β','Lib',15.28345,-9.3829,2.61],
    ['sheratan','Sheratan','娄宿一','β','Ari',1.91069,20.8080,2.64],
    ['sadalsuud','Sadalsuud','虚宿一','β','Aqr',21.52597,-5.5712,2.90],
    ['sadalmelik','Sadalmelik','危宿一','α','Aqr',22.09640,-0.3199,2.95],
    ['yildun','Yildun','','δ','UMi',17.53722,86.5864,4.35],
    ['epsilonumi','Epsilon UMi','','ε','UMi',16.76614,82.0373,4.23],
    ['zetaumi','Zeta UMi','','ζ','UMi',15.73450,77.7945,4.29],
    ['pherkad','Pherkad','太子','γ','UMi',15.34549,71.8340,3.00],
    ['albireo','Albireo','辇道增七','β','Cyg',19.51203,27.9597,3.05],
    ['gienah','Gienah','天津九','ε','Cyg',20.77019,33.9703,2.48],
    ['deltacyg','Delta Cyg','','δ','Cyg',19.74957,45.1308,2.87],
    ['sheliak','Sheliak','渐台二','β','Lyr',18.83466,33.3627,3.52],
    ['sulafat','Sulafat','渐台三','γ','Lyr',18.98240,32.6896,3.25],
    ['deltalyr','Delta Lyr','','δ','Lyr',18.90810,36.8986,4.30],
    ['tarazed','Tarazed','河鼓三','γ','Aql',19.77099,10.6133,2.72],
    ['alshain','Alshain','河鼓一','β','Aql',19.92186,6.4067,3.71],
    ['dsco','Dschubba','房宿三','δ','Sco',16.00556,-22.6217,2.29],
    ['sigm sco','Sigma Sco','','σ','Sco',16.35333,-25.5928,2.89],
    ['tausco','Tau Sco','','τ','Sco',16.59804,-28.2160,2.82],
    ['epsco','Epsilon Sco','','ε','Sco',16.83608,-34.2932,2.29],
    ['lesath','Lesath','尾宿九','υ','Sco',17.51267,-37.2958,2.70],
    ['zosma','Zosma','西上相','δ','Leo',11.23514,20.5237,2.56],
    ['chertan','Chertan','西次相','θ','Leo',11.23728,15.4297,3.33],
    ['rasalas','Rasalas','轩辕九','μ','Leo',9.87940,26.0069,3.88],
    ['epslEO','Epsilon Leo','','ε','Leo',9.76420,23.7743,2.98],
    ['etaleo','Eta Leo','','η','Leo',10.12220,16.7627,3.48],
    ['wasat','Wasat','天樽二','δ','Gem',7.33536,21.9823,3.53],
    ['mebsuta','Mebsuta','井宿五','ε','Gem',6.73229,25.1311,2.98],
    ['zetatau','Zeta Tau','','ζ','Tau',5.62742,21.1425,3.00],
    ['gammatau','Gamma Tau','','γ','Tau',4.32989,15.6276,3.65],
    ['epsTau','Epsilon Tau','','ε','Tau',4.47772,19.1804,3.53],
    ['muphrid','Muphrid','右摄提一','η','Boo',13.91141,18.3977,2.68],
    ['nekkar','Nekkar','七公增五','β','Boo',15.03244,40.3906,3.49],
    ['seginus','Seginus','招摇','γ','Boo',14.53463,38.3082,3.03],
    ['deltaboo','Delta Boo','','δ','Boo',15.25838,33.3147,3.47],
    ['deltacru','Delta Cru','','δ','Cru',12.25251,-58.7489,2.79],
    ['mahasim','Mahasim','五车四','θ','Aur',5.99535,37.2126,2.62],
    ['aludra','Aludra','弧矢二','η','CMa',7.40158,-29.3031,2.45],
    ['furud','Furud','丈人一','ζ','CMa',6.33855,-30.0634,3.02],
    ['gomeisa','Gomeisa','南河二','β','CMi',7.45253,8.2893,2.89],
    ['porrima','Porrima','东上相','γ','Vir',12.69436,-1.4494,2.74],
    ['vindemiatrix','Vindemiatrix','东次将','ε','Vir',13.03628,10.9591,2.83],
    ['zavijava','Zavijava','右执法','β','Vir',11.84491,1.7647,3.61],
    ['heze','Heze','角宿二','ζ','Vir',13.57870,-0.5958,3.38],
    ['kausmedia','Kaus Media','箕宿二','δ','Sgr',18.34990,-29.8281,2.70],
    ['kausborealis','Kaus Borealis','斗宿二','λ','Sgr',18.46616,-25.4217,2.81],
    ['phisgr','Phi Sgr','','φ','Sgr',18.68595,-26.9906,3.17],
    ['deltand','Delta And','','δ','And',0.65546,30.8610,3.27],
    ['almach','Almach','天大将军一','γ','And',2.06496,42.3297,2.10],
    ['epsper','Epsilon Per','','ε','Per',3.96422,40.0103,2.89],
    ['rastaban','Rastaban','天棓三','β','Dra',17.50721,52.3014,2.79],
    ['edasich','Edasich','左枢','ι','Dra',15.41552,58.9660,3.29],
    ['thuban','Thuban','右枢','α','Dra',14.07323,64.3758,3.65]
  ];

  var stars = RAW.map(function (r) {
    return { k: r[0], en: r[1], cn: r[2], bayer: r[3], con: r[4], ra: r[5], dec: r[6], mag: r[7] };
  });

  /* 星座：lines 为易读骨架连线（示意） */
  var constellations = [
    { abbr:'Ori', cn:'猎户座', en:'Orion', season:'冬季', lines:[
      ['betelgeuse','bellatrix'],['bellatrix','mintaka'],['mintaka','alnilam'],['alnilam','alnitak'],
      ['alnitak','betelgeuse'],['alnitak','saiph'],['mintaka','rigel'],['saiph','rigel'] ] },
    { abbr:'UMa', cn:'大熊座', en:'Ursa Major', season:'春季', lines:[
      ['dubhe','merak'],['merak','phecda'],['phecda','megrez'],['megrez','dubhe'],
      ['megrez','alioth'],['alioth','mizar'],['mizar','alkaid'] ] },
    { abbr:'UMi', cn:'小熊座', en:'Ursa Minor', season:'全年', lines:[
      ['polaris','yildun'],['yildun','epsilonumi'],['epsilonumi','zetaumi'],
      ['zetaumi','kochab'],['kochab','pherkad'],['pherkad','zetaumi'] ] },
    { abbr:'Cas', cn:'仙后座', en:'Cassiopeia', season:'秋季', lines:[
      ['caph','schedar'],['schedar','navi'],['navi','ruchbah'],['ruchbah','segin'] ] },
    { abbr:'Cyg', cn:'天鹅座', en:'Cygnus', season:'夏季', lines:[
      ['deneb','sadr'],['sadr','albireo'],['sadr','gienah'],['sadr','deltacyg'],['deltacyg','deneb'] ] },
    { abbr:'Lyr', cn:'天琴座', en:'Lyra', season:'夏季', lines:[
      ['vega','sheliak'],['sheliak','sulafat'],['sulafat','deltalyr'],['deltalyr','vega'] ] },
    { abbr:'Aql', cn:'天鹰座', en:'Aquila', season:'夏季', lines:[
      ['tarazed','altair'],['altair','alshain'] ] },
    { abbr:'Sco', cn:'天蝎座', en:'Scorpius', season:'夏季', lines:[
      ['antares','dsco'],['dsco','sigm sco'],['sigm sco','tausco'],['tausco','epsco'],
      ['epsco','sargas'],['sargas','shaula'],['shaula','lesath'],['sargas','shaula'] ] },
    { abbr:'Leo', cn:'狮子座', en:'Leo', season:'春季', lines:[
      ['regulus','chertan'],['chertan','denebola'],['regulus','etaleo'],['rasalas','epslEO'],
      ['epslEO','algieba'],['algieba','zosma'],['zosma','denebola'] ] },
    { abbr:'Gem', cn:'双子座', en:'Gemini', season:'冬季', lines:[
      ['castor','pollux'],['castor','mebsuta'],['mebsuta','wasat'],['wasat','alhena'],['pollux','wasat'] ] },
    { abbr:'Tau', cn:'金牛座', en:'Taurus', season:'冬季', lines:[
      ['aldebaran','gammatau'],['aldebaran','epsTau'],['epsTau','gammatau'],
      ['aldebaran','zetatau'],['zetatau','elnath'] ] },
    { abbr:'Boo', cn:'牧夫座', en:'Boötes', season:'春季', lines:[
      ['arcturus','muphrid'],['arcturus','izar'],['izar','nekkar'],['nekkar','seginus'],
      ['seginus','deltaboo'],['deltaboo','izar'] ] },
    { abbr:'Cru', cn:'南十字座', en:'Crux', season:'南天', lines:[
      ['acrux','gacrux'],['mimosa','deltacru'] ] },
    { abbr:'Peg', cn:'飞马座', en:'Pegasus', season:'秋季', lines:[
      ['markab','scheat'],['scheat','alpheratz'],['alpheratz','algenib'],['algenib','markab'] ] },
    { abbr:'And', cn:'仙女座', en:'Andromeda', season:'秋季', lines:[
      ['alpheratz','mirach'],['mirach','almach'],['mirach','deltand'] ] },
    { abbr:'Per', cn:'英仙座', en:'Perseus', season:'秋季', lines:[
      ['mirfak','algol'],['algol','epsper'],['mirfak','epsper'] ] },
    { abbr:'Aur', cn:'御夫座', en:'Auriga', season:'冬季', lines:[
      ['capella','menkalinan'],['capella','mahasim'],['menkalinan','elnath'],['mahasim','elnath'] ] },
    { abbr:'CMa', cn:'大犬座', en:'Canis Major', season:'冬季', lines:[
      ['mirzam','sirius'],['sirius','adhara'],['adhara','wezen'],['wezen','aludra'],['wezen','sirius'] ] },
    { abbr:'CMi', cn:'小犬座', en:'Canis Minor', season:'冬季', lines:[['procyon','gomeisa']] },
    { abbr:'Vir', cn:'室女座', en:'Virgo', season:'春季', lines:[
      ['spica','porrima'],['porrima','vindemiatrix'],['spica','heze'],['heze','zavijava'] ] },
    { abbr:'Sgr', cn:'人马座', en:'Sagittarius', season:'夏季', lines:[
      ['kausaustralis','kausmedia'],['kausmedia','kausborealis'],['kausborealis','phisgr'],
      ['phisgr','kausaustralis'],['nunki','phisgr'],['nunki','kausborealis'] ] },
    { abbr:'Dra', cn:'天龙座', en:'Draco', season:'夏季', lines:[
      ['eltanin','rastaban'],['rastaban','edasich'],['edasich','thuban'] ] }
  ];

  /* 深空天体：[key, 名称, 编号, ra, dec, mag, 类型, 简要] */
  var DSO = [
    ['m31','仙女座星系','M31',0.71231,41.2692,3.4,'旋涡星系','本星系群最大成员，肉眼可见为模糊光斑','Andromeda Galaxy'],
    ['m42','猎户座大星云','M42',5.58814,-5.3911,4.0,'发射星云','最近的巨型恒星形成区之一','Orion Nebula'],
    ['m45','昴星团','M45',3.79128,24.1167,1.6,'疏散星团','肉眼可见六至七颗蓝白星','Pleiades'],
    ['m44','蜂巢星团','M44',8.66667,19.9833,3.7,'疏散星团','巨蟹座中央的大型疏散星团','Beehive Cluster'],
    ['m7','托勒密星团','M7',17.89875,-34.8167,3.3,'疏散星团','天蝎座尾部的明亮星团','Ptolemy Cluster'],
    ['m6','蝴蝶星团','M6',17.66875,-32.2167,4.2,'疏散星团','形似蝴蝶的疏散星团','Butterfly Cluster'],
    ['m13','武仙座球状星团','M13',16.69444,36.4667,5.8,'球状星团','北天最亮的球状星团','Hercules Globular Cluster'],
    ['m22','人马座球状星团','M22',18.60639,-23.9036,5.1,'球状星团','距离近、视面积大','Sagittarius Globular Cluster'],
    ['m8','礁湖星云','M8',18.06000,-24.3833,6.0,'发射星云','人马座内的明亮星云','Lagoon Nebula'],
    ['m20','三叶星云','M20',18.04500,-23.0333,6.3,'发射星云','发射与反射复合星云','Trifid Nebula'],
    ['m16','鹰状星云','M16',18.31278,-13.7833,6.0,'发射星云','含创生之柱','Eagle Nebula'],
    ['m17','天鹅星云','M17',18.34611,-16.1717,6.0,'发射星云','人马座Omega星云','Swan Nebula'],
    ['m11','野鸭星团','M11',18.85111,-6.2667,6.3,'疏散星团','致密的疏散星团','Wild Duck Cluster'],
    ['m27','哑铃星云','M27',19.99361,22.7211,7.4,'行星状星云','狐狸座哑铃状行星状星云','Dumbbell Nebula'],
    ['m57','环状星云','M57',18.89361,33.0292,8.8,'行星状星云','天琴座经典行星状星云','Ring Nebula'],
    ['m51','涡状星系','M51',13.49797,47.1953,8.4,'旋涡星系','首个被确认具有旋涡结构的星系','Whirlpool Galaxy'],
    ['m81','波德星系','M81',9.92583,69.0653,6.9,'旋涡星系','大熊座明亮旋涡星系','Bode\'s Galaxy'],
    ['m82','雪茄星系','M82',9.93167,69.6797,8.4,'星暴星系','与M81相互作用的星暴星系','Cigar Galaxy'],
    ['m101','风车星系','M101',14.05347,54.3488,7.9,'旋涡星系','正面朝向的旋涡星系','Pinwheel Galaxy'],
    ['m104','草帽星系','M104',12.66639,-11.6231,8.0,'旋涡星系','侧向、带明显尘埃带','Sombrero Galaxy'],
    ['m33','三角座星系','M33',1.56458,30.6602,5.7,'旋涡星系','本星系群第三大星系','Triangulum Galaxy'],
    ['m1','蟹状星云','M1',5.57556,22.0145,8.4,'超新星遗迹','1054年超新星遗迹','Crab Nebula'],
    ['m97','猫头鹰星云','M97',11.24611,55.0192,9.9,'行星状星云','大熊座行星状星云','Owl Nebula'],
    ['m64','黑眼星系','M64',12.94528,21.6828,8.5,'旋涡星系','具有暗尘埃「黑眼」','Black Eye Galaxy'],
    ['m63','向日葵星系','M63',13.26361,42.0292,8.6,'旋涡星系','猎犬座旋涡星系','Sunflower Galaxy'],
    ['m3','M3 球状星团','M3',13.70306,28.3772,6.2,'球状星团','猎犬座明亮球状星团','M3'],
    ['m5','M5 球状星团','M5',15.30917,2.0811,5.6,'球状星团','巨蛇座球状星团','M5'],
    ['m15','M15 球状星团','M15',21.49972,12.1667,6.2,'球状星团','飞马座致密球状星团','M15'],
    ['m2','M2 球状星团','M2',21.55750,-0.8167,6.5,'球状星团','宝瓶座球状星团','M2'],
    ['m4','M4 球状星团','M4',16.39361,-26.5253,5.9,'球状星团','天蝎座松散球状星团','M4'],
    ['m10','M10 球状星团','M10',16.95167,-4.1000,6.6,'球状星团','蛇夫座球状星团','M10'],
    ['m12','M12 球状星团','M12',16.78722,-1.9500,6.7,'球状星团','蛇夫座球状星团','M12'],
    ['m92','M92 球状星团','M92',17.28528,43.1358,6.4,'球状星团','武仙座球状星团','M92'],
    ['m35','M35 疏散星团','M35',6.15167,24.3333,5.1,'疏散星团','双子座疏散星团','M35'],
    ['m41','M41 疏散星团','M41',6.76667,-20.7500,4.5,'疏散星团','大犬座疏散星团','M41'],
    ['m46','M46 疏散星团','M46',7.69667,-14.8167,6.1,'疏散星团','船尾座疏散星团','M46'],
    ['m47','M47 疏散星团','M47',7.61000,-14.5000,4.4,'疏散星团','船尾座疏散星团','M47'],
    ['m48','M48 疏散星团','M48',8.22667,-5.8000,5.8,'疏散星团','长蛇座疏散星团','M48'],
    ['m67','M67 疏散星团','M67',8.85167,11.8000,6.9,'疏散星团','巨蟹座老年疏散星团','M67'],
    ['m78','M78 反射星云','M78',5.77917,0.0833,8.3,'反射星云','猎户座最亮反射星云','M78'],
    ['m43','M43 星云','M43',5.59167,-5.2667,9.0,'发射星云','M42旁的小型星云','M43'],
    ['m76','小哑铃星云','M76',1.70528,51.5753,10.1,'行星状星云','英仙座行星状星云','Little Dumbbell Nebula'],
    ['m110','M110','M110',0.67306,41.6853,8.9,'椭圆星系','仙女座星系的伴星系','M110'],
    ['m32','M32','M32',0.71167,40.8653,8.1,'椭圆星系','仙女座星系的伴星系','M32'],
    ['m65','狮子座三重星系M65','M65',11.31556,13.0917,9.3,'旋涡星系','狮子座三重星系成员','M65'],
    ['m66','狮子座三重星系M66','M66',11.33750,12.9917,8.9,'旋涡星系','狮子座三重星系成员','M66'],
    ['m95','M95','M95',10.73278,11.7031,9.7,'旋涡星系','狮子座棒旋星系','M95'],
    ['m96','M96','M96',10.77917,11.8200,9.2,'旋涡星系','狮子座旋涡星系','M96'],
    ['m105','M105','M105',10.79667,12.5817,9.3,'椭圆星系','狮子座椭圆星系','M105'],
    ['m106','M106','M106',12.31611,47.3039,8.4,'旋涡星系','猎犬座旋涡星系','M106'],
    ['ngc7000','北美洲星云','NGC 7000',20.98333,44.3333,4.0,'发射星云','北美洲形状的大型发射星云','North America Nebula'],
    ['ngc869','英仙座双星团','NGC 869/884',2.31667,57.1333,3.7,'疏散星团','两个相邻的明亮疏散星团','Double Cluster'],
    ['ngc5139','半人马ω星团','NGC 5139',13.44667,-47.4792,3.9,'球状星团','银河系最大最亮的球状星团','Omega Centauri'],
    ['ngc4755','珠宝盒星团','NGC 4755',12.89333,-60.4000,4.2,'疏散星团','南十字附近的彩色星团','Jewel Box'],
  ];

  var dso = DSO.map(function (r) {
    /* en 是通行俗名（Orion Nebula / Ring Nebula）；没有俗名的深空天体保留编号（M35）。
     * 缺失时回落到中文名，界面不会出现空白。 */
    return { k: r[0], cn: r[1], id: r[2], ra: r[3], dec: r[4], mag: r[5], type: r[6], desc: r[7], en: r[8] || r[1] };
  });

  root.CATALOG = { stars: stars, constellations: constellations, dso: dso };
})(typeof window !== 'undefined' ? window : globalThis);
