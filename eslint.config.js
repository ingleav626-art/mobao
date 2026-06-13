import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020,
        // 项目全局变量
        Phaser: "readonly",
        WebSocket: "readonly",
        NativeBridge: "readonly",
        AndroidKeyboard: "readonly",
        AudioManager: "readonly",
        AudioUI: "readonly",
        MobileHandler: "readonly",
        LanBridge: "readonly",
        DeepSeekLLM: "readonly",
        LlmManager: "readonly",
        MobaoConstants: "readonly",
        MobaoUtils: "readonly",
        MobaoSettings: "readonly",
        MobaoAppState: "readonly",
        MobaoWarehouse: "readonly",
        MobaoUi: "readonly",
        MobaoBidding: "readonly",
        MobaoLobby: "readonly",
        MobaoLan: "readonly",
        MobaoAnimations: "readonly",
        MobaoShopBridge: "readonly",
        MobaoShopPage: "readonly",
        MobaoSceneLlm: "readonly",
        MobaoLlm: "readonly",
        MobaoLlmUiBridge: "readonly",
        MobaoBattleRecordBridge: "readonly",
        MobaoSettlementBridge: "readonly",
        MobaoMapProfiles: "readonly",
        MobaoPublicEvents: "readonly",
        ArtifactData: "readonly",
        CharacterData: "readonly",
        CharacterSystem: "readonly",
        SkillSystem: "readonly",
        ItemSystem: "readonly",
        AuctionAI: "readonly",
        MobaoGameHistory: "readonly",
        MobaoSummarizer: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "no-var": "off",
      "prefer-const": "off",
      "no-console": "off",
      "no-redeclare": "off",
      "no-useless-assignment": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off"
    },
    ignores: [
      "lib/**",
      "node_modules/**",
      "dist/**",
      "assets/**",
      "tools/**"
    ]
  }
];