/**
 * @file data/artifacts/config
 * @description 藏品品质配置常量。包含品质等级、尺寸标签映射、品类权重。
 *              从 data/artifacts.ts 拆分而来（纯数据搬迁，无逻辑变更）。
 */

export const QUALITY_CONFIG: Record<string, { label: string; color: number; glow: number; weight: number }> = {
  poor: { label: "粗品", color: 0x9f9f9f, glow: 0xdcdcdc, weight: 28 },
  normal: { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 34 },
  fine: { label: "精品", color: 0x12b46d, glow: 0x8ae4bf, weight: 22 },
  rare: { label: "珍品", color: 0xf0a300, glow: 0xffd56f, weight: 12 },
  legendary: { label: "绝品", color: 0xf04242, glow: 0xffa0a0, weight: 4 }
}

export const SIZE_TAG_BY_DIMENSION: Record<string, string> = {
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

export const CATEGORY_WEIGHTS: Array<{ key: string; weight: number }> = [
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
