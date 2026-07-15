import { createApp, h } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"

// Vue UI 暂时禁用--DOM 层级问题导致 UI 乱飞
// #vue-app 容器的 position/z-index 改变了原 CSS 的定位上下文
// 需要重新设计挂载方式（原地替换 vs 独立容器）
// const app = createApp(RootComponent)
// app.use(createPinia())
// app.mount("#vue-app")
