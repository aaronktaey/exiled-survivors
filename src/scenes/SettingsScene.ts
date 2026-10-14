import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { centredTop, fitWidth } from '@/systems/Layout';
import { fill, languageName, t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { MenuList } from '@/systems/MenuList';
import { MOVEMENT_MODES, settings, type MovementMode } from '@/systems/Settings';
import { requestTiltPermission, tiltAvailable } from '@/systems/TiltInput';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

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
  return mode === 'floating' ? copy.modeFloating : copy.modeTilt;
};

const modeHint = (mode: MovementMode): string => {
  const copy = t().settings;
  return mode === 'floating' ? copy.hintFloating : copy.hintTilt;
};

/**
 * 설정: the thumb stick's size, tilt steering, the language, and the music.
 *
 * The stick is previewed live at its real size, because a number alone says
 * nothing about whether it falls under a thumb. Where it sits is no longer
 * a setting: it appears under whichever finger lands.
 */
export class SettingsScene extends Phaser.Scene {
  public static readonly KEY = SCENES.settings;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: SettingsSceneData;
  private menu!: MenuList;
  private previewBase!: Phaser.GameObjects.Arc;
  private previewThumb!: Phaser.GameObjects.Arc;
  private hint!: Phaser.GameObjects.Text;

  public constructor() {
    super(SettingsScene.KEY);
  }

  public init(data: SettingsSceneData): void {
    this.payload = data;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    // Title and eight rows, centred together rather than pinned to the top.
    const listHeight = 7 * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
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
      onMove: () => this.setHint(),
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
        // A phone's canvas is 420 across and this line is the longest on the
        // screen; without the wrap it ran off both sides at once.
        wordWrap: { width: fitWidth(560, width) },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.ui + 1);
    this.setHint();

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

  /**
   * The ring at its real size, in the corner a thumb would reach for. It is
   * only ever a sample now — the pad itself appears wherever a finger lands.
   */
  private drawPreview(): void {
    const { joystickScale, movementMode } = settings.value;

    // Nothing to preview for tilt: there is no pad at all.
    const shown = movementMode !== 'tilt';
    this.previewBase.setVisible(shown);
    this.previewThumb.setVisible(shown);

    this.previewBase.setRadius(JOYSTICK.baseRadius * joystickScale);
    this.previewThumb.setRadius(JOYSTICK.thumbRadius * joystickScale);

    const x = JOYSTICK.margin;
    const y = this.scale.height - JOYSTICK.margin;
    this.previewBase.setPosition(x, y).setAlpha(0.45);
    this.previewThumb.setPosition(x, y).setAlpha(0.45);
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

    this.drawPreview();
    this.menu.refresh();
    this.setHint();

    if (next !== 'tilt') {
      return;
    }

    // Ask here, because a permission prompt has to come off a real press.
    // A refusal is said out loud and nothing else: putting the setting back
    // made the row look broken — it would flick to 기울이기 and straight back
    // to the pad, with no way to tell why. The choice stands, the run asks
    // again when it starts, and a run that never hears from the sensor
    // falls back to a pad on its own.
    const granted = tiltAvailable() && (await requestTiltPermission());
    if (!granted) {
      this.hint.setText(t().settings.tiltRefused);
    }
  }

  private setHint(): void {
    if (this.payload.allowLanguage === false) {
      this.hint.setText(t().settings.languageTitleOnly);
      return;
    }

    // How the steering works matters on a phone; which keys do what matters
    // everywhere else. On the row that chooses it, say what the other way is
    // as well — a setting nobody can tell is there may as well not be.
    if (prefersTouchControls()) {
      const other = MOVEMENT_MODES.find((mode) => mode !== settings.value.movementMode);
      this.hint.setText(
        this.menu.selectedId === 'movement' && other
          ? `${modeHint(settings.value.movementMode)}
${fill(t().settings.modeOther, { mode: modeName(other) })}`
          : modeHint(settings.value.movementMode),
      );
      return;
    }

    this.hint.setText(t().settings.hint);
  }

  private close(): void {
    const { onClose, languageChanged } = this.payload;
    this.scene.stop();
    onClose(languageChanged === true);
  }
}
