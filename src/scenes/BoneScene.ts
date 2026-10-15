import Phaser from 'phaser';

import {
  ALL_BONES,
  BONE_RUN,
  COLORS,
  DEPTH,
  MENU,
  SCENES,
  SCRIM,
  TEXT,
  boneBonusFor,
  type BoneId,
} from '@/config';
import { boneDetail, boneName, boneShort, fill, t } from '@/i18n';
import { bones } from '@/systems/Bones';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export interface BoneSceneData {
  /** Starts the run with these, having spent them. */
  readonly onStart: (applied: readonly BoneId[]) => void;
  readonly onCancel: () => void;
}

/** A slot with nothing in it yet. */
const EMPTY_SLOT = '─'.repeat(18);
/** Roughly what one line of the read-out costs, for budgeting the layout. */
const LINE_HEIGHT = 24;
const FOOTER = 56;
const COLUMNS_FROM = 760;

/**
 * 뼈다귀 — what this run is going to be, decided before it starts.
 *
 * Everything else the survivor carries is permanent and the choice is
 * therefore easy: carry the better sword. A 뼈다귀 is spent, so the choice
 * is a real one — a 갈비뼈 doubles what every enemy can take, and whether
 * that is worth half again the drops depends on the run you think you are
 * about to have. Three slots, and what goes in them is read out in full
 * before anything is spent.
 */
export class BoneScene extends Phaser.Scene {
  public static readonly KEY = SCENES.bones;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: BoneSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  /** The three slots, and what the lot of them adds up to. Public for tests. */
  public slots!: Phaser.GameObjects.Text;
  public summary!: Phaser.GameObjects.Text;
  /** What has been put in the slots, in the order it went in. */
  public applied: BoneId[] = [];

  public constructor() {
    super(BoneScene.KEY);
  }

  /**
   * The step before every fresh run — from 게임 시작 and from 다시하기 alike.
   * Opens this screen over `host`, which waits paused underneath; with an
   * empty drawer the screen would be a page of nothing between the button
   * and the game, so it goes straight on with no 뼈다귀.
   *
   * `onStart` gets what was spent; `onCancel` runs once this screen is gone
   * and `host` is running again.
   */
  public static before(
    host: Phaser.Scene,
    onStart: (applied: readonly BoneId[]) => void,
    onCancel: () => void,
  ): void {
    if (bones.total === 0) {
      onStart([]);
      return;
    }

    host.scene.pause();
    host.scene.bringToTop(SCENES.bones);
    host.scene.launch(SCENES.bones, {
      onStart: (applied: readonly BoneId[]) => {
        host.scene.resume();
        onStart(applied);
      },
      onCancel: () => {
        host.scene.stop(SCENES.bones);
        host.scene.resume();
        onCancel();
      },
    } satisfies BoneSceneData);
  }

  public init(data: BoneSceneData): void {
    this.payload = data;
    // The scene instance outlives a launch; last run's picks are not this
    // run's, and they were never spent.
    this.applied = [];
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.payload.onCancel());
    const { width, height } = this.scale;
    const copy = t().bones;
    const held = ALL_BONES.filter((bone) => bones.count(bone.id) > 0);

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // The read-out is a fixed height: the slots are drawn whether or not
    // anything is in them, which is how the screen says how many there are.
    const step = MENU.buttonHeight + MENU.buttonGap;
    const linesHeight = (BONE_RUN.maxApplied + 3) * LINE_HEIGHT;
    const sideBySide = width > height && width >= COLUMNS_FROM;
    const headRoom = height < 480 ? 44 : 64;
    const bodyRoom = height - 24 - MENU.titleBlockHeight - headRoom - FOOTER;
    const listRoom = sideBySide ? bodyRoom : bodyRoom - 24 - linesHeight;
    const rows = Phaser.Math.Clamp(
      Math.floor((listRoom + MENU.buttonGap) / step),
      2,
      held.length + 3,
    );
    const listHeight = rows * step - MENU.buttonGap;
    const bodyHeight = sideBySide
      ? Math.max(listHeight, linesHeight)
      : listHeight + 24 + linesHeight;
    const top = centredTop(height, MENU.titleBlockHeight + headRoom + bodyHeight);

    this.add
      .text(width / 2, top + 16, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.add
      .text(width / 2, top + MENU.titleBlockHeight + headRoom / 2 - 24, copy.lead, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
        wordWrap: { width: fitWidth(620, width) },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const listTop = top + MENU.titleBlockHeight + headRoom;
    this.menu = new MenuList(this, {
      x: sideBySide ? Math.round(width * 0.28) : width / 2,
      y: listTop + MENU.buttonHeight / 2,
      width: sideBySide ? Math.round(width * 0.44) : undefined,
      maxVisible: rows,
      onCancel: () => this.payload.onCancel(),
      items: [
        ...held.map((bone) => ({
          id: bone.id,
          label: () =>
            fill(t().bones.held, {
              bone: boneName(bone.id),
              count: bones.count(bone.id) - this.used(bone.id),
            }),
          detail: () => {
            const used = this.used(bone.id);
            return used > 0 ? fill(t().bones.inUse, { count: used }) : '';
          },
          enabled: () => bones.canApply(bone.id, this.applied),
          onSelect: () => this.apply(bone.id),
        })),
        {
          id: 'clear',
          label: () => t().bones.clear,
          enabled: () => this.applied.length > 0,
          onSelect: () => this.clear(),
        },
        { id: 'start', label: () => t().bones.start, onSelect: () => this.start() },
        { id: 'back', label: () => t().common.back, onSelect: () => this.payload.onCancel() },
      ],
    });

    const columnX = sideBySide ? Math.round(width * 0.72) : width / 2;
    const columnWidth = sideBySide ? Math.round(width * 0.44) : fitWidth(560, width);
    const linesY = sideBySide ? listTop : listTop + listHeight + 24;

    this.slots = this.add
      .text(columnX, linesY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
        align: 'left',
        lineSpacing: 5,
        wordWrap: { width: columnWidth },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    this.summary = this.add
      .text(columnX, linesY + (BONE_RUN.maxApplied + 2) * LINE_HEIGHT, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.gearText,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: columnWidth },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    fitText(
      this.add
        .text(
          width / 2,
          height - 28,
          prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard,
          { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted },
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.refresh();
  }

  /** How many of one 뼈다귀 are already in the slots. */
  private used(id: BoneId): number {
    return this.applied.filter((one) => one === id).length;
  }

  /** Puts one in a slot, if the run can still take it. */
  private apply(id: BoneId): void {
    if (!bones.canApply(id, this.applied)) {
      return;
    }

    this.applied.push(id);
    this.refresh();
  }

  /** Empties the slots. Nothing has been spent, so nothing is lost. */
  private clear(): void {
    this.applied = [];
    this.refresh();
  }

  /**
   * Spends what is in the slots and hands the run what was actually taken —
   * the store trims rather than refuses, so the two can never disagree.
   */
  private start(): void {
    const spent = bones.spend(this.applied);
    this.scene.stop();
    this.payload.onStart(spent);
  }

  private refresh(): void {
    const copy = t().bones;
    const rows = this.applied.map(
      (id) => `${boneShort(id)}   ${boneDetail(id)}`,
    );
    while (rows.length < BONE_RUN.maxApplied) {
      rows.push(EMPTY_SLOT);
    }

    this.slots.setText([copy.slots, ...rows].join('\n'));

    // What the lot of them comes to, which is not what any one of them says:
    // two 갈비뼈 are four times the health, not twice.
    const bonus = boneBonusFor(this.applied);
    const parts: string[] = [];
    if (bonus.enemyHpScale !== 1) {
      parts.push(fill(copy.sumHp, { percent: Math.round((bonus.enemyHpScale - 1) * 100) }));
    }
    if (bonus.dropScale !== 1) {
      parts.push(fill(copy.sumDrop, { percent: Math.round((bonus.dropScale - 1) * 100) }));
    }
    if (bonus.raresBecomeBosses) {
      parts.push(copy.sumBosses);
    }

    this.summary.setText(parts.length > 0 ? `${copy.total}  ${parts.join('   ')}` : copy.none);
    this.menu.refresh();
  }
}
