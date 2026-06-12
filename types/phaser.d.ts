/**
 * @file types/phaser.d.ts
 * @description Phaser 全局类型声明。本项目通过 <script> 加载 phaser.min.js，
 *              Phaser 作为全局变量使用。此文件仅声明本项目实际用到的 API。
 */
declare namespace Phaser {
  namespace Math {
    function FloatBetween(min: number, max: number): number
    function Between(min: number, max: number): number
  }

  namespace Textures {
    enum FilterMode {
      LINEAR = 1,
      NEAREST = 0
    }
  }

  namespace BlendModes {
    const ADD: number
  }

  interface Texture {
    frames: any
    setFilter(filter: Textures.FilterMode): void
  }

  interface TextureManager {
    exists(key: string): boolean
    get(key: string): Texture
  }

  interface GameObject {
    setOrigin(x: number, y?: number): any
    setAlpha(alpha: number): any
    setScale(x: number, y?: number): any
    setStrokeStyle(lineWidth: number, color: number, alpha?: number): any
    setFillStyle(color: number, alpha?: number): any
    setDisplaySize(width: number, height: number): any
    setBlendMode(mode: number): any
    setInteractive(config?: any): any
    destroy(): void
    scaleX: number
    scaleY: number
    alpha: number
    x: number
    y: number
  }

  interface Container extends GameObject {
    add(children: any[]): void
    remove(child: any, destroy?: boolean): void
    removeAll(destroy?: boolean): void
  }

  interface Graphics extends GameObject {
    clear(): void
    lineStyle(width: number, color: number, alpha?: number): void
    lineBetween(x1: number, y1: number, x2: number, y2: number): void
    fillStyle(color: number, alpha?: number): void
    fillRect(x: number, y: number, width: number, height: number): void
  }

  interface Rectangle extends GameObject {}

  interface Image extends GameObject {}

  interface Zone extends GameObject {}

  interface Tween {
    stop(): void
  }

  interface TweenManager {
    add(config: Record<string, any>): Tween
  }

  interface LoaderPlugin {
    image(key: string, url: string): void
    start(): void
    on(event: string, callback: Function): void
  }

  interface InputPlugin {
    setDefaultCursor(cursor: string): void
  }

  interface TimePlugin {
    delayedCall(delay: number, callback: Function, args?: any[], scope?: any): any
  }

  interface Scene {
    add: {
      graphics(config?: Record<string, any>): Graphics
      rectangle(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): Rectangle
      image(x: number, y: number, key: string): Image
      container(x: number, y: number): Container
      zone(x: number, y: number, width: number, height: number): Zone
    }
    textures: TextureManager
    load: LoaderPlugin
    tweens: TweenManager
    input: InputPlugin
    time: TimePlugin
  }
}

declare var Phaser: {
  Math: typeof Phaser.Math
  Textures: typeof Phaser.Textures
  BlendModes: typeof Phaser.BlendModes
}
