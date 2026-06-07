/**
 * @file data/artifacts.js
 * @module data/artifacts
 * @description 藏品数据定义与生成管理。采用 IIFE 模式，挂载到 window.ArtifactData。
 *              定义藏品品质配置、品类权重、藏品图鉴库，以及 ArtifactManager 类
 *              负责藏品的随机生成、候选匹配、价格统计和信号分析。
 *
 * 核心数据：
 *   - QUALITY_CONFIG: 品质配置（label/color/glow/weight），5个等级
 *     poor(28) → normal(34) → fine(22) → rare(12) → legendary(4)
 *   - SIZE_TAG_BY_DIMENSION: 尺寸标签映射（1x1 ~ 4x1）
 *   - ARTIFACT_LIBRARY: 藏品图鉴库，70+件藏品定义
 *     每件：{ key, majorCategory, category, name, basePrice, qualityKey, w, h }
 *   - CATEGORY_WEIGHTS: 品类权重（10个品类，古董6+珠宝4）
 *
 * ArtifactManager 类：
 *   - createRandomArtifact(): 按品类权重随机生成藏品
 *   - createRandomArtifactForSlot(opts): 在指定槽位生成可放置的藏品
 *   - buildArtifactFromDef(def): 从图鉴定义构建藏品实例（含自增ID）
 *   - getCandidatesByRevealState(state): 按揭示状态筛选候选藏品
 *   - getCandidateStatsByRevealState(state): 候选价格统计
 *   - getSignalPriceStats(signals): 信号价格聚合分析
 *
 * 辅助函数：
 *   - estimatePriceByQuality(basePrice, qualityKey): 品质价格估算（poor×0.72 ~ legendary×1.85）
 *   - signalToRevealState(signal): 信号转揭示状态
 *   - summarizeCandidatePrices(candidates): 候选价格统计（均值/分位数/离散度/边缘比）
 *   - summarizeStatsCollection(statsList): 多组统计的加权聚合
 *   - weightedPick(list): 按权重随机选择
 *   - toSizeTag(w, h): 尺寸转标签
 *   - canPlaceRect(col, row, w, h, gridCols, gridRows, occupancy): 矩形放置检测
 *
 * 藏品品类：
 *   古董：瓷器(16)、玉器(12)、书画(11)、铜器(12)、木器(10)、金石(9)
 *   珠宝首饰：宝石(8)、有机宝石(6)、贵金属(7)、镶嵌饰品(9)
 *
 * @exports window.ArtifactData - 藏品数据与管理（兼容）
 * @exports QUALITY_CONFIG, ARTIFACT_LIBRARY, ArtifactManager, ... - 命名导出
 */
export const QUALITY_CONFIG = {
  poor: { label: "粗品", color: 0x9f9f9f, glow: 0xdcdcdc, weight: 28 },
  normal: { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 34 },
  fine: { label: "精品", color: 0x12b46d, glow: 0x8ae4bf, weight: 22 },
  rare: { label: "珍品", color: 0xf0a300, glow: 0xffd56f, weight: 12 },
  legendary: { label: "绝品", color: 0xf04242, glow: 0xffa0a0, weight: 4 }
}

export const SIZE_TAG_BY_DIMENSION = {
  "1x1": "1x1",
  "2x1": "2x1",
  "1x2": "1x2",
  "2x2": "2x2",
  "3x1": "3x1",
  "1x3": "1x3",
  "3x2": "3x2",
  "2x3": "2x3",
  "4x1": "4x1"
}

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

export const CATEGORY_WEIGHTS = [
  // 古董类
  { key: "瓷器", weight: 16 },
  { key: "玉器", weight: 12 },
  { key: "书画", weight: 11 },
  { key: "铜器", weight: 12 },
  { key: "木器", weight: 10 },
  { key: "金石", weight: 9 },
  // 珠宝首饰类
  { key: "宝石", weight: 8 },
  { key: "有机宝石", weight: 6 },
  { key: "贵金属", weight: 7 },
  { key: "镶嵌饰品", weight: 9 }
]

export class ArtifactManager {
  constructor() {
    this.counter = 1
  }

  createRandomArtifact() {
    const category = weightedPick(CATEGORY_WEIGHTS).key
    const defs = ARTIFACT_LIBRARY.filter((item) => item.category === category)
    const def = defs[Math.floor(Math.random() * defs.length)]
    return this.buildArtifactFromDef(def)
  }

  createRandomArtifactForSlot({ col, row, gridCols, gridRows, occupancy, categoryWeights, qualityWeights }) {
    const categoryWeightMap = categoryWeights
      ? { ...categoryWeights }
      : CATEGORY_WEIGHTS.reduce((acc, item) => {
        acc[item.key] = item.weight
        return acc
      }, {})

    let fitDefs = ARTIFACT_LIBRARY.filter((def) =>
      canPlaceRect(col, row, def.w, def.h, gridCols, gridRows, occupancy)
    )

    if (qualityWeights) {
      const totalQ = Object.values(qualityWeights).reduce((s, v) => s + v, 0) || 1
      fitDefs = fitDefs.map((def) => ({
        ...def,
        _qw: qualityWeights[def.qualityKey] || 1
      }))
      fitDefs = fitDefs.filter(() => Math.random() < 1)
      const expanded = []
      fitDefs.forEach((def) => {
        const cw = categoryWeightMap[def.category] || 1
        const qw = def._qw / totalQ
        expanded.push({ ...def, weight: cw * qw })
      })
      if (expanded.length === 0) {
        return null
      }
      const picked = weightedPick(expanded)
      return this.buildArtifactFromDef(picked)
    }

    if (fitDefs.length === 0) {
      return null
    }

    const weightedDefs = fitDefs.map((def) => ({
      ...def,
      weight: categoryWeightMap[def.category] || 1
    }))

    const picked = weightedPick(weightedDefs)
    return this.buildArtifactFromDef(picked)
  }

  buildArtifactFromDef(def) {
    const quality = QUALITY_CONFIG[def.qualityKey]

    return {
      id: `artifact-${this.counter++}`,
      key: def.key,
      majorCategory: def.majorCategory || "古董",
      category: def.category,
      name: def.name,
      basePrice: def.basePrice,
      qualityKey: def.qualityKey,
      quality,
      w: def.w,
      h: def.h,
      x: 0,
      y: 0
    }
  }

  getCandidatesByRevealState(state) {
    const { qualityKey = null, sizeTag = null, category = null } = state
    return ARTIFACT_LIBRARY.filter((artifact) => {
      if (category && artifact.category !== category) {
        return false
      }

      if (qualityKey && artifact.qualityKey !== qualityKey) {
        return false
      }

      if (sizeTag) {
        const artifactSizeTag = toSizeTag(artifact.w, artifact.h)
        if (artifactSizeTag !== sizeTag) {
          return false
        }
      }

      return true
    }).map((artifact) => ({
      ...artifact,
      revealedQualityKey: qualityKey,
      revealedQualityLabel: qualityKey ? QUALITY_CONFIG[qualityKey].label : "未知",
      expectedPrice: artifact.basePrice,
      previewSizeTag: toSizeTag(artifact.w, artifact.h)
    }))
  }

  getCandidateStatsByRevealState(state) {
    const candidates = this.getCandidatesByRevealState(state)
    return summarizeCandidatePrices(candidates)
  }

  getSignalPriceStats(signals = []) {
    const list = Array.isArray(signals) ? signals.filter(Boolean) : []
    const detail = list.map((signal) => {
      const revealState = signalToRevealState(signal)
      const candidates = this.getCandidatesByRevealState(revealState)
      return {
        ...signal,
        revealState,
        stats: summarizeCandidatePrices(candidates)
      }
    })

    const qualityCount = detail.filter((entry) => entry.type === "quality").length
    const outlineCount = detail.filter((entry) => entry.type === "outline").length

    return {
      signalCount: detail.length,
      qualitySignalRate: detail.length > 0 ? qualityCount / detail.length : 0,
      outlineSignalRate: detail.length > 0 ? outlineCount / detail.length : 0,
      detail,
      aggregate: summarizeStatsCollection(detail.map((entry) => entry.stats))
    }
  }

  getLibraryStats() {
    const byCategory = ARTIFACT_LIBRARY.reduce((acc, artifact) => {
      acc[artifact.category] = (acc[artifact.category] || 0) + 1
      return acc
    }, {})

    return {
      total: ARTIFACT_LIBRARY.length,
      byCategory
    }
  }
}

export function estimatePriceByQuality(basePrice, qualityKey) {
  const multiplierMap = {
    poor: 0.72,
    normal: 0.95,
    fine: 1.18,
    rare: 1.45,
    legendary: 1.85
  }

  const ratio = multiplierMap[qualityKey] || 1
  return Math.round(basePrice * ratio)
}

export function signalToRevealState(signal) {
  const state = {}
  if (signal.qualityKey) {
    state.qualityKey = signal.qualityKey
  }
  if (signal.sizeTag) {
    state.sizeTag = signal.sizeTag
  }
  if (signal.category) {
    state.category = signal.category
  }
  return state
}

export function summarizeCandidatePrices(candidates = []) {
  const prices = candidates
    .map((item) => Number(item.expectedPrice ?? item.basePrice) || 0)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)

  if (prices.length === 0) {
    return emptyPriceStats()
  }

  const count = prices.length
  const sum = prices.reduce((acc, value) => acc + value, 0)
  const mean = sum / count
  const top2 = prices.slice(-2)
  const bottom2 = prices.slice(0, 2)
  const top2Mean = top2.reduce((acc, value) => acc + value, 0) / top2.length
  const bottom2Mean = bottom2.reduce((acc, value) => acc + value, 0) / bottom2.length
  const variance = prices.reduce((acc, value) => acc + (value - mean) ** 2, 0) / count
  const std = Math.sqrt(variance)
  const p10 = quantileSorted(prices, 0.1)
  const q1 = quantileSorted(prices, 0.25)
  const q3 = quantileSorted(prices, 0.75)
  const p90 = quantileSorted(prices, 0.9)
  const iqr = q3 - q1
  const spreadRatio = iqr / (mean + 1)
  const upperEdge = (top2Mean - mean) / (mean + 1)
  const lowerEdge = (mean - bottom2Mean) / (mean + 1)

  return {
    count,
    mean,
    top2Mean,
    bottom2Mean,
    std,
    p10,
    q1,
    q3,
    p90,
    iqr,
    spreadRatio,
    upperEdge,
    lowerEdge
  }
}

export function summarizeStatsCollection(statsList = []) {
  const list = statsList.filter((stats) => stats && Number.isFinite(stats.count) && stats.count > 0)
  if (list.length === 0) {
    return emptyPriceStats()
  }

  const totalWeight = list.reduce((acc, stats) => acc + stats.count, 0)
  const weighted = (field) => list.reduce((acc, stats) => acc + stats[field] * stats.count, 0) / totalWeight

  return {
    count: Math.round(weighted("count")),
    mean: weighted("mean"),
    top2Mean: weighted("top2Mean"),
    bottom2Mean: weighted("bottom2Mean"),
    std: weighted("std"),
    p10: weighted("p10"),
    q1: weighted("q1"),
    q3: weighted("q3"),
    p90: weighted("p90"),
    iqr: weighted("iqr"),
    spreadRatio: weighted("spreadRatio"),
    upperEdge: weighted("upperEdge"),
    lowerEdge: weighted("lowerEdge")
  }
}

function emptyPriceStats() {
  return {
    count: 0,
    mean: 0,
    top2Mean: 0,
    bottom2Mean: 0,
    std: 0,
    p10: 0,
    q1: 0,
    q3: 0,
    p90: 0,
    iqr: 0,
    spreadRatio: 0,
    upperEdge: 0,
    lowerEdge: 0
  }
}

function quantileSorted(values, ratio) {
  if (!values || values.length === 0) {
    return 0
  }

  const q = Math.max(0, Math.min(1, ratio))
  const idx = (values.length - 1) * q
  const left = Math.floor(idx)
  const right = Math.ceil(idx)
  if (left === right) {
    return values[left]
  }

  const frac = idx - left
  return values[left] + (values[right] - values[left]) * frac
}

export function toSizeTag(w, h) {
  return SIZE_TAG_BY_DIMENSION[`${w}x${h}`] || `${w}x${h}`
}

function canPlaceRect(col, row, w, h, gridCols, gridRows, occupancy) {
  if (col + w > gridCols || row + h > gridRows) {
    return false
  }

  for (let y = row; y < row + h; y += 1) {
    for (let x = col; x < col + w; x += 1) {
      if (occupancy[y][x]) {
        return false
      }
    }
  }

  return true
}

function weightedPick(pool) {
  const total = pool.reduce((sum, item) => sum + item.weight, 0)
  let cursor = Math.random() * total

  for (const item of pool) {
    cursor -= item.weight
    if (cursor <= 0) {
      return item
    }
  }

  return pool[pool.length - 1]
}

// 兼容层：保持 window.ArtifactData 全局变量可用
window.ArtifactData = {
  QUALITY_CONFIG,
  ARTIFACT_LIBRARY,
  SIZE_TAG_BY_DIMENSION,
  CATEGORY_WEIGHTS,
  toSizeTag,
  estimatePriceByQuality,
  ArtifactManager
}
