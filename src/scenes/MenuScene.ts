import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, TEXTURES } from '@/config';
import { bgm } from '@/systems/Bgm';
import { MenuList } from '@/systems/MenuList';
import { saveGame } from '@/systems/SaveGame';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** Title screen: the logo, and the four ways out of it. */
export class MenuScene extends Phaser.Scene {
  public static readonly KEY = SCENES.menu;

  private menu!: MenuList;

  public constructor() {
    super(MenuScene.KEY);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.tileSprite(0, 0, width, height, TEXTURES.grid).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.add.rectangle(0, 0, width, height, 0x05070b, 0.55).setOrigin(0, 0).setDepth(DEPTH.ground + 1);

    this.addLogo(width, 128);

    const saved = saveGame.read();
    this.menu = new MenuList(this, {
      x: width / 2,
      y: 268,
      items: [
        { id: 'start', label: () => '게임 시작', onSelect: () => this.startRun() },
        {
          id: 'load',
          label: () => '불러오기',
          detail: () => (saved ? saveGame.describe(saved) : '저장 없음'),
          enabled: () => saved !== null,
          onSelect: () => this.startRun(true),
        },
        { id: 'settings', label: () => '설정', onSelect: () => this.openOverlay(SCENES.settings) },
        { id: 'credits', label: () => '제작자 정보', onSelect: () => this.openOverlay(SCENES.credits) },
      ],
    });

    this.add
      .text(
        width / 2,
        height - 26,
        prefersTouchControls() ? '항목을 탭해서 선택' : '↑ ↓ 이동   Space 선택   (마우스 클릭도 가능)',
        { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // The track is multi-megabyte, so it arrives a moment after the menu.
    bgm.start(this);
  }

  /** The pixel logo, drifting slowly up and down. */
  private addLogo(width: number, y: number): void {
    const logo = this.add.image(width / 2, y, TEXTURES.logo).setDepth(DEPTH.ui);

    this.tweens.add({
      targets: logo,
      y: y + MENU.logoBobPx,
      duration: MENU.logoBobMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(width / 2, y + logo.displayHeight / 2 + 26, '추방자 생존기', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  private startRun(fromSave = false): void {
    this.scene.start(SCENES.game, { save: fromSave ? saveGame.read() : null });
  }

  /** Settings and credits sit on top; the menu waits, deaf, underneath. */
  private openOverlay(key: string): void {
    this.scene.pause();
    this.scene.launch(key, {
      onClose: () => {
        this.scene.resume();
        this.menu.refresh();
      },
    });
  }
}
