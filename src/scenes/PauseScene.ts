import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import type { GameScene } from '@/scenes/GameScene';
import { MenuList } from '@/systems/MenuList';
import { RareTooltip } from '@/systems/RareTooltip';
import { devToolsAllowed } from '@/systems/DevAccess';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import type { SkillId } from '@/weapons/skills';


export interface PauseSceneData {
  readonly elapsedMs: number;
  readonly level: number;
  readonly onResume: () => void;
  /** Writes the run out and goes back to the title. */
  readonly onQuit: () => void;
  /** The run's skills and their DPS, for the 밸런스 panel. */
  readonly dps?: () => ReadonlyArray<{ readonly id: SkillId; readonly name: string; readonly dps: number }>;
}

/** 일시정지: the run is frozen underneath until this closes. */
export class PauseScene extends Phaser.Scene {
  public static readonly KEY = SCENES.pause;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: PauseSceneData;
  private menu!: MenuList;
  /** This screen draws its own affix panel over the frozen run. */
  private tooltip?: RareTooltip;

  public constructor() {
    super(PauseScene.KEY);
  }

  public init(data: PauseSceneData): void {
    this.payload = data;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.resume());
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.pause).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(width / 2, height / 2 - 128, t().pause.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.banner,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const total = Math.floor(this.payload.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    this.add
      .text(width / 2, height / 2 - 86, fill(t().pause.survived, { time: `${mm}:${ss}`, level: this.payload.level }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.menu = new MenuList(this, {
      x: width / 2,
      y: height / 2 - 50,
      onCancel: () => this.resume(),
      items: [
        { id: 'resume', label: () => t().pause.resume, onSelect: () => this.resume() },
        // 장비: the run's own, worn and kept, and the 구슬 to spend on them.
        ...(this.run()
          ? [
              { id: 'gear', label: () => t().runGear.pauseRow, onSelect: () => this.openOverlay(SCENES.runGear, { kit: this.run()!.kit }) },
              // 룬: the skills' 강화 슬롯, and the 룬 to set in them.
              {
                id: 'runes',
                label: () => t().runes.pauseRow,
                onSelect: () => this.openOverlay(SCENES.runes, { kit: this.run()!.kit, skills: this.run()!.skillsHeld }),
              },
            ]
          : []),
        { id: 'guide', label: () => t().menu.guide, onSelect: () => this.openOverlay(SCENES.info, { topic: 'guide' }) },
        { id: 'patch', label: () => t().menu.patch, onSelect: () => this.openOverlay(SCENES.info, { topic: 'patch' }) },
        {
          id: 'settings',
          label: () => t().menu.settings,
          onSelect: () => this.openOverlay(SCENES.settings, { allowLanguage: false }),
        },
        ...(devToolsAllowed()
          ? [
              {
                id: 'tuning',
                label: () => t().tuning.title,
                onSelect: () => this.openOverlay(SCENES.tuning, { dps: this.payload.dps }),
              },
            ]
          : []),
        { id: 'quit', label: () => t().pause.quit, onSelect: () => this.quit() },
      ],
    });

    this.add
      .text(width / 2, height - 28, t().pause.hint, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.input.keyboard?.on('keydown-ESC', this.resume, this);

    // The run is frozen underneath but still drawn, so a rare's affixes can
    // be read at leisure. The panel is this scene's own: drawn by the paused
    // run it would sit under this screen's dimmer, borrowing that run's
    // camera and enemies to know where everything is.
    const run = this.run();
    if (run) {
      this.tooltip = new RareTooltip(this, run.enemyGroup, run.cameras.main);
      this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onInspect, this);
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onInspect, this);
    }
  }

  private run(): GameScene | undefined {
    return this.scene.get(SCENES.game) as GameScene | undefined;
  }

  private onInspect(pointer: Phaser.Input.Pointer): void {
    this.tooltip?.inspectAt(pointer.x, pointer.y);
  }

  /** Settings, the guide and the notes all open over the pause screen. */
  private openOverlay(key: string, extra: object = {}): void {
    this.scene.pause();
    this.scene.bringToTop(key);
    this.scene.launch(key, {
      ...extra,
      onClose: (languageChanged = false) => {
        this.scene.resume();
        if (languageChanged) {
          this.scene.restart();
          return;
        }
        this.menu.refresh();
      },
    });
  }

  private resume(): void {
    this.input.keyboard?.off('keydown-ESC', this.resume, this);
    const { onResume } = this.payload;
    this.scene.stop();
    onResume();
  }

  private quit(): void {
    this.input.keyboard?.off('keydown-ESC', this.resume, this);
    const { onQuit } = this.payload;
    this.scene.stop();
    onQuit();
  }
}
