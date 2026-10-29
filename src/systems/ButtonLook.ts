import Phaser from 'phaser';

import { BUTTON_LOOK, COLORS } from '@/config';

/**
 * Every button looks like one you could press (0.141, the user's ask): a
 * body of its own colour, light along its top, shade along its bottom, a
 * shadow under it, and a dip while it is pressed.
 *
 * Buttons are rectangles made in many places, each in its own way, so the
 * look is laid on wherever a rectangle becomes clickable with a hand cursor
 * (`setInteractive({ useHandCursor: true })`) rather than at each of those
 * places — a new button gets it without asking. What is clickable but is
 * not a button (a grid cell, a HUD slot) opts out with `setData('flat', true)`.
 * One inside a container, or covering most of the screen, is left alone.
 *
 * Two pictures follow each button every frame: under it (its shadow, and a
 * body where its own fill is see-through) and over it (the light and the
 * shade, under its label). They are seen by the cameras that see the button.
 */
export function installButtonLook(): void {
  const proto = Phaser.GameObjects.Rectangle.prototype as unknown as {
    setInteractive: (this: Phaser.GameObjects.Rectangle, ...args: unknown[]) => Phaser.GameObjects.Rectangle;
  };
  const original = proto.setInteractive;
  proto.setInteractive = function (this: Phaser.GameObjects.Rectangle, ...args: unknown[]) {
    const out = original.apply(this, args);
    const config = args[0] as { useHandCursor?: boolean } | undefined;
    if (config && typeof config === 'object' && config.useHandCursor) {
      raise(this);
    }
    return out;
  };
}

const RAISED = new WeakSet<Phaser.GameObjects.Rectangle>();

function raise(rect: Phaser.GameObjects.Rectangle): void {
  if (RAISED.has(rect) || !rect.scene) {
    return;
  }
  RAISED.add(rect);
  const scene = rect.scene;
  let under: Phaser.GameObjects.Graphics | undefined;
  let over: Phaser.GameObjects.Graphics | undefined;
  let pressedUntil = 0;
  rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    pressedUntil = scene.time.now + BUTTON_LOOK.pressMs;
  });

  const forget = (): void => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw);
    under?.destroy();
    over?.destroy();
    under = undefined;
    over = undefined;
  };

  const draw = (): void => {
    if (!rect.active || !rect.scene) {
      forget();
      return;
    }
    const { width, height } = scene.scale;
    const huge = rect.displayWidth * rect.displayHeight > width * height * 0.4;
    if (rect.getData('flat') === true || rect.parentContainer || huge) {
      forget();
      return;
    }
    const shown = rect.visible && rect.alpha > 0.01;
    if (!shown) {
      under?.setVisible(false);
      over?.setVisible(false);
      return;
    }
    under ??= scene.add.graphics();
    over ??= scene.add.graphics();
    const look = BUTTON_LOOK;
    const pressed = scene.time.now < pressedUntil;
    const b = rect.getBounds();
    for (const g of [under, over]) {
      g.clear()
        .setVisible(true)
        .setAlpha(rect.alpha)
        .setScrollFactor(rect.scrollFactorX, rect.scrollFactorY);
      // Only the cameras that draw the button draw its look.
      (g as unknown as { cameraFilter: number }).cameraFilter = (rect as unknown as { cameraFilter: number }).cameraFilter;
    }
    under.setDepth(rect.depth - 0.5);
    over.setDepth(rect.depth + 0.5);

    // In focus — a menu's row under the cursor, or anything wearing the accent ring — it glows (0.158).
    const focused = rect.getData('focus') === true || (rect.isStroked && rect.strokeColor === COLORS.accentFill);
    if (focused) {
      const { rings, step, alpha } = look.focusGlow;
      for (let i = 1; i <= rings; i++) {
        const out = i * step;
        under.lineStyle(2, COLORS.glow, alpha * (1 - (i - 1) / rings)).strokeRect(b.x - out, b.y - out, b.width + out * 2, b.height + out * 2);
      }
    }
    // Its shadow, below it — shorter while pressed, as if it went down.
    const drop = pressed ? 1 : look.shadowDrop;
    under.fillStyle(look.shadow, look.shadowAlpha).fillRect(b.x + 1, b.bottom, b.width - 1, drop);
    // A body where its own fill lets the floor through.
    if (rect.fillAlpha < 0.35) {
      under.fillStyle(look.body, look.bodyAlpha).fillRect(b.x, b.y, b.width, b.height);
    }
    // Light along the top, shade along the bottom, inside its edge.
    const inset = 2;
    over.fillStyle(look.light, pressed ? look.lightAlpha / 2 : look.lightAlpha)
      .fillRect(b.x + inset, b.y + inset, b.width - inset * 2, Math.max(1, b.height * 0.4 - inset));
    over.fillStyle(look.shade, look.shadeAlpha).fillRect(b.x + inset, b.bottom - inset - 2, b.width - inset * 2, 2);
    if (pressed) {
      over.fillStyle(look.shade, look.pressAlpha).fillRect(b.x, b.y, b.width, b.height);
    }
  };

  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
  rect.once(Phaser.GameObjects.Events.DESTROY, forget);
}
