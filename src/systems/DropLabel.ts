import Phaser from 'phaser';

import { DEPTH, DROP_LABEL, LIGHT_PILLAR, TEXT, TEXTURES, type DropTier } from '@/config';
import { outlineWidth } from '@/systems/SharpText';

/**
 * The name that floats over something lying on the ground.
 *
 * One of these serves every drop — a skill, a weapon, a 신성한 조각 — and
 * what it looks like comes from how rare the thing under it is. The plate is
 * drawn rather than baked into a texture: a weapon's name is not known until
 * it is rolled, and a baked plate would also have to be baked again every
 * time the language changed.
 */
export class DropLabel {
  /** The slab and the words on it. Public so a test can measure them. */
  public readonly plate: Phaser.GameObjects.Rectangle;
  public readonly label: Phaser.GameObjects.Text;
  /**
   * The column of light a 희귀 or 신화 drop stands in, in its tier's colour.
   * Public so a test can see it. Absent on a label that asked for none — a
   * 제단 is not something to pick up, however loud its offer is.
   */
  public readonly pillar?: Phaser.GameObjects.Image;
  /** The tier it was last shown as: what CombatSystem.land sounds by. */
  public tier: DropTier = 'normal';
  private readonly scene: Phaser.Scene;
  private pulse?: Phaser.Tweens.Tween;
  private glow?: Phaser.Tweens.Tween;

  public constructor(scene: Phaser.Scene, x: number, y: number, options: { readonly pillar?: boolean } = {}) {
    this.scene = scene;

    if (options.pillar !== false) {
      this.pillar = scene.add
        .image(x, y, TEXTURES.lightPillar)
        .setOrigin(0.5, 1)
        .setDisplaySize(LIGHT_PILLAR.width, LIGHT_PILLAR.height)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(LIGHT_PILLAR.alpha)
        .setDepth(DEPTH.pickups - 1)
        .setVisible(false);
    }

    this.plate = scene.add
      .rectangle(x, y, 10, 10, DROP_LABEL.tiers.rare.plate, 0)
      .setOrigin(0.5)
      .setDepth(DEPTH.skillDrop)
      .setVisible(false);

    this.label = scene.add
      .text(x, y, '', { fontFamily: 'system-ui, sans-serif' })
      .setOrigin(0.5)
      .setDepth(DEPTH.skillDrop + 1)
      .setVisible(false);
  }

  /** What the label is drawn on, for tests and for the drop's own layout. */
  public get height(): number {
    return this.plate.height;
  }

  public get text(): string {
    return this.label.text;
  }

  /** True while the plate is breathing — the loudest tier only. */
  public get pulsing(): boolean {
    return this.pulse !== undefined && this.pulse.isPlaying();
  }

  /** For a test to read the tier back off the screen. */
  public get style(): { readonly colour: string; readonly plateAlpha: number; readonly border: number } {
    return {
      colour: String(this.label.style.color ?? ''),
      plateAlpha: this.plate.fillAlpha,
      border: this.plate.strokeColor,
    };
  }

  /** Writes a name, in the dress its rarity calls for. */
  public show(text: string, tier: DropTier): void {
    const style = DROP_LABEL.tiers[tier];

    // `setStyle` reads every key it is given, and an explicit `undefined`
    // makes the thickness undefined rather than leaving it alone — which
    // turns the measured width into NaN and the label into nothing at all.
    // So the number is always spelled out: bare text leans on its outline,
    // text on a plate would only be muddied by one.
    this.label.setStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: style.fontSize,
      color: style.text,
      stroke: (style as { outline?: string }).outline ?? TEXT.outline.color,
      strokeThickness: style.outlined ? outlineWidth(style.fontSize) : 0,
    });
    this.label.setText(text);

    this.plate.setSize(
      Math.ceil(this.label.width) + DROP_LABEL.paddingX * 2,
      Math.ceil(this.label.height) + DROP_LABEL.paddingY * 2,
    );
    this.plate.setFillStyle(style.plate, style.plateAlpha);
    this.plate.setStrokeStyle(style.borderWidth, style.border, style.borderWidth > 0 ? 1 : 0);
    this.plate.setVisible(style.plateAlpha > 0 || style.borderWidth > 0);
    this.label.setVisible(true);

    this.tier = tier;
    this.pop(style.pulse);
    // 0.111's ladder: 희귀 in a yellow pillar, 신화 in a red one, the rest in none.
    this.light(style.pillar !== null, style.pillar ?? undefined);
  }

  /** Centres the plate and its words just above an item of `size` at (x, y). */
  public place(x: number, y: number, size: number): void {
    const top = y - size / 2 - DROP_LABEL.gap - this.plate.height / 2;
    this.plate.setPosition(x, top);
    this.label.setPosition(x, top);
    this.pillar?.setPosition(x, y + LIGHT_PILLAR.footOffset);
  }

  public hide(): void {
    this.pulse?.remove();
    this.pulse = undefined;
    this.light(false);
    this.scene.tweens.killTweensOf([this.plate, this.label]);
    this.plate.setVisible(false).setScale(1);
    this.label.setVisible(false).setScale(1);
  }

  public destroy(fromScene?: boolean): void {
    this.pulse?.remove();
    this.glow?.remove();
    this.pillar?.destroy(fromScene);
    this.plate.destroy(fromScene);
    this.label.destroy(fromScene);
  }

  /**
   * The same little pop the drop itself does, and then — on the rarest tier
   * only — a slow swell that goes on until it is picked up.
   *
   * The label owns both because the sprite's pop kills every tween on its
   * targets as it starts, which would take the breathing with it.
   */
  private pop(amount: number): void {
    const parts = [this.plate, this.label];
    this.pulse?.remove();
    this.pulse = undefined;
    this.scene.tweens.killTweensOf(parts);

    parts.forEach((part) => part.setScale(0.6));
    this.scene.tweens.add({
      targets: parts,
      scale: 1,
      duration: DROP_LABEL.popMs,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (amount > 0) {
          this.beat(amount);
        }
      },
    });
  }

  /** Stands the pillar up, breathing — in `tint`, or its own white — or takes it down. */
  private light(on: boolean, tint?: number): void {
    this.glow?.remove();
    this.glow = undefined;
    if (!this.pillar) {
      return;
    }

    if (tint === undefined) {
      this.pillar.clearTint();
    } else {
      this.pillar.setTint(tint);
    }
    this.pillar.setVisible(on).setAlpha(LIGHT_PILLAR.alpha);
    if (on) {
      this.glow = this.scene.tweens.add({
        targets: this.pillar,
        alpha: LIGHT_PILLAR.alphaPeak,
        duration: LIGHT_PILLAR.pulseMs / 2,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** A slow swell, so the loudest tier catches the eye from across the field. */
  private beat(amount: number): void {
    this.pulse = this.scene.tweens.add({
      targets: [this.plate, this.label],
      scale: 1 + amount,
      duration: DROP_LABEL.pulseMs / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
