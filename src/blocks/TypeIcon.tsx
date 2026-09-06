/**
 * The Type tool glyph: a small record declaration, distinct from the Block
 * rectangle and the Pill capsule at icon size.
 */
export function TypeIcon() {
  return (
    <div
      className="tlui-icon__placeholder systemsketch-type-icon"
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
        <path d="M4 4.5h16v15h-16z" />
        <path d="M7.5 9h4.5M7.5 12.5h6.5M7.5 16h3.5" />
      </svg>
    </div>
  )
}
