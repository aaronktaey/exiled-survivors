import Phaser from 'phaser';

import { DEPTH, TITLE_NOTICE } from '@/config';

/**
 * A line drawn one glyph at a time, each glyph white and tinted, the hues
 * running along it like a rainbow and every glyph bobbing a little out of
 * step with the next. A tint is cheap — no glyph is redrawn as the colours
 * move, only re-coloured.
 *
 * Wraps at spaces to `maxWidth`, centres each line, and is scaled down
 * (never below `minScale`) to fit `maxHeight`.
 */
export class RainbowText {
  public readonly container: Phaser.GameObjects.Container;
  /** Each glyph, in reading order. Public for tests. */
  public readonly glyphs: Phaser.GameObjects.Text[] = [];
  /** Where each glyph rests before its bob. */
  private readonly restY: number[] = [];
  private readonly scene: Phaser.Scene;
  /** The block's own size, before any scale. */
  public readonly width: number;
  public readonly height: number;

  public constructor(
    scene: Phaser.Scene,
    text: string,
    options: { maxWidth: number; fontSize?: number },
  ) {
    this.scene = scene;
    const fontSize = options.fontSize ?? TITLE_NOTICE.fontSize;
    const stroke = 4;
    const style = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#05070b',
      strokeThickness: stroke,
    };
    this.container = scene.add.container(0, 0).setDepth(DEPTH.ui);

    // Measured glyph by glyph, so a line can be laid out before it is placed.
    // Each glyph's width counts its outline as well, and side by side the
    // outlines overlap: a glyph advances by its width less the outline.
    const make = (glyph: string) => scene.add.text(0, 0, glyph, style).setOrigin(0, 0.5);
    const advance = (glyph: Phaser.GameObjects.Text) => glyph.width - stroke;
    const space = make(' ');
    const spaceWidth = advance(space);
    space.destroy();

    const words = text.split(' ').filter((word) => word.length > 0);
    const built = words.map((word) => {
      const glyphs = [...word].map(make);
      return { glyphs, width: glyphs.reduce((sum, g) => sum + advance(g), 0) + stroke };
    });

    const lines: (typeof built)[] = [];
    let line: typeof built = [];
    let lineWidth = 0;
    for (const word of built) {
      const wider = lineWidth + (line.length > 0 ? spaceWidth : 0) + word.width;
      if (line.length > 0 && wider > options.maxWidth) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      lineWidth += (line.length > 0 ? spaceWidth : 0) + word.width;
      line.push(word);
    }
    if (line.length > 0) {
      lines.push(line);
    }

    const lineHeight = fontSize * TITLE_NOTICE.lineHeight;
    const widths = lines.map(
      (words) => words.reduce((sum, w) => sum + w.width, 0) + spaceWidth * (words.length - 1),
    );
    this.width = Math.max(0, ...widths);
    this.height = lines.length * lineHeight;

    lines.forEach((words, row) => {
      let x = -widths[row]! / 2;
      const y = -this.height / 2 + lineHeight * (row + 0.5);
      for (const word of words) {
        for (const glyph of word.glyphs) {
          glyph.setPosition(x, y);
          this.container.add(glyph);
          this.glyphs.push(glyph);
          this.restY.push(y);
          x += advance(glyph);
        }
        x += spaceWidth;
      }
    });

    this.paint();
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.paint, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Puts it here, scaled down to fit the room if it must. */
  public placeIn(x: number, y: number, maxHeight: number, tiltDeg = 0): this {
    const scale = Phaser.Math.Clamp(maxHeight / Math.max(1, this.height), TITLE_NOTICE.minScale, 1);
    this.container.setPosition(x, y).setScale(scale).setAngle(tiltDeg);
    return this;
  }

  public destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.paint, this);
    this.container.destroy();
  }

  /** The colours move along it, and each glyph bobs a beat after the last. */
  private paint(): void {
    const now = this.scene.time.now;
    const { hueStep, cycleMs, saturation, waveAmp, waveMs, waveStep } = TITLE_NOTICE;
    this.glyphs.forEach((glyph, i) => {
      const hue = (((i * hueStep - now / cycleMs) % 1) + 1) % 1;
      glyph.setTint(Phaser.Display.Color.HSVToRGB(hue, saturation, 1).color as number);
      glyph.y = this.restY[i]! + Math.sin((now / waveMs) * Math.PI * 2 - i * waveStep) * waveAmp;
    });
  }
}
