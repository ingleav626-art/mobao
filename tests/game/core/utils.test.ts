import { describe, it, expect } from 'vitest'
import {
  clamp,
  roundToStep,
  toCellKey,
  fromCellKey,
  sizeTagToCellCount,
  formatTrackIndex,
  rgbHex,
  trimTrailingZero,
  formatCompactNumber,
  formatBidRevealNumber,
  escapeHtml,
  compactOneLine,
  compactPanelText,
  indentMultiline,
  normalizeActionToken,
  isNoneActionText,
  safeParseJson,
  tryExtractDecisionJson,
  pickFirstDefined,
  createEmptyAiPrivateIntelPool,
  qualityPulseDuration,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality,
  shuffle
} from '../../../scripts/game/core/utils'

describe('utils', () => {
  describe('clamp', () => {
    it('值在范围内保持不变', () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })
    it('低于下限截断到 min', () => {
      expect(clamp(-1, 0, 10)).toBe(0)
    })
    it('超过上限截断到 max', () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })
    it('min === max 返回该值', () => {
      expect(clamp(5, 3, 3)).toBe(3)
    })
  })

  describe('roundToStep', () => {
    it('对齐到步长 100', () => {
      expect(roundToStep(150, 100)).toBe(200)
      expect(roundToStep(149, 100)).toBe(100)
    })
    it('步长为 1 时四舍五入', () => {
      expect(roundToStep(3.7, 1)).toBe(4)
    })
    it('步长为 0 时回退到 1', () => {
      expect(roundToStep(5, 0)).toBe(5)
    })
    it('负值正常处理', () => {
      expect(roundToStep(-150, 100)).toBe(-100) // Math.round(-1.5) = -1
    })
  })

  describe('toCellKey / fromCellKey', () => {
    it('生成正确 key', () => {
      expect(toCellKey(3, 7)).toBe('3,7')
    })
    it('解析正确 key', () => {
      expect(fromCellKey('3,7')).toEqual({ x: 3, y: 7 })
    })
    it('无效 key 返回 null', () => {
      expect(fromCellKey('abc')).toBeNull()
    })
    it('空字符串返回 null', () => {
      expect(fromCellKey('')).toBeNull()
    })
    it('含非数字返回 null', () => {
      expect(fromCellKey('1,abc')).toBeNull()
    })
    it('往返一致', () => {
      const key = toCellKey(10, 20)
      expect(fromCellKey(key)).toEqual({ x: 10, y: 20 })
    })
  })

  describe('sizeTagToCellCount', () => {
    it('1x1 → 1', () => {
      expect(sizeTagToCellCount('1x1')).toBe(1)
    })
    it('2x3 → 6', () => {
      expect(sizeTagToCellCount('2x3')).toBe(6)
    })
    it('3x2 → 6', () => {
      expect(sizeTagToCellCount('3x2')).toBe(6)
    })
    it('大小写不敏感', () => {
      expect(sizeTagToCellCount('2X3')).toBe(6)
    })
    it('无效格式返回 null', () => {
      expect(sizeTagToCellCount('abc')).toBeNull()
      expect(sizeTagToCellCount('')).toBeNull()
    })
    it('含 0 返回 null', () => {
      expect(sizeTagToCellCount('0x3')).toBeNull()
    })
  })

  describe('formatTrackIndex', () => {
    it('1 → 一', () => {
      expect(formatTrackIndex(1)).toBe('一')
    })
    it('10 → 十', () => {
      expect(formatTrackIndex(10)).toBe('十')
    })
    it('11 → 十一', () => {
      expect(formatTrackIndex(11)).toBe('十一')
    })
    it('0 回退到 1 → 一', () => {
      expect(formatTrackIndex(0)).toBe('一')
    })
    it('20 → 字符串', () => {
      expect(formatTrackIndex(20)).toBe('20')
    })
  })

  describe('rgbHex', () => {
    it('0xff0000 → #ff0000', () => {
      expect(rgbHex(0xff0000)).toBe('#ff0000')
    })
    it('0x000000 → #000000', () => {
      expect(rgbHex(0x000000)).toBe('#000000')
    })
    it('不足 6 位补零', () => {
      expect(rgbHex(0x1)).toBe('#000001')
    })
  })

  describe('trimTrailingZero', () => {
    it('去除末尾 .0', () => {
      expect(trimTrailingZero('5.0')).toBe('5')
    })
    it('保留非零小数', () => {
      expect(trimTrailingZero('5.5')).toBe('5.5')
    })
    it('数字输入', () => {
      expect(trimTrailingZero(10)).toBe('10')
    })
    it('无小数点不变', () => {
      expect(trimTrailingZero('100')).toBe('100')
    })
  })

  describe('formatCompactNumber', () => {
    it('小于 1000 直接显示', () => {
      expect(formatCompactNumber(999)).toBe('999')
    })
    it('1000 → 1k', () => {
      expect(formatCompactNumber(1000)).toBe('1k')
    })
    it('1500 → 1.5k', () => {
      expect(formatCompactNumber(1500)).toBe('1.5k')
    })
    it('10000 → 10k', () => {
      expect(formatCompactNumber(10000)).toBe('10k')
    })
    it('1000000 → 1M', () => {
      expect(formatCompactNumber(1000000)).toBe('1M')
    })
    it('1500000 → 1.5M', () => {
      expect(formatCompactNumber(1500000)).toBe('1.5M')
    })
    it('负数', () => {
      expect(formatCompactNumber(-1500)).toBe('-1.5k')
    })
    it('0', () => {
      expect(formatCompactNumber(0)).toBe('0')
    })
  })

  describe('formatBidRevealNumber', () => {
    it('小于 1M 使用千分位', () => {
      const result = formatBidRevealNumber(12345)
      expect(result).toContain('12')
      expect(result).toContain('345')
    })
    it('大于等于 1M 使用紧凑格式', () => {
      expect(formatBidRevealNumber(1000000)).toBe('1M')
    })
    it('0', () => {
      expect(formatBidRevealNumber(0)).toBe('0')
    })
  })

  describe('escapeHtml', () => {
    it('转义 < > & " \'', () => {
      expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
        '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;'
      )
    })
    it('纯文本不变', () => {
      expect(escapeHtml('hello')).toBe('hello')
    })
    it('空字符串', () => {
      expect(escapeHtml('')).toBe('')
    })
  })

  describe('compactOneLine', () => {
    it('短文本不变', () => {
      expect(compactOneLine('hello world')).toBe('hello world')
    })
    it('多空白合并为单空格', () => {
      expect(compactOneLine('hello   world\n\tfoo')).toBe('hello world foo')
    })
    it('超长截断加 ...', () => {
      const long = 'a'.repeat(150)
      const result = compactOneLine(long, 120)
      expect(result).toHaveLength(123) // 120 + '...'
      expect(result.endsWith('...')).toBe(true)
    })
    it('自定义 maxLength', () => {
      const result = compactOneLine('abcdef', 3)
      expect(result).toBe('abc...')
    })
  })

  describe('compactPanelText', () => {
    it('短文本不变', () => {
      expect(compactPanelText('hello', 100)).toBe('hello')
    })
    it('空文本返回 (empty)', () => {
      expect(compactPanelText('', 100)).toBe('(empty)')
    })
    it('超长截断', () => {
      const result = compactPanelText('abcdefghij', 5)
      expect(result).toContain('abcde')
      expect(result).toContain('truncated')
    })
  })

  describe('indentMultiline', () => {
    it('每行添加缩进', () => {
      expect(indentMultiline('a\nb\nc', '  ')).toBe('  a\n  b\n  c')
    })
    it('单行也添加', () => {
      expect(indentMultiline('hello', '>>')).toBe('>>hello')
    })
  })

  describe('normalizeActionToken', () => {
    it('去除空白和标点', () => {
      expect(normalizeActionToken('不 使用')).toBe('不使用')
    })
    it('转小写', () => {
      expect(normalizeActionToken('NONE')).toBe('none')
    })
    it('去除括号和冒号', () => {
      expect(normalizeActionToken('（测试）:值')).toBe('测试值')
    })
  })

  describe('isNoneActionText', () => {
    it.each(['无', '不使用', 'none', 'null', 'nil', 'na', 'NONE', '无 '])(
      '"%s" → true',
      (text) => {
        expect(isNoneActionText(text)).toBe(true)
      }
    )
    it.each(['使用', 'reveal', 'bid', '攻击'])(
      '"%s" → false',
      (text) => {
        expect(isNoneActionText(text)).toBe(false)
      }
    )
  })

  describe('safeParseJson', () => {
    it('有效 JSON 解析', () => {
      expect(safeParseJson('{"a":1}')).toEqual({ a: 1 })
    })
    it('无效 JSON 返回 null', () => {
      expect(safeParseJson('not json')).toBeNull()
    })
    it('数组 JSON', () => {
      expect(safeParseJson('[1,2,3]')).toEqual([1, 2, 3])
    })
  })

  describe('tryExtractDecisionJson', () => {
    it('直接 JSON 对象', () => {
      expect(tryExtractDecisionJson('{"bid":100}')).toEqual({ bid: 100 })
    })
    it('代码块中的 JSON', () => {
      const text = '思考过程...\n```json\n{"bid":200}\n```\n结束'
      expect(tryExtractDecisionJson(text)).toEqual({ bid: 200 })
    })
    it('无代码块标记时从花括号提取', () => {
      const text = '前置文本 {"bid":300} 后置文本'
      expect(tryExtractDecisionJson(text)).toEqual({ bid: 300 })
    })
    it('空字符串返回 null', () => {
      expect(tryExtractDecisionJson('')).toBeNull()
    })
    it('无有效 JSON 返回 null', () => {
      expect(tryExtractDecisionJson('完全无json内容')).toBeNull()
    })
    it('纯文本中嵌套对象', () => {
      const text = 'xxx {"a": {"b": 1}} yyy'
      expect(tryExtractDecisionJson(text)).toEqual({ a: { b: 1 } })
    })
  })

  describe('pickFirstDefined', () => {
    it('返回第一个非 undefined/null 值', () => {
      expect(pickFirstDefined(undefined, null, 0, 1)).toBe(0)
    })
    it('全部 undefined 返回 null', () => {
      expect(pickFirstDefined(undefined, undefined)).toBeNull()
    })
    it('第一个就有值', () => {
      expect(pickFirstDefined('a', 'b')).toBe('a')
    })
    it('空参数返回 null', () => {
      expect(pickFirstDefined()).toBeNull()
    })
  })

  describe('createEmptyAiPrivateIntelPool', () => {
    it('返回正确结构', () => {
      const pool = createEmptyAiPrivateIntelPool()
      expect(pool.knownOutlineIds).toBeInstanceOf(Set)
      expect(pool.knownQualityIds).toBeInstanceOf(Set)
      expect(pool.outlineSignals).toEqual([])
      expect(pool.qualitySignals).toEqual([])
      expect(pool.signalHistory).toEqual([])
      expect(pool.latestSignalStats).toBeNull()
      expect(pool.aggregateStats).toBeNull()
      expect(pool.knownCellStates).toEqual({})
      expect(pool.itemKnowledge).toEqual({})
      expect(pool.highValueTrackByItemId).toEqual({})
      expect(pool.highValueTracks).toEqual([])
      expect(pool.nextTrackIndex).toBe(1)
    })
    it('每次调用返回新对象', () => {
      const a = createEmptyAiPrivateIntelPool()
      const b = createEmptyAiPrivateIntelPool()
      expect(a).not.toBe(b)
      expect(a.knownOutlineIds).not.toBe(b.knownOutlineIds)
    })
  })

  describe('qualityPulseDuration', () => {
    it('legendary 最短', () => {
      expect(qualityPulseDuration('legendary')).toBe(380)
    })
    it('rare', () => {
      expect(qualityPulseDuration('rare')).toBe(520)
    })
    it('fine', () => {
      expect(qualityPulseDuration('fine')).toBe(660)
    })
    it('normal', () => {
      expect(qualityPulseDuration('normal')).toBe(760)
    })
    it('poor 或默认最长', () => {
      expect(qualityPulseDuration('poor')).toBe(880)
      expect(qualityPulseDuration('unknown')).toBe(880)
    })
  })

  describe('settlementRevealDelayByQuality', () => {
    it('legendary 最长', () => {
      expect(settlementRevealDelayByQuality('legendary')).toBe(360)
    })
    it('poor 最短', () => {
      expect(settlementRevealDelayByQuality('poor')).toBe(220)
    })
    it('未知品质有默认值', () => {
      expect(settlementRevealDelayByQuality('unknown')).toBe(260)
    })
  })

  describe('settlementSearchDurationByQuality', () => {
    it('legendary 最长', () => {
      expect(settlementSearchDurationByQuality('legendary')).toBe(1250)
    })
    it('poor 最短', () => {
      expect(settlementSearchDurationByQuality('poor')).toBe(360)
    })
    it('未知品质有默认值', () => {
      expect(settlementSearchDurationByQuality('unknown')).toBe(540)
    })
  })

  describe('shuffle', () => {
    it('返回新数组', () => {
      const arr = [1, 2, 3]
      const result = shuffle(arr)
      expect(result).not.toBe(arr)
    })
    it('包含相同元素', () => {
      const arr = [1, 2, 3, 4, 5]
      const result = shuffle(arr)
      expect(result.sort()).toEqual([1, 2, 3, 4, 5])
    })
    it('空数组返回空数组', () => {
      expect(shuffle([])).toEqual([])
    })
    it('单元素返回相同', () => {
      expect(shuffle([42])).toEqual([42])
    })
    it('不修改原数组', () => {
      const arr = [1, 2, 3]
      shuffle(arr)
      expect(arr).toEqual([1, 2, 3])
    })
  })
})
