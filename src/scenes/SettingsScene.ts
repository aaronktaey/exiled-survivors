import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK, SCENES, SETTINGS_RANGE } from '@/config';
import { bgm } from '@/systems/Bgm';
import { MenuList } from '@/systems/MenuList';
import { settings, type MovementMode } from '@/systems/Settings';
import { requestTiltPermission, tiltAvailable } from '@/systems/TiltInput';

export interface SettingsSceneData {
  readonly onClose: () => void;
}

const MODE_NAMES: Record<MovementMode, string> = {
  fixed: '고정 패드',
  floating: '터치 위치에 생성',
  tilt: '기울이기',
};

const MODE_HINTS: Record<MovementMode, string> = {
  fixed: '↑ ↓ 이동   ◀ ▶ 값 조절   Space 선택   Esc 돌아가기',
  floating: '화면 아무 곳이나 누른 자리에 패드가 생깁니다   ·   Esc 돌아가기',
  tilt: '기기를 기울여 움직입니다. 패드는 표시되지 않습니다   ·   Esc 돌아가기',
};

/**
 * 설정: the thumb stick's size and where it sits, tilt steering, and the
 * music volume.
 *
 * The stick is previewed live at its real size and position, because a
 * number alone says nothing about whether it falls under your thumb.
 * Placing it is its own little mode: the list stops listening, and the ring
 * follows the arrow keys or wherever you touch.
 */
export class SettingsScene extends Phaser.Scene {
  public static readonly KEY = SCENES.settings;

  private payload!: SettingsSceneData;
  private menu!: MenuList;
  private previewBase!: Phaser.GameObjects.Arc;
  private previewThumb!: Phaser.GameObjects.Arc;
  private hint!: Phaser.GameObjects.Text;
  private placing = false;

  public constructor() {
    super(SettingsScene.KEY);
  }

  public init(data: SettingsSceneData): void {
    this.payload = data;
    this.placing = false;
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.92).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, 52, '설정', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.createPreview();

    this.menu = new MenuList(this, {
      x: width / 2,
      y: 128,
      width: 420,
      onCancel: () => this.close(),
      items: [
        {
          id: 'joystickScale',
          label: () => '터치패드 크기',
          detail: () => `${Math.round(settings.value.joystickScale * 100)}%`,
          onSelect: () => settings.step('joystickScale', 1),
          onAdjust: (direction) => {
            settings.step('joystickScale', direction);
            this.drawPreview();
          },
        },
        {
          id: 'movement',
          label: () => '모바일 이동 방식',
          detail: () => `${MODE_NAMES[settings.value.movementMode]}`,
          onSelect: () => void this.cycleMode(1),
          onAdjust: (direction) => void this.cycleMode(direction),
        },
        {
          id: 'joystickPlace',
          label: () => '고정 패드 위치',
          detail: () =>
            settings.value.movementMode === 'fixed'
              ? `${Math.round(settings.value.joystickX)}, ${Math.round(settings.value.joystickY)}`
              : '고정 패드 전용',
          enabled: () => settings.value.movementMode === 'fixed',
          onSelect: () => this.beginPlacing(),
        },
        {
          id: 'bgm',
          label: () => '배경음 음량',
          detail: () => `${Math.round(settings.value.bgmVolume * 100)}%`,
          onSelect: () => this.stepVolume(1),
          onAdjust: (direction) => this.stepVolume(direction),
        },
        {
          id: 'reset',
          label: () => '기본값으로',
          onSelect: () => {
            settings.reset();
            bgm.applyVolume(this);
            this.drawPreview();
            this.menu.refresh();
          },
        },
        { id: 'back', label: () => '돌아가기', onSelect: () => this.close() },
      ],
    });

    this.hint = this.add
      .text(width / 2, height - 28, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: COLORS.muted,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    this.setHint();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointer, this);
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  private createPreview(): void {
    this.previewBase = this.add
      .circle(0, 0, JOYSTICK.baseRadius, COLORS.stick, JOYSTICK.baseAlpha)
      .setDepth(DEPTH.ui + 1);
    this.previewBase.setStrokeStyle(2, COLORS.stick, JOYSTICK.baseAlpha * 2);

    this.previewThumb = this.add
      .circle(0, 0, JOYSTICK.thumbRadius, COLORS.stick, JOYSTICK.thumbAlpha)
      .setDepth(DEPTH.ui + 1);

    this.drawPreview();
  }

  private drawPreview(): void {
    const { joystickScale, joystickX, joystickY, movementMode } = settings.value;

    // Nothing to preview for tilt, and a floating pad has no home.
    const shown = movementMode !== 'tilt';
    this.previewBase.setVisible(shown);
    this.previewThumb.setVisible(shown);

    this.previewBase.setRadius(JOYSTICK.baseRadius * joystickScale);
    this.previewThumb.setRadius(JOYSTICK.thumbRadius * joystickScale);
    this.previewBase.setPosition(joystickX, joystickY);
    this.previewThumb.setPosition(joystickX, joystickY);

    const highlight = this.placing ? 1 : movementMode === 'fixed' ? 0.55 : 0.25;
    this.previewBase.setAlpha(highlight);
    this.previewThumb.setAlpha(highlight);
  }

  private stepVolume(direction: -1 | 1): void {
    settings.step('bgmVolume', direction);
    bgm.applyVolume(this);
    this.menu.refresh();
  }

  /**
   * Steps to the next way of steering. Tilt is the one that can be refused:
   * iOS hands out orientation only after an explicit ask, and only from
   * inside a gesture — which this press is.
   */
  private async cycleMode(direction: -1 | 1): Promise<void> {
    const next = settings.cycleMovementMode(direction).movementMode;

    if (next === 'tilt') {
      const granted = tiltAvailable() && (await requestTiltPermission());
      if (!granted) {
        this.hint.setText('이 기기에서는 기울이기를 쓸 수 없습니다');
        settings.cycleMovementMode(direction);
      }
    }

    this.drawPreview();
    this.menu.refresh();
    this.setHint();
  }

  private beginPlacing(): void {
    this.menu.setInputEnabled(false);

    // A frame later, deliberately: the key — or the tap — that chose this
    // row is still being dispatched, and would otherwise arrive here as
    // 'confirm' or as 'put the stick on the button you just pressed'.
    this.time.delayedCall(0, () => {
      this.placing = true;
      this.drawPreview();
      this.setHint();
    });
  }

  private endPlacing(): void {
    this.placing = false;
    this.menu.setInputEnabled(true);
    this.drawPreview();
    this.menu.refresh();
    this.setHint();
  }

  private setHint(): void {
    if (this.placing) {
      this.hint.setText('방향키로 옮기거나 화면을 눌러 배치   ·   Space 로 확정');
      return;
    }

    this.hint.setText(MODE_HINTS[settings.value.movementMode]);
  }

  private moveStick(x: number, y: number): void {
    const radius = JOYSTICK.baseRadius * settings.value.joystickScale;
    settings.update({
      joystickX: Phaser.Math.Clamp(x, radius, this.scale.width - radius),
      joystickY: Phaser.Math.Clamp(y, radius, this.scale.height - radius),
    });
    this.drawPreview();
    // Keep the row's read-out honest while the ring is being dragged around.
    this.menu.refresh();
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.placing || (pointer.event.type === 'pointermove' && !pointer.isDown)) {
      return;
    }
    this.moveStick(pointer.x, pointer.y);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.placing) {
      return;
    }

    const nudge = SETTINGS_RANGE.joystickNudgePx;
    const { joystickX: x, joystickY: y } = settings.value;

    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.moveStick(x - nudge, y);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveStick(x + nudge, y);
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.moveStick(x, y - nudge);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.moveStick(x, y + nudge);
        break;
      case 'Space':
      case 'Enter':
      case 'Escape':
        this.endPlacing();
        break;
      default:
        break;
    }
  }

  private close(): void {
    if (this.placing) {
      this.endPlacing();
      return;
    }

    this.input.keyboard?.off('keydown', this.onKeyDown, this);
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
