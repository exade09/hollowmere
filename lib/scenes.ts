export type PanelId =
  | 'sigil' | 'raven' | 'chest' | 'books' | 'map' | 'astro' | 'mirror'
  | 'cage' | 'altar' | 'gate'
  /**
   * Talking to Wick. It has no hotzone of its own: the conversation is reached
   * from the permanent bar at the bottom, so it is on screen in every scene
   * and nobody has to find it by hovering the room.
   */
  | 'wick';

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
 * The wide numbers are a pure translation of the narrow ones: +320 px in x,
 * with the width untouched. That is what freezing the vertical field of view
 * means — the extra 640 px are added 320 to each side, the picture in the
 * middle is the same, and so an object's size on screen does not change. The
 * door is the one exception, and only because the 16:9 frame cut it off at the
 * edge: 367 px of it were visible there against 453 px here.
 *
 * Do not scale these by 2560/1920. That was the original bug: it happens to be
 * right at the centre of the frame and drifts to ~200 px of error at the door,
 * which is exactly the kind of mistake that survives a check of the y values.
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
          '21x9': { x: 374, y: 613, w: 234, h: 127 },
        },
      },
      {
        clip: '02_chest', label: 'the chest', action: { kind: 'panel', id: 'chest' },
        rects: {
          '16x9': { x: 590, y: 720, w: 145, h: 182 },
          '21x9': { x: 910, y: 720, w: 145, h: 182 },
        },
      },
      {
        clip: '03_bookshelf', label: 'the shelf', action: { kind: 'panel', id: 'books' },
        rects: {
          '16x9': { x: 458, y: 607, w: 227, h: 286 },
          '21x9': { x: 778, y: 607, w: 227, h: 286 },
        },
      },
      {
        clip: '04_map', label: 'the old map', action: { kind: 'panel', id: 'map' },
        rects: {
          '16x9': { x: 716, y: 499, w: 241, h: 174 },
          '21x9': { x: 1036, y: 499, w: 241, h: 174 },
        },
      },
      {
        clip: '05_astrolabe', label: 'the spheres', action: { kind: 'panel', id: 'astro' },
        rects: {
          '16x9': { x: 922, y: 525, w: 253, h: 374 },
          '21x9': { x: 1242, y: 525, w: 253, h: 374 },
        },
      },
      {
        clip: '06_mirror', label: 'the mirror', action: { kind: 'panel', id: 'mirror' },
        rects: {
          '16x9': { x: 1244, y: 537, w: 203, h: 336 },
          '21x9': { x: 1564, y: 537, w: 203, h: 336 },
        },
      },
      {
        clip: '07_door', label: 'the door down', action: { kind: 'travel', to: 'undercroft' },
        rects: {
          '16x9': { x: 1553, y: 388, w: 367, h: 672 },
          '21x9': { x: 1873, y: 388, w: 453, h: 672 },
        },
      },
      {
        // The sigil sits under the character; pushed below the chest in both
        // aspects so the two zones do not fight over the same pixels.
        clip: '00_idle', label: 'the sigil', action: { kind: 'panel', id: 'sigil' },
        rects: {
          '16x9': { x: 621, y: 906, w: 636, h: 135 },
          '21x9': { x: 941, y: 906, w: 636, h: 135 },
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
          '21x9': { x: 816, y: 328, w: 411, h: 372 },
        },
      },
      {
        // Nudged clear of the cage, which the export overlaps by a few pixels.
        clip: '02_altar', label: 'the altar', action: { kind: 'panel', id: 'altar' },
        rects: {
          '16x9': { x: 915, y: 551, w: 412, h: 210 },
          '21x9': { x: 1235, y: 551, w: 412, h: 210 },
        },
      },
      {
        clip: '03_gate', label: 'the sealed gate', action: { kind: 'panel', id: 'gate' },
        rects: {
          '16x9': { x: 1335, y: 237, w: 270, h: 466 },
          '21x9': { x: 1655, y: 237, w: 270, h: 466 },
        },
      },
      {
        clip: '00_idle', label: 'the stairs up', action: { kind: 'travel', to: 'sanctum' },
        rects: {
          '16x9': { x: 197, y: 124, w: 287, h: 254 },
          '21x9': { x: 517, y: 124, w: 287, h: 254 },
        },
      },
    ],
  },
};
