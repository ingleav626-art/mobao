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
    destroyed: boolean
    isDestroyed: boolean
    active: boolean
    visible: boolean
    name: string
    type: string
    scene: Scene
    data: any
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

  interface Arc extends GameObject {
    setRadius(radius: number): this
    setStartAngle(start: number): this
    setEndAngle(end: number): this
    setAnticlockwise(anticlockwise: boolean): this
    setFillStyle(color: number, alpha?: number): this
    lineStyle(width: number, color: number, alpha?: number): this
  }

  interface Star extends GameObject {
    setPointRadius(radius: number): this
    setPoints(points: number, innerRadius?: number, outerRadius?: number): this
    setFillStyle(color: number, alpha?: number): this
    lineStyle(width: number, color: number, alpha?: number): this
  }

  interface Text extends GameObject {
    setText(text: string): this
    setStyle(style: Record<string, any>): this
    setTextStyle(style: Record<string, any>): this
    setFontSize(size: number): this
    setColor(color: string): this
    text: string
  }

  interface Tween {
    stop(): void
  }

  interface TweenManager {
    add(config: Record<string, any>): Tween
    killAll(): void
  }

  interface LoaderPlugin {
    image(key: string, url: string): LoaderPlugin
    start(): void
    on(event: string, callback: Function): LoaderPlugin
    once(event: string, callback: Function): LoaderPlugin
  }

  interface InputPlugin {
    setDefaultCursor(cursor: string): void
    enabled: boolean
  }

  interface TimePlugin {
    delayedCall(delay: number, callback: Function, args?: any[], scope?: any): any
    removeAllEvents(): void
  }

  interface ScaleManager {
    width: number
    height: number
  }

  interface Scene {
    add: {
      graphics(config?: Record<string, any>): Graphics
      rectangle(x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number): Rectangle
      image(x: number, y: number, key: string): Image
      container(x: number, y: number): Container
      zone(x: number, y: number, width: number, height: number): Zone
      arc(x: number, y: number, radius: number, startAngle?: number, endAngle?: number, anticlockwise?: boolean, fillColor?: number, fillAlpha?: number): Arc
      star(x: number, y: number, points: number, innerRadius?: number, outerRadius?: number, fillColor?: number, fillAlpha?: number): Star
      text(x: number, y: number, text: string, style?: Record<string, any>): Text
      circle(x: number, y: number, radius: number, fillColor?: number, fillAlpha?: number): GameObject
      polygon(x: number, y: number, points: number[][], fillColor?: number, fillAlpha?: number): GameObject
    }
    textures: TextureManager
    load: LoaderPlugin
    tweens: TweenManager
    input: InputPlugin
    time: TimePlugin
    scene: { [key: string]: any }
  }
}

declare var Phaser: {
  Math: typeof Phaser.Math
  Textures: typeof Phaser.Textures
  BlendModes: typeof Phaser.BlendModes
  Scene: typeof Phaser.Scene
  Game: new (config: any) => any
  AUTO: number
}
