/**
 * @file data/artifacts/library
 * @description 藏品图鉴数据（ARTIFACT_LIBRARY，73 件藏品定义）。
 *              从 data/artifacts.ts 拆分而来（纯数据搬迁，无逻辑变更）。
 */

export const ARTIFACT_LIBRARY = [
  // ==================== 古董类 ====================
  // 瓷器
  {
    key: "porcelain-taowan",
    majorCategory: "古董",
    category: "瓷器",
    name: "陶碗",
    basePrice: 1800,
    qualityKey: "poor",
    w: 1,
    h: 1
  },
  {
    key: "porcelain-qingyou-zhan",
    majorCategory: "古董",
    category: "瓷器",
    name: "青釉盏",
    basePrice: 3200,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "porcelain-miaojin-ping",
    majorCategory: "古董",
    category: "瓷器",
    name: "描金瓶",
    basePrice: 4200,
    qualityKey: "fine",
    w: 1,
    h: 2
  },
  {
    key: "porcelain-yudian-guan",
    majorCategory: "古董",
    category: "瓷器",
    name: "雨点罐",
    basePrice: 2800,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "porcelain-hubai-pan",
    majorCategory: "古董",
    category: "瓷器",
    name: "湖白盘",
    basePrice: 2400,
    qualityKey: "poor",
    w: 2,
    h: 1
  },
  {
    key: "porcelain-fanhong-zun",
    majorCategory: "古董",
    category: "瓷器",
    name: "矾红尊",
    basePrice: 5100,
    qualityKey: "rare",
    w: 1,
    h: 2
  },
  {
    key: "porcelain-binglie-guan",
    majorCategory: "古董",
    category: "瓷器",
    name: "冰裂罐",
    basePrice: 3900,
    qualityKey: "fine",
    w: 2,
    h: 1
  },

  // 玉器
  {
    key: "jade-jadepei",
    majorCategory: "古董",
    category: "玉器",
    name: "玉佩",
    basePrice: 3600,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "jade-guyubi",
    majorCategory: "古董",
    category: "玉器",
    name: "古玉璧",
    basePrice: 5300,
    qualityKey: "rare",
    w: 2,
    h: 2
  },
  {
    key: "jade-yangzhi-zhui",
    majorCategory: "古董",
    category: "玉器",
    name: "羊脂坠",
    basePrice: 4900,
    qualityKey: "fine",
    w: 1,
    h: 1
  },
  {
    key: "jade-yunwen-pei",
    majorCategory: "古董",
    category: "玉器",
    name: "云纹珮",
    basePrice: 4100,
    qualityKey: "fine",
    w: 1,
    h: 1
  },
  {
    key: "jade-longwen-jue",
    majorCategory: "古董",
    category: "玉器",
    name: "龙纹玦",
    basePrice: 6200,
    qualityKey: "rare",
    w: 2,
    h: 1
  },
  {
    key: "jade-heti-zhou",
    majorCategory: "古董",
    category: "玉器",
    name: "合体镯",
    basePrice: 7700,
    qualityKey: "legendary",
    w: 2,
    h: 2
  },

  // 书画
  {
    key: "painting-shanshui-zhou",
    majorCategory: "古董",
    category: "书画",
    name: "山水轴",
    basePrice: 4600,
    qualityKey: "fine",
    w: 1,
    h: 2
  },
  {
    key: "painting-huaniao-ce",
    majorCategory: "古董",
    category: "书画",
    name: "花鸟册",
    basePrice: 3900,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "painting-xingshu-juan",
    majorCategory: "古董",
    category: "书画",
    name: "行书卷",
    basePrice: 5600,
    qualityKey: "rare",
    w: 2,
    h: 1
  },
  {
    key: "painting-tishi-ye",
    majorCategory: "古董",
    category: "书画",
    name: "题诗页",
    basePrice: 3400,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "painting-jinbo-fu",
    majorCategory: "古董",
    category: "书画",
    name: "金箔赋",
    basePrice: 8500,
    qualityKey: "legendary",
    w: 2,
    h: 2
  },
  {
    key: "painting-molan-tiao",
    majorCategory: "古董",
    category: "书画",
    name: "墨兰条",
    basePrice: 4300,
    qualityKey: "fine",
    w: 1,
    h: 2
  },

  // 铜器
  {
    key: "bronze-tongjing",
    majorCategory: "古董",
    category: "铜器",
    name: "铜镜",
    basePrice: 3000,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "bronze-ding-er-lei",
    majorCategory: "古董",
    category: "铜器",
    name: "鼎耳罍",
    basePrice: 6800,
    qualityKey: "rare",
    w: 2,
    h: 2
  },
  {
    key: "bronze-kuiwen-hu",
    majorCategory: "古董",
    category: "铜器",
    name: "夔纹壶",
    basePrice: 5200,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "bronze-shoumian-lu",
    majorCategory: "古董",
    category: "铜器",
    name: "兽面炉",
    basePrice: 4700,
    qualityKey: "fine",
    w: 2,
    h: 2
  },
  {
    key: "bronze-zhongding-pian",
    majorCategory: "古董",
    category: "铜器",
    name: "钟鼎片",
    basePrice: 2600,
    qualityKey: "poor",
    w: 1,
    h: 1
  },
  {
    key: "bronze-qinglong-jian",
    majorCategory: "古董",
    category: "铜器",
    name: "青龙鉴",
    basePrice: 7400,
    qualityKey: "rare",
    w: 2,
    h: 1
  },

  // 木器
  {
    key: "wood-mudiao-xia",
    majorCategory: "古董",
    category: "木器",
    name: "木雕匣",
    basePrice: 2300,
    qualityKey: "poor",
    w: 1,
    h: 1
  },
  {
    key: "wood-xiangzhang-he",
    majorCategory: "古董",
    category: "木器",
    name: "香樟盒",
    basePrice: 2700,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "wood-sunmao-jia",
    majorCategory: "古董",
    category: "木器",
    name: "榫卯架",
    basePrice: 3500,
    qualityKey: "normal",
    w: 1,
    h: 2
  },
  {
    key: "wood-miaoqi-pan",
    majorCategory: "古董",
    category: "木器",
    name: "描漆盘",
    basePrice: 2600,
    qualityKey: "poor",
    w: 2,
    h: 1
  },
  {
    key: "wood-jinmu-ping",
    majorCategory: "古董",
    category: "木器",
    name: "金木屏",
    basePrice: 5900,
    qualityKey: "rare",
    w: 2,
    h: 2
  },
  {
    key: "wood-zhimu-zhen",
    majorCategory: "古董",
    category: "木器",
    name: "栉木枕",
    basePrice: 3100,
    qualityKey: "normal",
    w: 1,
    h: 1
  },

  // 金石
  {
    key: "stone-yinzhang",
    majorCategory: "古董",
    category: "金石",
    name: "印章",
    basePrice: 3300,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "stone-shigu-tuo",
    majorCategory: "古董",
    category: "金石",
    name: "石鼓拓",
    basePrice: 4400,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "stone-canbei-pian",
    majorCategory: "古董",
    category: "金石",
    name: "残碑片",
    basePrice: 2100,
    qualityKey: "poor",
    w: 1,
    h: 1
  },
  {
    key: "stone-zhuanke-niu",
    majorCategory: "古董",
    category: "金石",
    name: "篆刻钮",
    basePrice: 3700,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "stone-hanwa-duan",
    majorCategory: "古董",
    category: "金石",
    name: "汉瓦断",
    basePrice: 5100,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "stone-jinshi-lu",
    majorCategory: "古董",
    category: "金石",
    name: "金石录",
    basePrice: 8100,
    qualityKey: "legendary",
    w: 2,
    h: 2
  },

  // ==================== 珠宝首饰类 ====================
  // 宝石类
  {
    key: "gem-pigeon-blood-ruby",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "鸽血红宝",
    basePrice: 12000,
    qualityKey: "rare",
    w: 1,
    h: 1
  },
  {
    key: "gem-royal-blue-sapphire",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "皇家蓝宝",
    basePrice: 9800,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "gem-emerald-crystal",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "祖母绿晶",
    basePrice: 10500,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "gem-chrysoberyl-cats-eye",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "金绿猫眼",
    basePrice: 8800,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "gem-alexandrite",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "亚历山大",
    basePrice: 15000,
    qualityKey: "rare",
    w: 1,
    h: 1
  },
  {
    key: "gem-paraiba-tourmaline",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "帕拉伊巴",
    basePrice: 13500,
    qualityKey: "rare",
    w: 1,
    h: 1
  },
  {
    key: "gem-star-sapphire",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "星光蓝宝",
    basePrice: 8200,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "gem-pink-diamond-rough",
    majorCategory: "珠宝首饰",
    category: "宝石",
    name: "粉钻原石",
    basePrice: 18000,
    qualityKey: "legendary",
    w: 1,
    h: 1
  },

  // 有机宝石类
  {
    key: "organic-south-sea-gold-pearl",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "南洋金珠",
    basePrice: 6500,
    qualityKey: "fine",
    w: 1,
    h: 1
  },
  {
    key: "organic-aka-coral",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "阿卡珊瑚",
    basePrice: 7200,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "organic-amber-bead",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "波罗蜜蜡",
    basePrice: 4800,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "organic-qiu-jiao-thumb-ring",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "虬角扳指",
    basePrice: 5500,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "organic-hawksbill-bracelet",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "玳瑁手镯",
    basePrice: 6200,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "organic-sperm-whale-tooth",
    majorCategory: "珠宝首饰",
    category: "有机宝石",
    name: "抹香鲸牙",
    basePrice: 9500,
    qualityKey: "rare",
    w: 3,
    h: 1
  },

  // 贵金属类
  {
    key: "metal-gold-bowl-tuanhua",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "团花纹金碗",
    basePrice: 7800,
    qualityKey: "fine",
    w: 3,
    h: 2
  },
  {
    key: "metal-silver-gilt-ewer",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "银鎏金执壶",
    basePrice: 8200,
    qualityKey: "fine",
    w: 2,
    h: 3
  },
  {
    key: "metal-silver-plate-hunting",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "狩猎纹银盘",
    basePrice: 7500,
    qualityKey: "fine",
    w: 3,
    h: 2
  },
  {
    key: "metal-gold-filigree-sachet",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "金累丝香囊",
    basePrice: 5800,
    qualityKey: "normal",
    w: 1,
    h: 2
  },
  {
    key: "metal-platinum-pocket-watch-case",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "铂金怀表壳",
    basePrice: 4200,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "metal-gold-woven-crown",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "金丝编冠",
    basePrice: 11000,
    qualityKey: "rare",
    w: 3,
    h: 1
  },
  {
    key: "metal-niello-silver-cigarette-case",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "乌银烟盒",
    basePrice: 3800,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "metal-gold-seal-base",
    majorCategory: "珠宝首饰",
    category: "贵金属",
    name: "金印镇",
    basePrice: 6800,
    qualityKey: "fine",
    w: 1,
    h: 1
  },

  // 镶嵌饰品类
  {
    key: "inlay-cornflower-dream",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "矢车菊之梦",
    basePrice: 9200,
    qualityKey: "rare",
    w: 1,
    h: 2
  },
  {
    key: "inlay-leopard-brooch",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "豹影胸针",
    basePrice: 7800,
    qualityKey: "fine",
    w: 2,
    h: 1
  },
  {
    key: "inlay-tudor-rose-ring",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "都铎玫瑰戒",
    basePrice: 5500,
    qualityKey: "normal",
    w: 1,
    h: 1
  },
  {
    key: "inlay-dragonfly-hairpin",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "蜻蜓羽翼钗",
    basePrice: 6800,
    qualityKey: "fine",
    w: 1,
    h: 3
  },
  {
    key: "inlay-victorian-mourning-bracelet",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "维多利亚哀悼手环",
    basePrice: 8500,
    qualityKey: "fine",
    w: 3,
    h: 1
  },
  {
    key: "inlay-bodhi-rosary",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "摩诃菩提念珠",
    basePrice: 10200,
    qualityKey: "rare",
    w: 4,
    h: 1
  },
  {
    key: "inlay-st-george-medal",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "圣乔治勋章",
    basePrice: 7200,
    qualityKey: "fine",
    w: 1,
    h: 2
  },
  {
    key: "inlay-enamel-snuff-bottle",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "珐琅鼻烟壶",
    basePrice: 4800,
    qualityKey: "normal",
    w: 1,
    h: 2
  },
  {
    key: "inlay-art-nouveau-dragonfly-pendant",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "新艺术蜻蜓女坠",
    basePrice: 6500,
    qualityKey: "fine",
    w: 1,
    h: 2
  },
  {
    key: "inlay-pink-sapphire-bracelet",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "粉刚手链",
    basePrice: 8800,
    qualityKey: "fine",
    w: 3,
    h: 1
  },
  {
    key: "inlay-silver-gilt-filigree-bangle",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "银鎏金花丝镯",
    basePrice: 5800,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "inlay-byzantine-cross",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "拜占庭十字章",
    basePrice: 6200,
    qualityKey: "normal",
    w: 1,
    h: 2
  },
  {
    key: "inlay-magnolia-bud-brooch",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "玉兰花蕾胸针",
    basePrice: 5200,
    qualityKey: "normal",
    w: 2,
    h: 1
  },
  {
    key: "inlay-diamond-beast-pendant",
    majorCategory: "珠宝首饰",
    category: "镶嵌饰品",
    name: "钻石瑞兽项坠",
    basePrice: 11500,
    qualityKey: "rare",
    w: 1,
    h: 2
  }
]
