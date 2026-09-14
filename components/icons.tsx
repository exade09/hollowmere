/**
 * The few marks that are drawn rather than rendered.
 *
 * Everything else in this interface is Blender output — the object portraits,
 * the panel stone, the character. These are not: an icon that has to sit at
 * 14 px inside a line of text needs to be a shape, not an image, so it stays
 * crisp, takes its colour from the text around it and costs no request.
 *
 * Both marks are cut the same way as the rest of the interface: straight
 * edges, flat faces, no curves and no gradients. Nothing here is traced from
 * anyone's artwork — they are two crossed bands and a leaf of paper, built
 * from the same chamfer the plates are.
 */

type IconProps = { size?: number; className?: string };

/**
 * The mark for the account.
 *
 * Two tapered bands crossing, drawn in the same faceted geometry as the
 * world's own marks. They overlap rather than interlock, which at this size is
 * indistinguishable and is one path each instead of three.
 */
export function XMark({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <polygon points="1.8,2 6.6,2 22.2,22 17.4,22" />
      <polygon points="17.4,2 22.2,2 6.6,22 1.8,22" />
    </svg>
  );
}

/** A leaf of paper with a folded corner: the manual, and the link to it. */
export function PageMark({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <polygon points="4,2 15,2 20,7 20,22 4,22" />
      <polyline points="15,2 15,7 20,7" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" />
      <line x1="7.5" y1="16.5" x2="13" y2="16.5" />
    </svg>
  );
}
