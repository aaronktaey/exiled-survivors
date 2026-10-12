import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { MenuList } from '@/systems/MenuList';

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
      .text(width / 2, height / 2 - 128, '일시정지', {
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
      .text(width / 2, height / 2 - 86, `생존 ${mm}:${ss}    Lv ${this.payload.level}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.menu = new MenuList(this, {
      x: width / 2,
      y: height / 2 - 20,
      onCancel: () => this.resume(),
      items: [
        { id: 'resume', label: () => '계속하기', onSelect: () => this.resume() },
        { id: 'settings', label: () => '설정', onSelect: () => this.openSettings() },
        { id: 'quit', label: () => '저장하고 타이틀로', onSelect: () => this.quit() },
      ],
    });

    this.add
      .text(width / 2, height / 2 + 150, 'Esc 또는 뒤로가기로 이어서 진행', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.input.keyboard?.on('keydown-ESC', this.resume, this);
  }

  private openSettings(): void {
    this.scene.pause();
    this.scene.launch(SCENES.settings, {
      onClose: () => {
        this.scene.resume();
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
