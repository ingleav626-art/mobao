/**
 * @file lobby/carousel-manager.ts
 * @module lobby/carousel-manager
 * @description CarouselManager -- 大厅地图轮播管理器（Phase 2 依赖注入）。
 *              包装 carousel.ts 的独立函数，通过构造函数持有 CarouselState，
 *              替代原 Mixin 使用模块级 _carouselState 的隐式共享方式。
 *              Manager 可独立单测（注入 state 后验证 offset 变更），过渡期 Mixin 保留为薄代理层。
 */
import type { CarouselState } from "./carousel"
import {
  renderCarousel,
  bindCarouselTouch,
  carouselScroll,
  updateCarouselPosition,
  renderMapDetail,
} from "./carousel"

/**
 * 大厅地图轮播管理器。
 *
 * 依赖注入：
 *   - state: 轮播状态（offset），Manager 持有此引用，scroll/渲染均操作此状态
 *
 * 与 Mixin 的区别：Mixin 使用模块级 _carouselState（全局单例），
 * Manager 将状态封装为实例属性，可创建多个独立实例。
 */
export class CarouselManager {
  private readonly state: CarouselState

  /**
   * @param state 初始轮播状态（默认 { offset: 0 }）
   */
  constructor(state: CarouselState = { offset: 0 }) {
    this.state = state
  }

  /** 渲染地图卡片列表，绑定点击选中事件 */
  renderCarousel(onCardClick?: () => void): void {
    renderCarousel(this.state, onCardClick)
  }

  /** 绑定触摸滑动手势（水平滑动>30px触发翻页） */
  bindCarouselTouch(): void {
    bindCarouselTouch(this.state)
  }

  /** 左右翻页（-1/1），限制在有效范围内 */
  carouselScroll(direction: number): void {
    carouselScroll(this.state, direction)
  }

  /** 更新轮播位置（translateX），控制箭头禁用状态 */
  updateCarouselPosition(): void {
    updateCarouselPosition(this.state.offset)
  }

  /** 渲染选中地图的参数详情面板 */
  renderMapDetail(): void {
    renderMapDetail()
  }

  /** 获取当前轮播偏移量 */
  getOffset(): number {
    return this.state.offset
  }

  /** 获取轮播状态引用 */
  getState(): CarouselState {
    return this.state
  }
}
