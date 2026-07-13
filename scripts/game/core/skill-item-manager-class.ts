/**
 * @file skill-item-manager-class.ts
 * @module core/skill-item-manager-class
 * @description SkillItemManager -- 技能/道具使用管理器（Phase 2 依赖注入）。
 *              包装 skill-item-manager.ts 的纯函数与 useAction helper，通过构造函数注入依赖
 *              （skillManager/itemManager/round/actionsLeft/lanBridge 等），
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测（构造函数注入 mock 依赖），过渡期 Mixin 保留为薄代理层。
 */
import type { Player, SkillContext } from "../../../types/game"
import {
  getItemInfo,
  getPlayerActionId,
  consumeActionState,
  wrapContextWithCharacterBonus,
} from "./skill-item-manager"
import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"

type DefEntry = { id: string; name: string; description: string }

type ActionManager = { use(id: string, ctx: unknown): { ok: boolean; message: string } }

/** LanBridge 最小接口（结构兼容真实 LanBridge） */
export interface LanBridgeLike {
  playerId: string
  send(msg: unknown): void
}

/** SkillItemManager 依赖接口 */
export interface SkillItemManagerDeps {
  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 获取剩余行动次数（动态值） */
  getActionsLeft: () => number
  /** 设置剩余行动次数（useAction 扣减/恢复时调用） */
  setActionsLeft: (n: number) => void

  /** 技能管理器（调用 use(id, ctx) 执行技能） */
  skillManager: ActionManager
  /** 道具管理器（调用 use(id, ctx) 执行道具） */
  itemManager: ActionManager

  /** 是否可使用情报行动（行动受限时提前退出） */
  canUseIntelActions: () => boolean
  /** 关闭道具抽屉（useItem 各退出点调用） */
  closeItemDrawer: () => void
  /** 写入操作日志 */
  writeLog: (msg: string) => void
  /** 构建 SkillContext（揭示回调容器） */
  buildSkillContext: () => SkillContext
  /** 刷新 HUD（行动次数等） */
  updateHud: () => void
  /** 记录玩家使用动作（用于历史面板） */
  recordPlayerUsage: (playerId: string, actionId: string) => void
  /** 添加私人情报条目 */
  addPrivateIntelEntry: (entry: { source: string; text: string }) => void

  /** 角色轮廓加成（来自 character-system，0 表示无加成） */
  getOutlineBonus: () => number
  /** 角色品质加成（来自 character-system，0 表示无加成） */
  getQualityBonus: () => number
  /** 角色排序策略（来自 character-system，null 表示无策略） */
  getOutlineSortStrategy: () => string | null

  /** 是否联机模式 */
  isLanMode: () => boolean
  /** 联机槽位 ID（联机模式下用于确定玩家动作 ID） */
  lanMySlotId: () => string | null
  /** 联机桥接（为 null 时跳过 LAN 同步） */
  lanBridge: () => LanBridgeLike | null
  /** 获取玩家列表（用于 LAN 消息中的玩家名查找） */
  getPlayers: () => Player[]

  /** 消耗道具（MobaoShopBridge.consumeItem 的回调） */
  consumeItem: (itemId: string) => void
}

interface UseActionOptions {
  manager: ActionManager
  defs: DefEntry[]
  actionId: string
  actionLabel: string
  lanActionType: string
  fallbackText: string
  closeDrawer: boolean
  onAfterUse?: (actionId: string) => void
}

/**
 * 技能/道具使用管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * useSkill/useItem 共享 useAction 私有方法，委托 skill-item-manager.ts 的纯函数
 * （consumeActionState/getPlayerActionId/wrapContextWithCharacterBonus）完成状态判断与上下文包装。
 */
export class SkillItemManager {
  constructor(private readonly deps: SkillItemManagerDeps) {}

  /**
   * useSkill/useItem 共享逻辑（有副作用，非纯函数）。
   * 逻辑与原 Mixin 的 useAction helper 等价，this. 依赖替换为注入依赖。
   */
  private useAction(options: UseActionOptions): void {
    const { manager, defs, actionId, actionLabel, lanActionType, fallbackText, closeDrawer, onAfterUse } = options

    if (!this.deps.canUseIntelActions()) {
      if (closeDrawer) this.deps.closeItemDrawer()
      return
    }

    const check = consumeActionState(this.deps.getRound(), this.deps.getActionsLeft(), actionLabel)
    if (!check.allowed) {
      this.deps.writeLog(check.message!)
      if (closeDrawer) this.deps.closeItemDrawer()
      return
    }
    this.deps.setActionsLeft(this.deps.getActionsLeft() - 1)

    let context = this.deps.buildSkillContext()
    const outlineBonus = this.deps.getOutlineBonus()
    const qualityBonus = this.deps.getQualityBonus()
    const sortStrategy = this.deps.getOutlineSortStrategy()
    context = wrapContextWithCharacterBonus(context, outlineBonus, qualityBonus, sortStrategy)

    const result = manager.use(actionId, context)
    if (!result.ok) {
      this.deps.setActionsLeft(this.deps.getActionsLeft() + 1)
      this.deps.writeLog(result.message)
      this.deps.updateHud()
      if (closeDrawer) this.deps.closeItemDrawer()
      return
    }

    if (onAfterUse) {
      onAfterUse(actionId)
    }

    const playerActionId = getPlayerActionId(this.deps.isLanMode(), this.deps.lanMySlotId())
    this.deps.recordPlayerUsage(playerActionId, actionId)
    const def = defs.find((d) => d.id === actionId)
    this.deps.addPrivateIntelEntry({
      source: def ? def.name : actionId,
      text: def ? def.description : fallbackText,
    })
    this.deps.writeLog(result.message)
    this.deps.updateHud()
    if (closeDrawer) this.deps.closeItemDrawer()
    const bridge = this.deps.lanBridge()
    if (this.deps.isLanMode() && bridge) {
      bridge.send({
        type: "lan:player-action",
        playerId: bridge.playerId,
        playerName: this.deps.getPlayers().find((p) => p.id === playerActionId)?.name || "玩家",
        actionId,
        actionType: lanActionType,
        itemName: def ? def.name : actionId,
      })
    }
  }

  /** 使用技能（扣减行动次数，构建上下文，委托 skillManager.use） */
  useSkill(skillId: string): void {
    this.useAction({
      manager: this.deps.skillManager,
      defs: SKILL_DEFS,
      actionId: skillId,
      actionLabel: "技能",
      lanActionType: "skill",
      fallbackText: "技能效果",
      closeDrawer: false,
    })
  }

  /** 使用道具（扣减行动次数，构建上下文，委托 itemManager.use，成功后消耗道具） */
  useItem(itemId: string): void {
    this.useAction({
      manager: this.deps.itemManager,
      defs: ITEM_DEFS,
      actionId: itemId,
      actionLabel: "道具",
      lanActionType: "item",
      fallbackText: "道具效果",
      closeDrawer: true,
      onAfterUse: (id) => {
        this.deps.consumeItem(id)
      },
    })
  }

  /** 消耗一次行动次数（仅检查并扣减，不执行技能/道具） */
  consumeAction(actionType: string): boolean {
    const check = consumeActionState(this.deps.getRound(), this.deps.getActionsLeft(), actionType)
    if (!check.allowed) {
      this.deps.writeLog(check.message!)
      return false
    }
    this.deps.setActionsLeft(this.deps.getActionsLeft() - 1)
    return true
  }

  /** 查询道具/技能信息（委托纯函数 getItemInfo） */
  getItemInfo(itemId: string): { label: string; tip: string } {
    return getItemInfo(itemId)
  }
}
