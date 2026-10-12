import Phaser from 'phaser';

import { COLORS, DEPTH, INFO, SCENES } from '@/config';
import { guideChapters, type GuideChapter, type GuideSection } from '@/content/guide';
import { PATCH_NOTES } from '@/content/patchNotes';
import { language, t } from '@/i18n';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export type InfoTopic = 'patch' | 'guide';

export interface InfoSceneData {
  readonly topic: InfoTopic;
  readonly onClose: () => void;
}

const title = (topic: InfoTopic): string =>
  topic === 'patch' ? t().info.patchTitle : t().info.guideTitle;

/** 패치노트, as the one chapter it is. */
function patchChapter(): GuideChapter {
  return {
    id: 'patch',
    title: t().info.patchTitle,
    sections: PATCH_NOTES.map((note) => ({
      heading: `v${note.version}   ${note.date}`,
      // Korean is the fallback: an entry always has it, a new language may
      // not have caught up with the newest note yet.
      lines: (note.changes[language()] ?? note.changes.ko).map((change) => `· ${change}`),
    })),
  };
}

/**
 * The reading screen: 게임 가이드 and 패치노트.
 *
 * The guide is long enough that one scroll was a poor way through it, so it
 * has a contents list down the side — up and down pick a chapter, and the
 * page beside it changes. The notes are a single chapter and simply scroll.
 */
export class InfoScene extends Phaser.Scene {
  public static readonly KEY = SCENES.info;

  private payload!: InfoSceneData;
  private chapters: readonly GuideChapter[] = [];
  private tocEntries: Phaser.GameObjects.Text[] = [];
  private page!: Phaser.GameObjects.Container;
  private bar?: Phaser.GameObjects.Rectangle;
  private barTrack?: Phaser.GameObjects.Rectangle;

  private chapter = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private viewTop = 0;
  private viewHeight = 0;
  private contentLeft = 0;
  private contentWidth = 0;
  /** Where a drag started, in screen px, or null when nothing is held. */
  private dragFrom: { pointerY: number; scrollY: number } | null = null;

  public constructor() {
    super(InfoScene.KEY);
  }

  public init(data: InfoSceneData): void {
    this.payload = data;
    this.chapter = 0;
    this.scrollY = 0;
    // The scene instance outlives a launch: last time's entries are already
    // destroyed, and 패치노트 has no contents list to replace them with.
    this.tocEntries = [];
  }

  public create(): void {
    const { width, height } = this.scale;
    this.chapters = this.payload.topic === 'patch' ? [patchChapter()] : guideChapters();

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.97).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, INFO.titleY, title(this.payload.topic), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.viewTop = INFO.contentTop;
    this.viewHeight = height - INFO.contentTop - INFO.contentBottom;

    const hasContents = this.chapters.length > 1;
    if (hasContents) {
      // Contents down the left, the chapter beside it.
      this.contentLeft = (width - INFO.contentWidth) / 2 + INFO.tocWidth / 2;
      this.contentWidth = INFO.contentWidth - INFO.tocWidth;
      this.buildContents((width - INFO.contentWidth) / 2);
    } else {
      this.contentLeft = (width - INFO.contentWidth) / 2;
      this.contentWidth = INFO.contentWidth;
    }

    this.page = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    const shape = this.make.graphics({}, false);
    shape.fillRect(0, this.viewTop, width, this.viewHeight);
    this.page.setMask(shape.createGeometryMask());

    this.buildCloseButton(width);
    this.add
      .text(
        width / 2,
        height - 24,
        prefersTouchControls() ? t().info.hintTouch : t().info.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.armInput();
    this.showChapter(0);
  }

  /** The contents list: one line per chapter, the current one lit. */
  private buildContents(left: number): void {
    this.tocEntries = this.chapters.map((entry, index) => {
      const text = this.add
        .text(left, this.viewTop + index * INFO.tocLineHeight, entry.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: INFO.headingSize,
          color: COLORS.muted,
        })
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });

      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.showChapter(index));
      return text;
    });
  }

  /** Lays a chapter out and puts the page back to the top. */
  private showChapter(index: number): void {
    this.chapter = Phaser.Math.Wrap(index, 0, this.chapters.length);
    this.scrollY = 0;

    this.page.removeAll(true);
    const height = this.layout(this.chapters[this.chapter]?.sections ?? []);
    this.maxScroll = Math.max(0, height - this.viewHeight);

    this.tocEntries.forEach((entry, i) => {
      const active = i === this.chapter;
      entry.setColor(active ? COLORS.accent : COLORS.muted);
      entry.setAlpha(active ? 1 : 0.75);
    });

    this.buildScrollbar();
    this.applyScroll();
  }

  /** Stacks the sections into the page; returns how tall it came out. */
  private layout(sections: readonly GuideSection[]): number {
    let y = this.viewTop;

    sections.forEach((section, index) => {
      if (index > 0) {
        y += INFO.sectionGap;
      }

      const heading = this.add.text(this.contentLeft, y, section.heading, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.headingSize,
        color: COLORS.accent,
      });
      this.page.add(heading);
      y += heading.height + INFO.headingGap;

      const body = this.add.text(this.contentLeft, y, [...section.lines], {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.lineSize,
        color: COLORS.text,
        lineSpacing: INFO.lineSpacing,
        wordWrap: { width: this.contentWidth },
      });
      this.page.add(body);
      y += body.height;
    });

    return y - this.viewTop;
  }

  private buildScrollbar(): void {
    this.bar?.destroy();
    this.barTrack?.destroy();
    this.bar = undefined;
    this.barTrack = undefined;

    if (this.maxScroll <= 0) {
      return;
    }

    const x = this.contentLeft + this.contentWidth + 16;
    this.barTrack = this.add
      .rectangle(x, this.viewTop, 3, this.viewHeight, COLORS.panelEdge, 1)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    const thumbHeight = Math.max(
      24,
      this.viewHeight * (this.viewHeight / (this.viewHeight + this.maxScroll)),
    );
    this.bar = this.add
      .rectangle(x, this.viewTop, 3, thumbHeight, COLORS.accentFill, 1)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 2);
  }

  /** A tappable 닫기, for touch screens with no Esc key. */
  private buildCloseButton(width: number): void {
    const x = (width + INFO.contentWidth) / 2 - 10;
    const button = this.add
      .rectangle(x, INFO.titleY, 64, 28, COLORS.panelActive, 0.55)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, INFO.titleY, t().common.close, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);

    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.close());
  }

  private armInput(): void {
    this.input.keyboard?.on('keydown', this.onKeyDown, this);

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.scrollBy(dy),
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragFrom = { pointerY: pointer.y, scrollY: this.scrollY };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !pointer.isDown) {
        return;
      }
      // Drag down to pull the page down, as a touch screen expects.
      this.scrollTo(this.dragFrom.scrollY - (pointer.y - this.dragFrom.pointerY));
    });
    const release = (): void => {
      this.dragFrom = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const chaptered = this.chapters.length > 1;

    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        // With a contents list the arrows walk it; without one they scroll.
        if (chaptered) {
          this.showChapter(this.chapter - 1);
        } else {
          this.scrollBy(-INFO.keyStep);
        }
        break;
      case 'ArrowDown':
      case 'KeyS':
        if (chaptered) {
          this.showChapter(this.chapter + 1);
        } else {
          this.scrollBy(INFO.keyStep);
        }
        break;
      case 'PageUp':
        this.scrollBy(-this.viewHeight);
        break;
      case 'PageDown':
      case 'Space':
        this.scrollBy(this.viewHeight);
        break;
      case 'Home':
        this.scrollTo(0);
        break;
      case 'End':
        this.scrollTo(this.maxScroll);
        break;
      case 'Escape':
      case 'Enter':
        this.close();
        break;
      default:
        break;
    }
  }

  private scrollBy(amount: number): void {
    this.scrollTo(this.scrollY + amount);
  }

  private scrollTo(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.applyScroll();
  }

  private applyScroll(): void {
    this.page.setY(-this.scrollY);

    if (this.bar) {
      const travel = this.viewHeight - this.bar.height;
      const ratio = this.maxScroll === 0 ? 0 : this.scrollY / this.maxScroll;
      this.bar.setY(this.viewTop + travel * ratio);
    }
  }

  private close(): void {
    this.input.keyboard?.off('keydown', this.onKeyDown, this);
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
