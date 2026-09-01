/**
 * The Block tool glyph: the cube-plus mark proven in the earlier pyblocks UI.
 *
 * tldraw accepts a React element in a tool's icon slot. Keeping the SVG inline
 * makes the Block tool self-contained and avoids extending the host's icon
 * asset map solely for one semantic tool.
 */
export function BlockIcon() {
  return (
    <div
      className="tlui-icon__placeholder systemsketch-block-icon"
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
        <path d="M12.5 2.75a1.55 1.55 0 0 0-1.55 0L4.4 6.45a1.3 1.3 0 0 0-.65 1.12v6.86c0 .47.25.9.65 1.13l6.55 3.7c.48.27 1.07.27 1.55 0l.85-.48" />
        <path d="m3.9 6.8 7.85 4.2m0 0 7.85-4.2M11.75 11v8.5" />
        <path d="M19.6 7.6v3.9" />
        <path d="M17.3 18.1h5.1m-2.55-2.55v5.1" />
      </svg>
    </div>
  )
}
