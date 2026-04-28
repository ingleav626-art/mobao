(function setupMobaoSceneLlm(global) {
  const LLM_DECISION_SYSTEM_PROMPT = [
    "你是仓库摸宝中的竞拍AI玩家。目标是在有限轮次内，以低于仓库真实总价值的成交价来盈利。",
    "【规则摘要】每轮结算后所有玩家同时公布出价；非最终轮可以提前获胜（由 directWinRatio 触发然后提前拿下）；最终轮最高出价者获胜。",
    "【分红机制】若拍下者亏损，非拍下者各获得亏损额的15%作为分红（鼓励欺诈对手高价拍下）。",
    "【门票机制】若拍下者盈利，非拍下者各被扣除盈利额的5%作为门票（鼓励积极竞拍）。",
    "【策略影响】分红机制意味着你可以通过抬价让对手高价拍下后亏损来获利；门票机制意味着不拍下而对手盈利时你会被扣钱。权衡出价与放弃的利弊。",
    "【信息可见性】otherPlayersPublic、bidHistory、publicEvents 属于公开信息；privateIntel 仅代表你当前可见，不可推断他人也知道。",
    "【禁止臆造】任何输入中未出现的藏品信息、他人私有情报、额外规则一律视为不存在。",
    "【动作约束】本局禁止弃标(canFold=false)。",
    "【两段式流程】可能存在 initial 与 follow-up-after-tool 两阶段：若第一阶段执行了工具，才会进入第二阶段。",
    "【同轮动作上限】同一轮最多一次技能或道具；若是 follow-up 阶段，必须 skill=无 且 item=无，仅允许更新 bid/thought。",
    "【输出合同】只返回 JSON 对象，且仅包含 bid、skill、item、thought 四个字段，不要输出 markdown 代码块或额外解释。",
    "【bid要求】bid 必须为正整数；会被系统做钱包/步长等归一化校验。",
    "【thought要求】thought 仅用于日志复盘，最长 200 字。",
    "若输出不合法或动作非法，系统可能忽略你的该部分决策并回退到规则AI结果。"
  ].join("\n");

  function safeParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function tryExtractDecisionJson(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return null;
    }

    const direct = safeParseJson(text);
    if (direct && typeof direct === "object") {
      return direct;
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      const parsed = safeParseJson(fenced[1].trim());
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const slice = text.slice(firstBrace, lastBrace + 1);
      const parsed = safeParseJson(slice);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }

    return null;
  }

  function createSceneLlmBridge(deps) {
    const {
      AI_LLM_SWITCH_STORAGE_KEY,
      LLM_SETTINGS,
      GAME_SETTINGS,
      SKILL_DEFS,
      ITEM_DEFS,
      normalizeDeepSeekSettings,
      maskApiKey,
      saveDeepSeekSettings,
      pickFirstDefined,
      compactOneLine,
      normalizeActionToken,
      isNoneActionText,
      compactPanelText,
      indentMultiline,
      formatBidRevealNumber
    } = deps;

    function loadAiLlmPlayerSwitches(players) {
      const defaults = {};
      (players || []).forEach((player) => {
        if (!player.isHuman) {
          defaults[player.id] = true;
        }
      });

      const raw = window.localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY);
      if (!raw) {
        return defaults;
      }

      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          return defaults;
        }

        const merged = { ...defaults };
        Object.keys(defaults).forEach((playerId) => {
          if (Object.prototype.hasOwnProperty.call(parsed, playerId)) {
            const rawValue = parsed[playerId];
            if (typeof rawValue === "boolean") {
              merged[playerId] = rawValue;
            } else if (typeof rawValue === "string") {
              const normalized = rawValue.trim().toLowerCase();
              if (normalized === "true" || normalized === "1") {
                merged[playerId] = true;
              } else if (normalized === "false" || normalized === "0") {
                merged[playerId] = false;
              }
            } else if (typeof rawValue === "number") {
              merged[playerId] = rawValue !== 0;
            }
          }
        });
        return merged;
      } catch (_error) {
        return defaults;
      }
    }

    function saveAiLlmPlayerSwitches(value) {
      if (!value || typeof value !== "object") {
        return;
      }
      window.localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify(value));
    }

    const methods = {
      renderAiLogicPanelForLlm(telemetry) {
        const lines = [];
        lines.push(`回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`);
        lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。\n");
        lines.push("-");

        const rulePayload = this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
          ? this.aiEngine.getLastDecisionLog()
          : null;
        const ruleEntryById = new Map(
          ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
        );

        (telemetry.entries || []).forEach((entry) => {
          const isLlm = entry.controlMode === "llm";
          lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`);
          lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`);

          if (isLlm) {
            if (entry.controlMode) {
              lines.push(`  接管模式: ${entry.controlMode}`);
            }
            if (entry.historyMessagesCount > 0) {
              lines.push(`  跨局记忆注入: ${entry.historyMessagesCount}条${entry.historyMessagesPreview ? ` | ${entry.historyMessagesPreview.slice(0, 120)}` : ""}`);
            }
            if (entry.llmActionName) {
              lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`);
            }
            if (entry.ruleActionName) {
              lines.push(`  规则动作: ${entry.ruleActionName}`);
            }
            if (entry.thought) {
              lines.push(`  思考: ${entry.thought}`);
            }
            if (entry.reasoningContent) {
              lines.push(`  思维链: ${entry.reasoningContent}`);
            }
            if (entry.error) {
              lines.push(`  错误: ${entry.error}`);
            }
            if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
              lines.push(`  回退规则出价参考: ${formatBidRevealNumber(entry.fallbackRuleBid)}`);
            }

            lines.push("  [System Prompt]");
            lines.push(indentMultiline(compactPanelText(entry.systemPrompt, 2200), "    "));
            lines.push("  [User Prompt]");
            lines.push(indentMultiline(compactPanelText(entry.userPrompt, 10000), "    "));
            lines.push("  [Model Response]");
            lines.push(indentMultiline(compactPanelText(entry.modelResponse, 3000), "    "));
            if (entry.toolResultSummary) {
              lines.push("  [Tool Result]");
              lines.push(indentMultiline(compactPanelText(entry.toolResultSummary, 800), "    "));
            }
            if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
              lines.push("  [Follow-up Prompt]");
              lines.push(indentMultiline(compactPanelText(entry.followupPrompt, 4200), "    "));
              lines.push("  [Follow-up Response]");
              lines.push(indentMultiline(compactPanelText(entry.followupResponse || entry.followupError, 4000), "    "));
              if (entry.followupActionRejected) {
                lines.push("  [Follow-up Action Guard]");
                lines.push(indentMultiline(compactPanelText(entry.followupActionRejected, 500), "    "));
              }
            }
          } else {
            const ruleEntry = ruleEntryById.get(entry.playerId);
            if (ruleEntry) {
              const parts = ruleEntry.confidenceParts || {};
              const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100);
              const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100);
              lines.push(`  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`);
              lines.push(`  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`);
              lines.push(`  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`);
              lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`);
              lines.push(`  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`);
              lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`);
              lines.push(`  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`);
              lines.push(`  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`);
            } else {
              lines.push("  （无规则AI决策数据）");
            }
          }
          lines.push("-");
        });

        this.dom.aiLogicContent.textContent = lines.join("\n");
      },

      fillLlmSettingsForm(values) {
        const source = normalizeDeepSeekSettings(values, LLM_SETTINGS);
        if (this.dom.settingLlmEnabled) {
          this.dom.settingLlmEnabled.checked = Boolean(source.enabled);
        }
        if (this.dom.settingLlmMultiGameMemoryEnabled) {
          this.dom.settingLlmMultiGameMemoryEnabled.checked = Boolean(source.multiGameMemoryEnabled);
        }
        if (this.dom.settingLlmReflectionEnabled) {
          this.dom.settingLlmReflectionEnabled.checked = Boolean(source.reflectionEnabled);
        }
        if (this.dom.settingDeepseekApiKey) {
          this.dom.settingDeepseekApiKey.value = source.apiKey || "";
        }
        if (this.dom.settingDeepseekModel) {
          this.dom.settingDeepseekModel.value = source.model || "deepseek-v4-flash";
        }

        if (!source.apiKey) {
          this.setLlmSettingsStatus("尚未填写 DeepSeek API Key。", "normal");
          return;
        }
        this.setLlmSettingsStatus(`已读取本地密钥：${maskApiKey(source.apiKey)}`, "normal");
      },

      readLlmSettingsForm() {
        const draft = {
          enabled: this.dom.settingLlmEnabled ? this.dom.settingLlmEnabled.checked : LLM_SETTINGS.enabled,
          multiGameMemoryEnabled: this.dom.settingLlmMultiGameMemoryEnabled
            ? this.dom.settingLlmMultiGameMemoryEnabled.checked
            : LLM_SETTINGS.multiGameMemoryEnabled,
          reflectionEnabled: this.dom.settingLlmReflectionEnabled
            ? this.dom.settingLlmReflectionEnabled.checked
            : LLM_SETTINGS.reflectionEnabled,
          apiKey: this.dom.settingDeepseekApiKey ? this.dom.settingDeepseekApiKey.value : LLM_SETTINGS.apiKey,
          model: this.dom.settingDeepseekModel ? this.dom.settingDeepseekModel.value : LLM_SETTINGS.model,
          endpoint: LLM_SETTINGS.endpoint,
          timeoutMs: LLM_SETTINGS.timeoutMs,
          temperature: LLM_SETTINGS.temperature,
          maxTokens: LLM_SETTINGS.maxTokens
        };
        return normalizeDeepSeekSettings(draft, LLM_SETTINGS);
      },

      setLlmSettingsStatus(text, state) {
        if (!this.dom.settingsLlmStatusText) {
          return;
        }
        this.dom.settingsLlmStatusText.textContent = text;
        this.dom.settingsLlmStatusText.classList.remove("is-success", "is-error", "is-pending");
        if (state === "success") {
          this.dom.settingsLlmStatusText.classList.add("is-success");
        } else if (state === "error") {
          this.dom.settingsLlmStatusText.classList.add("is-error");
        } else if (state === "pending") {
          this.dom.settingsLlmStatusText.classList.add("is-pending");
        }
      },

      async testDeepSeekConnectionFromOverlay() {
        if (this.deepSeekTesting) {
          return;
        }

        const input = this.readLlmSettingsForm();
        if (!input.apiKey) {
          this.setLlmSettingsStatus("请先填写 API Key，再进行连接测试。", "error");
          this.writeLog("DeepSeek连接测试取消：未填写 API Key。");
          return;
        }

        this.deepSeekTesting = true;
        if (this.dom.settingsTestDeepSeekBtn) {
          this.dom.settingsTestDeepSeekBtn.disabled = true;
        }
        this.setLlmSettingsStatus("正在连接 DeepSeek，请稍候...", "pending");

        try {
          const result = await this.deepSeekClient.testConnection(input);
          if (result.ok) {
            this.setLlmSettingsStatus(`连接成功：${result.message || "已返回响应"}`, "success");
            this.writeLog(`DeepSeek连接成功，耗时 ${result.elapsedMs}ms。`);
          } else {
            this.setLlmSettingsStatus(`连接失败：${result.error || "未知错误"}`, "error");
            this.writeLog(`DeepSeek连接失败：${result.error || "未知错误"}`);
          }
        } catch (error) {
          const message = error && error.message ? error.message : "未知异常";
          this.setLlmSettingsStatus(`连接异常：${message}`, "error");
          this.writeLog(`DeepSeek连接异常：${message}`);
        } finally {
          this.deepSeekTesting = false;
          if (this.dom.settingsTestDeepSeekBtn) {
            this.dom.settingsTestDeepSeekBtn.disabled = false;
          }
        }
      },

      buildAiLlmRoundPayload(player) {
        const playerId = player.id;
        const isInitialRound = this.round <= 1;
        const compact = !isInitialRound;
        const persona = this.aiEngine.personalityMap[playerId] || null;
        const actionConstraint = this.buildAiActionConstraintBlock(playerId);
        const resource = this.getAiResourceSnapshot(playerId);

        const bidHistory = this.buildBidHistorySnapshot();
        const publicEvents = this.buildPublicEventSnapshot({ compact, viewerId: playerId });

        return {
          gameState: {
            round: {
              current: this.round,
              total: GAME_SETTINGS.maxRounds
            },
            selfId: playerId,
            selfName: player.name,
            wallet: this.getAiWallet(playerId),
            directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
            folded: false,
            currentBid: this.currentBid,
            currentLeader: this.bidLeader
          },
          selfRoleAndTools: {
            roleName: persona ? persona.archetype : "规则型",
            passive: persona
              ? `激进${persona.aggression.toFixed(2)} / 纪律${persona.discipline.toFixed(2)} / 跟风${persona.followRate.toFixed(2)}`
              : "默认规则人格",
            activeSkills: SKILL_DEFS.map((entry) => ({
              name: entry.name,
              description: entry.description,
              remaining: Number(resource.skills[entry.id] || 0),
              timing: "出价前",
              resultPublic: false
            })),
            items: ITEM_DEFS.map((entry) => ({
              name: entry.name,
              description: entry.description,
              remaining: Number(resource.items[entry.id] || 0),
              timing: "出价前",
              resultPublic: false
            }))
          },
          otherPlayersPublic: this.buildOtherPlayersPublicInfo(playerId, { compact }),
          catalogSummary: this.buildCatalogSummary({ compact }),
          ...(compact
            ? { roundPublicStateTable: this.buildRoundPublicStateTable(playerId) }
            : { bidHistory, publicEvents }),
          privateIntel: this.buildAiPrivateIntelBlock(playerId),
          actionConstraints: {
            canBid: actionConstraint.canBid,
            canFold: actionConstraint.canFold,
            availableSkills: actionConstraint.availableSkills,
            availableItems: actionConstraint.availableItems,
            notes: actionConstraint.notes
          },
          responseContract: {
            requiredFields: ["bid", "skill", "item", "thought"],
            bidRule: "正整数",
            skillRule: "无 或 技能名称[:目标]",
            itemRule: "无 或 道具名称[:目标]",
            thoughtRule: "简短说明，不超过200字"
          }
        };
      },

      buildAiFollowupRoundPayload(player, currentPlan, toolSummary) {
        const resolvedToolSummary = toolSummary || (currentPlan && currentPlan.toolResultSummary) || "";
        return {
          requestStage: "followup-after-tool",
          round: this.round,
          gameState: {
            selfId: player.id,
            selfName: player.name,
            wallet: this.getAiWallet(player.id),
            directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
            currentBid: this.currentBid,
            currentLeader: this.bidLeader
          },
          followupContext: {
            toolResultSummary: resolvedToolSummary,
            toolActionType: currentPlan && currentPlan.toolActionType ? currentPlan.toolActionType : "none",
            toolActionId: currentPlan && currentPlan.toolActionId ? currentPlan.toolActionId : "none",
            initialDecision: {
              bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
              actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
              actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none"
            }
          }
        };
      },

      canUseLlmDecision() {
        return Boolean(
          LLM_SETTINGS.enabled
          && typeof LLM_SETTINGS.apiKey === "string"
          && LLM_SETTINGS.apiKey.trim().length > 0
          && this.deepSeekClient
        );
      },

      isAiLlmEnabledForPlayer(playerId) {
        if (!this.aiLlmPlayerEnabled || typeof this.aiLlmPlayerEnabled !== "object") {
          return false;
        }
        return Boolean(this.aiLlmPlayerEnabled[playerId]);
      },

      canUseLlmDecisionForPlayer(playerId) {
        return this.canUseLlmDecision() && this.isAiLlmEnabledForPlayer(playerId);
      },

      buildAiDecisionUserPrompt(payload, extraBlocks = [], options = {}) {
        const requestStage = options.requestStage || "initial";
        const isFollowup = requestStage === "followup-after-tool";
        const roundNoRaw = pickFirstDefined(
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.current,
          payload && payload.round,
          this.round
        );
        const totalRoundRaw = pickFirstDefined(
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.total,
          GAME_SETTINGS.maxRounds
        );
        const roundNo = Number.isFinite(Number(roundNoRaw)) ? Math.max(1, Math.round(Number(roundNoRaw))) : Math.max(1, this.round);
        const totalRounds = Number.isFinite(Number(totalRoundRaw))
          ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
          : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo);
        const isFinalRound = roundNo >= totalRounds;
        const isFirstRound = roundNo <= 1;
        const roundStateText = isFinalRound ? "最终轮" : (isFirstRound ? "首轮" : "后续轮");
        const finalRoundHint = isFinalRound
          ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
          : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。";
        const base = isFollowup
          ? [
            "【任务】请根据本轮工具结果修正最终出价。",
            `【阶段】${requestStage}`,
            `【回合状态】第 ${roundNo}/${totalRounds} 轮（${roundStateText}）`,
            finalRoundHint,
            "【硬约束】同一轮次只能执行一次技能或道具；本阶段 skill=无,item=无，只允许更新 bid/thought。",
            "【当前状态数据】",
            JSON.stringify(payload, null, 2)
          ]
          : (isFirstRound ? [
            "【任务】请基于本轮状态，给出合法竞拍决策（bid/skill/item/thought）。",
            `【阶段】${requestStage}`,
            `【回合状态】第 ${roundNo}/${totalRounds} 轮（${roundStateText}）`,
            finalRoundHint,
            "",
            "【决策规则】",
            "1) 严格遵守 actionConstraints 与 responseContract。",
            "2) 仅可基于输入数据推理，不得臆造未给出信息。",
            "3) 本局禁止弃标（canFold=false）。",
            "4) bid 输出正整数；skill/item 必须来自可用列表，否则应填写 无。",
            "5) 输出必须是纯 JSON 对象，不得附带额外解释文本。",
            "",
            "【仓库与价格参考】",
            "- warehouseDefinition 会告诉你仓库是什么：它是一个藏品网格，藏品有品质、品类、尺寸和基础价格。",
            "- qualityPriceGuide 提供每个品质阶段的价格区间与平均值；估价时优先参考均值，再结合当前线索修正。",
            "- specialMechanismHint 用于理解高价值藏品可能单格高价或多格组合高价。",
            "",
            "【信息分层提醒】",
            "- 公开信息：otherPlayersPublic / bidHistory / publicEvents。",
            "- 私有信息：privateIntel（仅你可见）。",
            "",
            "【参数用途说明】",
            "- currentBid：上一轮全场最高出价，用来判断本轮报价压力和提前获胜可能。",
            "- 首轮 currentBid 是系统起拍参考价，当前实现固定为 1000（由 startNewRun 初始化），不代表仓库真实估值。",
            "- currentLeader：上一轮领先者，帮助你判断要对谁追价。",
            "- wallet：你的剩余资金上限。",
            "- directWinRatio：提前获胜系数，若你的出价相对第二名足够高，可提前结束本局并拿下仓库。",
            "- bidHistory：历史出价趋势，可用于判断对手是否突然抬价。",
            "- publicEvents：公开动作记录，可用于判断谁在主动探查。",
            "- privateIntel.aggregate / highValueTracks：你的私有探查结果，用来估值和判断高价值目标。",
            "- catalogSummary.qualityPriceGuide：每个品质阶段的价格区间与平均值，首轮估价优先参考它。",
            "- bottomCell: 如果你使用了有探查藏品轮廓性质的道具则返回所有被探查藏品在仓库绝对坐标系下纵坐标最大的单元格坐标（单个藏品时即取其自身的最底部单元格，含纵向多格情况）",
            "- 每局仓库都是随机生成，不能把上一局的仓库布局直接当成本局事实。",
            "- 每局开始后，道具库存与技能次数会重置；跨局只能复用策略经验，不可复用次数。",
            "【关键字段说明（以当前实现为准）】",
            "- privateIntel 使用 aggregate + highValueTracks 结构，不是 batchStats/highValueTargets。",
            "- actionConstraints 使用 canBid/canFold/availableSkills/availableItems/notes。",
            "- responseContract 给出字段要求与文本规则。",
            "- catalogSummary 是仓库概览与价格参考，不要忽略其中的 qualityPriceGuide。",
            "",
            "【游戏提示】",
            "- 轮廓是指藏品在仓库中占据的格子情况；品质是指藏品的价值等级，在藏品格数相同时高品质的藏品一般更有价值。",
            "- 若看到更高品质阶段的候选范围很宽，优先用道具/技能缩小范围，而不是盲目抬价。",
            "- 在没有新线索时，follow-up 只需要修正 bid，不要重复声明工具动作。",
            "- 首轮的系统参考价通常极低，建议不要完全参考它来定价，以免被对手轻易压过（如轻易被对手以较低价格中标）",
            "【当前状态数据】",
            JSON.stringify(payload, null, 2)
          ] : [
            "【任务】请基于本轮状态更新，给出本轮合法竞拍决策（bid/skill/item/thought）。",
            `【阶段】${requestStage}`,
            `【回合状态】第 ${roundNo}/${totalRounds} 轮（${roundStateText}）`,
            finalRoundHint,

            "【多轮数据】历史数据以 roundPublicStateTable 提供；列名已标注变量语义，请优先读取该表并避免重复推导。",
            "【价格参考】后续轮不再发送完整 qualityPriceGuide，改读 catalogSummary.qualityPriceRangeTable（表格列名已标注）。",
            "【约束】遵守 actionConstraints 与 responseContract；禁止弃标；输出纯 JSON。",
            "【重点关注】当前最高价变化、对手最近出价与动作、你的私有线索增量。",
            "【当前状态数据】",
            JSON.stringify(payload, null, 2)
          ]);

        if (Array.isArray(extraBlocks) && extraBlocks.length > 0) {
          if (!isFollowup) {
            base.push("");
            base.push("补充信息（优先参考）：");
          } else {
            base.push("");
            base.push("【补充信息】");
          }
          extraBlocks.forEach((block, index) => {
            base.push(`- 补充${index + 1}: ${String(block || "")}`);
          });
        }

        return base.join("\n");
      },

      extractAiDecisionObject(content) {
        const jsonObj = tryExtractDecisionJson(content);
        if (jsonObj) {
          return jsonObj;
        }

        const text = String(content || "");
        const bidMatch = text.match(/(?:bid|出价|报价)\s*[:：]\s*(-?\d+)/i);
        const skillMatch = text.match(/(?:skill|使用技能)\s*[:：]\s*([^\n\r]+)/i);
        const itemMatch = text.match(/(?:item|使用道具)\s*[:：]\s*([^\n\r]+)/i);
        const thoughtMatch = text.match(/(?:thought|思考过程)\s*[:：]\s*([\s\S]{1,200})/i);

        return {
          bid: bidMatch ? Number(bidMatch[1]) : 0,
          skill: skillMatch ? skillMatch[1].trim() : "无",
          item: itemMatch ? itemMatch[1].trim() : "无",
          thought: thoughtMatch ? thoughtMatch[1].trim() : ""
        };
      },

      resolveActionPick(rawText, type, availableIds) {
        const text = String(rawText || "").trim();
        if (!text) {
          return { actionId: null, target: "" };
        }

        const [namePartRaw, targetRaw] = text.split(/[:：]/, 2);
        const namePart = String(namePartRaw || "").trim();
        const target = String(targetRaw || "").trim();

        if (isNoneActionText(namePart)) {
          return { actionId: null, target };
        }

        const normalized = normalizeActionToken(namePart);
        for (const actionId of availableIds) {
          const def = this.getActionDefById(actionId);
          const aliases = [
            actionId,
            def.name,
            this.getItemInfo(actionId).label
          ]
            .filter(Boolean)
            .map((entry) => normalizeActionToken(entry));

          const matched = aliases.some((alias) => {
            return alias === normalized || alias.includes(normalized) || normalized.includes(alias);
          });

          if (matched) {
            return { actionId, target };
          }
        }

        return { actionId: null, target };
      },

      normalizeAiLlmPlan(playerId, decision, rawContent, options = {}) {
        const bidRaw = pickFirstDefined(
          decision && decision.bid,
          decision && decision.出价,
          decision && decision.报价
        );
        const skillRaw = pickFirstDefined(
          decision && decision.skill,
          decision && decision.使用技能,
          decision && decision.skillName
        );
        const itemRaw = pickFirstDefined(
          decision && decision.item,
          decision && decision.使用道具,
          decision && decision.itemName
        );
        const thoughtRaw = pickFirstDefined(
          decision && decision.thought,
          decision && decision.思考过程,
          decision && decision.reason
        );

        const actionState = this.getAiAvailableActionState(playerId);
        const allowAction = options.allowAction !== false;
        const bidParsed = Number(bidRaw);
        const hasBidDecision = Number.isFinite(bidParsed);
        let bid = hasBidDecision ? Math.round(bidParsed) : 0;
        if (hasBidDecision) {
          const wallet = this.getAiWallet(playerId);
          bid = this.normalizeAiBidValue(playerId, bid, wallet);
        }

        const skillPick = allowAction
          ? this.resolveActionPick(skillRaw, "skill", actionState.availableSkillIds)
          : { actionId: null, target: "" };
        const itemPick = allowAction
          ? this.resolveActionPick(itemRaw, "item", actionState.availableItemIds)
          : { actionId: null, target: "" };

        let actionType = "none";
        let actionId = "none";
        let target = "";
        if (skillPick.actionId) {
          actionType = "skill";
          actionId = skillPick.actionId;
          target = skillPick.target || "";
        } else if (itemPick.actionId) {
          actionType = "item";
          actionId = itemPick.actionId;
          target = itemPick.target || "";
        }

        return {
          source: "llm",
          bid,
          folded: false,
          hasBidDecision,
          actionType,
          actionId,
          target,
          thought: compactOneLine(thoughtRaw, 200),
          rawSkill: String(skillRaw || ""),
          rawItem: String(itemRaw || ""),
          rawContent: compactOneLine(rawContent, 240)
        };
      },

      async requestAiLlmPlan(player, options = {}) {
        const payload = options.requestStage === "followup-after-tool"
          ? this.buildAiFollowupRoundPayload(player, options.followupContext || {}, options.followupToolSummary || "")
          : this.buildAiLlmRoundPayload(player);
        const requestStage = options.requestStage || "initial";
        const firstRoundBlocks = requestStage === "initial"
          && Number(this.round) === 1
          && typeof this.getAiFirstRoundExtraBlocks === "function"
          ? this.getAiFirstRoundExtraBlocks()
          : [];
        const mergedExtraBlocks = [...(Array.isArray(firstRoundBlocks) ? firstRoundBlocks : []), ...(options.extraBlocks || [])];

        const userPrompt = this.buildAiDecisionUserPrompt(payload, mergedExtraBlocks, {
          requestStage
        });
        const systemPrompt = LLM_DECISION_SYSTEM_PROMPT;
        const useMultiGameMemory = typeof this.isAiMultiGameMemoryEnabled === "function"
          ? this.isAiMultiGameMemoryEnabled()
          : false;
        const historyMessages = useMultiGameMemory && typeof this.getAiConversationMessages === "function"
          ? this.getAiConversationMessages(player.id)
          : [];
        const messages = [
          { role: "system", content: systemPrompt },
          ...(Array.isArray(historyMessages) ? historyMessages : []),
          { role: "user", content: userPrompt }
        ];

        try {
          const requestTimeoutMs = Math.max(3000, Math.round((Number(GAME_SETTINGS.roundSeconds) || 40) * 1000));
          const isThinkingModel = /deepseek-v4-pro|deepseek-reasoner/i.test(LLM_SETTINGS.model || "");
          const requestMaxTokens = isThinkingModel
            ? Math.max(3000, Number(LLM_SETTINGS.maxTokens) || 3000)
            : Math.max(300, Number(LLM_SETTINGS.maxTokens) || 300);
          const result = await this.deepSeekClient.requestChat({
            temperature: 0.1,
            maxTokens: requestMaxTokens,
            timeoutMs: requestTimeoutMs,
            messages
          });

          if (!result.ok) {
            const detail = result && result.meta ? result.meta : {};
            const errorPieces = [
              result.error || "请求失败",
              result.code ? `code=${result.code}` : "",
              result.stage ? `stage=${result.stage}` : "",
              detail.endpoint ? `endpoint=${detail.endpoint}` : "",
              detail.model ? `model=${detail.model}` : "",
              detail.timeoutMs ? `timeout=${detail.timeoutMs}ms` : "",
              result.requestId ? `req=${result.requestId}` : "",
              detail.hint ? `hint=${detail.hint}` : ""
            ].filter(Boolean);
            return {
              source: "llm",
              failed: true,
              error: errorPieces.join(" | "),
              actionType: "none",
              actionId: "none",
              systemPrompt,
              userPrompt,
              modelResponse: String(result.error || "")
            };
          }

          const responseText = String(result.content || "");
          const reasoningContent = String(result.reasoningContent || "");
          let decision = this.extractAiDecisionObject(responseText);
          const hasValidBid = decision && Number.isFinite(Number(decision.bid)) && Number(decision.bid) > 0;
          const hasValidAction = (decision && decision.skill && String(decision.skill).trim() !== "无"
            && String(decision.skill).trim() !== "") || (decision && decision.item && String(decision.item).trim() !== "无"
              && String(decision.item).trim() !== "");
          if ((!hasValidBid && !hasValidAction) && reasoningContent) {
            const fallbackDecision = this.extractAiDecisionObject(reasoningContent);
            if (fallbackDecision && Number.isFinite(Number(fallbackDecision.bid)) && Number(fallbackDecision.bid) > 0) {
              decision = fallbackDecision;
              if (typeof this.writeLog === "function") {
                this.writeLog(`${player.name}：从思维链中提取到决策，出价${fallbackDecision.bid}`);
              }
            }
          }
          const plan = this.normalizeAiLlmPlan(player.id, decision, responseText, {
            allowAction: options.allowAction !== false
          });
          if (useMultiGameMemory && requestStage === "initial" && typeof this.pushAiRoundSummary === "function") {
            this.pushAiRoundSummary(player.id, plan);
          }
          plan.elapsedMs = result.elapsedMs;
          plan.systemPrompt = systemPrompt;
          plan.userPrompt = userPrompt;
          plan.modelResponse = responseText;
          plan.reasoningContent = reasoningContent;
          plan.requestStage = requestStage;
          plan.historyMessagesCount = historyMessages.length;
          plan.historyMessagesPreview = historyMessages.map((m) => String(m.content || "").slice(0, 80)).join(" | ");
          return plan;
        } catch (error) {
          const message = error && error.message ? error.message : "LLM请求异常";
          return {
            source: "llm",
            failed: true,
            error: message,
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: ""
          };
        }
      },

      buildAiToolResultSummary(result, actionType, actionId) {
        const info = this.getItemInfo(actionId);
        const stats = result && result.signalStats && result.signalStats.aggregate
          ? result.signalStats.aggregate
          : null;
        const parts = [];
        parts.push(`action=${actionType}:${actionId}`);
        parts.push(`name=${info.label}`);
        parts.push(`ok=${Boolean(result && result.ok)}`);
        parts.push(`revealed=${Number(result && result.revealed) || 0}`);
        if (stats && Number(stats.count) > 0) {
          parts.push(`mean=${Number(stats.mean).toFixed(2)}`);
        }
        if (result && result.message) {
          parts.push(`message=${compactOneLine(result.message, 120)}`);
        }
        if (result && Array.isArray(result.trackUpdates)) {
          const ids = result.trackUpdates
            .map((entry) => entry && entry.trackId)
            .filter(Boolean);
          if (ids.length > 0) {
            parts.push(`tracks=${ids.join(",")}`);
          } else {
            parts.push("tracks=none");
          }
        }
        if (result && result.bottomCell && Number.isFinite(result.bottomCell.row) && Number.isFinite(result.bottomCell.col)) {
          parts.push(`bottomCell=r${result.bottomCell.row}c${result.bottomCell.col}`);
        }
        return parts.join(" | ");
      },

      async requestAiLlmFollowupBid(player, currentPlan, toolSummary) {
        const trackHint = String(toolSummary || "").includes("tracks=")
          ? "若 tracks=none，代表本次探查未直接命中高价值追踪目标，不要把它写成已确认。"
          : "";
        const followupBlock = `你刚执行的探查结果如下，请在保留合法动作约束下重新给出最终出价：${toolSummary}${trackHint ? ` | ${trackHint}` : ""}`;
        const followupPlan = await this.requestAiLlmPlan(player, {
          requestStage: "followup-after-tool",
          allowAction: false,
          followupToolSummary: toolSummary,
          followupContext: {
            toolActionType: currentPlan && currentPlan.toolActionType ? currentPlan.toolActionType : (currentPlan && currentPlan.actionType) ? currentPlan.actionType : "none",
            toolActionId: currentPlan && currentPlan.toolActionId ? currentPlan.toolActionId : (currentPlan && currentPlan.actionId) ? currentPlan.actionId : "none",
            bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
            actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
            actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none",
            thought: currentPlan && currentPlan.thought ? currentPlan.thought : "",
            modelResponse: currentPlan && currentPlan.modelResponse ? currentPlan.modelResponse : ""
          },
          extraBlocks: [followupBlock]
        });

        if (followupPlan && (followupPlan.rawSkill || followupPlan.rawItem)) {
          const illegalSkill = !isNoneActionText(followupPlan.rawSkill || "") && followupPlan.rawSkill;
          const illegalItem = !isNoneActionText(followupPlan.rawItem || "") && followupPlan.rawItem;
          if (illegalSkill || illegalItem) {
            followupPlan.followupActionRejected = compactOneLine(
              `二次调用声明了额外动作，已按规则忽略：skill=${illegalSkill || "无"}, item=${illegalItem || "无"}`,
              160
            );
          }
        }

        return followupPlan;
      },

      async prepareAiLlmRoundPlans() {
        this.aiLlmRoundPlans = {};
        if (!this.canUseLlmDecision()) {
          return;
        }

        const aiPlayers = this.players.filter((player) => !player.isHuman);
        const activePlayers = aiPlayers.filter((player) => this.canUseLlmDecisionForPlayer(player.id));
        const disabledPlayers = aiPlayers.filter((player) => !this.canUseLlmDecisionForPlayer(player.id));
        if (activePlayers.length === 0) {
          this.writeLog("大模型总开关已开，但所有AI位开关均关闭，使用规则AI。");
          return;
        }

        const plans = await Promise.all(activePlayers.map((player) => this.requestAiLlmPlan(player)));
        const summary = [];

        activePlayers.forEach((player, index) => {
          const plan = plans[index];
          if (!plan) {
            return;
          }
          this.aiLlmRoundPlans[player.id] = plan;

          if (plan.failed) {
            summary.push(`${player.name}:失败(${plan.error || "未知"})`);
            return;
          }

          if (!plan.hasBidDecision) {
            summary.push(`${player.name}:出价无效(hasBidDecision=false), 模型回复预览:${(plan.modelResponse || "").slice(0, 120)}`);
            return;
          }

          const actionName = plan.actionId !== "none"
            ? this.getActionDefById(plan.actionId).name
            : "无";
          summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`);
        });

        disabledPlayers.forEach((player) => {
          summary.push(`${player.name}:规则AI(开关关闭)`);
        });

        if (summary.length > 0) {
          this.writeLog(`DeepSeek决策：${summary.join("；")}`);
        }
      },

      captureAiDecisionTelemetry(roundBids) {
        const aiPlayers = this.players.filter((player) => !player.isHuman);
        const hasLlm = aiPlayers.some((player) => Boolean(this.aiLlmRoundPlans[player.id]));

        if (!hasLlm) {
          this.lastAiDecisionTelemetry = {
            mode: "rule",
            round: this.round
          };
          return;
        }

        const rulePayload = this.aiEngine.getLastDecisionLog();
        const ruleEntryById = new Map(
          ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
        );

        const bidByPlayerId = new Map((roundBids || []).map((entry) => [entry.playerId, Number(entry.bid) || 0]));
        const entries = aiPlayers.map((player) => {
          const plan = this.aiLlmRoundPlans[player.id] || null;
          const llmSeatEnabled = this.canUseLlmDecisionForPlayer(player.id);
          const ruleEntry = ruleEntryById.get(player.id);
          const finalBid = bidByPlayerId.has(player.id) ? bidByPlayerId.get(player.id) : (ruleEntry ? ruleEntry.finalBid : 0);
          const executedActions = this.currentRoundUsage[player.id] || [];
          const llmExecutedActionId = plan && plan.actionExecuted ? (plan.toolActionId || plan.actionId || "") : "";
          const hasLlmExecutedAction = Boolean(llmExecutedActionId) && executedActions.includes(llmExecutedActionId);
          const llmActionName = hasLlmExecutedAction ? this.getActionDefById(llmExecutedActionId).name : "";
          const ruleActionIds = executedActions.filter((actionId) => actionId !== llmExecutedActionId);
          const ruleActionName = ruleActionIds.length > 0
            ? ruleActionIds.map((actionId) => this.getActionDefById(actionId).name).join("、")
            : "";
          const decisionSource = !plan || !llmSeatEnabled
            ? "规则AI"
            : (plan.failed ? "规则AI回退" : "DeepSeek");

          return {
            playerId: player.id,
            playerName: player.name,
            finalBid,
            folded: Boolean(plan && plan.folded),
            decisionSource,
            llmActionName,
            ruleActionName,
            actionExecuted: hasLlmExecutedAction,
            controlMode: plan && plan.controlMode
              ? plan.controlMode
              : (plan && !plan.failed && plan.hasBidDecision && llmSeatEnabled ? "llm" : "rule"),
            thought: plan && plan.thought ? plan.thought : "",
            reasoningContent: plan && plan.reasoningContent ? plan.reasoningContent : "",
            error: plan && plan.failed ? (plan.error || "未知错误") : "",
            fallbackRuleBid: (plan && !plan.failed && plan.hasBidDecision) ? null : (ruleEntry ? ruleEntry.finalBid : null),
            systemPrompt: plan && plan.systemPrompt ? plan.systemPrompt : "",
            userPrompt: plan && plan.userPrompt ? plan.userPrompt : "",
            modelResponse: plan && plan.modelResponse ? plan.modelResponse : "",
            toolResultSummary: plan && plan.actionExecuted && plan.toolResultSummary ? plan.toolResultSummary : "",
            followupPrompt: plan && plan.followupPrompt ? plan.followupPrompt : "",
            followupResponse: plan && plan.followupResponse ? plan.followupResponse : "",
            followupError: plan && plan.followupError ? plan.followupError : "",
            followupActionRejected: plan && plan.followupActionRejected ? plan.followupActionRejected : "",
            historyMessagesCount: plan && plan.historyMessagesCount ? plan.historyMessagesCount : 0,
            historyMessagesPreview: plan && plan.historyMessagesPreview ? plan.historyMessagesPreview : ""
          };
        });

        this.lastAiDecisionTelemetry = {
          mode: "llm",
          round: this.round,
          entries
        };
      }
    };

    return {
      methods,
      loadAiLlmPlayerSwitches,
      saveAiLlmPlayerSwitches
    };
  }

  global.MobaoSceneLlm = {
    createSceneLlmBridge
  };
})(window);
