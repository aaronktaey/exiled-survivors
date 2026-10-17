import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { cloudSave, summarize, type SaveData } from '@/systems/CloudSave';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';

export interface ConflictSceneData {
  readonly onClose: () => void;
}

type Side = 'local' | 'server';

const CARD_WIDTH = 230;
const CARD_HEIGHT = 176;
const BUTTON_W = 200;
const BUTTON_H = 38;

/** One side's records, as a card that can be picked. */
interface SideCard {
  readonly side: Side;
  readonly plate: Phaser.GameObjects.Rectangle;
}

/**
 * 어느 기록을 쓸까요 — this browser and the account each hold records, and
 * they differ. Both are read out side by side, swords to saved run, and the
 * player keeps one by pressing its card — then says so once more on a
 * popup that spells out what is lost, since the other side is gone for
 * good. Putting it off leaves syncing paused until it is answered.
 */
export class ConflictScene extends Phaser.Scene {
  public static readonly KEY = SCENES.conflict;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** The two read-outs, and the name over each. Public for tests. */
  public cards: Phaser.GameObjects.Text[] = [];
  public headings: Phaser.GameObjects.Text[] = [];
  /** The side the popup is asking about, or null while it is closed. Public for tests. */
  public asking: Side | null = null;
  /** The popup, while it is open. Public for tests. */
  public popup?: Phaser.GameObjects.Container;

  private payload!: ConflictSceneData;
  private sides: SideCard[] = [];
  /** The card (0, 1) or 나중에 (2) the keyboard is on. */
  private focused = 0;
  private laterPlate?: Phaser.GameObjects.Rectangle;

  public constructor() {
    super(ConflictScene.KEY);
  }

  public init(data: ConflictSceneData): void {
    this.payload = data;
    this.cards = [];
    this.headings = [];
    this.sides = [];
    this.asking = null;
    this.popup = undefined;
    this.focused = 0;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => (this.asking ? this.cancel() : this.close()));
    const { width, height } = this.scale;
    const copy = t().conflict;
    const conflict = cloudSave.conflict;
    const side = width >= CARD_WIDTH * 2 + 60;
    const cardsHeight = side ? CARD_HEIGHT : CARD_HEIGHT * 2 + 12;
    const top = centredTop(height, MENU.titleBlockHeight + 84 + cardsHeight + 24 + BUTTON_H);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    fitText(
      this.add
        .text(width / 2, top + 16, copy.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.screen,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );
    this.add
      .text(width / 2, top + MENU.titleBlockHeight + 20, `${copy.lead}\n${copy.pick}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: fitWidth(560, width) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const cardsTop = top + MENU.titleBlockHeight + 84;
    const at = (index: number): { x: number; y: number } =>
      side
        ? { x: width / 2 + (index === 0 ? -1 : 1) * (CARD_WIDTH / 2 + 10), y: cardsTop + CARD_HEIGHT / 2 }
        : { x: width / 2, y: cardsTop + CARD_HEIGHT / 2 + index * (CARD_HEIGHT + 12) };
    this.card(at(0), 'local', copy.device, conflict?.local ?? {});
    this.card(at(1), 'server', copy.cloud, conflict?.server ?? {});

    // Only putting it off is a button; keeping a side is its card.
    const laterY = cardsTop + cardsHeight + 24 + BUTTON_H / 2;
    this.laterPlate = this.button(width / 2, laterY, copy.later, () => this.close(), DEPTH.ui + 1).plate;
    this.laterPlate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(2));

    this.armKeys();
    this.focus(0);
  }

  /** Opens the popup that asks once more about keeping this side. Public so a test can. */
  public ask(which: Side): void {
    if (this.asking) {
      return;
    }
    this.asking = which;
    const { width, height } = this.scale;
    const copy = t().conflict;
    const panelW = Math.min(440, width - 32);
    const panelH = 220;
    const layer = this.add.container(0, 0).setDepth(DEPTH.ui + 10);
    // In the way of everything under it.
    const dim = this.add.rectangle(0, 0, width, height, 0x05070b, 0.7).setOrigin(0, 0).setInteractive();
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.gear, 1);
    const title = this.add
      .text(width / 2, height / 2 - 70, which === 'local' ? copy.askDevice : copy.askCloud, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.gearText,
      })
      .setOrigin(0.5);
    fitText(title, panelW - 24, 0);
    const body = this.add
      .text(width / 2, height / 2 - 18, which === 'local' ? copy.askDeviceBody : copy.askCloudBody, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.text,
        align: 'center',
        wordWrap: { width: panelW - 40 },
      })
      .setOrigin(0.5);
    layer.add([dim, panel, title, body]);
    const half = Math.min(BUTTON_W, (panelW - 48) / 2) / 2 + 6;
    const yes = this.button(width / 2 - half, height / 2 + 62, which === 'local' ? copy.useDevice : copy.useCloud, () => void this.confirm(), 0, Math.min(BUTTON_W, (panelW - 48) / 2));
    const no = this.button(width / 2 + half, height / 2 + 62, copy.cancel, () => this.cancel(), 0, Math.min(BUTTON_W, (panelW - 48) / 2));
    yes.plate.setStrokeStyle(2, COLORS.accentFill, 1);
    layer.add([yes.plate, yes.label, no.plate, no.label]);
    this.popup = layer;
  }

  /** Keeps the side being asked about. Public so a test can. */
  public async confirm(): Promise<void> {
    const which = this.asking;
    if (!which) {
      return;
    }
    await cloudSave.resolve(which);
    // Keeping the account's reloads the page; keeping this device's goes on.
    this.close();
  }

  /** Closes the popup, keeping nothing. Public so a test can. */
  public cancel(): void {
    this.asking = null;
    this.popup?.destroy();
    this.popup = undefined;
  }

  /** One side's records, read out on a bordered card that is pressed to keep them. */
  private card(at: { x: number; y: number }, which: Side, heading: string, data: SaveData): void {
    const copy = t().conflict;
    const s = summarize(data);
    const plate = this.add
      .rectangle(at.x, at.y, CARD_WIDTH, CARD_HEIGHT, COLORS.panel, 0.92)
      .setStrokeStyle(2, COLORS.gear, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const index = this.sides.length;
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.ask(which));
    this.sides.push({ side: which, plate });
    const title = this.add
      .text(at.x, at.y - CARD_HEIGHT / 2 + 20, heading, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    this.headings.push(title);
    const text = this.add
      .text(
        at.x,
        at.y + 14,
        [
          fill(copy.swords, { n: s.swords }),
          fill(copy.passives, { n: s.passiveRanks, points: s.points }),
          fill(copy.orbs, { n: s.orbs }),
          fill(copy.bones, { n: s.bones }),
          s.savedRun ? copy.savedRun : copy.noSavedRun,
        ].join('\n'),
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.text,
          align: 'center',
          lineSpacing: 4,
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    this.cards.push(text);
  }

  private button(
    x: number,
    y: number,
    label: string,
    onPress: () => void,
    depth: number,
    w = BUTTON_W,
  ): { plate: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
    const plate = this.add
      .rectangle(x, y, w, BUTTON_H, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(depth + 1);
    fitText(text, w - 12, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { plate, label: text };
  }

  /** Lights the card (or 나중에) the keyboard or the mouse is on. */
  private focus(index: number): void {
    this.focused = index;
    this.sides.forEach((card, i) => {
      card.plate.setStrokeStyle(i === index ? 3 : 2, i === index ? COLORS.textFill : COLORS.gear, 1);
      card.plate.setFillStyle(i === index ? COLORS.panelActive : COLORS.panel, 0.92);
    });
    this.laterPlate?.setStrokeStyle(index === 2 ? 3 : 2, index === 2 ? COLORS.textFill : COLORS.panelEdge, 1);
  }

  /** Arrows between the two cards and 나중에, Space to press, Esc out — and, on the popup, Space to keep, Esc to back off. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (this.asking) {
        if (event.code === 'Escape') {
          this.cancel();
        } else if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
          void this.confirm();
        } else {
          return;
        }
        event.preventDefault?.();
        return;
      }
      switch (event.code) {
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'KeyA':
        case 'KeyW':
          this.focus((this.focused + 2) % 3);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
        case 'KeyD':
        case 'KeyS':
          this.focus((this.focused + 1) % 3);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter': {
          const card = this.sides[this.focused];
          if (card) {
            this.ask(card.side);
          } else {
            this.close();
          }
          break;
        }
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

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
