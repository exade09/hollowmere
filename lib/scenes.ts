export type PanelId =
  | 'sigil' | 'raven' | 'chest' | 'books' | 'map' | 'astro' | 'mirror'
  | 'cage' | 'altar' | 'gate';

export type SceneId = 'sanctum' | 'undercroft';

/**
 * Two authored aspect ratios. Both are the same picture from the same camera:
 * the 21:9 pass keeps the vertical field of view frozen and adds its extra
 * pixels at the sides, so nothing is reframed and no animation differs. Only
 * the hotzone rectangles change, because the frame is wider.
 */
export type Aspect = '16x9' | '21x9';

export type Rect = { x: number; y: number; w: number; h: number };

export type Zone = {
  /** Hover clip id — also the file name under /public/clips/<dir>/<res>/. */
  clip: string;
  /** What a click does: open a panel, or walk into another scene. */
  action: { kind: 'panel'; id: PanelId } | { kind: 'travel'; to: SceneId };
  label: string;
  /** Same zone, one rectangle per authored aspect. */
  rects: Record<Aspect, Rect>;
};

export type Scene = {
  id: SceneId;
  title: string;
  idle: string;
  /** Clip folder under /public/clips, per aspect. */
  dirs: Record<Aspect, string>;
  zones: Zone[];
};

export const CANVASES: Record<Aspect, { w: number; h: number }> = {
  '16x9': { w: 1920, h: 1080 },
  '21x9': { w: 2560, h: 1080 },
};

/** A window this wide or wider gets the 21:9 set and almost no letterbox. */
export const WIDE_FROM = 2.0;

export function aspectFor(w: number, h: number): Aspect {
  return h > 0 && w / h >= WIDE_FROM ? '21x9' : '16x9';
}

/**
 * Rectangles are exported straight out of the Blender scenes through their
 * render cameras (scene/export_hotzones.py, once per aspect) on the canvas
 * sizes above, so a hotzone sits exactly on top of the object in the video at
 * any window size and never needs hand tuning.
 *
 * Note the y values are identical across the two aspects: that is the whole
 * point of how the wide pass is built.
 */
export const SCENES: Record<SceneId, Scene> = {
  sanctum: {
    id: 'sanctum',
    title: 'THE SANCTUM',
    idle: '00_idle',
    dirs: { '16x9': 'sanctum', '21x9': 'sanctum-21x9' },
    zones: [
      {
        clip: '01_raven', label: 'the raven', action: { kind: 'panel', id: 'raven' },
        rects: {
          '16x9': { x: 54, y: 613, w: 234, h: 127 },
          '21x9': { x: 72, y: 613, w: 312, h: 127 },
        },
      },
      {
        clip: '02_chest', label: 'the chest', action: { kind: 'panel', id: 'chest' },
        rects: {
          '16x9': { x: 590, y: 720, w: 145, h: 182 },
          '21x9': { x: 787, y: 720, w: 194, h: 182 },
        },
      },
      {
        clip: '03_bookshelf', label: 'the shelf', action: { kind: 'panel', id: 'books' },
        rects: {
          '16x9': { x: 458, y: 607, w: 227, h: 286 },
          '21x9': { x: 611, y: 607, w: 302, h: 286 },
        },
      },
      {
        clip: '04_map', label: 'the old map', action: { kind: 'panel', id: 'map' },
        rects: {
          '16x9': { x: 716, y: 499, w: 241, h: 174 },
          '21x9': { x: 955, y: 499, w: 322, h: 174 },
        },
      },
      {
        clip: '05_astrolabe', label: 'the spheres', action: { kind: 'panel', id: 'astro' },
        rects: {
          '16x9': { x: 922, y: 525, w: 253, h: 374 },
          '21x9': { x: 1229, y: 525, w: 337, h: 374 },
        },
      },
      {
        clip: '06_mirror', label: 'the mirror', action: { kind: 'panel', id: 'mirror' },
        rects: {
          '16x9': { x: 1244, y: 537, w: 203, h: 336 },
          '21x9': { x: 1659, y: 537, w: 271, h: 336 },
        },
      },
      {
        clip: '07_door', label: 'the door down', action: { kind: 'travel', to: 'undercroft' },
        rects: {
          '16x9': { x: 1553, y: 388, w: 367, h: 672 },
          '21x9': { x: 2070, y: 388, w: 490, h: 672 },
        },
      },
      {
        // The sigil sits under the character; pushed below the chest in both
        // aspects so the two zones do not fight over the same pixels.
        clip: '00_idle', label: 'the sigil', action: { kind: 'panel', id: 'sigil' },
        rects: {
          '16x9': { x: 621, y: 906, w: 636, h: 135 },
          '21x9': { x: 828, y: 906, w: 849, h: 135 },
        },
      },
    ],
  },
  undercroft: {
    id: 'undercroft',
    title: 'THE UNDERCROFT',
    idle: '00_idle',
    dirs: { '16x9': 'undercroft', '21x9': 'undercroft-21x9' },
    zones: [
      {
        clip: '01_cage', label: 'the cage', action: { kind: 'panel', id: 'cage' },
        rects: {
          '16x9': { x: 496, y: 328, w: 411, h: 372 },
          '21x9': { x: 662, y: 328, w: 548, h: 372 },
        },
      },
      {
        // Nudged clear of the cage, which the export overlaps by a few pixels.
        clip: '02_altar', label: 'the altar', action: { kind: 'panel', id: 'altar' },
        rects: {
          '16x9': { x: 915, y: 551, w: 412, h: 210 },
          '21x9': { x: 1218, y: 551, w: 551, h: 210 },
        },
      },
      {
        clip: '03_gate', label: 'the sealed gate', action: { kind: 'panel', id: 'gate' },
        rects: {
          '16x9': { x: 1335, y: 237, w: 270, h: 466 },
          '21x9': { x: 1780, y: 237, w: 360, h: 466 },
        },
      },
      {
        clip: '00_idle', label: 'the stairs up', action: { kind: 'travel', to: 'sanctum' },
        rects: {
          '16x9': { x: 197, y: 124, w: 287, h: 254 },
          '21x9': { x: 262, y: 124, w: 383, h: 254 },
        },
      },
    ],
  },
};
