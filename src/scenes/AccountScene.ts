import Phaser from 'phaser';

import { ACCOUNT, ACCOUNT_BUTTONS, COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { account, type ProviderId } from '@/systems/Account';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { cloudSave } from '@/systems/CloudSave';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { MenuList, type MenuItem } from '@/systems/MenuList';
import { ranking } from '@/systems/Ranking';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface AccountSceneData {
  readonly onClose: () => void;
  /** Opened from the ranking's entry popup: signing in is what stands between. */
  readonly reason?: 'ranking';
  /** Runs just before the page is left for a provider. */
  readonly onBeforeLogin?: () => void;
}

const LEAD_WIDTH = 560;

/**
 * 계정 — sign in, or see who is signed in.
 *
 * Signed out, a row per way in the server offers, each in its provider's
 * colours. Signed in, who, how the records are syncing, and sign out /
 * delete — the delete asks twice. The privacy policy is a row in both.
 */
export class AccountScene extends Phaser.Scene {
  public static readonly KEY = SCENES.account;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** The rows. Public so a test can drive them. */
  public menu!: MenuList;
  /** Who is signed in, or what signing in is for. Public for tests. */
  public lead!: Phaser.GameObjects.Text;
  /** True once 계정 삭제 has been pressed once, waiting for the second press. */
  public armed = false;

  private payload!: AccountSceneData;

  public constructor() {
    super(AccountScene.KEY);
  }

  public init(data: AccountSceneData): void {
    this.payload = data;
    this.armed = false;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const items = this.items();
    const step = MENU.buttonHeight + MENU.buttonGap;
    const leadHeight = 96;
    const listHeight = items.length * step - MENU.buttonGap;
    const top = centredTop(height, MENU.titleBlockHeight + leadHeight + listHeight);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, top + 16, t().account.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.lead = this.add
      .text(width / 2, top + MENU.titleBlockHeight + leadHeight / 2 - 12, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: fitWidth(LEAD_WIDTH, width) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + MENU.titleBlockHeight + leadHeight + MENU.buttonHeight / 2,
      width: 380,
      onCancel: () => this.close(),
      items,
    });

    fitText(
      this.add
        .text(width / 2, height - 26, prefersTouchControls() ? t().account.hintTouch : t().account.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.drawLead();
    const unwatchAccount = account.onChange(() => this.redraw());
    const unwatchSync = cloudSave.onChange(() => this.drawLead());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatchAccount();
      unwatchSync();
    });
  }

  /** What can be done here, signed in or out. */
  private items(): MenuItem[] {
    const copy = t().account;
    const privacy: MenuItem = {
      id: 'privacy',
      label: () => copy.privacy,
      onSelect: () => window.open(ACCOUNT.privacyUrl, '_blank', 'noopener'),
    };

    if (account.status === 'offline') {
      return [{ id: 'retry', label: () => copy.retry, onSelect: () => void account.refresh() }, privacy];
    }

    if (!account.user) {
      return [
        ...account.providers.map((provider) => ({
          id: `login:${provider}`,
          label: () => copy.providers[provider] ?? provider,
          accent: ACCOUNT_BUTTONS[provider]?.fill,
          accentText: ACCOUNT_BUTTONS[provider]?.text,
          onSelect: () => this.login(provider),
        })),
        privacy,
      ];
    }

    return [
      ...(cloudSave.conflict
        ? [{ id: 'resolve', label: () => copy.resolve, onSelect: () => this.openConflict() }]
        : []),
      { id: 'logout', label: () => copy.logout, onSelect: () => void this.logout() },
      {
        id: 'delete',
        label: () => (this.armed ? copy.removeConfirm : copy.remove),
        onSelect: () => void this.remove(),
      },
      privacy,
    ];
  }

  /** Who is signed in, and how the records are doing — or why to sign in. */
  private drawLead(): void {
    const copy = t().account;
    const user = account.user;
    let text: string;
    if (account.status === 'offline') {
      text = copy.offline;
    } else if (!user) {
      text = account.providers.length === 0
        ? copy.noProviders
        : this.payload.reason === 'ranking'
          ? copy.leadRanking
          : copy.leadSignedOut;
    } else {
      const who = fill(copy.signedIn, {
        provider: copy.providerNames[user.provider] ?? user.provider,
        name: user.name || '—',
      });
      const sync =
        cloudSave.status === 'synced'
          ? fill(copy.synced, { time: new Date(cloudSave.syncedAt).toLocaleTimeString() })
          : cloudSave.status === 'syncing'
            ? copy.syncing
            : cloudSave.status === 'conflict'
              ? copy.syncConflict
              : cloudSave.status === 'error'
                ? copy.syncError
                : copy.syncOff;
      text = `${who}\n${sync}`;
    }
    this.lead.setText(text);
    this.lead.setColor(cloudSave.status === 'conflict' ? COLORS.accent : COLORS.muted);
  }

  /** The rows depend on who is signed in, so the screen is built again. */
  private redraw(): void {
    if (this.scene.isActive()) {
      this.scene.restart(this.payload);
    }
  }

  private login(provider: ProviderId): void {
    this.payload.onBeforeLogin?.();
    account.login(provider, '/');
  }

  private async logout(): Promise<void> {
    if (await account.logout()) {
      cloudSave.forget();
    }
  }

  /** First press asks; the second deletes the account and everything it holds. */
  private async remove(): Promise<void> {
    if (!this.armed) {
      this.armed = true;
      this.menu.refresh();
      return;
    }
    if (await account.remove()) {
      cloudSave.forget();
      void ranking.refresh();
    }
  }

  private openConflict(): void {
    this.scene.pause();
    this.scene.launch(SCENES.conflict, {
      onClose: () => {
        this.scene.resume();
        this.redraw();
      },
    });
    this.scene.bringToTop(SCENES.conflict);
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
