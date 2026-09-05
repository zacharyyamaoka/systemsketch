/** A note box, leader knee, and pointed termination—small but recognisable at toolbar scale. */
export function CalloutIcon() {
  return (
    <div
      className="tlui-icon__placeholder systemsketch-callout-icon"
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
        <rect x="11" y="3.5" width="9.5" height="6.5" rx="1" />
        <path d="M11 7H7.5v8.5H3.7" />
        <path d="m5.7 13.5-2 2 2 2" />
        <path d="M13.5 6.5h4.5m-4.5 2h3" />
      </svg>
    </div>
  )
}
