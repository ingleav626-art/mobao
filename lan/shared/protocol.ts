/**
 * @file lan/shared/protocol.ts
 * @module lan/shared/protocol
 * @description 联机通信协议常量定义。定义客户端与服务端之间的消息类型、
 *              协议版本、房间状态和回合阶段等常量。
 *              客户端和服务端共享此文件以确保消息类型一致。
 *
 * @exports MSG - 消息类型常量
 * @exports PROTOCOL_VERSION - 协议版本号
 */
declare const module: { exports: Record<string, unknown> } | undefined;

const PROTOCOL_VERSION = 1;

const DEFAULT_LAN_SERVER_URL = "ws://localhost:9720";
const DEFAULT_LAN_HTTP_BASE = "http://localhost:9720";

/**
 * 联机通信协议常量。定义客户端与服务端之间的消息类型、房间状态和回合阶段。
 * @constant
 */
const MSG = {
  PROTOCOL_VERSION,

  /**
   * 客户端→服务端消息类型
   */
  CLIENT: {
    READY: "lan:ready",           // 玩家就绪
    BID_SUBMIT: "lan:bid:submit", // 提交出价
    ACTION_USE: "lan:action:use", // 使用技能/道具
    SETTLE_REQUEST: "lan:settle:request", // 请求结算
    PAUSE_TOGGLE: "lan:pause:toggle",     // 暂停/恢复
    PING: "lan:ping",             // 心跳
  },

  /**
   * 服务端→客户端消息类型
   */
  SERVER: {
    GAME_INIT: "lan:game:init",               // 游戏初始化
    ROUND_START: "lan:round:start",           // 回合开始
    ROUND_BID_ACK: "lan:round:bid-ack",       // 出价确认
    ROUND_BID_REVEAL: "lan:round:bid-reveal", // 出价揭示
    ROUND_RESULT: "lan:round:result",         // 回合结果
    GAME_SETTLE: "lan:game:settle",           // 游戏结算
    GAME_SETTLE_REVEAL: "lan:game:settle-reveal", // 结算揭示
    GAME_SETTLE_FINAL: "lan:game:settle-final",   // 最终结算
    PAUSE_STATE: "lan:pause:state",           // 暂停状态
    PLAYER_LEFT: "lan:player:left",           // 玩家离开
    ERROR: "lan:error",                       // 错误消息
    PONG: "lan:pong",                         // 心跳回复
  },

  /**
   * 房间状态枚举
   */
  ROOM_STATE: {
    WAITING: "waiting",   // 等待玩家加入
    PLAYING: "playing",   // 游戏进行中
    SETTLED: "settled",   // 已结算
  },

  /**
   * 回合阶段枚举
   */
  ROUND_PHASE: {
    BIDDING: "bidding",     // 出价阶段
    REVEALING: "revealing", // 揭示阶段
    SETTLED: "settled",     // 已结算
  },
};

if (typeof module !== "undefined" && (module as any).exports) {
  (module as any).exports = MSG;
}

export { MSG, PROTOCOL_VERSION, DEFAULT_LAN_SERVER_URL, DEFAULT_LAN_HTTP_BASE };
