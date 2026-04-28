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
