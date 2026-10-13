import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK, MENU, SCENES, SCRIM, SETTINGS_RANGE, TEXT } from '@/config';
import { centredTop } from '@/systems/Layout';
import { languageName, t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { MenuList } from '@/systems/MenuList';
import { settings, type MovementMode } from '@/systems/Settings';
import { requestTiltPermission, tiltAvailable } from '@/systems/TiltInput';

export interface SettingsSceneData {
  /**
   * Whether the language may be changed here. Only the title screen says
   * yes: swapping every string out from under a running game meant
   * rebuilding scenes that are mid-run, which is not worth the risk.
   */
  readonly allowLanguage?: boolean;
  /** True once the language has been changed during this visit. */
  readonly languageChanged?: boolean;
  readonly onClose: (languageChanged: boolean) => void;
}

const modeName = (mode: MovementMode): string => {
  const copy = t().settings;
  return mode === 'fixed' ? copy.modeFixed : mode === 'floating' ? copy.modeFloating : copy.modeTilt;
};

const modeHint = (mode: MovementMode): string => {
  const copy = t().settings;
  return mode === 'fixed' ? copy.hint : mode === 'floating' ? copy.hintFloating : copy.hintTilt;
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

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    // Title and eight rows, centred together rather than pinned to the top.
    const listHeight = 8 * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const top = centredTop(height, MENU.titleBlockHeight + listHeight);

    this.add
      .text(width / 2, top + 16, t().settings.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.createPreview();

    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + MENU.titleBlockHeight + MENU.buttonHeight / 2,
      width: 420,
      onCancel: () => this.close(),
      items: [
        {
          id: 'language',
          // Always "Language", in every language — that is the point of it.
          label: () => 'Language',
          detail: () => languageName(settings.value.language),
          enabled: () => this.payload.allowLanguage !== false,
          onSelect: () => this.changeLanguage(1),
          onAdjust: (direction) => this.changeLanguage(direction),
        },
        {
          id: 'joystickScale',
          label: () => t().settings.padSize,
          detail: () => `${Math.round(settings.value.joystickScale * 100)}%`,
          onSelect: () => settings.step('joystickScale', 1),
          onAdjust: (direction) => {
            settings.step('joystickScale', direction);
            this.drawPreview();
          },
        },
        {
          id: 'movement',
          label: () => t().settings.movement,
          detail: () => modeName(settings.value.movementMode),
          onSelect: () => void this.cycleMode(1),
          onAdjust: (direction) => void this.cycleMode(direction),
        },
        {
          id: 'joystickPlace',
          label: () => t().settings.padPlace,
          detail: () =>
            settings.value.movementMode === 'fixed'
              ? `${Math.round(settings.value.joystickX)}, ${Math.round(settings.value.joystickY)}`
              : t().settings.padPlaceOnlyFixed,
          enabled: () => settings.value.movementMode === 'fixed',
          onSelect: () => this.beginPlacing(),
        },
        {
          id: 'bgm',
          label: () => t().settings.bgm,
          detail: () => `${Math.round(settings.value.bgmVolume * 100)}%`,
          onSelect: () => this.stepVolume(1),
          onAdjust: (direction) => this.stepVolume(direction),
        },
        {
          id: 'reset',
          label: () => t().settings.reset,
          onSelect: () => {
            settings.reset();
            bgm.applyVolume(this);
            this.drawPreview();
            this.menu.refresh();
          },
        },
        { id: 'credits', label: () => t().menu.credits, onSelect: () => this.openCredits() },
        { id: 'back', label: () => t().common.back, onSelect: () => this.close() },
      ],
    });

    this.hint = this.add
      .text(width / 2, height - 28, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
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

  /** 제작자 정보 lives under here now; it opens on top of this screen. */
  private openCredits(): void {
    this.scene.pause();
    // Drawn over whatever opened this screen, whichever one it was.
    this.scene.bringToTop(SCENES.credits);
    this.scene.launch(SCENES.credits, {
      onClose: () => {
        this.scene.resume();
        this.menu.refresh();
      },
    });
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
  /**
   * Steps to the next language. Every label on screen changes, including
   * this screen's own, so it is rebuilt from scratch — and the screen
   * underneath is told to do the same when this one closes.
   */
  private changeLanguage(direction: -1 | 1): void {
    if (this.payload.allowLanguage === false) {
      return;
    }

    settings.cycleLanguage(direction);

    // A frame later: this call is still inside the input handler that is
    // walking this scene's interactive objects, and restarting now pulls
    // them out from under it.
    this.time.delayedCall(0, () => {
      this.scene.restart({ ...this.payload, languageChanged: true });
    });
  }

  private async cycleMode(direction: -1 | 1): Promise<void> {
    const next = settings.cycleMovementMode(direction).movementMode;

    if (next === 'tilt') {
      const granted = tiltAvailable() && (await requestTiltPermission());
      if (!granted) {
        this.hint.setText(t().settings.tiltRefused);
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
      this.hint.setText(t().settings.hintPlacing);
      return;
    }

    if (this.payload.allowLanguage === false) {
      this.hint.setText(t().settings.languageTitleOnly);
      return;
    }

    this.hint.setText(modeHint(settings.value.movementMode));
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
    const { onClose, languageChanged } = this.payload;
    this.scene.stop();
    onClose(languageChanged === true);
  }
}
