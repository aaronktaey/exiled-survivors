import Phaser from 'phaser';

import { COLORS, DEPTH, HUD, TEXT, TOAST } from '@/config';

/** How a toast is dressed: an ordinary line, something rare, or a warning. */
export type ToastTone = 'normal' | 'rare' | 'warning';

const EDGE: Record<ToastTone, number> = {
  normal: 0x2b3445,
  rare: 0xffc43a,
  warning: 0xe0564a,
};

interface Toast {
  readonly box: Phaser.GameObjects.Container;
  readonly height: number;
  leaving: boolean;
}

/**
 * 전투 알림 — what the run says while it is played (a pickup, a 우두머리
 * walking in), as toasts stacked in the top-right corner, newest at the
 * bottom. Each stays TOAST.lifeMs and fades; past TOAST.max the oldest goes
 * at once. Out of the middle of the field, where a banner used to sit over
 * exactly the place the player was looking.
 */
export class Toasts {
  private readonly scene: Phaser.Scene;
  private readonly live: Toast[] = [];

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** The lines on screen, oldest first. Public for tests. */
  public get lines(): string[] {
    return this.live
      .filter((toast) => !toast.leaving)
      .map((toast) => (toast.box.getAt(1) as Phaser.GameObjects.Text).text);
  }

  /** Where the stack is drawn. Public for tests. */
  public get boxes(): Phaser.GameObjects.Container[] {
    return this.live.filter((toast) => !toast.leaving).map((toast) => toast.box);
  }

  public show(message: string, tone: ToastTone = 'normal'): void {
    const { width } = this.scene.cameras.main;
    const narrow = width < HUD.narrowWidth;
    const maxWidth = Math.min(narrow ? TOAST.narrowMaxWidth : TOAST.maxWidth, width - 24);
    const text = this.scene.add
      .text(0, 0, message, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: tone === 'rare' ? '#ffd76a' : COLORS.text,
        wordWrap: { width: maxWidth - TOAST.padding * 2 },
      })
      .setOrigin(1, 0);
    const boxW = Math.ceil(text.width) + TOAST.padding * 2;
    const boxH = Math.ceil(text.height) + TOAST.padding * 1.4;
    text.setPosition(-TOAST.padding, TOAST.padding * 0.7);
    // Drawn rather than a Rectangle: a stroked Rectangle with its origin
    // moved draws slanted edges inside a Container under Phaser 4.
    const plate = this.scene.add.graphics();
    plate.fillStyle(0x0b0e14, 0.86);
    plate.fillRoundedRect(-boxW, 0, boxW, boxH, 6);
    plate.lineStyle(2, EDGE[tone], 1);
    plate.strokeRoundedRect(-boxW, 0, boxW, boxH, 6);
    const box = this.scene.add
      .container(width - TOAST.margin + 40, 0, [plate, text])
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 5)
      .setAlpha(0);
    const toast: Toast = { box, height: boxH, leaving: false };
    this.live.push(toast);

    // Past the ceiling, the oldest goes now.
    while (this.live.filter((t) => !t.leaving).length > TOAST.max) {
      const oldest = this.live.find((t) => !t.leaving);
      if (oldest) {
        this.dismiss(oldest, 120);
      }
    }
    this.layout();
    this.scene.tweens.add({ targets: box, x: width - TOAST.margin, alpha: 1, duration: 160, ease: 'Quad.easeOut' });
    this.scene.time.delayedCall(TOAST.lifeMs, () => this.dismiss(toast, TOAST.fadeMs));
  }

  /** Every toast at once, gone. */
  public clear(): void {
    this.live.forEach((toast) => toast.box.destroy());
    this.live.length = 0;
  }

  private dismiss(toast: Toast, fadeMs: number): void {
    if (toast.leaving) {
      return;
    }
    toast.leaving = true;
    this.scene.tweens.add({
      targets: toast.box,
      alpha: 0,
      duration: fadeMs,
      onComplete: () => {
        toast.box.destroy();
        const at = this.live.indexOf(toast);
        if (at >= 0) {
          this.live.splice(at, 1);
        }
        this.layout();
      },
    });
    this.layout();
  }

  /** Stacks what is staying from the top down; the leaving keep their place until gone. */
  private layout(): void {
    let y = this.scene.cameras.main.width < HUD.narrowWidth ? TOAST.narrowTop : TOAST.top;
    for (const toast of this.live) {
      if (toast.leaving) {
        continue;
      }
      this.scene.tweens.add({ targets: toast.box, y, duration: 140, ease: 'Quad.easeOut' });
      y += toast.height + TOAST.gap;
    }
  }
}
