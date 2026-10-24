import Phaser from 'phaser';

import { COLORS, DEPTH, GUIDE_TONES, INFO, SCENES, SCRIM, TEXT } from '@/config';
import { fitText, fitWidth } from '@/systems/Layout';
import { guideChapters, type GuideCard, type GuideChapter } from '@/content/guide';
import { PATCH_NOTES } from '@/content/patchNotes';
import { fill, language, t } from '@/i18n';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export type InfoTopic = 'patch' | 'guide';

export interface InfoSceneData {
  readonly topic: InfoTopic;
  readonly onClose: () => void;
}

const title = (topic: InfoTopic): string =>
  topic === 'patch' ? t().info.patchTitle : t().info.guideTitle;

/** 패치노트, as the one chapter it is: a card per version, newest first. */
function patchChapter(): GuideChapter {
  return {
    id: 'patch',
    title: t().info.patchTitle,
    tabs: [
      {
        id: 'patch',
        title: t().info.patchTitle,
        cards: PATCH_NOTES.map((note) => ({
          title: `v${note.version}   ${note.date}`,
          tone: 'patch' as const,
          facts: [],
          // Korean is the fallback: an entry always has it, a new language
          // may not have caught up with the newest note yet.
          lines: note.changes[language()] ?? note.changes.ko,
        })),
      },
    ],
  };
}

/** Below this width the contents list moves from the side to a row on top. */
const SIDE_CONTENTS_FROM = 600;

/** One plate in a row of choices: a chapter, or a tab. */
interface Plate {
  readonly box: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

/**
 * The reading screen: 게임 가이드 and 패치노트.
 *
 * The guide is chapters (down the side, or across the top on a narrow
 * screen), each chapter a row of tabs, each tab a page of cards. A card is
 * bordered and titled in the colour of what it is about, so a page reads as
 * a set of things rather than one wall of text. ↑↓ walk the chapters, ←→ the
 * tabs, and the page scrolls under the wheel, a drag or PageUp / PageDown.
 *
 * The page is drawn by a camera of its own whose viewport is the reading
 * window: Phaser 4 has no `setMask` under WebGL, and a viewport clips for
 * free. Scrolling moves that camera.
 */
export class InfoScene extends Phaser.Scene {
  public static readonly KEY = SCENES.info;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: InfoSceneData;
  /** Everything this screen can show. Public so a test can read it all. */
  public chapters: readonly GuideChapter[] = [];
  /** The contents list's labels, and the open chapter's tabs. Public for tests. */
  public tocEntries: Phaser.GameObjects.Text[] = [];
  public tabEntries: Phaser.GameObjects.Text[] = [];
  /** What is on the page now. Public so a test can read what is shown. */
  public page!: Phaser.GameObjects.Container;
  public chapter = 0;
  public tab = 0;
  public maxScroll = 0;
  /** Cards not drawn yet (패치노트's older versions), and where the page ends now. Public for tests. */
  public pending: readonly GuideCard[] = [];
  private pageEnd = 0;
  /** 더 보기, while there is more. Public so a test can press it. */
  public moreButton?: Phaser.GameObjects.Text;
  private morePlate?: Phaser.GameObjects.Graphics;

  private tocPlates: Plate[] = [];
  private tabPlates: Plate[] = [];
  private pageCam!: Phaser.Cameras.Scene2D.Camera;
  private bar?: Phaser.GameObjects.Rectangle;
  private barTrack?: Phaser.GameObjects.Rectangle;

  private scrollY = 0;
  private viewTop = 0;
  private viewHeight = 0;
  private viewBottom = 0;
  /** Where the tab row starts: under the title, or under a top contents row. */
  private tabsTop = 0;
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
    this.tab = 0;
    this.scrollY = 0;
    // The scene instance outlives a launch: last time's objects are already
    // destroyed, and 패치노트 has no contents list to replace them with.
    this.tocEntries = [];
    this.tocPlates = [];
    this.tabEntries = [];
    this.tabPlates = [];
    this.bar = undefined;
    this.barTrack = undefined;
  }

  public create(): void {
    // A camera added last time is still on the manager; start from the main.
    for (const camera of [...this.cameras.cameras]) {
      if (camera !== this.cameras.main) {
        this.cameras.remove(camera);
      }
    }

    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    this.chapters = this.payload.topic === 'patch' ? [patchChapter()] : guideChapters();

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, INFO.titleY, title(this.payload.topic), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.viewBottom = height - INFO.contentBottom;

    // The page is as wide as it wants, or as wide as the screen allows.
    const pageWidth = fitWidth(INFO.contentWidth, width, INFO.sideMargin);
    const left = (width - pageWidth) / 2;
    const hasContents = this.chapters.length > 1;
    if (hasContents && width >= SIDE_CONTENTS_FROM) {
      // Contents down the left, the chapter beside it.
      const toc = Math.max(INFO.tocMinWidth, Math.min(INFO.tocWidth, pageWidth * 0.26));
      this.contentLeft = left + toc + INFO.tocGutter;
      this.contentWidth = pageWidth - toc - INFO.tocGutter;
      this.buildSideContents(left, toc);
      this.tabsTop = INFO.contentTop;
    } else {
      this.contentLeft = left;
      this.contentWidth = pageWidth;
      // On a narrow screen the chapters are a row of their own over the tabs.
      this.tabsTop = hasContents
        ? INFO.contentTop + this.buildTopContents(left, pageWidth) + INFO.tabGap
        : INFO.contentTop;
    }

    // The page and its camera: the page lives at the world origin, and the
    // camera's viewport is wherever the reading window is on screen.
    this.page = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.cameras.main.ignore(this.page);
    this.pageCam = this.cameras.add(this.contentLeft, INFO.contentTop, this.contentWidth, 1);

    this.buildCloseButton(width);
    const copy = t().info;
    const touch = prefersTouchControls();
    const hint = hasContents
      ? touch
        ? copy.guideHintTouch
        : copy.guideHintKeyboard
      : touch
        ? copy.hintTouch
        : copy.hintKeyboard;
    fitText(
      this.add
        .text(width / 2, height - 24, hint, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.armInput();
    this.showChapter(0);
  }

  // --- the rows of choices ---

  /** A plate with a label in it: the shape a chapter and a tab both take. */
  private plate(x: number, y: number, label: string, onPress: () => void, width?: number): Plate {
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.tabSize,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    const w = width ?? Math.ceil(text.width) + INFO.tabPadX * 2;
    const box = this.add
      .rectangle(x + w / 2, y + INFO.tabHeight / 2, w, INFO.tabHeight, COLORS.panel, 0.9)
      .setStrokeStyle(1, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    text.setPosition(box.x, box.y);
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { box, label: text };
  }

  /** Lays plates left to right, wrapping, from `top`; returns the height used. */
  private row(
    left: number,
    top: number,
    width: number,
    labels: readonly string[],
    onPress: (index: number) => void,
  ): { plates: Plate[]; height: number } {
    let x = left;
    let y = top;
    const plates = labels.map((label, index) => {
      const made = this.plate(x, y, label, () => onPress(index));
      if (x > left && x + made.box.width > left + width) {
        // Over the edge: this one starts the next row.
        x = left;
        y += INFO.tabHeight + INFO.tabGap;
        made.box.setPosition(x + made.box.width / 2, y + INFO.tabHeight / 2);
        made.label.setPosition(made.box.x, made.box.y);
      }
      x += made.box.width + INFO.tabGap;
      return made;
    });
    return { plates, height: plates.length > 0 ? y - top + INFO.tabHeight : 0 };
  }

  /** The contents list down the left: a plate per chapter. */
  private buildSideContents(left: number, width: number): void {
    this.tocPlates = this.chapters.map((entry, index) =>
      this.plate(
        left,
        INFO.contentTop + index * (INFO.tocItemHeight + INFO.tocItemGap),
        entry.title,
        () => this.showChapter(index),
        width,
      ),
    );
    this.tocEntries = this.tocPlates.map((p) => p.label);
  }

  /** The contents as a row of their own, on a narrow screen. */
  private buildTopContents(left: number, width: number): number {
    const { plates, height } = this.row(
      left,
      INFO.contentTop,
      width,
      this.chapters.map((c) => c.title),
      (index) => this.showChapter(index),
    );
    this.tocPlates = plates;
    this.tocEntries = plates.map((p) => p.label);
    return height;
  }

  /** The open chapter's tabs, over the page. Nothing for a one-tab chapter. */
  private buildTabs(): number {
    for (const plate of this.tabPlates) {
      plate.box.destroy();
      plate.label.destroy();
    }
    this.tabPlates = [];
    this.tabEntries = [];

    const tabs = this.chapters[this.chapter]?.tabs ?? [];
    if (tabs.length <= 1) {
      return 0;
    }

    const { plates, height } = this.row(
      this.contentLeft,
      this.tabsTop,
      this.contentWidth,
      tabs.map((tab) => tab.title),
      (index) => this.showTab(index),
    );
    this.tabPlates = plates;
    this.tabEntries = plates.map((p) => p.label);
    return height + INFO.tabsBottomGap;
  }

  /** Lights the chosen plate in a row and dims the rest. */
  private static light(plates: readonly Plate[], active: number, edge: number): void {
    plates.forEach((plate, i) => {
      const on = i === active;
      plate.box.setFillStyle(on ? COLORS.panelActive : COLORS.panel, on ? 1 : 0.9);
      plate.box.setStrokeStyle(on ? 2 : 1, on ? edge : COLORS.panelEdge, 1);
      plate.label.setColor(on ? COLORS.text : COLORS.muted);
      plate.label.setAlpha(on ? 1 : 0.8);
    });
  }

  // --- the page ---

  /** Opens a chapter on its first tab. */
  private showChapter(index: number): void {
    this.chapter = Phaser.Math.Wrap(index, 0, this.chapters.length);
    // A chapter lights red and a tab blue, so the two rows read apart when
    // a narrow screen stacks them.
    InfoScene.light(this.tocPlates, this.chapter, COLORS.accentFill);

    const tabsHeight = this.buildTabs();
    this.viewTop = this.tabsTop + tabsHeight;
    this.viewHeight = Math.max(40, this.viewBottom - this.viewTop);
    this.pageCam.setViewport(this.contentLeft, this.viewTop, this.contentWidth, this.viewHeight);

    this.showTab(0);
  }

  /** Lays a tab's cards out and puts the page back to the top. */
  private showTab(index: number): void {
    const tabs = this.chapters[this.chapter]?.tabs ?? [];
    this.tab = tabs.length > 0 ? Phaser.Math.Wrap(index, 0, tabs.length) : 0;
    InfoScene.light(this.tabPlates, this.tab, GUIDE_TONES.info.edge);
    this.scrollY = 0;

    this.page.removeAll(true);
    this.moreButton = undefined;
    this.morePlate = undefined;
    const cards = tabs[this.tab]?.cards ?? [];
    // 패치노트 a page at a time (INFO.patchPage); the guide's tabs are short enough whole.
    const first = this.payload.topic === 'patch' ? INFO.patchPage : cards.length;
    this.pending = cards.slice(first);
    this.pageEnd = this.layout(cards.slice(0, first), 0);
    this.refit();
  }

  /** The next lot of 패치노트, under what is there, the page kept where it was. */
  public showMore(): void {
    if (this.pending.length === 0) {
      return;
    }
    this.moreButton?.destroy();
    this.morePlate?.destroy();
    this.moreButton = undefined;
    this.morePlate = undefined;
    const next = this.pending.slice(0, INFO.patchPage);
    this.pending = this.pending.slice(INFO.patchPage);
    this.pageEnd = this.layout(next, this.pageEnd);
    this.refit(this.scrollY);
  }

  /** 더 보기 under the page while there is more, the scroll bounds, the bar — after the page changed. */
  private refit(keepScroll = 0): void {
    let height = this.pageEnd;
    if (this.pending.length > 0) {
      const top = this.pageEnd + INFO.cardGap;
      const width = this.contentWidth;
      this.morePlate = this.add.graphics();
      this.morePlate.fillStyle(INFO.cardFill, INFO.cardFillAlpha).fillRoundedRect(0, top, width, INFO.moreHeight, INFO.cardRadius);
      this.morePlate.lineStyle(INFO.cardEdge, GUIDE_TONES.info.edge, 0.85).strokeRoundedRect(0, top, width, INFO.moreHeight, INFO.cardRadius);
      this.moreButton = this.add
        .text(width / 2, top + INFO.moreHeight / 2, fill(t().info.patchMore, { count: this.pending.length }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: INFO.lineSize,
          color: COLORS.accent,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      // A press that did not drag the page, so a scroll by finger never loads by accident.
      this.moreButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        if (Math.abs(pointer.y - pointer.downY) < 8) {
          this.showMore();
        }
      });
      this.page.add([this.morePlate, this.moreButton]);
      height = top + INFO.moreHeight;
    }
    this.maxScroll = Math.max(0, height - this.viewHeight);
    this.scrollY = Phaser.Math.Clamp(keepScroll, 0, this.maxScroll);

    // Everything but the page is drawn by the main camera only.
    this.pageCam.ignore(this.children.list.filter((child) => child !== this.page));
    this.buildScrollbar();
    this.applyScroll();
  }

  /** Stacks the cards into the page from `start`; returns where the page ends. */
  private layout(cards: readonly GuideCard[], start: number): number {
    let y = start;
    cards.forEach((card, index) => {
      if (index > 0 || start > 0) {
        y += INFO.cardGap;
      }
      y += this.drawCard(card, y);
    });
    return y;
  }

  /**
   * One card: a bordered panel with a bar down its left side in the card's
   * colour, the title in that colour, its facts smaller and lighter, then
   * its lines, each with a bullet and a hanging indent.
   */
  private drawCard(card: GuideCard, top: number): number {
    const tone = GUIDE_TONES[card.tone];
    const width = this.contentWidth;
    const innerX = INFO.cardBar + INFO.cardPad;
    const innerWidth = width - innerX - INFO.cardPad;
    const texts: Phaser.GameObjects.Text[] = [];
    let y = top + INFO.cardPad;

    const heading = this.add.text(innerX, y, card.title, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: INFO.cardTitleSize,
      fontStyle: 'bold',
      color: tone.title,
      wordWrap: { width: innerWidth },
    });
    texts.push(heading);
    y += heading.height;

    if (card.facts.length > 0) {
      y += 6;
      const facts = this.add.text(innerX, y, card.facts.join('\n'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.factSize,
        color: INFO.factColor,
        lineSpacing: 4,
        wordWrap: { width: innerWidth },
      });
      texts.push(facts);
      y += facts.height;
    }

    const bullet = 14;
    card.lines.forEach((line, index) => {
      y += index === 0 ? 10 : INFO.lineSpacing;
      texts.push(
        this.add.text(innerX, y, '•', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: INFO.lineSize,
          color: tone.title,
        }),
      );
      const body = this.add.text(innerX + bullet, y, line, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: INFO.lineSize,
        color: COLORS.text,
        lineSpacing: 4,
        wordWrap: { width: innerWidth - bullet },
      });
      texts.push(body);
      y += body.height;
    });

    const height = y + INFO.cardPad - top;
    const panel = this.add.graphics();
    panel.fillStyle(INFO.cardFill, INFO.cardFillAlpha);
    panel.fillRoundedRect(0, top, width, height, INFO.cardRadius);
    panel.lineStyle(INFO.cardEdge, tone.edge, 0.85);
    panel.strokeRoundedRect(0, top, width, height, INFO.cardRadius);
    panel.fillStyle(tone.edge, 1);
    panel.fillRoundedRect(0, top, INFO.cardBar, height, {
      tl: INFO.cardRadius,
      bl: INFO.cardRadius,
      tr: 0,
      br: 0,
    });

    // The panel first, so it sits under its own words.
    this.page.add(panel);
    this.page.add(texts);
    return height;
  }

  private buildScrollbar(): void {
    this.bar?.destroy();
    this.barTrack?.destroy();
    this.bar = undefined;
    this.barTrack = undefined;

    if (this.maxScroll <= 0) {
      return;
    }

    const x = this.contentLeft + this.contentWidth + 8;
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
    this.pageCam.ignore([this.barTrack, this.bar]);
  }

  /** A tappable 닫기, for touch screens with no Esc key. */
  private buildCloseButton(width: number): void {
    const x = width - INFO.sideMargin - 22;
    const button = this.add
      .rectangle(x, INFO.titleY, 64, 28, COLORS.panelActive, 0.55)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, INFO.titleY, t().common.close, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
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
    const tabbed = (this.chapters[this.chapter]?.tabs.length ?? 0) > 1;

    if ((event.code === 'Enter' || event.code === 'Space') && this.pending.length > 0) {
      event.preventDefault();
      this.showMore();
      return;
    }

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
      case 'ArrowLeft':
      case 'KeyA':
        if (tabbed) {
          this.showTab(this.tab - 1);
        }
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (tabbed) {
          this.showTab(this.tab + 1);
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
    this.pageCam.setScroll(0, this.scrollY);

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
