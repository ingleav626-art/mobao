(function setupAuctionAI(global) {
  class AuctionAiEngine {
    constructor() {
      // 规则化人格参数：用于控制AI出价节奏、跟风倾向与失误概率。
      this.personalityMap = {
        p1: {
          name: "左上AI",
          archetype: "稳算师",
          aggression: 0.58,// 激进程度：影响AI出价的积极性和冒险倾向，数值越高越倾向于激进出价。
          discipline: 0.86,// 纪律性：影响AI出价的稳定性和理性程度，数值越高越倾向于理性出价。
          followRate: 0.32,// 跟风倾向：影响AI对市场参考价的敏感度和模仿程度，数值越高越倾向于跟风出价。
          bluffRate: 0.18,// 虚张声势：影响AI在前中期故意藏价的概率，数值越高越倾向于偶尔藏价。
          errorRate: 0.04,// 失误率：影响AI做出非理性出价的概率，数值越高越倾向于偶尔犯错。
          anchorMin: 1.24,// 锚点范围：AI初始锚点出价相对于市场参考价的倍数范围，AI会在这个范围内随机选择一个初始锚点出价。
          anchorMax: 1.72,// 锚点范围：同上，AI会在anchorMin和anchorMax之间随机选择一个初始锚点出价。
          openRaiseRatio: 0.055,// 开局抬价率：AI在当前出价基础上进行开局抬价时的加成比例，数值越高开局抬价越激进。
          crowdBias: -0.35,// 群体偏差：影响AI在群体多样性调整中的倾向，数值为负时倾向于与市场参考价保持距离，数值为正时倾向于靠近市场参考价。
          expectationElasticity: 0.34,// 预期弹性：影响AI调整心理预期出价时的适应速度，数值越高调整越快。
          retreatFactor: 0.82,// 退却因素：影响AI在感到过热时的回撤程度，数值越高回撤越激烈。
          noInfoAdjustMin: -0.4,// 无信息调整：当线索率较低时，AI出价的随机调整范围下限，数值越低AI越可能大幅降低出价。
          noInfoAdjustMax: 1.5// 无信息调整：当线索率较低时，AI出价的随机调整范围上限，数值越高AI越可能大幅提高出价。
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
      };
      // AI状态：每个AI玩家一个，记录锚点、心理预期等动态信息。
      this.aiState = new Map();
      this.runMeta = {
        startingBid: 100000,
        itemCount: 0
      };
      // 最近一次决策的日志，供事后分析和调试使用。
      this.lastDecisionLog = null;
    }


    // 每次新拍卖开始时重置AI状态，接受一些上下文信息以便调整初始参数。
    resetForNewRun(context = {}) {
      this.aiState.clear();
      this.runMeta = {
        startingBid: Math.max(100000, Number(context.startingBid) || 100000),
        itemCount: Math.max(0, Number(context.itemCount) || 0)
      };
      this.lastDecisionLog = null;
    }

    // 确保AI状态存在，并根据人格参数初始化锚点等信息。
    buildAIBids(context) {
      const {
        aiPlayers,// 当前拍卖中的AI玩家列表，由主场景传入
        clueRate,
        round,
        maxRounds,
        currentBid,// 当前出价，由主场景传入，AI根据这个出价和其他信息进行决策。
        lastRoundBids = {},
        bidStep = 10000,
        aiIntelMap = {},// 每个AI玩家的情报总结，由主场景根据其揭示的信息计算后传入
        aiToolEffectMap = {}
      } = context;

      // 轮次进度：影响AI的激进程度和跟风倾向，越往后越敢于冒险。
      const roundProgress = maxRounds <= 1 ? 1 : (round - 1) / (maxRounds - 1);

      // 出价步长：影响AI出价的粒度和调整幅度，过大可能导致出价过于跳跃，过小则可能过于保守。
      const step = Math.max(10, Math.round(Number(bidStep) || 10000));

      // 市场参考价：基于当前出价和历史出价计算的一个锚点，AI会围绕这个价格进行调整。
      const marketRef = marketReference(currentBid, lastRoundBids, this.runMeta.startingBid);

      // 决策结果的临时存储，后续会进行群体多样性调整。
      const decisionMap = {};

      // 最终出价结果的存储，供主场景执行出价和更新状态。
      const bidMap = {};

      // 逐个计算每个AI玩家的出价决策，基于其人格、当前信息和市场状态。
      aiPlayers.forEach((player) => {
        const persona = this.personalityMap[player.id] || defaultPersona();

        // 情报总结：主场景根据AI玩家揭示的信息计算出的线索率、质量率、不确定性等指标，AI根据这些指标评估当前的信心和价值。
        const intelSummary = aiIntelMap[player.id] || {};

        // 工具效果：如果AI玩家使用了技能或道具，主场景会计算出这些工具对AI决策的潜在影响，并传入AI进行评估和利用。
        const toolEffect = aiToolEffectMap[player.id] || this.buildToolEffect({ actionType: "none" });

        //ai的所有基础信息都来自于参数传入的context，主场景负责收集和计算后传入，AI只专注于决策逻辑。
        //计算单个AI玩家的出价决策，得到一个包含最终出价和相关决策信息的对象。
        //这里调用了computeSingleDecision方法，传入了AI玩家的ID、情报总结、市场状态、人格参数和工具效果等信息，AI根据这些信息进行综合评估和决策。
        const decision = this.computeSingleDecision({
          playerId: player.id,
          //这里的clamp函数用于确保输入的数值在合理的范围内，避免异常值导致AI决策失常。把数值强行限制在最小和最大值之间，超出就截断
          // 情报相关的输入：线索率、质量率、不确定性、信息分布等，AI根据这些评估当前的信心和价值。
          clueRate: clamp(Number.isFinite(intelSummary.clueRate) ? intelSummary.clueRate : clueRate, 0, 1),

          // 质量率：如果主场景没有提供，默认使用0作为质量率的估计，表示平均质量水平。
          qualityRate: clamp(Number(intelSummary.qualityRate) || 0, 0, 1),

          // 不确定性：如果主场景没有提供，默认使用1减去线索率作为不确定性的估计，表示线索越少不确定性越高。
          uncertainty: clamp(Number(intelSummary.uncertainty) || (1 - clueRate), 0, 1),

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
        });
        // 存储决策结果，后续会进行群体多样性调整，确保AI玩家之间的出价行为有一定的差异，避免过于雷同。
        decisionMap[player.id] = decision;

        // 存储最终出价结果，供主场景执行出价和更新状态。
        bidMap[player.id] = decision.finalBid;
      });

      // 调用函数，基于AI玩家的人格特征和当前市场状态，对决策结果进行微调，增加出价行为的多样性和不可预测性。
      this.applyCrowdDiversity({
        aiPlayers,
        decisionMap,
        bidMap,
        currentBid,
        bidStep: step
      });

      // 记录本次决策的详细信息，供事后分析和调试使用，包括每个AI玩家的输入信息、评估指标、决策过程和最终出价等。
      this.lastDecisionLog = {
        round,
        clueRate,
        currentBid,
        marketReference: marketRef,
        //遍历AI玩家列表，构建一个包含每个玩家决策信息的对象，供事后分析和调试使用。
        entries: aiPlayers.map((player) => ({ ...decisionMap[player.id] }))
      };

      // 返回最终的出价结果，供主场景执行出价和更新状态。
      return bidMap;
    }

    // 计算单个AI玩家的出价决策，基于其人格、当前信息和市场状态，得到一个包含最终出价和相关决策信息的对象。
    computeSingleDecision(args) {
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
      } = args;

      // 确保AI玩家的状态存在，如果不存在则根据人格和出价步长初始化一个新的状态对象，包含锚点出价、心理预期出价和上次出价等信息。
      const state = this.ensureState(playerId, persona, bidStep);

      //下面的const属性都是基于输入参数和AI玩家状态计算得到的中间变量，用于评估当前的信心、价值、市场状况等，最终综合这些因素进行出价决策。
      //简单来讲就是根据传入参数来定义一些常量
      const step = Math.max(10, Math.round(Number(bidStep) || 10000));

      // 工具效果的规则化：将技能或道具的效果转换为对AI决策的具体影响，包括信心提升、策略加成、跟风加成等，确保工具效果在合理范围内。
      const normalizedTool = normalizeToolEffect(toolEffect);


      const safeClueRate = clamp(Number(clueRate) || 0, 0, 1);
      const safeQualityRate = clamp(Number(qualityRate) || 0, 0, 1);
      const safeUncertainty = clamp(Number(uncertainty) || (1 - clueRate), 0, 1);
      const safeSpread = clamp(Number(spreadRatio) || 0, 0, 1.5);
      const safeUpperEdge = clamp(Number(upperEdge) || 0, -0.4, 0.6);
      const safeLowerEdge = clamp(Number(lowerEdge) || 0, -0.4, 0.6);
      const edgeSignal = clamp(safeUpperEdge - safeLowerEdge, -0.4, 0.6);

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
      });

      //总信心是各个部分的加权总和，反映了AI对当前拍卖情况的整体评估和信心程度，数值越高表示AI越有信心进行积极出价。
      const confidence = confidenceParts.total;

      // 基础估值：基于锚点出价、信心程度、线索质量和边缘信号等因素计算的一个初始出价估计，AI会在这个基础上进行调整。
      //计算公式为：锚点出价*（0.82 + 信心*0.52 + 质量率*0.18 + 边缘信号*0.12），反映了AI对当前拍卖机会的主观价值评估。
      const baseEstimate = state.anchorBid * (0.82 + confidence * 0.52 + safeQualityRate * 0.18 + edgeSignal * 0.12);

      // 趋势调整：根据市场参考价和AI的跟风倾向进行调整，参考价越有利，调整越积极；跟风倾向强的AI对参考价更敏感。
      //计算公式为：市场参考价*（0.08 + 跟风倾向*0.2 + 工具跟风加成*0.25）
      const trendAdjust = marketRef * (0.08 + persona.followRate * 0.2 + normalizedTool.followBoost * 0.25);

      // 压力调整：随着当前出价接近或超过AI的心理预期，AI可能会感受到压力，尤其是在拍卖后期，这个调整反映了AI在压力下的出价行为变化。
      //计算公式为：当前出价*轮次进度*（0.015 + 激进程度*0.06 + 工具的激进加成*0.12）
      const pressureAdjust = currentBid * roundProgress * (0.015 + persona.aggression * 0.06 + normalizedTool.aggressionBoost * 0.12);

      // 感知价值：AI对当前拍卖情况的综合评估，基于基础估值、趋势调整和压力调整等因素计算得到，反映了AI对当前拍卖机会的主观价值判断。
      let perceivedValue = baseEstimate + trendAdjust + pressureAdjust;

      // 噪声干扰：为了增加AI出价的多样性和不可预测性，基于AI的人格特征、当前信息的不确定性和工具效果等因素引入一个随机噪声，避免AI出价过于机械和可预测。
      //计算公式为：((1-纪律性)*0.18 + 失误率*0.72)*(1 + 不确定性*0.28)*(1 - 工具效果的不确定性降低部分*0.84)*(1 + 信息分布*0.22)
      const noiseBand = clamp(
        ((1 - persona.discipline) * 0.18 + persona.errorRate * 0.72)
        * (1 + safeUncertainty * 0.28)
        * (1 - normalizedTool.uncertaintyReduction * 0.84)
        * (1 + safeSpread * 0.22),
        0.025,
        0.26
      );

      // 最终感知价值：在基础感知价值的基础上引入噪声干扰，得到AI最终的主观价值评估，这个值将用于后续的出价决策。
      perceivedValue *= randomBetween(1 - noiseBand, 1 + noiseBand);

      // 确保感知价值不低于出价步长，避免AI出价过于保守或停滞不前。
      perceivedValue = Math.max(step, perceivedValue);

      // 心理预期调整：AI根据当前的信心程度、市场参考价、锚点出价和工具效果等因素调整其心理预期出价，反映了AI对未来拍卖走势的预期和适应。
      //计算公式为:锚点出价*（0.64+纪律性*0.22）+市场参考价*（0.2+跟风倾向*0.17+工具跟风加成*0.15）+当前出价*（0.02+线索率对信心的影响*0.07+质量率对信心的影响*0.08+轮次进度对压力的影响*0.05+工具策略加成对心理预期的提升*0.025）
      const targetPsychExpected = Math.max(
        step,
        state.anchorBid * (0.64 + persona.discipline * 0.22) +
        marketRef * (0.2 + persona.followRate * 0.17 + normalizedTool.followBoost * 0.15) +
        currentBid * (0.02 + safeClueRate * 0.07 + safeQualityRate * 0.08 + roundProgress * 0.05 + normalizedTool.strategyScoreBoost * 0.025)
      );

      // 适应率：AI调整心理预期出价的速度，基于当前的信心程度、市场参考价、锚点出价和工具效果等因素计算得到，数值越高表示AI对新信息的适应越快。
      //计算公式为：0.12+信心*0.24+预期弹性*0.18+工具效果的信心提升部分*0.25-信息分布*0.08
      const adaptRate = clamp(
        0.12 + confidence * 0.24 + persona.expectationElasticity * 0.18 + normalizedTool.confidenceBoost * 0.25 - safeSpread * 0.08,
        0.1,
        0.72
      );

      // 更新心理预期出价：AI根据适应率调整其心理预期出价，逐渐向目标心理预期靠近，反映了AI对拍卖走势的动态预期和适应过程。
      let psychExpectedBid = state.psychExpectedBid + (targetPsychExpected - state.psychExpectedBid) * adaptRate;

      // 过热评估：AI评估当前的出价是否过热，基于当前出价与心理预期的关系、信心程度、信息不确定性和工具效果等因素计算一个过热阈值和过热程度，决定是否进行回撤。
      //计算公式为：0.04+(1-信心)*0.1+不确定性*0.1+信息分布*0.06-激进程度*0.03+纪律性*0.02-工具效果的不确定性降低部分*0.09
      const overheatThreshold = clamp(
        0.04 +
        (1 - confidence) * 0.1 +
        safeUncertainty * 0.1 +
        safeSpread * 0.06 -
        persona.aggression * 0.03 +
        persona.discipline * 0.02 -
        normalizedTool.uncertaintyReduction * 0.09,
        0.04,
        0.26
      );

      // 过热程度：当前出价超过心理预期的程度，数值越高表示AI感受到的压力越大，可能会触发回撤等保护性行为。
      const overheatRatio = psychExpectedBid <= step ? 0 : (currentBid - psychExpectedBid) / psychExpectedBid;

      // 是否过热：AI根据过热程度和过热阈值评估当前是否处于过热状态，过热状态可能会触发回撤等保护性行为，避免AI在不利的情况下继续加价。
      const isOverheated = overheatRatio > overheatThreshold;

      // 价格上限计算：AI根据感知价值、心理预期、市场参考价和锚点出价等因素计算一个出价上限，AI的最终出价不会超过这个上限，确保AI在合理范围内进行出价。
      //计算公式为：感知价值*（0.82 + 纪律性*0.1 + 质量率*0.08）
      const perceivedCap = perceivedValue * clamp(0.82 + persona.discipline * 0.1 + safeQualityRate * 0.08, 0.78, 1.05);

      // 锚点上限：基于锚点出价、信心程度和边缘信号等因素计算的一个出价上限，反映了AI对当前拍卖机会的主观价值评估和风险控制。
      //计算公式为：锚点出价*（0.92 + 信心*0.18 + 边缘信号*0.1），反映了AI对当前拍卖机会的主观价值评估和风险控制。
      const anchorCap = state.anchorBid * clamp(0.92 + confidence * 0.18 + edgeSignal * 0.1, 0.82, 1.18);

      // 心理预期上限：基于心理预期出价、信心程度和工具效果等因素计算的一个出价上限，反映了AI对未来拍卖走势的预期和适应，以及工具对AI决策的影响。
      //计算公式为：心理预期出价*（0.9 + 信心*0.16），反映了AI对未来拍卖走势的预期和适应，以及工具对AI决策的影响。
      const psychCap = psychExpectedBid * clamp(0.9 + confidence * 0.16, 0.82, 1.2);

      // 市场参考价上限：基于市场参考价、跟风倾向和工具效果等因素计算的一个出价上限，反映了AI对当前市场状况的评估和跟风行为的控制。
      //计算公式为：市场参考价*（0.78 + 跟风倾向*0.12 + 轮次进度*0.05），反映了AI对当前市场状况的评估和跟风行为的控制。
      const marketCap = marketRef * clamp(0.78 + persona.followRate * 0.12 + roundProgress * 0.05, 0.72, 1.08);

      // 综合价格上限：AI根据感知价值、心理预期、市场参考价和锚点出价等因素计算一个综合的出价上限，确保AI在合理范围内进行出价，避免过度冒险或过于保守。
      //求在perceivedCap、anchorCap、psychCap和marketCap这四个上限中的最小值，确保AI的出价不会超过这些合理的限制，反映了AI对当前拍卖机会的综合评估和风险控制。
      let hardCap = Math.max(step, Math.min(perceivedCap, Math.max(anchorCap, psychCap, marketCap)));

      // 工具加成：如果AI玩家使用了技能或道具，工具可能会提供一个加成，提升AI的出价上限，反映了工具对AI决策的积极影响。
      hardCap *= clamp(1 + normalizedTool.capBoost * 0.2, 0.88, 1.1);

      // 确保出价上限不低于出价步长，避免AI出价过于保守或停滞不前。
      hardCap = Math.max(step, hardCap);

      // 价值差距：AI感知的价值与当前出价之间的差距，数值越大表示AI认为当前出价相对于其价值评估有更大的提升空间，可能会更积极地加价。
      const valueGap = perceivedValue - currentBid;

      // 抬价计算：基于价值差距、激进程度、轮次进度和工具效果等因素计算一个基础的抬价金额，反映了AI对当前拍卖机会的积极程度和冒险倾向。
      //计算公式为：价值差距*（0.12 + 激进程度*0.16 + 轮次进度*0.1 + 工具的策略加成*0.03）
      const baseRaise = Math.max(0, valueGap) * (0.12 + persona.aggression * 0.16 + roundProgress * 0.1 + normalizedTool.strategyScoreBoost * 0.03);

      // 跟风抬价：如果市场参考价高于当前出价，AI可能会进行一个跟风抬价
      //计算公式为：市场参考价与当前出价的差距*（0.05 + 跟风倾向*0.11 + 工具跟风加成*0.1）
      const followRaise = Math.max(0, marketRef - currentBid) * (0.05 + persona.followRate * 0.11 + normalizedTool.followBoost * 0.1);

      // 弹性调整：根据线索率、工具效果、过热程度、不确定性和信息分布等因素进行一个随机的弹性调整，增加AI出价的多样性和适应性，避免AI出价过于机械和可预测。
      //如果线索率较低，AI可能会进行一个更大范围的随机调整，反映了AI在信息不足时的更大不确定性和冒险倾向；如果线索率较高，调整范围会缩小，反映了AI在信息充足时的更高信心和稳定性。
      let floorAdjustRatio = safeClueRate < 0.1
        ? randomBetween(persona.noInfoAdjustMin, persona.noInfoAdjustMax)
        : randomBetween(persona.noInfoAdjustMin * 0.52, persona.noInfoAdjustMax * 0.52);

      //下面的计算可以合并为一个公式
      //计算公式为：弹性调整比例=根据线索率确定的基础随机调整范围 + 工具的策略*0.006 - 超热程度超过阈值部分*0.26 - 不确定性*0.038 - 信息分布*0.022
      floorAdjustRatio += normalizedTool.strategyScoreBoost * 0.006;
      floorAdjustRatio -= clamp(Math.max(0, overheatRatio - overheatThreshold) * 0.26, 0, 0.15);
      floorAdjustRatio -= safeUncertainty * 0.038;
      floorAdjustRatio -= safeSpread * 0.022;

      // 弹性调整金额：基于当前出价和弹性调整比例计算的一个随机调整金额
      const floorAdjustAmount = currentBid * floorAdjustRatio;

      // 恐高减价：如果当前出价接近AI的心理预期，且AI感受到一定的压力，AI可能会进行一个恐高减价
      const fearThreshold = state.anchorBid * 0.92;

      // 恐高概率计算
      //计算公式为：0.08 + (1 - 激进程度)*0.14 + 不确定性*0.1 + 信息分布*0.08 - 轮次进度*0.06
      const fearChance = clamp(
        0.08 + (1 - persona.aggression) * 0.14 + safeUncertainty * 0.1 + safeSpread * 0.08 - roundProgress * 0.06,
        0.05,
        0.3
      );

      // 是否触发恐高减价
      const shouldFearDrop = !isOverheated
        && roundProgress < 0.96
        && currentBid >= fearThreshold
        && randomBetween(0, 1) < fearChance;

      // AI的最终出价决策
      let bid = currentBid;

      // 行动标签：记录AI的决策过程和触发的行为，供事后分析和调试使用，反映了AI在当前拍卖状态下的决策逻辑和行为特征。
      let actionTag = normalizedTool.tag ? `${normalizedTool.tag}后评估` : "规则估值抬价";

      //下面的if-else逻辑根据AI的评估结果和当前拍卖状态，决定AI的最终出价行为，包括过热回撤、恐高减价、低估值观望和正常抬价等不同的行为模式
      // 过热回撤
      //计算公式为：(过热程度超过阈值的部分) * (0.36 + 退却因素*0.22 + 纪律性*0.12)
      if (isOverheated) {
        const retreatStrength = clamp(
          (overheatRatio - overheatThreshold) * (0.36 + persona.retreatFactor * 0.22 + persona.discipline * 0.12),
          0.02,
          0.3
        );

        // 回撤目标：基于心理预期出价和当前出价计算的一个回撤目标
        const retreatTarget = psychExpectedBid * randomBetween(0.92, 0.99);

        // 回撤金额：基于当前出价和回撤强度计算的一个回撤金额
        const retreatByCurrent = currentBid * randomBetween(0.92, 0.99) * (1 - retreatStrength * 0.24);

        // 最终回撤：在回撤目标和回撤金额之间取一个较小的值
        bid = Math.min(retreatTarget, retreatByCurrent);

        // 行动标签更新：反映AI触发了过热回撤行为，标签中包含工具标签（如果有）和回撤的原因。
        actionTag = normalizedTool.tag ? `${normalizedTool.tag}+超预期回撤` : "超预期回撤";

        // 回撤后心理预期调整：如果AI触发了过热回撤，AI的心理预期出价也会进行一个额外的回撤调整
        psychExpectedBid *= 1 - retreatStrength * randomBetween(0.18, 0.36);
      } else if (shouldFearDrop) {
        bid = currentBid * randomBetween(0.92, 0.99);
        actionTag = normalizedTool.tag ? `${normalizedTool.tag}+恐高减价` : "恐高减价";
      } else if (valueGap < -step * 0.5 && roundProgress < 0.9) {
        const coolDown = clamp(Math.abs(valueGap) / Math.max(currentBid, step), 0.02, 0.2);
        bid = currentBid * (1 - coolDown * (0.36 + persona.discipline * 0.18));
        actionTag = normalizedTool.tag ? `${normalizedTool.tag}+低估值观望` : "低估值观望";
      } else {
        const conservativeDrift = step * randomBetween(-1.6, 1.2);
        const openingLift = currentBid * (
          (persona.openRaiseRatio * 0.45 + normalizedTool.aggressionBoost * 0.08)
          * clamp(0.45 + confidence * 0.45, 0.3, 0.9)
        );
        //上面的else内的逻辑差不多不额外加注释

        // 最终出价计算：在当前出价的基础上加上开局提升、基础抬价、跟风抬价、弹性调整和一个随机的保守漂移，得到AI的最终出价决策。
        bid = currentBid + openingLift + baseRaise + followRaise + floorAdjustAmount + conservativeDrift;


        if (floorAdjustAmount < 0) {
          actionTag = normalizedTool.tag ? `${normalizedTool.tag}+弹性调整` : "弹性调整出价";
        } else if (!normalizedTool.tag) {
          actionTag = "规则估值抬价";
        }
      }

      // 前中期部分AI会故意藏价。
      if (!isOverheated && roundProgress < 0.74 && randomBetween(0, 1) < persona.bluffRate && bid > currentBid) {
        bid = currentBid + (bid - currentBid) * randomBetween(0.52, 0.78);
        actionTag = `${actionTag}+藏价`;
      }

      //失误的概率
      const mistakeChance = persona.errorRate * (0.75 + roundProgress * 0.9);
      let mistakeTag = "";
      //这里要重写，应该根据不同的失误类型来调整出价，以及失误的类型与信心有关但计算概率时又不能完全等同于信心，应该是一个综合了信心、轮次进度和人格特征的函数，来决定AI是否会犯错以及犯什么类型的错。
      if (randomBetween(0, 1) < mistakeChance) {
        const roll = randomBetween(0, 1);
        if (roll < 0.4) {
          // 过度乐观：短暂冲动上头。
          bid = Math.max(bid, hardCap * randomBetween(1.02, 1.12));
          mistakeTag = "冲动高估";
        } else if (roll < 0.78) {
          // 过度保守：错失机会。
          bid = Math.max(currentBid * randomBetween(0.82, 0.98), 0);
          mistakeTag = "保守错失";
        } else {
          // 跟风失误：盲目贴近市场锚点。
          bid = Math.max(currentBid + step, marketRef * randomBetween(0.95, 1.08));
          mistakeTag = "盲目跟风";
        }
      }

      if (roundProgress >= 0.98 && randomBetween(0, 1) < persona.aggression * 0.46) {
        const expectedEdge = (hardCap - currentBid) / Math.max(currentBid, step);
        if (!isOverheated && expectedEdge > 0.03) {
          bid *= randomBetween(1.01, 1.06);
          if (!mistakeTag) {
            mistakeTag = "末轮冲动";
          }
        }
      }

      // 确保最终出价在合理范围内，既不超过计算得到的上限，也不低于当前出价，避免AI出价过于激进或过于保守。
      bid = Math.min(bid, hardCap * 1.02);
      bid = Math.max(0, bid);

      // 将最终出价调整到最接近的出价步长，确保AI的出价符合拍卖的规则和节奏。
      const rounded = roundToStep(Math.max(0, bid), step);
      const finalBid = Math.max(0, rounded);

      // 更新AI玩家的状态，包括心理预期出价、锚点出价和上次出价等信息，为下一轮的决策提供参考和基础。
      state.psychExpectedBid = clamp(psychExpectedBid * 0.64 + finalBid * 0.36, step * 1.6, step * 12000);

      // 锚点出价的更新：基于当前的锚点出价、市场参考价和心理预期出价进行更新
      state.anchorBid = clamp(
        state.anchorBid * 0.58 + marketRef * 0.16 + state.psychExpectedBid * 0.26,
        step * 2.4,
        step * 16000
      );
      state.lastBid = finalBid;

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
      };
    }

    //信心的计算
    computeConfidenceParts(args) {
      const {
        clueRate,
        qualityRate,
        uncertainty,
        spreadRatio,
        upperEdge,
        lowerEdge,
        roundProgress,
        currentBid,
        marketRef,
        persona,
        toolEffect
      } = args;

      //基础值
      const base = 0.8;

      //数值计算
      const clue = clueRate * (0.3 + persona.discipline * 0.1);

      //质量计算：AI对质量信息的敏感度，尤其是当线索率较高时，质量信息能显著提升AI的信心。
      const quality = qualityRate * (0.2 + persona.discipline * 0.08);

      //进度相关：AI在拍卖初期可能更谨慎，随着拍卖的推进逐渐增加信心，尤其是当线索和质量信息逐渐揭示时。
      const progress = roundProgress * (0.16 + persona.aggression * 0.1);

      //市场相关：参考价越有利，信心越高；跟风倾向强的AI对市场参考价更敏感。
      const marketDelta = Math.abs((marketRef - currentBid) / Math.max(currentBid, 1));

      const market = clamp(marketDelta * (0.12 + persona.followRate * 0.08), 0, 0.16);
      const tool = clamp((toolEffect.confidenceBoost || 0) * 0.8 + (toolEffect.strategyScoreBoost || 0) * 0.1, -0.06, 0.16);
      const edgeBonus = clamp(((upperEdge || 0) - (lowerEdge || 0)) * 0.22, -0.08, 0.14);
      const spreadPenalty = (spreadRatio || 0) * (0.18 - persona.discipline * 0.05);
      const uncertaintyPenalty = uncertainty * (0.2 - persona.discipline * 0.06);
      const mood = randomBetween(-0.08, 0.08) * (1 - persona.discipline * 0.6);
      const total = clamp(
        base + clue + quality + progress + market + tool + edgeBonus - spreadPenalty - uncertaintyPenalty + mood,
        0,
        1
      );

      return {
        base,
        clue,
        quality,
        progress,
        market,
        tool,
        edgeBonus,
        spreadPenalty,
        uncertaintyPenalty,
        mood,
        total
      };
    }


    planIntelAction(args) {
      const {
        playerId,
        round,
        maxRounds,
        intelSummary = {},
        resources = {}
      } = args;

      const persona = this.personalityMap[playerId] || defaultPersona();
      const roundProgress = maxRounds <= 1 ? 1 : (round - 1) / (maxRounds - 1);
      const clueRate = clamp(Number(intelSummary.clueRate) || 0, 0, 1);
      const qualityRate = clamp(Number(intelSummary.qualityRate) || 0, 0, 1);
      const uncertainty = clamp(Number(intelSummary.uncertainty) || 1, 0, 1);
      const spreadRatio = clamp(Number(intelSummary.spreadRatio) || 0, 0, 1.5);
      const signalCount = Math.max(0, Number(intelSummary.signalCount) || 0);
      const infoGap = 1 - clueRate;
      const qualityGap = 1 - qualityRate;
      const earlyNeed = 1 - roundProgress;
      const confidenceNeed = clamp(0.78 - clueRate * 0.44 - qualityRate * 0.2 + uncertainty * 0.26 + spreadRatio * 0.2, 0, 1.2);
      const skillPool = resources.skills || {};
      const itemPool = resources.items || {};
      const itemTotal = Object.values(itemPool).reduce((sum, value) => sum + (Number(value) || 0), 0);
      const itemPenaltyBase = itemTotal <= 1 ? 0.1 : (itemTotal <= 2 ? 0.06 : 0.03);
      const itemUseBoost = clamp(0.05 + earlyNeed * 0.04 + confidenceNeed * 0.03, 0, 0.14);
      const fatiguePenalty = signalCount > 12 ? 0.05 : 0;

      const candidates = [];
      candidates.push({
        actionType: "none",
        actionId: "none",
        expectedReveal: 0,
        score: 0.2
          + roundProgress * 0.2
          + (1 - confidenceNeed) * 0.12
          + persona.discipline * 0.06
          - spreadRatio * 0.04
          + randomBetween(-0.04, 0.04)
      });

      if ((skillPool["skill-outline-scan"] || 0) > 0) {
        candidates.push({
          actionType: "skill",
          actionId: "skill-outline-scan",
          expectedReveal: 3,
          score: confidenceNeed * 0.42
            + infoGap * 0.24
            + earlyNeed * 0.18
            + persona.discipline * 0.07
            - fatiguePenalty
            + randomBetween(-0.05, 0.05)
        });
      }

      if ((skillPool["skill-quality-jade"] || 0) > 0) {
        candidates.push({
          actionType: "skill",
          actionId: "skill-quality-jade",
          expectedReveal: 2,
          score: qualityGap * 0.46
            + confidenceNeed * 0.18
            + spreadRatio * 0.2
            + (1 - Math.abs(roundProgress - 0.58)) * 0.1
            + persona.discipline * 0.09
            - fatiguePenalty * 0.8
            + randomBetween(-0.05, 0.05)
        });
      }

      if ((itemPool["item-outline-lamp"] || 0) > 0) {
        candidates.push({
          actionType: "item",
          actionId: "item-outline-lamp",
          expectedReveal: 4,
          score: confidenceNeed * 0.34
            + infoGap * 0.26
            + earlyNeed * 0.14
            + persona.aggression * 0.08
            + itemUseBoost
            - itemPenaltyBase
            - fatiguePenalty
            + randomBetween(-0.06, 0.06)
        });
      }

      if ((itemPool["item-quality-needle"] || 0) > 0) {
        candidates.push({
          actionType: "item",
          actionId: "item-quality-needle",
          expectedReveal: 3,
          score: qualityGap * 0.5
            + confidenceNeed * 0.16
            + spreadRatio * 0.22
            + persona.aggression * 0.07
            + itemUseBoost
            - (itemPenaltyBase + 0.03)
            - fatiguePenalty
            + randomBetween(-0.06, 0.06)
        });
      }

      const sorted = [...candidates].sort((a, b) => b.score - a.score);
      const best = sorted[0] || {
        actionType: "none",
        actionId: "none",
        expectedReveal: 0,
        score: 0
      };

      const threshold = clamp(0.2 + roundProgress * 0.1 - confidenceNeed * 0.08 + spreadRatio * 0.06, 0.14, 0.38);
      if (best.actionType === "none" || best.score < threshold) {
        return {
          actionType: "none",
          actionId: "none",
          expectedReveal: 0,
          score: best.score,
          candidates: sorted.slice(0, 4)
        };
      }

      return {
        ...best,
        candidates: sorted.slice(0, 4)
      };
    }

    buildToolEffect(args = {}) {
      const {
        actionType = "none",
        actionId = "none",
        roundProgress = 0,
        intelSummary = {},
        signalStats = null,
        planScore = 0
      } = args;

      if (actionType === "none" || actionId === "none") {
        return normalizeToolEffect({
          tag: "无工具",
          confidenceBoost: 0,
          capBoost: 0,
          followBoost: 0,
          aggressionBoost: 0,
          uncertaintyReduction: 0,
          strategyScoreBoost: 0,
          planScore: 0
        });
      }

      const aggregate = signalStats && signalStats.aggregate
        ? signalStats.aggregate
        : (signalStats || null);
      const qualitySignalRate = clamp(Number(signalStats?.qualitySignalRate) || 0, 0, 1);
      const outlineSignalRate = clamp(Number(signalStats?.outlineSignalRate) || 0, 0, 1);
      const qualityRate = clamp(Number(intelSummary.qualityRate) || 0, 0, 1);

      const statCount = Math.max(0, Number(aggregate?.count) || 0);
      const spread = clamp(Number(aggregate?.spreadRatio) || Number(intelSummary.spreadRatio) || 0, 0, 1.5);
      const upperEdge = clamp(Number(aggregate?.upperEdge) || Number(intelSummary.upperEdge) || 0, -0.4, 0.6);
      const lowerEdge = clamp(Number(aggregate?.lowerEdge) || Number(intelSummary.lowerEdge) || 0, -0.4, 0.6);
      const edgeSignal = clamp(upperEdge - lowerEdge, -0.4, 0.6);
      const signalCount = Math.max(0, Number(signalStats?.signalCount) || 0);
      const stageFactor = clamp(0.94 - roundProgress * 0.14, 0.7, 1);
      const countFactor = clamp(signalCount * 0.24 + statCount / 40, 0, 1.2);
      const stability = clamp(1 - spread * 1.2, 0, 1);

      const effect = {
        tag: actionId.includes("quality") ? "候选鉴质" : "候选拓影",
        confidenceBoost: clamp((stability * 0.12 + countFactor * 0.06 + edgeSignal * 0.1 + qualitySignalRate * 0.03) * stageFactor, -0.05, 0.24),
        capBoost: clamp((Math.max(0, edgeSignal) * 0.22 + qualitySignalRate * 0.06 + qualityRate * 0.04 - spread * 0.05) * stageFactor, -0.08, 0.18),
        followBoost: clamp((outlineSignalRate * 0.07 + stability * 0.04 - roundProgress * 0.02), -0.05, 0.12),
        aggressionBoost: clamp((Math.max(0, edgeSignal) * 0.11 + (Number(planScore) || 0) * 0.03 - spread * 0.04) * (1 - roundProgress * 0.35), -0.08, 0.12),
        uncertaintyReduction: clamp(stability * 0.18 + countFactor * 0.08 + qualitySignalRate * 0.05, 0, 0.32),
        strategyScoreBoost: clamp((Number(planScore) || 0) * 0.62 + edgeSignal * 0.22 - spread * 0.12, -0.25, 0.9),
        planScore: Number(planScore) || 0
      };

      return normalizeToolEffect(effect);
    }

    applyCrowdDiversity(args) {
      const {
        aiPlayers,
        decisionMap,
        bidMap,
        currentBid,
        bidStep
      } = args;

      const step = Math.max(10, Math.round(Number(bidStep) || 100));
      const spacing = Math.max(step * 5, currentBid * 0.015);

      const sorted = aiPlayers
        .map((player) => ({ id: player.id, bid: bidMap[player.id] || 0 }))
        .sort((a, b) => a.bid - b.bid);

      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const diff = curr.bid - prev.bid;

        if (diff >= spacing) {
          continue;
        }

        const need = spacing - diff;
        const prevPersona = this.personalityMap[prev.id] || defaultPersona();
        const currPersona = this.personalityMap[curr.id] || defaultPersona();
        const bias = (currPersona.crowdBias || 0) - (prevPersona.crowdBias || 0);

        let pullDown = need * 0.5;
        let pushUp = need * 0.5;
        if (bias > 0.18) {
          pushUp = need * 0.58;
          pullDown = need * 0.42;
        } else if (bias < -0.18) {
          pushUp = need * 0.42;
          pullDown = need * 0.58;
        }

        bidMap[prev.id] = roundToStep(Math.max(0, bidMap[prev.id] - pullDown), step);
        bidMap[curr.id] = roundToStep(Math.max(0, bidMap[curr.id] + pushUp), step);

        if (decisionMap[prev.id]) {
          decisionMap[prev.id].diversifyTag = "差异化下修";
          decisionMap[prev.id].finalBid = bidMap[prev.id];
        }
        if (decisionMap[curr.id]) {
          decisionMap[curr.id].diversifyTag = "差异化上调";
          decisionMap[curr.id].finalBid = bidMap[curr.id];
        }
      }

      const used = new Set();
      aiPlayers.forEach((player, idx) => {
        const id = player.id;
        let bid = roundToStep(Math.max(0, bidMap[id] || 0), step);
        while (used.has(bid)) {
          const offset = step * (idx + 1);
          const lower = Math.max(0, bid - offset);
          if (!used.has(lower)) {
            bid = lower;
            break;
          }
          bid += offset;
        }
        used.add(bid);
        bidMap[id] = bid;
        if (decisionMap[id]) {
          decisionMap[id].finalBid = bid;
        }
      });
    }

    // 确保AI玩家的状态存在，如果不存在则根据人格和出价步长初始化一个新的状态对象，包含锚点出价、心理预期出价和上次出价等信息。
    ensureState(playerId, persona, bidStep) {
      const existed = this.aiState.get(playerId);
      if (existed) {
        return existed;
      }

      // 初始化ai状态
      const step = Math.max(10, Math.round(Number(bidStep) || 10000));
      // 锚点出价的初始值基于出价步长和人格特质中的锚点范围随机生成，确保AI在拍卖开始时有一个合理的参考出价。
      const runAnchor = Math.max(step, this.runMeta.startingBid * randomBetween(persona.anchorMin, persona.anchorMax));
      const state = {
        anchorBid: runAnchor,
        psychExpectedBid: runAnchor * randomBetween(0.82, 1.08),
        lastBid: 0
      };
      // 将新创建的状态对象存储在aiState映射中，供后续决策使用和更新。
      this.aiState.set(playerId, state);
      // 返回状态对象，供调用者使用。
      return state;
    }

    getLastDecisionLog() {
      return this.lastDecisionLog;
    }
  }

  function defaultPersona() {
    return {
      name: "AI",
      archetype: "规则型",
      aggression: 0.64,
      discipline: 0.72,
      followRate: 0.35,
      bluffRate: 0.2,
      errorRate: 0.05,
      anchorMin: 1.3,
      anchorMax: 1.9,
      openRaiseRatio: 0.06,
      crowdBias: 0,
      expectationElasticity: 0.56,
      retreatFactor: 0.56,
      noInfoAdjustMin: -0.04,
      noInfoAdjustMax: 0.05
    };
  }

  function normalizeToolEffect(effect = {}) {
    return {
      tag: effect.tag || "",
      confidenceBoost: clamp(Number(effect.confidenceBoost) || 0, -0.2, 0.45),
      capBoost: clamp(Number(effect.capBoost) || 0, -0.2, 0.25),
      followBoost: clamp(Number(effect.followBoost) || 0, -0.2, 0.3),
      aggressionBoost: clamp(Number(effect.aggressionBoost) || 0, -0.2, 0.3),
      uncertaintyReduction: clamp(Number(effect.uncertaintyReduction) || 0, 0, 0.45),
      strategyScoreBoost: clamp(Number(effect.strategyScoreBoost) || 0, -0.4, 1.6),
      planScore: Number(effect.planScore) || 0
    };
  }

  function marketReference(currentBid, lastRoundBids, fallback) {
    const values = Object.values(lastRoundBids || {})
      .map((value) => Number(value) || 0)
      .filter((value) => value > 0);

    if (values.length === 0) {
      return Math.max(currentBid, fallback || currentBid);
    }

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const top = Math.max(...values);
    return Math.max(currentBid, avg * 0.62 + top * 0.38);
  }

  function roundToStep(value, step) {
    return Math.round(value / step) * step;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  global.AuctionAI = {
    AuctionAiEngine
  };
})(window);
