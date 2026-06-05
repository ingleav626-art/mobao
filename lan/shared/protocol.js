/**
 * @file lan/shared/protocol.js
 * @module lan/protocol
 * @description 联机通信协议常量定义。定义客户端与服务端之间的消息类型、
 *              协议版本、房间状态和回合阶段等常量。
 *              客户端和服务端共享此文件以确保消息类型一致。
 *
 * 导出常量：
 *   - PROTOCOL_VERSION: 协议版本号（当前为 1）
 *
 *   - MSG.CLIENT: 客户端→服务端消息类型
 *     READY: "lan:ready"           — 客户端就绪
 *     BID_SUBMIT: "lan:bid:submit" — 提交出价
 *     ACTION_USE: "lan:action:use" — 使用技能/道具
 *     SETTLE_REQUEST: "lan:settle:request" — 请求结算
 *     PAUSE_TOGGLE: "lan:pause:toggle"    — 暂停/恢复
 *     PING: "lan:ping"             — 心跳
 *
 *   - MSG.SERVER: 服务端→客户端消息类型
 *     GAME_INIT: "lan:game:init"          — 游戏初始化
 *     ROUND_START: "lan:round:start"      — 回合开始
 *     ROUND_BID_ACK: "lan:round:bid-ack"  — 出价确认
 *     ROUND_BID_REVEAL: "lan:round:bid-reveal" — 出价揭示
 *     ROUND_RESULT: "lan:round:result"    — 回合结果
 *     GAME_SETTLE: "lan:game:settle"      — 游戏结算
 *     GAME_SETTLE_REVEAL: "lan:game:settle-reveal" — 结算揭示
 *     GAME_SETTLE_FINAL: "lan:game:settle-final"   — 最终结算
 *     PAUSE_STATE: "lan:pause:state"      — 暂停状态
 *     PLAYER_LEFT: "lan:player:left"      — 玩家离开
 *     ERROR: "lan:error"                  — 错误
 *     PONG: "lan:pong"                    — 心跳回复
 *
 *   - MSG.ROOM_STATE: 房间状态枚举
 *     WAITING / PLAYING / SETTLED
 *
 *   - MSG.ROUND_PHASE: 回合阶段枚举
 *     BIDDING / REVEALING / SETTLED
 *
 * @requires 无（纯常量定义，无外部依赖）
 *
 * @exports MSG — 协议常量对象（浏览器环境挂载到全局，Node.js 环境 module.exports）
 */
const PROTOCOL_VERSION = 1;

const MSG = {
  PROTOCOL_VERSION,

  CLIENT: {
    READY: "lan:ready",
    BID_SUBMIT: "lan:bid:submit",
    ACTION_USE: "lan:action:use",
    SETTLE_REQUEST: "lan:settle:request",
    PAUSE_TOGGLE: "lan:pause:toggle",
    PING: "lan:ping",
  },

  SERVER: {
    GAME_INIT: "lan:game:init",
    ROUND_START: "lan:round:start",
    ROUND_BID_ACK: "lan:round:bid-ack",
    ROUND_BID_REVEAL: "lan:round:bid-reveal",
    ROUND_RESULT: "lan:round:result",
    GAME_SETTLE: "lan:game:settle",
    GAME_SETTLE_REVEAL: "lan:game:settle-reveal",
    GAME_SETTLE_FINAL: "lan:game:settle-final",
    PAUSE_STATE: "lan:pause:state",
    PLAYER_LEFT: "lan:player:left",
    ERROR: "lan:error",
    PONG: "lan:pong",
  },

  ROOM_STATE: {
    WAITING: "waiting",
    PLAYING: "playing",
    SETTLED: "settled",
  },

  ROUND_PHASE: {
    BIDDING: "bidding",
    REVEALING: "revealing",
    SETTLED: "settled",
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = MSG;
}
