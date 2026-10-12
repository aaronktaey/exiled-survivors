import Phaser from 'phaser';

import { COLORS, DEPTH, INFO, SCENES } from '@/config';
import type { GuideSection } from '@/content/guide';
import { guideSections } from '@/content/guide';
import { PATCH_NOTES } from '@/content/patchNotes';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export type InfoTopic = 'patch' | 'guide';

export interface InfoSceneData {
  readonly topic: InfoTopic;
  readonly onClose: () => void;
}

const TITLES: Record<InfoTopic, string> = {
  patch: '패치노트',
  guide: '게임 가이드',
};

/** 패치노트, as the same shape the guide uses. */
function patchSections(): readonly GuideSection[] {
  return PATCH_NOTES.map((note) => ({
    heading: `v${note.version}   ${note.date}`,
    lines: note.changes.map((change) => `· ${change}`),
  }));
}

/**
 * The reading screen: 패치노트 and 게임 가이드, both long enough to need
 * scrolling. Opened from the title and from the pause menu, over whichever
 * of them called it.
 *
 * Everything scrolls together inside a container with a rectangular mask —
 * the wheel, the arrow keys, or a drag all move the same offset.
 */
export class InfoScene extends Phaser.Scene {
  public static readonly KEY = SCENES.info;

  private payload!: InfoSceneData;
  private page!: Phaser.GameObjects.Container;
  private bar!: Phaser.GameObjects.Rectangle;

  private scrollY = 0;
  private maxScroll = 0;
  private viewTop = 0;
  private viewHeight = 0;
  /** Where a drag started, in screen px, or null when nothing is held. */
  private dragFrom: { pointerY: number; scrollY: number } | null = null;

  public constructor() {
    super(InfoScene.KEY);
  }

  public init(data: InfoSceneData): void {
    this.payload = data;
    this.scrollY = 0;
  }

  public create(): void {
    const { width, height } = this.scale;
    const sections = this.payload.topic === 'patch' ? patchSections() : guideSections();

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.95).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, INFO.titleY, TITLES[this.payload.topic], {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.viewTop = INFO.contentTop;
    this.viewHeight = height - INFO.contentTop - INFO.contentBottom;

    this.page = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    const contentHeight = this.layout(sections, width);
    this.maxScroll = Math.max(0, contentHeight - this.viewHeight);

    // Clip the page to the window it scrolls behind.
    const shape = this.make.graphics({}, false);
    shape.fillRect(0, this.viewTop, width, this.viewHeight);
    this.page.setMask(shape.createGeometryMask());

    this.buildScrollbar(width);
    this.buildCloseButton(width);

    this.add
      .text(
        width / 2,
        height - 24,
        prefersTouchControls() ? '위아래로 쓸어 넘기기   ·   닫기를 눌러 돌아가기' : '↑ ↓ 또는 휠로 스크롤   ·   Esc 로 돌아가기',
        { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.armInput();
    this.applyScroll();
  }

  /** Stacks the sections into the page; returns how tall it came out. */
  private layout(sections: readonly GuideSection[], width: number): number {
    const left = (width - INFO.contentWidth) / 2;
    let y = this.viewTop;

    sections.forEach((section, index) => {
      if (index > 0) {
        y += INFO.sectionGap;
      }

      const heading = this.add.text(left, y, section.heading, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.headingSize,
        color: COLORS.accent,
      });
      this.page.add(heading);
      y += heading.height + INFO.headingGap;

      const body = this.add.text(left, y, [...section.lines], {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.lineSize,
        color: COLORS.text,
        lineSpacing: INFO.lineSpacing,
        wordWrap: { width: INFO.contentWidth },
      });
      this.page.add(body);
      y += body.height;
    });

    return y - this.viewTop;
  }

  private buildScrollbar(width: number): void {
    if (this.maxScroll <= 0) {
      return;
    }

    const x = (width + INFO.contentWidth) / 2 + 14;
    this.add
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
      .rectangle(x, INFO.titleY, 64, 28, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, INFO.titleY, '닫기', {
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
    const release = () => {
      this.dragFrom = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.scrollBy(-INFO.keyStep);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.scrollBy(INFO.keyStep);
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
