import Phaser from 'phaser';

/**
 * 폰트 비교 (dev server only, 2026-10-23, the user's ask): a picker in the
 * page's corner that swaps every label the game draws in `system-ui` for a
 * candidate font, loaded from its CDN — nothing is bundled or shipped. The
 * choice is kept in localStorage under `dev-font` (outside the game's
 * `exiled-survivors:` keys, so it is never synced or carried) and applied by
 * a reload, before the first scene draws a word.
 */
interface DevFont {
  readonly id: string;
  readonly label: string;
  /** The CSS families, first to last fallback; none for the game's own. */
  readonly families?: readonly string[];
  readonly css?: readonly string[];
}

const GALMURI = 'https://cdn.jsdelivr.net/npm/galmuri/dist/galmuri.css';

/** The title logo's letters as a font (tools/make-logo-font.py): Latin, digits and symbols only. */
const LOGO = `${import.meta.env.BASE_URL}dev-fonts/exiled-pixel.css`;

export const DEV_FONTS: readonly DevFont[] = [
  { id: 'default', label: '기본 (system-ui)' },
  { id: 'logo', label: '로고체 + 갈무리 11 (한글)', families: ['ExiledPixel', 'Galmuri11'], css: [LOGO, GALMURI] },
  { id: 'galmuri11', label: '갈무리 11', families: ['Galmuri11'], css: [GALMURI] },
  { id: 'galmuri14', label: '갈무리 14', families: ['Galmuri14'], css: [GALMURI] },
  { id: 'neodgm', label: 'Neo둥근모', families: ['NeoDunggeunmo'], css: ['https://cdn.jsdelivr.net/gh/neodgm/neodgm-webfont@latest/neodgm/style.css'] },
  { id: 'pretendard', label: 'Pretendard', families: ['Pretendard'], css: ['https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'] },
  { id: 'hahmlet', label: '함렛 (Hahmlet)', families: ['Hahmlet'], css: ['https://fonts.googleapis.com/css2?family=Hahmlet:wght@400;700&display=swap'] },
];

const KEY = 'dev-font';

function chosen(): DevFont {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // The game's own, then.
  }
  return DEV_FONTS.find((font) => font.id === id) ?? DEV_FONTS[0]!;
}

/** The picker, bottom-left over the page: a choice reloads the game in that font. */
function addPicker(current: DevFont): void {
  const select = document.createElement('select');
  select.title = '폰트 비교 (개발 서버 전용)';
  Object.assign(select.style, {
    position: 'fixed', left: '8px', bottom: '8px', zIndex: '9999', font: '13px system-ui, sans-serif',
    padding: '4px 6px', background: '#151a24', color: '#e8edf7', border: '1px solid #3a4352', borderRadius: '4px', opacity: '0.85',
  });
  for (const font of DEV_FONTS) {
    const option = document.createElement('option');
    option.value = font.id;
    option.textContent = `폰트: ${font.label}`;
    option.selected = font.id === current.id;
    select.append(option);
  }
  select.addEventListener('change', () => {
    try {
      localStorage.setItem(KEY, select.value);
    } catch {
      // Nothing kept: the reload shows the game's own.
    }
    window.location.reload();
  });
  document.body.append(select);
}

/**
 * Loads the chosen font and has every `system-ui` label use it. Awaited in
 * main.ts before the game is made, so no word is drawn in the old font first.
 * The harness never sees it: run-all clears storage before every suite.
 */
export async function primeDevFont(): Promise<void> {
  const font = chosen();
  addPicker(font);
  if (!font.families || !font.css) {
    return;
  }
  await Promise.all(
    font.css.map(
      (href) =>
        new Promise<void>((resolve) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.addEventListener('load', () => resolve());
          link.addEventListener('error', () => resolve());
          document.head.append(link);
        }),
    ),
  );
  // Hangul, Latin and digits, so every subset the game writes in is fetched.
  const sample = '가나다라 전투 재능의 파편 ABCxyz 0123456789';
  await Promise.race([
    Promise.all(
      font.families.flatMap((name) => ['400', '700'].map((weight) => document.fonts.load(`${weight} 16px "${name}"`, sample))),
    ),
    new Promise((resolve) => setTimeout(resolve, 6000)),
  ]);

  const family = `${font.families.map((name) => `"${name}"`).join(', ')}, system-ui, sans-serif`;
  const proto = Phaser.GameObjects.TextStyle.prototype as unknown as {
    setStyle: (style: Record<string, unknown> | undefined, updateText?: boolean, setDefaults?: boolean) => unknown;
  };
  const original = proto.setStyle;
  proto.setStyle = function (style, updateText, setDefaults) {
    const swapped =
      style && typeof style.fontFamily === 'string' && style.fontFamily.startsWith('system-ui')
        ? { ...style, fontFamily: family }
        : style;
    return original.call(this, swapped, updateText, setDefaults);
  };
}
