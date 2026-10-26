import Phaser from 'phaser';

import {
  ALL_ORBS,
  COLORS,
  DEPTH,
  GEAR_DROP,
  ORB_FX,
  ORBS,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  gearTexture,
  type OrbId,
  type OrbSpec,
} from '@/config';
import { fill, gearTitle, orbDetail, orbName, orbShort, t } from '@/i18n';
import { sparkleBurst } from '@/systems/Celebrate';
import { InventoryScene } from '@/scenes/InventoryScene';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { canTakeOrb, MAX_AFFIX_LINES, gear, orbApplied, type GearItem } from '@/systems/Gear';
import { fitText } from '@/systems/Layout';
import { orbs } from '@/systems/Orbs';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface OrbSceneData {
  /** The weapon the 구슬 go on. */
  readonly uid: string;
  /** The 구슬 picked first; the row along the top switches it. */
  readonly orb: OrbId;
  /**
   * Back to the 인벤토리: the weapon's uid while it is still there (null once
   * a 구슬 destroyed it), and the line saying what the last 구슬 did.
   */
  readonly onClose: (result: { readonly uid: string | null; readonly note?: string }) => void;
}

/** One 구슬 along the top. */
interface OrbTab {
  readonly id: OrbId;
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly count: Phaser.GameObjects.Text;
}

const TITLE_Y = 30;
const TABS_Y = 72;
const TAB_W = 76;
const TAB_H = 34;
const BUTTON_W = 150;
const BUTTON_H = 36;

/**
 * 구슬 사용 — the popup a 구슬 button opens over the 인벤토리.
 *
 * Along the top, every 구슬 with how many are held; under it, what the
 * picked one does, every rule of it spelt out, beside the weapon it would go
 * on as that weapon reads now. 사용 spends one and says what it did, and the
 * popup stays for the next — the lines it changed lit in its colour. A
 * weapon that does not survive turns the popup into the news of it, and its
 * 확인 goes back to the 인벤토리.
 */
export class OrbScene extends Phaser.Scene {
  public static readonly KEY = SCENES.orb;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** The 구슬 picked. Public for tests. */
  public orb: OrbId = ALL_ORBS[0]!.id;
  /** What the last 구슬 did, in one line. Public for tests. */
  public note = '';
  /** The weapon did not survive the last one. Public for tests. */
  public destroyed = false;
  /** The read-out's lines the last 구슬 changed. Public for tests. */
  public changed: string[] = [];
  /** Everything drawn under the tabs, drawn again on each change. Public for tests. */
  public layer!: Phaser.GameObjects.Container;

  private payload!: OrbSceneData;
  private tabs: OrbTab[] = [];
  /** The weapon's read-out before the last 구슬, to tell what changed. */
  private before: string[] = [];
  private iconAt = { x: 0, y: 0 };

  public constructor() {
    super(OrbScene.KEY);
  }

  public init(data: OrbSceneData): void {
    this.payload = data;
    this.orb = data.orb;
    this.note = '';
    this.destroyed = false;
    this.changed = [];
    this.tabs = [];
    this.before = [];
  }

  /** The weapon as the stash holds it now. Public for tests. */
  public get item(): GearItem | undefined {
    return gear.items.find((held) => held.uid === this.payload.uid);
  }

  /** Whether the picked 구슬 would do anything to the weapon, and one is held. Public for tests. */
  public get usable(): boolean {
    const item = this.item;
    return (
      !this.destroyed &&
      item !== undefined &&
      canTakeOrb(item, gear.value.equipped) &&
      orbs.count(this.orb) > 0 &&
      orbApplied(item, ORBS[this.orb]) !== null
    );
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    // Over the 인벤토리, and in its way: nothing under the popup takes a press.
    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui)
      .setInteractive();
    fitText(
      this.add
        .text(width / 2, TITLE_Y, t().orbUse.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 240,
    );
    this.buildTabs(width);
    this.layer = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.armKeys();
    this.draw();
  }

  /** Picks another 구슬. Public so a test can. */
  public pick(id: OrbId): void {
    if (this.destroyed) {
      return;
    }
    this.orb = id;
    this.changed = [];
    this.draw();
  }

  /**
   * Spends the picked 구슬 on the weapon, the way the 인벤토리 always has:
   * the outcome is decided, the stash and the drawer written, and then the
   * popup shows it. Public so a test can.
   */
  public use(): void {
    const item = this.item;
    const spec = ORBS[this.orb];
    if (!item || !spec || !this.usable) {
      return;
    }
    const outcome = orbApplied(item, spec);
    if (!outcome || !orbs.spend(spec.id)) {
      return;
    }

    this.before = InventoryScene.describe(item).split('\n');
    if (outcome.item) {
      gear.replace(outcome.item);
    } else {
      // The weapon is gone; the store puts a 녹슨 검 back if that leaves the
      // survivor with nothing at all.
      gear.discardAnyway(item.uid);
      this.destroyed = true;
    }
    this.note = InventoryScene.noteFor(spec.id, outcome);
    const now = outcome.item ? InventoryScene.describe(outcome.item).split('\n') : [];
    const was = new Map<string, number>();
    this.before.forEach((line) => was.set(line, (was.get(line) ?? 0) + 1));
    this.changed = now.filter((line) => {
      const left = was.get(line) ?? 0;
      was.set(line, left - 1);
      return left <= 0 && line.trim() !== '';
    });
    // Decided and written at once, drawn on the next tick: a probe that pins
    // Math.random for the roll would otherwise have Phaser read it while it
    // makes the new labels (see the harness notes in CLAUDE.md).
    this.time.delayedCall(0, () => {
      this.draw();
      this.burst(spec);
    });
  }

  /** Back to the 인벤토리, telling it where the weapon is and what happened. */
  public close(): void {
    const { onClose, uid } = this.payload;
    this.scene.stop();
    onClose({ uid: this.destroyed ? null : uid, note: this.note || undefined });
  }

  private buildTabs(width: number): void {
    const gap = 6;
    const w = Math.min(TAB_W, Math.floor((width - 24) / ALL_ORBS.length) - gap);
    const left = width / 2 - (ALL_ORBS.length * (w + gap) - gap) / 2 + w / 2;
    ALL_ORBS.forEach((spec, index) => {
      const x = left + index * (w + gap);
      const plate = this.add
        .rectangle(x, TABS_Y, w, TAB_H, COLORS.panel, 1)
        .setStrokeStyle(2, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      this.add.image(x - w / 2 + 15, TABS_Y, spec.texture).setDisplaySize(18, 18).setDepth(DEPTH.ui + 2);
      const count = this.add
        .text(x + 9, TABS_Y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pick(spec.id));
      this.tabs.push({ id: spec.id, plate, count });
    });
  }

  /** The tabs lit for the pick and the counts, then everything under them from scratch. */
  private draw(): void {
    this.tabs.forEach((tab) => {
      const on = tab.id === this.orb;
      tab.plate.setStrokeStyle(on ? 3 : 2, on ? ORBS[tab.id].color : COLORS.panelEdge, 1);
      tab.plate.setFillStyle(on ? COLORS.panelActive : COLORS.panel, 1);
      tab.count.setText(`${orbShort(tab.id)} ${orbs.count(tab.id)}`);
      fitText(tab.count.setScale(1), TAB_W - 26, 0);
      tab.count.setAlpha(orbs.count(tab.id) > 0 ? 1 : 0.45);
    });

    this.layer.removeAll(true);
    if (this.destroyed) {
      this.drawDestroyed();
      return;
    }

    const { width, height } = this.scale;
    const top = TABS_Y + TAB_H / 2 + 16;
    const bottom = height - 112;
    const wide = width >= 720;
    const panel = Math.min(width - 32, 900);
    const colW = wide ? (panel - 32) / 2 : panel;
    const left = (width - panel) / 2;
    const orbBottom = this.drawOrb(left, top, colW);
    const gearLeft = wide ? left + colW + 32 : left;
    const gearTop = wide ? top : orbBottom + 14;
    this.drawGear(gearLeft, gearTop, colW, bottom);
    this.drawFooter(width, height);
  }

  /** The picked 구슬: its name in its colour, what it does, and every rule of it. Returns where it ends. */
  private drawOrb(left: number, top: number, w: number): number {
    const spec = ORBS[this.orb];
    const colour = `#${spec.color.toString(16).padStart(6, '0')}`;
    const name = this.add
      .text(left, top, `${orbName(spec.id)}  ·  ${fill(t().orbUse.held, { count: orbs.count(spec.id) })}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: colour,
      })
      .setOrigin(0, 0);
    fitText(name, w, 0);
    const body = this.add
      .text(left, top + 28, [orbDetail(spec.id), '', ...OrbScene.rules(spec).map((rule) => `• ${rule}`)].join('\n'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.text,
        lineSpacing: 4,
        wordWrap: { width: w },
      })
      .setOrigin(0, 0);
    this.layer.add([name, body]);
    return body.y + body.height;
  }

  /** Every rule of a 구슬, its numbers read off the table. Public for tests. */
  public static rules(spec: OrbSpec): string[] {
    const copy = t().orbUse.rules;
    if (spec.reroll) {
      return [fill(copy.reroll, { min: spec.reroll.min, max: spec.reroll.max, cap: GEAR_DROP.maxPrefixes })];
    }
    if (spec.add !== undefined) {
      return [fill(copy.add, { count: spec.add, max: MAX_AFFIX_LINES })];
    }
    if (spec.upgrade) {
      return [
        fill(copy.climb, { steps: spec.upgrade.steps }),
        copy.swap,
        fill(copy.destroy, { chance: `${Math.round(spec.upgrade.destroyChance * 100)}%` }),
        copy.noLines,
      ];
    }
    if (spec.ward) {
      return [copy.ward];
    }
    if (spec.engrave) {
      return [fill(copy.engraveMin, { min: spec.engrave.minLines }), copy.engraveKeep, copy.engraveOnce];
    }
    return [];
  }

  /** The weapon as it reads now, the lines the last 구슬 changed in its colour. */
  private drawGear(left: number, top: number, w: number, bottom: number): void {
    const item = this.item;
    const copy = t().orbUse;
    const heading = this.add
      .text(left, top, copy.gearHeading, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
      .setOrigin(0, 0);
    this.layer.add(heading);
    if (!item) {
      return;
    }
    const iconY = top + 38;
    this.iconAt = { x: left + 20, y: iconY };
    const icon = this.add.image(left + 20, iconY, gearTexture(item.id)).setDisplaySize(36, 36);
    const title = this.add
      .text(left + 46, iconY - 2, gearTitle(item), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.gearText })
      .setOrigin(0, 0.5);
    fitText(title, w - 46, 0);
    const state = this.add
      .text(left + 46, iconY + 16, item.mango ? t().gear.mangoState : '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.gearText,
      })
      .setOrigin(0, 0.5);
    fitText(state, w - 46, 0);
    this.layer.add([icon, title, state]);

    const tint = `#${ORBS[this.orb].color.toString(16).padStart(6, '0')}`;
    const lines = InventoryScene.describe(item).split('\n');
    const room = bottom - (iconY + 36);
    const pitch = Math.max(14, Math.min(20, room / Math.max(1, lines.length)));
    const fontSize = pitch >= 18 ? TEXT.size.small : TEXT.size.hint;
    const changed = [...this.changed];
    lines.forEach((line, index) => {
      const at = changed.indexOf(line);
      const lit = at >= 0;
      if (lit) {
        changed.splice(at, 1);
      }
      const text = this.add
        .text(left, iconY + 36 + index * pitch, line, {
          fontFamily: 'system-ui, sans-serif',
          fontSize,
          color: lit ? tint : COLORS.text,
        })
        .setOrigin(0, 0);
      fitText(text, w, 0);
      this.layer.add(text);
    });
  }

  /** What the last one did, 사용 and 닫기, and the keys. */
  private drawFooter(width: number, height: number): void {
    const copy = t().orbUse;
    const item = this.item;
    const why = !this.usable
      ? orbs.count(this.orb) <= 0
        ? copy.none
        : item && !canTakeOrb(item, gear.value.equipped)
          ? copy.equipped
          : item
            ? copy.useless
            : ''
      : '';
    const noteLine = this.add
      .text(width / 2, height - 92, this.note || why, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: this.note ? `#${ORBS[this.orb].color.toString(16).padStart(6, '0')}` : COLORS.muted,
        align: 'center',
      })
      .setOrigin(0.5);
    fitText(noteLine, width - 16, 0);
    this.layer.add(noteLine);

    this.button(width / 2 - BUTTON_W / 2 - 8, height - 56, copy.use, this.usable, () => this.use(), 'use');
    this.button(width / 2 + BUTTON_W / 2 + 8, height - 56, copy.close, true, () => this.close(), 'close');
    const hint = this.add
      .text(width / 2, height - 18, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5);
    fitText(hint, width, 0);
    this.layer.add(hint);
  }

  private button(x: number, y: number, label: string, live: boolean, onPress: () => void, name: string): void {
    const plate = this.add
      .rectangle(x, y, BUTTON_W, BUTTON_H, COLORS.panel, 1)
      .setStrokeStyle(2, live ? COLORS.panelEdge : COLORS.panel, 1)
      .setInteractive({ useHandCursor: live })
      .setName(name);
    const text = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setAlpha(live ? 1 : 0.4);
    fitText(text, BUTTON_W - 12, 0);
    if (live) {
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    }
    this.layer.add([plate, text]);
  }

  /** The weapon did not survive: the news, what did it, and 확인 back to the 인벤토리. */
  private drawDestroyed(): void {
    const { width, height } = this.scale;
    const copy = t().orbUse;
    const title = this.add
      .text(width / 2, height / 2 - 40, copy.destroyedTitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.accent,
      })
      .setOrigin(0.5);
    fitText(title, width - 32, 0);
    const line = this.add
      .text(width / 2, height / 2 + 6, this.note, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.muted })
      .setOrigin(0.5);
    fitText(line, width - 32, 0);
    this.layer.add([title, line]);
    this.button(width / 2, height / 2 + 62, copy.ok, true, () => this.close(), 'ok');
  }

  /** The 구슬 bursting on the weapon in its own colour, or red and shaking when it is gone. */
  private burst(spec: OrbSpec): void {
    const tint = this.destroyed ? ORB_FX.destroyed : spec.color;
    const at = this.destroyed ? { x: this.scale.width / 2, y: this.scale.height / 2 - 40 } : this.iconAt;
    const glow = this.add
      .image(at.x, at.y, TEXTURES.glow)
      .setDisplaySize(60, 60)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.ui + 5);
    this.tweens.add({
      targets: glow,
      alpha: 0,
      scale: glow.scale * (this.destroyed ? 4 : 2.6),
      duration: ORB_FX.burstMs * 2,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
    if (this.destroyed) {
      this.cameras.main.shake(180, 0.006);
    } else {
      // A blink of sparkles in the 구슬's colour (0.127 — short, a 구슬 is used again and again).
      sparkleBurst(this, { x: at.x, y: at.y, depth: DEPTH.ui + 6 }, tint, true);
    }
  }

  /** ← → between the 구슬, Space or Enter to use (or to leave, once it is gone), Esc out. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      const at = ALL_ORBS.findIndex((spec) => spec.id === this.orb);
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.pick(ALL_ORBS[(at - 1 + ALL_ORBS.length) % ALL_ORBS.length]!.id);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.pick(ALL_ORBS[(at + 1) % ALL_ORBS.length]!.id);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          if (this.destroyed) {
            this.close();
          } else {
            this.use();
          }
          break;
        case 'Escape':
          this.close();
          break;
        default:
          return;
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }
}
