export type PanelId =
  | 'sigil' | 'raven' | 'chest' | 'books' | 'map' | 'astro' | 'mirror'
  | 'cage' | 'altar' | 'gate';

export type Zone = {
  /** Hover clip id — also the file name under /public/clips/<dir>/<res>/. */
  clip: string;
  /** What a click does: open a panel, or walk into another scene. */
  action: { kind: 'panel'; id: PanelId } | { kind: 'travel'; to: SceneId };
  label: string;
  rect: { x: number; y: number; w: number; h: number };
};

export type SceneId = 'sanctum' | 'undercroft';

export type Scene = {
  id: SceneId;
  title: string;
  /** Folder under /public/clips. */
  dir: string;
  idle: string;
  zones: Zone[];
};

/**
 * Rectangles are exported straight out of the Blender scenes through their
 * render cameras (scene/export_hotzones.py) on a fixed 1920x1080 canvas, so a
 * hotzone sits exactly on top of the object in the video at any window size
 * and never needs hand tuning.
 */
export const SCENES: Record<SceneId, Scene> = {
  sanctum: {
    id: 'sanctum',
    title: 'THE SANCTUM',
    dir: 'sanctum',
    idle: '00_idle',
    zones: [
      { clip: '01_raven', label: 'the raven', action: { kind: 'panel', id: 'raven' },
        rect: { x: 54, y: 613, w: 234, h: 127 } },
      { clip: '02_chest', label: 'the chest', action: { kind: 'panel', id: 'chest' },
        rect: { x: 590, y: 720, w: 145, h: 182 } },
      { clip: '03_bookshelf', label: 'the shelf', action: { kind: 'panel', id: 'books' },
        rect: { x: 458, y: 607, w: 227, h: 286 } },
      { clip: '04_map', label: 'the old map', action: { kind: 'panel', id: 'map' },
        rect: { x: 716, y: 499, w: 241, h: 174 } },
      { clip: '05_astrolabe', label: 'the spheres', action: { kind: 'panel', id: 'astro' },
        rect: { x: 922, y: 525, w: 253, h: 374 } },
      { clip: '06_mirror', label: 'the mirror', action: { kind: 'panel', id: 'mirror' },
        rect: { x: 1244, y: 537, w: 203, h: 336 } },
      { clip: '07_door', label: 'the door down', action: { kind: 'travel', to: 'undercroft' },
        rect: { x: 1553, y: 388, w: 367, h: 672 } },
      // The sigil sits under the character; pushed below the chest so the two
      // zones do not fight over the same pixels.
      { clip: '00_idle', label: 'the sigil', action: { kind: 'panel', id: 'sigil' },
        rect: { x: 621, y: 906, w: 636, h: 135 } },
    ],
  },
  undercroft: {
    id: 'undercroft',
    title: 'THE UNDERCROFT',
    dir: 'undercroft',
    idle: '00_idle',
    zones: [
      { clip: '01_cage', label: 'the cage', action: { kind: 'panel', id: 'cage' },
        rect: { x: 496, y: 328, w: 411, h: 372 } },
      { clip: '02_altar', label: 'the altar', action: { kind: 'panel', id: 'altar' },
        rect: { x: 915, y: 551, w: 412, h: 210 } },
      { clip: '03_gate', label: 'the sealed gate', action: { kind: 'panel', id: 'gate' },
        rect: { x: 1335, y: 237, w: 270, h: 466 } },
      { clip: '00_idle', label: 'the stairs up', action: { kind: 'travel', to: 'sanctum' },
        rect: { x: 197, y: 124, w: 287, h: 254 } },
    ],
  },
};

export const CANVAS = { w: 1920, h: 1080 };
