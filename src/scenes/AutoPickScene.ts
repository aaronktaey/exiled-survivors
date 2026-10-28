import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, SKILL_ICONS, TALENT_SHARD_FX, TEXT, TEXTURES, type ShardStat } from '@/config';
import { fill, skillName, t } from '@/i18n';
import { AUTO_PICK_TABS, autoPicks, type AutoPickTab } from '@/systems/AutoPick';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import type { UpgradeId } from '@/systems/Progression';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import type { SkillId } from '@/weapons/skills';

export interface AutoPickSceneData {
  readonly onClose: () => void;
  /** The list to open on. */
  readonly tab?: AutoPickTab;
  /** Opened from a run's pause (0.151): the switches are that run's, and are kept for runs after. */
  readonly run?: { readonly on: (tab: AutoPickTab) => boolean; readonly set: (tab: AutoPickTab, on: boolean) => void };
}

const TABS = AUTO_PICK_TABS;
const TITLE_Y = 34;
const FOOTER = 34;
const ROW = { max: 36, min: 24, gap: 4, width: 460 };
const BUTTON = { h: 34, w: 150 };
const FOCUS_EDGE = 0xf4f1e8;
/** The grip's three bars (0.151): the colour of muted text. */
const GRIP = 0xa9b3c9;

/**
 * 전술 교본 (0.147, the user's design) — the order a run chooses in, list by
 * list: the skills (the run's first, and a 무작위 스킬's cards), the upgrades a
 * level-up offers, the 재능의 파편. The top of each list is taken first among
 * what is offered. Each list is switched on or off here, list by list
 * (0.152), or all at once at 전투 준비 (BoneScene); a run reads them as it
 * starts, and its pause opens this screen on the run's own.
 *
 * A row per entry, its place, its name and ▲ ▼ to move it; the keyboard
 * walks the rows with ↑ ↓ and carries the one it is on with Shift. Each row
 * has a grip (≡) on its left to carry it by, finger or mouse (0.151).
 */
export class AutoPickScene extends Phaser.Scene {
  public static readonly KEY = SCENES.autoPick;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** Which list is shown. Public for tests. */
  public tab: AutoPickTab = 'skills';
  /** Which row of it the keyboard is on. Public for tests. */
  public selected = 0;
  /** Each row's name, top first. Public for tests. */
  public rowNames: Phaser.GameObjects.Text[] = [];
  /** The switch: whether runs use the lists. Public for tests. */
  public toggleLabel!: Phaser.GameObjects.Text;
  /** The row being carried by its grip, while one is. Public for tests. */
  public dragging: number | null = null;
  /** Each row's place on the screen, top first: where a carried row would land. Public for tests. */
  public slots: Phaser.Geom.Rectangle[] = [];
  /** Each row's grip, top first. Public for tests. */
  public grips: Phaser.GameObjects.Rectangle[] = [];

  private payload!: AutoPickSceneData;
  private rowParts: Phaser.GameObjects.GameObject[] = [];
  private rowPlates: Phaser.GameObjects.Rectangle[] = [];
  private tabPlates = new Map<AutoPickTab, Phaser.GameObjects.Rectangle>();
  private tabMarks = new Map<AutoPickTab, Phaser.GameObjects.Arc>();
  private toggle!: Phaser.GameObjects.Rectangle;
  private tabLead!: Phaser.GameObjects.Text;
  private listTop = 0;
  private listBottom = 0;

  public constructor() {
    super(AutoPickScene.KEY);
  }

  public init(data: AutoPickSceneData): void {
    this.payload = data;
    this.tab = data.tab ?? 'skills';
    this.selected = 0;
    this.rowNames = [];
    this.rowParts = [];
    this.rowPlates = [];
    this.tabPlates = new Map();
    this.tabMarks = new Map();
    this.dragging = null;
    this.slots = [];
    this.grips = [];
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().autoPick;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    fitText(this.label(width / 2, TITLE_Y, copy.title, TEXT.size.screen, COLORS.text), width - 220);
    const lead = this.add
      .text(width / 2, TITLE_Y + 22, copy.lead, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: Math.min(width - 32, 640) },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    // The switch, then the three lists' tabs.
    let y = lead.y + lead.height + 10 + BUTTON.h / 2;
    const toggleW = Math.min(300, width - 32);
    this.toggle = this.plate(width / 2, y, toggleW, BUTTON.h, COLORS.panelEdge);
    this.toggle.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.flip());
    this.toggleLabel = this.label(width / 2, y, '', TEXT.size.body, COLORS.text).setDepth(DEPTH.ui + 2);
    y += BUTTON.h / 2 + 8 + BUTTON.h / 2;

    const tabW = Math.min(BUTTON.w, (width - 32 - 2 * 8) / 3);
    TABS.forEach((tab, index) => {
      const x = width / 2 + (index - 1) * (tabW + 8);
      const plate = this.plate(x, y, tabW, BUTTON.h, COLORS.panelEdge);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openTab(tab));
      fitText(this.label(x, y, copy.tabs[tab], TEXT.size.body, COLORS.text).setDepth(DEPTH.ui + 2), tabW - 10, 0);
      this.tabPlates.set(tab, plate);
      this.tabMarks.set(tab, this.add.circle(x - tabW / 2 + 12, y, 5, COLORS.panelEdge).setDepth(DEPTH.ui + 2));
    });
    y += BUTTON.h / 2 + 8;
    this.tabLead = this.label(width / 2, y + 9, '', TEXT.size.hint, COLORS.muted);
    this.listTop = y + 24;

    // 기본 순서로 and the hint at the foot.
    const resetY = height - FOOTER - BUTTON.h / 2 - 6;
    const reset = this.plate(width / 2, resetY, Math.min(BUTTON.w + 30, width - 32), BUTTON.h, COLORS.panelEdge);
    reset.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.resetTab());
    this.label(width / 2, resetY, copy.reset, TEXT.size.body, COLORS.text).setDepth(DEPTH.ui + 2);
    this.listBottom = resetY - BUTTON.h / 2 - 8;
    fitText(
      this.label(width / 2, height - FOOTER / 2, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, TEXT.size.hint, COLORS.muted),
      width - 16,
    );

    this.armKeys();
    // A row carried by its grip follows the pointer from slot to slot, and is
    // put down where it is let go.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.carry(pointer));
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.putDown());
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, () => this.putDown());
    this.drawList();
  }

  private carry(pointer: Phaser.Input.Pointer): void {
    if (this.dragging === null || !pointer.isDown) {
      return;
    }
    const to = this.slots.findIndex((slot) => slot.contains(pointer.x, pointer.y));
    if (to < 0 || to === this.dragging) {
      return;
    }
    if (autoPicks.move(this.tab, this.dragging, to - this.dragging)) {
      this.dragging = to;
      this.selected = to;
      this.drawList();
    }
  }

  private putDown(): void {
    if (this.dragging !== null) {
      this.dragging = null;
      this.drawList();
    }
  }

  /** Shows another list. Public so a test can switch. */
  public openTab(tab: AutoPickTab): void {
    this.tab = tab;
    this.selected = 0;
    this.drawList();
  }

  /** Moves the selected entry by `by` places, the selection with it. Public for tests. */
  public moveSelected(by: number): void {
    if (autoPicks.move(this.tab, this.selected, by)) {
      this.selected += by;
      this.drawList();
    }
  }

  /** The shown list back in its first order. Public for tests. */
  public resetTab(): void {
    autoPicks.reset(this.tab);
    this.selected = 0;
    this.drawList();
  }

  /** Whether the list `tab` chooses for the player — the run's, opened from its pause. */
  private isOn(tab: AutoPickTab): boolean {
    return this.payload.run ? this.payload.run.on(tab) : autoPicks.isOn(tab);
  }

  /** Switches the shown list choosing by itself on or off (0.152: each list its own). Public for tests. */
  public flip(): void {
    const on = !this.isOn(this.tab);
    if (this.payload.run) {
      this.payload.run.set(this.tab, on);
    } else {
      autoPicks.setOn(this.tab, on);
    }
    this.drawList();
  }

  private close(): void {
    this.scene.stop();
    this.payload.onClose();
  }

  private label(x: number, y: number, value: string, size: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
  }

  private plate(x: number, y: number, w: number, h: number, edge: number): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(x, y, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, edge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
  }

  /** What one entry is called, and the picture beside it. */
  private entry(id: string): { name: string; icon?: string; tint?: number } {
    const copy = t().autoPick;
    if (this.tab === 'skills') {
      return { name: skillName(id as SkillId), icon: SKILL_ICONS[id]?.key };
    }
    if (this.tab === 'shards') {
      return { name: t().shard.stats[id as ShardStat], icon: TEXTURES.talentShard, tint: TALENT_SHARD_FX.tint[id as ShardStat] };
    }
    return { name: copy.upgrades[id as UpgradeId] };
  }

  /** The switch, the tabs and the shown list, as they now stand. */
  private drawList(): void {
    const copy = t().autoPick;
    const { width } = this.scale;
    const on = this.isOn(this.tab);
    this.toggleLabel.setText(fill(copy.toggle, { list: copy.tabs[this.tab], state: on ? copy.on : copy.off }));
    this.toggle.setStrokeStyle(2, on ? COLORS.accentFill : COLORS.panelEdge, 1);
    this.toggleLabel.setColor(on ? COLORS.text : COLORS.muted);
    // Each tab says whether its list is on, a mark in the switch's colour.
    this.tabPlates.forEach((plate, tab) =>
      plate.setFillStyle(tab === this.tab ? COLORS.panelActive : COLORS.panel, 1).setStrokeStyle(2, tab === this.tab ? FOCUS_EDGE : COLORS.panelEdge, 1),
    );
    this.tabMarks.forEach((mark, tab) => mark.setFillStyle(this.isOn(tab) ? COLORS.accentFill : COLORS.panelEdge, 1));
    this.tabLead.setText(copy.tabLeads[this.tab]);
    fitText(this.tabLead.setScale(1), width - 24);

    this.rowParts.forEach((part) => part.destroy());
    this.rowParts = [];
    this.rowPlates = [];
    this.rowNames = [];
    this.slots = [];
    this.grips = [];
    const order = autoPicks.value[this.tab] as readonly string[];
    // One column while the rows fit at their smallest; two side by side when not (lying down, the 강화 list).
    const room = this.listBottom - this.listTop;
    const columns = order.length * (ROW.min + ROW.gap) <= room ? 1 : 2;
    const perColumn = Math.ceil(order.length / columns);
    const rowH = Math.max(ROW.min, Math.min(ROW.max, Math.floor(room / perColumn) - ROW.gap));
    const rowW = Math.min(ROW.width, (width - 32 - (columns - 1) * 12) / columns);
    const arrowW = Math.min(44, rowH + 8);
    const gripW = Math.min(30, rowH + 4);
    order.forEach((id, index) => {
      const column = Math.floor(index / perColumn);
      const left = width / 2 - (columns * rowW + (columns - 1) * 12) / 2 + column * (rowW + 12);
      const y = this.listTop + (index % perColumn) * (rowH + ROW.gap) + rowH / 2;
      const selected = index === this.selected;
      const carried = index === this.dragging;
      this.slots.push(new Phaser.Geom.Rectangle(left, y - (rowH + ROW.gap) / 2, rowW, rowH + ROW.gap));
      const plate = this.add
        .rectangle(left + rowW / 2, y, rowW, rowH, selected ? COLORS.panelActive : COLORS.panel, 1)
        .setStrokeStyle(selected ? 2 : 1, carried ? COLORS.accentFill : selected ? FOCUS_EDGE : COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setData('flat', true)
        .setInteractive({ useHandCursor: true });
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.selected = index;
        this.drawList();
      });
      const { name, icon, tint } = this.entry(id);
      // The grip: three bars, pressed to carry the row (0.151, the user's ask).
      const grip = this.add
        .rectangle(left + gripW / 2 + 2, y, gripW, rowH - 4, COLORS.panel, carried ? 1 : 0.01)
        .setDepth(DEPTH.ui + 2)
        .setData('flat', true)
        .setInteractive({ useHandCursor: true });
      grip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event?.stopPropagation?.();
        this.selected = index;
        this.dragging = index;
        this.drawList();
      });
      const bars = this.add.graphics().setDepth(DEPTH.ui + 3);
      bars.fillStyle(carried ? COLORS.accentFill : GRIP, 1);
      for (const dy of [-5, 0, 5]) {
        bars.fillRect(left + gripW / 2 + 2 - 7, y + dy - 1, 14, 2);
      }
      this.grips.push(grip);
      const rankX = left + gripW + 14;
      const rank = this.label(rankX, y, String(index + 1), TEXT.size.body, index === 0 ? COLORS.gearText : COLORS.muted).setDepth(DEPTH.ui + 2);
      const parts: Phaser.GameObjects.GameObject[] = [plate, grip, bars, rank];
      let textX = rankX + 20;
      if (icon && this.textures.exists(icon)) {
        const image = this.add.image(textX + (rowH - 8) / 2, y, icon).setDisplaySize(rowH - 8, rowH - 8).setDepth(DEPTH.ui + 2);
        if (tint !== undefined) {
          image.setTint(tint);
        }
        parts.push(image);
        textX += rowH;
      }
      const label = this.add
        .text(textX, y, name, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 2);
      fitText(label, rowW - (textX - left) - arrowW * 2 - 12, 0);
      parts.push(label);
      this.rowNames.push(label);
      // ▲ ▼: move this one up or down.
      ([[-1, '▲'], [1, '▼']] as const).forEach(([by, mark], k) => {
        const x = left + rowW - arrowW * (2 - k) + arrowW / 2 - 2;
        const can = by < 0 ? index > 0 : index < order.length - 1;
        const button = this.add
          .rectangle(x, y, arrowW - 6, rowH - 6, COLORS.panel, 1)
          .setStrokeStyle(1, COLORS.panelEdge, 1)
          .setDepth(DEPTH.ui + 2)
          .setAlpha(can ? 1 : 0.35)
          .setInteractive({ useHandCursor: true });
        button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
          event?.stopPropagation?.();
          this.selected = index;
          this.moveSelected(by);
        });
        parts.push(button, this.label(x, y, mark, TEXT.size.hint, can ? COLORS.text : COLORS.muted).setDepth(DEPTH.ui + 3));
      });
      this.rowPlates.push(plate);
      this.rowParts.push(...parts);
    });
  }

  /** ↑ ↓ rows, Shift+↑ ↓ carries the row, Tab / Q / E lists, Space the switch, R 기본 순서로, Esc back. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      const count = (autoPicks.value[this.tab] as readonly string[]).length;
      const step = (by: number) => {
        if (event.shiftKey) {
          this.moveSelected(by);
        } else {
          this.selected = Phaser.Math.Clamp(this.selected + by, 0, count - 1);
          this.drawList();
        }
      };
      const tabBy = (by: number) => this.openTab(TABS[Phaser.Math.Wrap(TABS.indexOf(this.tab) + by, 0, TABS.length)]!);
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          step(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          step(1);
          break;
        case 'Tab':
          tabBy(event.shiftKey ? -1 : 1);
          break;
        case 'KeyQ':
        case 'ArrowLeft':
          tabBy(-1);
          break;
        case 'KeyE':
        case 'ArrowRight':
          tabBy(1);
          break;
        case 'Space':
        case 'Enter':
          this.flip();
          break;
        case 'KeyR':
          this.resetTab();
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
