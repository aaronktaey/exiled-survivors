import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { fill, t } from '@/i18n';
import type { GameScene } from '@/scenes/GameScene';
import { MenuList } from '@/systems/MenuList';
import { RareTooltip } from '@/systems/RareTooltip';

export interface PauseSceneData {
  readonly elapsedMs: number;
  readonly level: number;
  readonly onResume: () => void;
  /** Writes the run out and goes back to the title. */
  readonly onQuit: () => void;
}

/** 일시정지: the run is frozen underneath until this closes. */
export class PauseScene extends Phaser.Scene {
  public static readonly KEY = SCENES.pause;

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
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.78).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(width / 2, height / 2 - 128, t().pause.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '38px',
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
        fontSize: '16px',
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
        { id: 'guide', label: () => t().menu.guide, onSelect: () => this.openOverlay(SCENES.info, { topic: 'guide' }) },
        { id: 'patch', label: () => t().menu.patch, onSelect: () => this.openOverlay(SCENES.info, { topic: 'patch' }) },
        { id: 'settings', label: () => t().menu.settings, onSelect: () => this.openOverlay(SCENES.settings) },
        { id: 'quit', label: () => t().pause.quit, onSelect: () => this.quit() },
      ],
    });

    this.add
      .text(width / 2, height - 28, t().pause.hint, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
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
