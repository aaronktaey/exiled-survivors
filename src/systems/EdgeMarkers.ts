import Phaser from 'phaser';

import { COLORS, DEPTH, EDGE_MARKERS } from '@/config';

/** One kind of thing worth pointing at, and how to draw it on the rim. */
export interface MarkerSource {
  readonly group: Phaser.GameObjects.Group;
  /** Sprite to show. Falls back to whatever the object itself is drawn with. */
  readonly texture?: string;
  readonly tint?: number;
  /** The arrow's colour, for saying which of these is worth more. */
  readonly arrowColor?: number;
  /** Only the children this passes are marked — bosses out of a whole crowd. */
  readonly filter?: (object: Phaser.GameObjects.GameObject) => boolean;
}

interface Candidate {
  x: number;
  y: number;
  texture: string;
  tint: number;
  distance: number;
  arrowColor: number;
  /** Sources earlier in the list win a tie — the 우두머리 before a potion. */
  rank: number;
}

interface Marker {
  readonly icon: Phaser.GameObjects.Image;
  readonly arrow: Phaser.GameObjects.Triangle;
}

const NO_TINT = -1;

/**
 * The rim of the screen, as a map of what is just off it.
 *
 * A 우두머리 walks in from outside the view, and the weapon it leaves can sit
 * on a patch of floor the camera never turns towards — both are things the
 * player would have walked to had they known. This points at them: a small
 * icon pinned inside the edge with an arrow behind it, one per thing, the
 * nearest few only.
 *
 * Everything is pooled and pinned to the camera, so a screen full of drops
 * costs the same as an empty one and nothing scrolls with the world.
 */
export class EdgeMarkers {
  private readonly scene: Phaser.Scene;
  private readonly sources: readonly MarkerSource[];
  private readonly markers: Marker[] = [];
  /** Reused every frame; the whole point is to not allocate per drop. */
  private readonly candidates: Candidate[] = [];
  private used = 0;

  public constructor(scene: Phaser.Scene, sources: readonly MarkerSource[]) {
    this.scene = scene;
    this.sources = sources;
  }

  /** How many markers are on screen right now. Public for tests. */
  public get shown(): number {
    return this.used;
  }

  public update(): void {
    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    const centreX = view.centerX;
    const centreY = view.centerY;

    this.candidates.length = 0;
    this.sources.forEach((source, rank) => {
      for (const child of source.group.getChildren()) {
        const object = child as Phaser.GameObjects.GameObject & {
          active: boolean;
          x: number;
          y: number;
          texture?: { key: string };
          concealed?: boolean;
        };
        // Hidden by the 아이템 필터: pointing at it would undo the hiding.
        if (!object.active || object.concealed === true || source.filter?.(child) === false) {
          continue;
        }

        // Inside the view is not worth pointing at: it is already there to see.
        if (view.contains(object.x, object.y)) {
          continue;
        }

        const distance = Phaser.Math.Distance.Between(centreX, centreY, object.x, object.y);
        if (distance > EDGE_MARKERS.rangePx) {
          continue;
        }

        this.candidates.push({
          x: object.x,
          y: object.y,
          texture: source.texture ?? object.texture?.key ?? '',
          tint: source.tint ?? NO_TINT,
          arrowColor: source.arrowColor ?? COLORS.textFill,
          distance,
          rank,
        });
      }
    });

    // The nearest, and within that the ones that matter most.
    this.candidates.sort((a, b) => a.rank - b.rank || a.distance - b.distance);

    const limit = Math.min(this.candidates.length, EDGE_MARKERS.max);
    for (let i = 0; i < limit; i++) {
      this.place(this.marker(i), this.candidates[i]!, camera);
    }

    for (let i = limit; i < this.markers.length; i++) {
      this.markers[i]!.icon.setVisible(false);
      this.markers[i]!.arrow.setVisible(false);
    }
    this.used = limit;
  }

  public destroy(): void {
    for (const marker of this.markers) {
      marker.icon.destroy();
      marker.arrow.destroy();
    }
    this.markers.length = 0;
    this.used = 0;
  }

  /** Pins one marker inside the screen edge, pointing the way out to it. */
  private place(marker: Marker, target: Candidate, camera: Phaser.Cameras.Scene2D.Camera): void {
    const { margin, size, alpha } = EDGE_MARKERS;
    const halfWidth = camera.width / 2;
    const halfHeight = camera.height / 2;

    // Direction from the middle of the screen out to the thing.
    const dx = target.x - camera.worldView.centerX;
    const dy = target.y - camera.worldView.centerY;
    const angle = Math.atan2(dy, dx);

    // Walk that direction out to whichever edge it leaves through.
    const inset = margin + size / 2;
    const limitX = Math.max(1, halfWidth - inset);
    const limitY = Math.max(1, halfHeight - inset);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scale = Math.min(
      Math.abs(cos) > 1e-6 ? limitX / Math.abs(cos) : Number.POSITIVE_INFINITY,
      Math.abs(sin) > 1e-6 ? limitY / Math.abs(sin) : Number.POSITIVE_INFINITY,
    );

    const x = halfWidth + cos * scale;
    const y = halfHeight + sin * scale;

    marker.icon.setTexture(target.texture);
    marker.icon.setDisplaySize(size, size);
    marker.icon.setPosition(x, y);
    marker.icon.setAlpha(alpha);
    marker.icon.setVisible(true);
    if (target.tint === NO_TINT) {
      marker.icon.clearTint();
    } else {
      marker.icon.setTint(target.tint);
    }

    // The arrow sits just outside the icon, on the same line out.
    marker.arrow.setPosition(x + cos * (size * 0.95), y + sin * (size * 0.95));
    marker.arrow.setFillStyle(target.arrowColor, 1);
    marker.arrow.setRotation(angle + Math.PI / 2);
    marker.arrow.setAlpha(alpha);
    marker.arrow.setVisible(true);
  }

  /** One pooled marker, made on the first frame that needs it. */
  private marker(index: number): Marker {
    const existing = this.markers[index];
    if (existing) {
      return existing;
    }

    const { arrow } = EDGE_MARKERS;
    const icon = this.scene.add
      .image(0, 0, '')
      .setScrollFactor(0)
      .setDepth(DEPTH.edgeMarker)
      .setVisible(false);

    const tip = this.scene.add
      .triangle(0, 0, 0, arrow * 1.4, arrow, 0, arrow * 2, arrow * 1.4, 0xf4f1e8)
      .setScrollFactor(0)
      .setDepth(DEPTH.edgeMarker)
      .setVisible(false);

    const made = { icon, arrow: tip };
    this.markers[index] = made;
    return made;
  }
}
