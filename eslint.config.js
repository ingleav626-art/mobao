import js from "@eslint/js"
import globals from "globals"
import tsPlugin from "@typescript-eslint/eslint-plugin"

const tsRecommended = tsPlugin.configs["flat/recommended"]

export default [
  // 全局忽略：不 lint 这些目录
  {
    ignores: [
      "lib/**",
      "node_modules/**",
      "dist/**",
      "assets/**",
      "tools/**"
    ]
  },
  // JS 推荐规则（适用于 .js 文件）
  js.configs.recommended,
  // TypeScript：解析器 + 推荐规则（数组含 3 个配置对象）
  ...tsRecommended,
  // 项目配置：全局变量 + 自定义规则（适用于 .ts 文件）
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
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
      // TS 文件用 @typescript-eslint/no-unused-vars 替代原生 no-unused-vars
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ],
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // 既有源码债务降为 warn，建立非阻塞 lint 基线（后续可随债务偿还逐步收紧）
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "no-var": "off",
      "prefer-const": "off",
      "no-console": "off",
      "no-redeclare": "off",
      "no-useless-assignment": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off"
    }
  }
]
