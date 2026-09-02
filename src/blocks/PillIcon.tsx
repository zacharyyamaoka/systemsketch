/**
 * The Pill tool glyph: a capsule with `=` inside and its outlet on the rim —
 * the literal-argument pill at icon size. Inline for the same reason the Block
 * glyph is: one semantic tool should not extend the host's icon asset map.
 */
export function PillIcon() {
  return (
    <div
      className="tlui-icon__placeholder systemsketch-pill-icon"
      style={{ display: 'grid', placeItems: 'center', color: 'currentColor' }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: 'block' }}
        aria-hidden="true"
      >
        <rect x="1.5" y="7.5" width="16" height="9" rx="4.5" />
        <path d="M6.5 10.4h6M6.5 13.6h6" strokeWidth="2" />
        <circle cx="20.25" cy="12" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    </div>
  )
}
