import Phaser from 'phaser';

import { COLORS, DEPTH, PAUSE_BUTTON, TEXT } from '@/config';
import { t } from '@/i18n';

/** Below this canvas width the button drops its word and keeps the arrow. */
const BACK_WORD_FROM = 600;

/** What `addBackButton` hands back, so a screen can keep it for tests. */
export interface BackButton {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  /** The same thing a press does. */
  readonly press: () => void;
}

/**
 * "← 돌아가기" in the top-left corner — the same corner, and the same size,
 * as the pause button a run wears, so a way out is always where the thumb
 * already looks.
 *
 * Every screen but the title and the run itself has one: Esc and the back
 * gesture already did this, but a phone has no Esc and a mouse should not
 * need a keyboard to leave a screen.
 */
export function addBackButton(scene: Phaser.Scene, onBack: () => void): BackButton {
  const { size, margin } = PAUSE_BUTTON;
  const y = margin + size / 2;

  // On a phone held upright the word would run into a centred title, so
  // there the arrow says it alone.
  const narrow = scene.scale.width < BACK_WORD_FROM;
  const label = scene.add
    .text(0, y, narrow ? '←' : `← ${t().common.back}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: TEXT.size.body,
      color: COLORS.text,
    })
    .setOrigin(0, 0.5)
    .setScrollFactor(0)
    .setDepth(DEPTH.ui + 21);

  const width = Math.max(size, Math.ceil(label.width) + 24);
  label.setX(margin + 12);

  let pressed = false;
  const press = () => {
    // One press is one way out: a double tap must not close two screens.
    if (pressed) {
      return;
    }
    pressed = true;
    onBack();
  };

  const plate = scene.add
    .rectangle(margin + width / 2, y, width, size, COLORS.panel, 0.85)
    .setStrokeStyle(2, COLORS.panelEdge, 1)
    .setScrollFactor(0)
    .setDepth(DEPTH.ui + 20)
    .setInteractive({ useHandCursor: true });
  plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, press);

  return { plate, label, press };
}
