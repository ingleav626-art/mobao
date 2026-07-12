/**
 * @file bidding.js
 * @module ai/bidding
 * @description AI出价引擎（AuctionAiEngine）。基于人格参数、情报状态、市场参考价和工具效果，
 *              为每个AI玩家计算出价决策。这是规则AI的核心，不依赖LLM。
 *
 * 核心类：AuctionAiEngine
 *
 * 出价算法流程（buildAIBids → computeSingleDecision）：
 *   1. 计算市场参考价 marketRef（基于当前出价和上轮出价的加权均值）
 *   2. 计算信心 confidence（线索率、质量率、不确定性、轮次进度、市场偏差、工具效果等加权）
 *   3. 计算感知价值 perceivedValue = 锚点出价 × 系数 + 趋势调整 + 压力调整 + 噪声
 *   4. 更新心理预期 psychExpectedBid（向目标预期逐步适应）
 *   5. 过热评估：当前出价超过心理预期时触发回撤
 *   6. 计算价格上限 hardCap（感知上限、锚点上限、心理上限、市场上限取最小）
 *   7. 最终出价 = max(当前出价, 感知价值 × 调整) 并对齐到出价步长
 *   8. 群体多样性调整 applyCrowdDiversity：确保AI出价不扎堆
 *
 * 人格系统（personalityMap）：
 *   - p1 稳算师：高纪律、低激进，锚点保守
 *   - p3 猛冲客：高激进、高跟风，锚点激进
 *   - p4 机变派：高纪律、中激进，灵活适应
 *
 * 情报动作规划（planIntelAction）：
 *   基于信息缺口、信心需求、资源存量，评分选择最优动作（技能/道具/不操作）
 *
 * 工具效果（buildToolEffect）：
 *   将技能/道具使用效果转换为对出价算法的数值影响（信心提升、上限加成等）
 *
 * @requires MobaoUtils - 工具函数（clamp, roundToStep, formatBidRevealNumber）
 *
 * @exports AuctionAiEngine - AI出价引擎类
 *
 * 使用方式：
 *   const engine = new AuctionAiEngine();
 *   engine.resetForNewRun(context);
 *   const bidMap = engine.buildAIBids(context);
 *   const plan = engine.planIntelAction(context);
 */

import { clamp, roundToStep, randomBetween } from "../core/utils"
import type {
  Personality,
  AiStateEntry,
  ToolEffect,
  ConfidenceParts,
  DecisionResult,
  IntelActionResult,
  ResetContext,
  BuildAIBidsContext,
  IntelSummaryInput,
  ComputeSingleDecisionArgs,
  ComputeConfidencePartsArgs,
  PlanIntelActionArgs,
  ApplyCrowdDiversityArgs
} from "./bidding/types"
import {
  defaultPersona,
  normalizeToolEffect,
  marketReference,
  buildToolEffect as _buildToolEffect,
  computeConfidenceParts as _computeConfidenceParts,
  applyCrowdDiversity as _applyCrowdDiversity,
  calcBaseEstimate,
  calcNoiseBand,
  calcTargetPsychExpected,
  calcAdaptRate,
  calcOverheatThreshold,
  calcOverheatRatio,
  calcHardCap,
  calcFearChance
} from "./bidding/pure"
import { planIntelAction as _planIntelAction } from "./bidding/intel-action"

export class AuctionAiEngine {
  personalityMap: Record<string, Personality>
  aiState: Map<string, AiStateEntry>
  runMeta: { startingBid: number; itemCount: number }
  lastDecisionLog: Record<string, unknown> | null

  constructor() {
    // 规则化人格参数：用于控制AI出价节奏、跟风倾向与失误概率。
    this.personalityMap = {
      p1: {
        name: "左上AI",
        archetype: "稳算师",
        aggression: 0.58, // 激进程度：影响AI出价的积极性和冒险倾向，数值越高越倾向于激进出价。
        discipline: 0.86, // 纪律性：影响AI出价的稳定性和理性程度，数值越高越倾向于理性出价。
        followRate: 0.32, // 跟风倾向：影响AI对市场参考价的敏感度和模仿程度，数值越高越倾向于跟风出价。
        bluffRate: 0.18, // 虚张声势：影响AI在前中期故意藏价的概率，数值越高越倾向于偶尔藏价。
        errorRate: 0.04, // 失误率：影响AI做出非理性出价的概率，数值越高越倾向于偶尔犯错。
        anchorMin: 1.24, // 锚点范围：AI初始锚点出价相对于市场参考价的倍数范围，AI会在这个范围内随机选择一个初始锚点出价。
        anchorMax: 1.72, // 锚点范围：同上，AI会在anchorMin和anchorMax之间随机选择一个初始锚点出价。
        openRaiseRatio: 0.055, // 开局抬价率：AI在当前出价基础上进行开局抬价时的加成比例，数值越高开局抬价越激进。
        crowdBias: -0.35, // 群体偏差：影响AI在群体多样性调整中的倾向，数值为负时倾向于与市场参考价保持距离，数值为正时倾向于靠近市场参考价。
        expectationElasticity: 0.34, // 预期弹性：影响AI调整心理预期出价时的适应速度，数值越高调整越快。
        retreatFactor: 0.82, // 退却因素：影响AI在感到过热时的回撤程度，数值越高回撤越激烈。
        noInfoAdjustMin: -0.4, // 无信息调整：当线索率较低时，AI出价的随机调整范围下限，数值越低AI越可能大幅降低出价。
        noInfoAdjustMax: 1.5 // 无信息调整：当线索率较低时，AI出价的随机调整范围上限，数值越高AI越可能大幅提高出价。
      },
      p3: {
        name: "右上AI",
        archetype: "猛冲客",
        aggression: 0.84,
        discipline: 0.62,
        followRate: 0.56,
        bluffRate: 0.3,
        errorRate: 0.08,
        anchorMin: 1.42,
        anchorMax: 1.98,
        openRaiseRatio: 0.082,
        crowdBias: 0.48,
        expectationElasticity: 0.72,
        retreatFactor: 0.34,
        noInfoAdjustMin: -0.3,
        noInfoAdjustMax: 2
      },
      p4: {
        name: "右下AI",
        archetype: "机变派",
        aggression: 0.54,
        discipline: 0.88,
        followRate: 0.26,
        bluffRate: 0.24,
        errorRate: 0.05,
        anchorMin: 1.2,
        anchorMax: 1.78,
        openRaiseRatio: 0.064,
        crowdBias: 0.18,
        expectationElasticity: 0.52,
        retreatFactor: 0.68,
        noInfoAdjustMin: -0.25,
        noInfoAdjustMax: 1.8
      }
    }
    // AI状态：每个AI玩家一个，记录锚点、心理预期等动态信息。
    this.aiState = new Map()
    this.runMeta = {
      startingBid: 100000,
      itemCount: 0
    }
    // 最近一次决策的日志，供事后分析和调试使用。
    this.lastDecisionLog = null
  }

  // 每次新拍卖开始时重置AI状态，接受一些上下文信息以便调整初始参数。
  resetForNewRun(context: ResetContext = {}) {
    this.aiState.clear()
    this.runMeta = {
      startingBid: Math.max(100000, Number(context.startingBid) || 100000),
      itemCount: Math.max(0, Number(context.itemCount) || 0)
    }
    this.lastDecisionLog = null
  }

  /**
   * 批量计算所有AI玩家的出价决策
   * @param {BuildAIBidsContext} context - 出价上下文
   * @param {Array} context.aiPlayers - AI玩家列表
   * @param {number} context.clueRate - 线索揭示率 (0-1)
   * @param {number} context.round - 当前轮次
   * @param {number} context.maxRounds - 最大轮数
   * @param {number} context.currentBid - 当前最高出价
   * @param {Object} [context.lastRoundBids={}] - 上轮出价记录
   * @param {number} [context.bidStep=10000] - 出价步长
   * @param {Object} [context.aiIntelMap={}] - 各AI情报摘要
   * @param {Object} [context.aiToolEffectMap={}] - 各AI工具效果
   * @returns {Object<string, number>} 各AI玩家ID到出价值的映射
   */
  buildAIBids(context: BuildAIBidsContext) {
    const {
      aiPlayers, // 当前拍卖中的AI玩家列表，由主场景传入
      clueRate,
      round,
      maxRounds,
      currentBid, // 当前出价，由主场景传入，AI根据这个出价和其他信息进行决策。
      lastRoundBids = {},
      bidStep = 10000,
      aiIntelMap = {}, // 每个AI玩家的情报总结，由主场景根据其揭示的信息计算后传入
      aiToolEffectMap = {}
    } = context

    // 轮次进度：影响AI的激进程度和跟风倾向，越往后越敢于冒险。
    const roundProgress = maxRounds <= 1 ? 1 : (round - 1) / (maxRounds - 1)

    // 出价步长：影响AI出价的粒度和调整幅度，过大可能导致出价过于跳跃，过小则可能过于保守。
    const step = Math.max(10, Math.round(Number(bidStep) || 10000))

    // 市场参考价：基于当前出价和历史出价计算的一个锚点，AI会围绕这个价格进行调整。
    const marketRef = marketReference(currentBid, lastRoundBids, this.runMeta.startingBid)

    // 决策结果的临时存储，后续会进行群体多样性调整。
    const decisionMap: Record<string, DecisionResult> = {}

    // 最终出价结果的存储，供主场景执行出价和更新状态。
    const bidMap: Record<string, number> = {}

    // 逐个计算每个AI玩家的出价决策，基于其人格、当前信息和市场状态。
    aiPlayers.forEach((player) => {
      const persona = this.personalityMap[player.id] || defaultPersona()

      // 情报总结：主场景根据AI玩家揭示的信息计算出的线索率、质量率、不确定性等指标，AI根据这些指标评估当前的信心和价值。
      const intelSummary = aiIntelMap[player.id] || {}

      // 工具效果：如果AI玩家使用了技能或道具，主场景会计算出这些工具对AI决策的潜在影响，并传入AI进行评估和利用。
      const toolEffect = aiToolEffectMap[player.id] || this.buildToolEffect({ actionType: "none" })

      //ai的所有基础信息都来自于参数传入的context，主场景负责收集和计算后传入，AI只专注于决策逻辑。
      //计算单个AI玩家的出价决策，得到一个包含最终出价和相关决策信息的对象。
      //这里调用了computeSingleDecision方法，传入了AI玩家的ID、情报总结、市场状态、人格参数和工具效果等信息，AI根据这些信息进行综合评估和决策。
      const decision = this.computeSingleDecision({
        playerId: player.id,
        //这里的clamp函数用于确保输入的数值在合理的范围内，避免异常值导致AI决策失常。把数值强行限制在最小和最大值之间，超出就截断
        // 情报相关的输入：线索率、质量率、不确定性、信息分布等，AI根据这些评估当前的信心和价值。
        clueRate: clamp(Number.isFinite(intelSummary.clueRate) ? (intelSummary.clueRate as number) : clueRate, 0, 1),

        // 质量率：如果主场景没有提供，默认使用0作为质量率的估计，表示平均质量水平。
        qualityRate: clamp(Number(intelSummary.qualityRate) || 0, 0, 1),

        // 不确定性：如果主场景没有提供，默认使用1减去线索率作为不确定性的估计，表示线索越少不确定性越高。
        uncertainty: clamp(Number(intelSummary.uncertainty) || 1 - clueRate, 0, 1),

        // 信息分布：如果主场景没有提供，默认使用0作为信息分布的估计，表示没有明显的信息集中或分散。
        spreadRatio: clamp(Number(intelSummary.spreadRatio) || 0, 0, 1.5),

        // 上下边缘：如果主场景没有提供，默认使用0作为边缘的估计，表示没有明显的价格边界信号。
        upperEdge: clamp(Number(intelSummary.upperEdge) || 0, -0.4, 0.6),

        // 下边缘：同上，默认0，范围-0.4到0.6，表示价格可能的波动范围。
        lowerEdge: clamp(Number(intelSummary.lowerEdge) || 0, -0.4, 0.6),

        //下面的参数都是主场景传入的当前拍卖状态和AI玩家状态，AI根据这些信息进行综合评估和决策。
        roundProgress,
        currentBid,
        marketRef,
        persona,
        lastRoundBids,
        bidStep: step,
        toolEffect
      })
      // 存储决策结果，后续会进行群体多样性调整，确保AI玩家之间的出价行为有一定的差异，避免过于雷同。
      decisionMap[player.id] = decision

      // 存储最终出价结果，供主场景执行出价和更新状态。
      bidMap[player.id] = decision.finalBid
    })

    // 调用函数，基于AI玩家的人格特征和当前市场状态，对决策结果进行微调，增加出价行为的多样性和不可预测性。
    this.applyCrowdDiversity({
      aiPlayers,
      decisionMap,
      bidMap,
      currentBid,
      bidStep: step
    })

    // 记录本次决策的详细信息，供事后分析和调试使用，包括每个AI玩家的输入信息、评估指标、决策过程和最终出价等。
    this.lastDecisionLog = {
      round,
      clueRate,
      currentBid,
      marketReference: marketRef,
      //遍历AI玩家列表，构建一个包含每个玩家决策信息的对象，供事后分析和调试使用。
      entries: aiPlayers.map((player) => ({ ...decisionMap[player.id] }))
    }

    // 返回最终的出价结果，供主场景执行出价和更新状态。
    return bidMap
  }

  /**
   * 计算单个AI玩家的出价决策。基于人格参数、情报信息和市场状态，执行8步出价算法：
   * 1. 市场参考价 → 2. 信心计算 → 3. 感知价值 → 4. 心理预期 →
   * 5. 过热评估 → 6. 价格上限 → 7. 最终出价 → 8. 多样性调整
   * @param {ComputeSingleDecisionArgs} args - 决策参数
   * @returns {DecisionResult} 包含finalBid和决策元数据的结果对象
   */
  computeSingleDecision(args: ComputeSingleDecisionArgs): DecisionResult {
    const {
      playerId,
      clueRate,
      qualityRate,
      uncertainty,
      spreadRatio = 0,
      upperEdge = 0,
      lowerEdge = 0,
      roundProgress,
      currentBid,
      marketRef,
      persona,
      bidStep,
      toolEffect
    } = args

    // ─── 出价算法8步流程 ───
    //
    // 步骤1: 市场参考价 marketRef ← 当前出价 + 上轮出价的加权均值
    // 步骤2: 信心 confidence ← 线索率 + 质量率 + 不确定性 + 轮次进度 + 工具效果
    // 步骤3: 感知价值 perceivedValue ← 锚点出价 × 系数 + 趋势 + 压力 + 噪声
    // 步骤4: 心理预期 psychExpectedBid ← 向目标预期逐步适应
    // 步骤5: 过热评估 ← 当前出价超过心理预期时触发回撤
    // 步骤6: 价格上限 hardCap ← min(感知上限, 锚点上限, 心理上限, 市场上限)
    // 步骤7: 最终出价 ← max(当前出价, 感知价值 × 调整) 对齐到步长
    // 步骤8: 群体多样性调整 ← 确保AI出价不扎堆
    //
    // 关键变量:
    //   confidence - 信心分数 (0-1)，影响出价积极性
    //   perceivedValue - 感知价值，基于锚点和情报的估值
    //   hardCap - 价格上限，防止非理性出价
    //
    // 注意事项:
    //   - 人格参数(激进/纪律/跟风)会影响各步骤的权重
    //   - 不确定性高时AI会更保守

    // 确保AI玩家的状态存在，如果不存在则根据人格和出价步长初始化一个新的状态对象，包含锚点出价、心理预期出价和上次出价等信息。
    const state = this.ensureState(playerId, persona, bidStep)

    //下面的const属性都是基于输入参数和AI玩家状态计算得到的中间变量，用于评估当前的信心、价值、市场状况等，最终综合这些因素进行出价决策。
    //简单来讲就是根据传入参数来定义一些常量
    const step = Math.max(10, Math.round(Number(bidStep) || 10000))

    // 工具效果的规则化：将技能或道具的效果转换为对AI决策的具体影响，包括信心提升、策略加成、跟风加成等，确保工具效果在合理范围内。
    const normalizedTool = normalizeToolEffect(toolEffect)

    const safeClueRate = clamp(Number(clueRate) || 0, 0, 1)
    const safeQualityRate = clamp(Number(qualityRate) || 0, 0, 1)
    const safeUncertainty = clamp(Number(uncertainty) || 1 - clueRate, 0, 1)
    const safeSpread = clamp(Number(spreadRatio) || 0, 0, 1.5)
    const safeUpperEdge = clamp(Number(upperEdge) || 0, -0.4, 0.6)
    const safeLowerEdge = clamp(Number(lowerEdge) || 0, -0.4, 0.6)
    const edgeSignal = clamp(safeUpperEdge - safeLowerEdge, -0.4, 0.6)

    //信心计算
    const confidenceParts = this.computeConfidenceParts({
      clueRate: safeClueRate,
      qualityRate: safeQualityRate,
      uncertainty: safeUncertainty,
      spreadRatio: safeSpread,
      upperEdge: safeUpperEdge,
      lowerEdge: safeLowerEdge,
      roundProgress,
      currentBid,
      marketRef,
      persona,
      toolEffect: normalizedTool
    })

    //总信心是各个部分的加权总和，反映了AI对当前拍卖情况的整体评估和信心程度，数值越高表示AI越有信心进行积极出价。
    const confidence = confidenceParts.total

    // 基础估值（公式见 pure.ts calcBaseEstimate）
    const baseEstimate = calcBaseEstimate(state.anchorBid, confidence, safeQualityRate, edgeSignal)

    // 趋势调整：根据市场参考价和AI的跟风倾向进行调整，参考价越有利，调整越积极；跟风倾向强的AI对参考价更敏感。
    //计算公式为：市场参考价*（0.08 + 跟风倾向*0.2 + 工具跟风加成*0.25）
    const trendAdjust = marketRef * (0.08 + persona.followRate * 0.2 + normalizedTool.followBoost * 0.25)

    // 压力调整：随着当前出价接近或超过AI的心理预期，AI可能会感受到压力，尤其是在拍卖后期，这个调整反映了AI在压力下的出价行为变化。
    //计算公式为：当前出价*轮次进度*（0.015 + 激进程度*0.06 + 工具的激进加成*0.12）
    const pressureAdjust =
      currentBid * roundProgress * (0.015 + persona.aggression * 0.06 + normalizedTool.aggressionBoost * 0.12)

    // 感知价值：AI对当前拍卖情况的综合评估，基于基础估值、趋势调整和压力调整等因素计算得到，反映了AI对当前拍卖机会的主观价值判断。
    let perceivedValue = baseEstimate + trendAdjust + pressureAdjust

    // 噪声带宽（公式见 pure.ts calcNoiseBand）
    const noiseBand = calcNoiseBand(persona, safeUncertainty, normalizedTool, safeSpread)

    // 最终感知价值：在基础感知价值的基础上引入噪声干扰，得到AI最终的主观价值评估，这个值将用于后续的出价决策。
    perceivedValue *= randomBetween(1 - noiseBand, 1 + noiseBand)

    // 确保感知价值不低于出价步长，避免AI出价过于保守或停滞不前。
    perceivedValue = Math.max(step, perceivedValue)

    // 目标心理预期（公式见 pure.ts calcTargetPsychExpected）
    const targetPsychExpected = calcTargetPsychExpected(
      step,
      state.anchorBid,
      marketRef,
      currentBid,
      persona,
      normalizedTool,
      safeClueRate,
      safeQualityRate,
      roundProgress
    )

    // 适应率（公式见 pure.ts calcAdaptRate）
    const adaptRate = calcAdaptRate(confidence, persona, normalizedTool, safeSpread)

    // 更新心理预期出价：AI根据适应率调整其心理预期出价，逐渐向目标心理预期靠近，反映了AI对拍卖走势的动态预期和适应过程。
    let psychExpectedBid = state.psychExpectedBid + (targetPsychExpected - state.psychExpectedBid) * adaptRate

    // 过热阈值（公式见 pure.ts calcOverheatThreshold）
    const overheatThreshold = calcOverheatThreshold(confidence, safeUncertainty, safeSpread, persona, normalizedTool)

    // 过热程度（公式见 pure.ts calcOverheatRatio）
    const overheatRatio = calcOverheatRatio(currentBid, psychExpectedBid, step)

    // 是否过热：AI根据过热程度和过热阈值评估当前是否处于过热状态，过热状态可能会触发回撤等保护性行为，避免AI在不利的情况下继续加价。
    const isOverheated = overheatRatio > overheatThreshold

    // 价格上限 hardCap（四上限组合 + 工具加成，公式见 pure.ts calcHardCap）
    let hardCap = calcHardCap(
      step,
      perceivedValue,
      state.anchorBid,
      psychExpectedBid,
      marketRef,
      persona,
      safeQualityRate,
      confidence,
      edgeSignal,
      roundProgress,
      normalizedTool
    )

    // 价值差距：AI感知的价值与当前出价之间的差距，数值越大表示AI认为当前出价相对于其价值评估有更大的提升空间，可能会更积极地加价。
    const valueGap = perceivedValue - currentBid

    // 抬价计算：基于价值差距、激进程度、轮次进度和工具效果等因素计算一个基础的抬价金额，反映了AI对当前拍卖机会的积极程度和冒险倾向。
    //计算公式为：价值差距*（0.12 + 激进程度*0.16 + 轮次进度*0.1 + 工具的策略加成*0.03）
    const baseRaise =
      Math.max(0, valueGap) *
      (0.12 + persona.aggression * 0.16 + roundProgress * 0.1 + normalizedTool.strategyScoreBoost * 0.03)

    // 跟风抬价：如果市场参考价高于当前出价，AI可能会进行一个跟风抬价
    //计算公式为：市场参考价与当前出价的差距*（0.05 + 跟风倾向*0.11 + 工具跟风加成*0.1）
    const followRaise =
      Math.max(0, marketRef - currentBid) * (0.05 + persona.followRate * 0.11 + normalizedTool.followBoost * 0.1)

    // 弹性调整：根据线索率、工具效果、过热程度、不确定性和信息分布等因素进行一个随机的弹性调整，增加AI出价的多样性和适应性，避免AI出价过于机械和可预测。
    //如果线索率较低，AI可能会进行一个更大范围的随机调整，反映了AI在信息不足时的更大不确定性和冒险倾向；如果线索率较高，调整范围会缩小，反映了AI在信息充足时的更高信心和稳定性。
    let floorAdjustRatio =
      safeClueRate < 0.1
        ? randomBetween(persona.noInfoAdjustMin, persona.noInfoAdjustMax)
        : randomBetween(persona.noInfoAdjustMin * 0.52, persona.noInfoAdjustMax * 0.52)

    //下面的计算可以合并为一个公式
    //计算公式为：弹性调整比例=根据线索率确定的基础随机调整范围 + 工具的策略*0.006 - 超热程度超过阈值部分*0.26 - 不确定性*0.038 - 信息分布*0.022
    floorAdjustRatio += normalizedTool.strategyScoreBoost * 0.006
    floorAdjustRatio -= clamp(Math.max(0, overheatRatio - overheatThreshold) * 0.26, 0, 0.15)
    floorAdjustRatio -= safeUncertainty * 0.038
    floorAdjustRatio -= safeSpread * 0.022

    // 弹性调整金额：基于当前出价和弹性调整比例计算的一个随机调整金额
    const floorAdjustAmount = currentBid * floorAdjustRatio

    // 恐高减价：如果当前出价接近AI的心理预期，且AI感受到一定的压力，AI可能会进行一个恐高减价
    const fearThreshold = state.anchorBid * 0.92

    // 恐高概率（公式见 pure.ts calcFearChance）
    const fearChance = calcFearChance(persona, safeUncertainty, safeSpread, roundProgress)

    // 是否触发恐高减价
    const shouldFearDrop =
      !isOverheated && roundProgress < 0.96 && currentBid >= fearThreshold && randomBetween(0, 1) < fearChance

    // AI的最终出价决策
    let bid = currentBid

    // 行动标签：记录AI的决策过程和触发的行为，供事后分析和调试使用，反映了AI在当前拍卖状态下的决策逻辑和行为特征。
    let actionTag = normalizedTool.tag ? `${normalizedTool.tag}后评估` : "规则估值抬价"

    //下面的if-else逻辑根据AI的评估结果和当前拍卖状态，决定AI的最终出价行为，包括过热回撤、恐高减价、低估值观望和正常抬价等不同的行为模式
    // 过热回撤
    //计算公式为：(过热程度超过阈值的部分) * (0.36 + 退却因素*0.22 + 纪律性*0.12)
    if (isOverheated) {
      const retreatStrength = clamp(
        (overheatRatio - overheatThreshold) * (0.36 + persona.retreatFactor * 0.22 + persona.discipline * 0.12),
        0.02,
        0.3
      )

      // 回撤目标：基于心理预期出价和当前出价计算的一个回撤目标
      const retreatTarget = psychExpectedBid * randomBetween(0.92, 0.99)

      // 回撤金额：基于当前出价和回撤强度计算的一个回撤金额
      const retreatByCurrent = currentBid * randomBetween(0.92, 0.99) * (1 - retreatStrength * 0.24)

      // 最终回撤：在回撤目标和回撤金额之间取一个较小的值
      bid = Math.min(retreatTarget, retreatByCurrent)

      // 行动标签更新：反映AI触发了过热回撤行为，标签中包含工具标签（如果有）和回撤的原因。
      actionTag = normalizedTool.tag ? `${normalizedTool.tag}+超预期回撤` : "超预期回撤"

      // 回撤后心理预期调整：如果AI触发了过热回撤，AI的心理预期出价也会进行一个额外的回撤调整
      psychExpectedBid *= 1 - retreatStrength * randomBetween(0.18, 0.36)
    } else if (shouldFearDrop) {
      bid = currentBid * randomBetween(0.92, 0.99)
      actionTag = normalizedTool.tag ? `${normalizedTool.tag}+恐高减价` : "恐高减价"
    } else if (valueGap < -step * 0.5 && roundProgress < 0.9) {
      const coolDown = clamp(Math.abs(valueGap) / Math.max(currentBid, step), 0.02, 0.2)
      bid = currentBid * (1 - coolDown * (0.36 + persona.discipline * 0.18))
      actionTag = normalizedTool.tag ? `${normalizedTool.tag}+低估值观望` : "低估值观望"
    } else {
      const conservativeDrift = step * randomBetween(-1.6, 1.2)
      const openingLift =
        currentBid *
        ((persona.openRaiseRatio * 0.45 + normalizedTool.aggressionBoost * 0.08) *
          clamp(0.45 + confidence * 0.45, 0.3, 0.9))
      //上面的else内的逻辑差不多不额外加注释

      // 最终出价计算：在当前出价的基础上加上开局提升、基础抬价、跟风抬价、弹性调整和一个随机的保守漂移，得到AI的最终出价决策。
      bid = currentBid + openingLift + baseRaise + followRaise + floorAdjustAmount + conservativeDrift

      if (floorAdjustAmount < 0) {
        actionTag = normalizedTool.tag ? `${normalizedTool.tag}+弹性调整` : "弹性调整出价"
      } else if (!normalizedTool.tag) {
        actionTag = "规则估值抬价"
      }
    }

    // 前中期部分AI会故意藏价。
    if (!isOverheated && roundProgress < 0.74 && randomBetween(0, 1) < persona.bluffRate && bid > currentBid) {
      bid = currentBid + (bid - currentBid) * randomBetween(0.52, 0.78)
      actionTag = `${actionTag}+藏价`
    }

    //失误的概率
    const mistakeChance = persona.errorRate * (0.75 + roundProgress * 0.9)
    let mistakeTag = ""
    //这里要重写，应该根据不同的失误类型来调整出价，以及失误的类型与信心有关但计算概率时又不能完全等同于信心，应该是一个综合了信心、轮次进度和人格特征的函数，来决定AI是否会犯错以及犯什么类型的错。
    if (randomBetween(0, 1) < mistakeChance) {
      const roll = randomBetween(0, 1)
      if (roll < 0.4) {
        // 过度乐观：短暂冲动上头。
        bid = Math.max(bid, hardCap * randomBetween(1.02, 1.12))
        mistakeTag = "冲动高估"
      } else if (roll < 0.78) {
        // 过度保守：错失机会。
        bid = Math.max(currentBid * randomBetween(0.82, 0.98), 0)
        mistakeTag = "保守错失"
      } else {
        // 跟风失误：盲目贴近市场锚点。
        bid = Math.max(currentBid + step, marketRef * randomBetween(0.95, 1.08))
        mistakeTag = "盲目跟风"
      }
    }

    if (roundProgress >= 0.98 && randomBetween(0, 1) < persona.aggression * 0.46) {
      const expectedEdge = (hardCap - currentBid) / Math.max(currentBid, step)
      if (!isOverheated && expectedEdge > 0.03) {
        bid *= randomBetween(1.01, 1.06)
        if (!mistakeTag) {
          mistakeTag = "末轮冲动"
        }
      }
    }

    // 确保最终出价在合理范围内，既不超过计算得到的上限，也不低于当前出价，避免AI出价过于激进或过于保守。
    bid = Math.min(bid, hardCap * 1.02)
    bid = Math.max(0, bid)

    // 将最终出价调整到最接近的出价步长，确保AI的出价符合拍卖的规则和节奏。
    const rounded = roundToStep(Math.max(0, bid), step)
    const finalBid = Math.max(0, rounded)

    // 更新AI玩家的状态，包括心理预期出价、锚点出价和上次出价等信息，为下一轮的决策提供参考和基础。
    state.psychExpectedBid = clamp(psychExpectedBid * 0.64 + finalBid * 0.36, step * 1.6, step * 12000)

    // 锚点出价的更新：基于当前的锚点出价、市场参考价和心理预期出价进行更新
    state.anchorBid = clamp(
      state.anchorBid * 0.58 + marketRef * 0.16 + state.psychExpectedBid * 0.26,
      step * 2.4,
      step * 16000
    )
    state.lastBid = finalBid

    //返回所有数据
    return {
      playerId,
      name: persona.name || playerId,
      archetype: persona.archetype || "规则型",
      confidence,
      confidenceParts,
      intelClueRate: safeClueRate,
      intelQualityRate: safeQualityRate,
      intelUncertainty: safeUncertainty,
      intelSpreadRatio: safeSpread,
      intelUpperEdge: safeUpperEdge,
      intelLowerEdge: safeLowerEdge,
      marketRef,
      perceivedValue,
      hardCap,
      targetPsychExpected,
      psychExpectedBid,
      overheatThreshold,
      overheatRatio,
      floorAdjustAmount,
      toolTag: normalizedTool.tag,
      toolScoreBoost: normalizedTool.strategyScoreBoost,
      actionTag,
      mistakeTag,
      diversifyTag: "",
      finalBid
    }
  }

  //信心的计算（委托至 pure.ts 纯函数）
  computeConfidenceParts(args: ComputeConfidencePartsArgs): ConfidenceParts {
    return _computeConfidenceParts(args)
  }

  /**
   * 规划AI情报动作。根据当前情报状态和可用资源，选择最优的技能/道具使用策略
   * @param {PlanIntelActionArgs} args - 情报规划参数
   * @param {string} args.playerId - 玩家ID
   * @param {number} args.round - 当前轮次
   * @param {number} args.maxRounds - 最大轮数
   * @param {Object} [args.intelSummary={}] - 情报摘要
   * @param {Object} [args.resources={}] - 可用资源（技能/道具）
   * @returns {IntelActionResult} 情报动作结果 { type, itemId?, skillId?, reason }
   */
  planIntelAction(args: PlanIntelActionArgs): IntelActionResult {
    return _planIntelAction(args, this.personalityMap)
  }

  /**
   * 计算工具（技能/道具）使用后的效果评估
   * @param {Object} args - 工具效果参数
   * @param {string} [args.actionType="none"] - 动作类型 (skill/item/none)
   * @param {string} [args.actionId="none"] - 动作ID
   * @param {number} [args.roundProgress=0] - 轮次进度 (0-1)
   * @param {IntelSummaryInput} [args.intelSummary] - 情报摘要
   * @param {Object} [args.signalStats] - 信号统计数据
   * @returns {ToolEffect} 工具效果评估结果
   */
  buildToolEffect(
    args: {
      actionType?: string
      actionId?: string
      roundProgress?: number
      intelSummary?: IntelSummaryInput
      signalStats?: {
        aggregate?: IntelSummaryInput
        qualitySignalRate?: number
        outlineSignalRate?: number
        signalCount?: number
        spreadRatio?: number
        upperEdge?: number
        lowerEdge?: number
        [key: string]: unknown
      } | null
      planScore?: number
      [key: string]: unknown
    } = {}
  ): ToolEffect {
    return _buildToolEffect(args)
  }

  applyCrowdDiversity(args: ApplyCrowdDiversityArgs): void {
    _applyCrowdDiversity(args, this.personalityMap)
  }

  // 确保AI玩家的状态存在，如果不存在则根据人格和出价步长初始化一个新的状态对象，包含锚点出价、心理预期出价和上次出价等信息。
  ensureState(playerId: string, persona: Personality, bidStep: number): AiStateEntry {
    const existed = this.aiState.get(playerId)
    if (existed) {
      return existed
    }

    // 初始化ai状态
    const step = Math.max(10, Math.round(Number(bidStep) || 10000))
    // 锚点出价的初始值基于出价步长和人格特质中的锚点范围随机生成，确保AI在拍卖开始时有一个合理的参考出价。
    const runAnchor = Math.max(step, this.runMeta.startingBid * randomBetween(persona.anchorMin, persona.anchorMax))
    const state = {
      anchorBid: runAnchor,
      psychExpectedBid: runAnchor * randomBetween(0.82, 1.08),
      lastBid: 0
    }
    // 将新创建的状态对象存储在aiState映射中，供后续决策使用和更新。
    this.aiState.set(playerId, state)
    // 返回状态对象，供调用者使用。
    return state
  }

  getLastDecisionLog(): Record<string, unknown> | null {
    return this.lastDecisionLog
  }
}

// re-export 纯函数保持向后兼容（消费方可能从 ai/bidding 导入）
export {
  defaultPersona,
  normalizeToolEffect,
  marketReference,
  buildToolEffect,
  computeConfidenceParts,
  applyCrowdDiversity,
  calcBaseEstimate,
  calcNoiseBand,
  calcTargetPsychExpected,
  calcAdaptRate,
  calcOverheatThreshold,
  calcOverheatRatio,
  calcHardCap,
  calcFearChance
} from "./bidding/pure"
export { planIntelAction } from "./bidding/intel-action"
export type {
  Personality,
  AiStateEntry,
  ToolEffect,
  ConfidenceParts,
  DecisionResult,
  IntelActionCandidate,
  IntelActionResult,
  ResetContext,
  BuildAIBidsContext,
  IntelSummaryInput,
  ComputeSingleDecisionArgs,
  ComputeConfidencePartsArgs,
  PlanIntelActionArgs,
  ApplyCrowdDiversityArgs
} from "./bidding/types"
