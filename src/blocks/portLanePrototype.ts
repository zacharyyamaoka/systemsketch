/**
 * The port-lane prototype flag: `?portLanes=1`.
 *
 * WHY a URL flag and not a setting: this is a prototype of a second editing
 * model for a Block's ports (each lane is one multi-line document, one line
 * per port) living beside the shipped one-line-per-row editor. Until Zach has
 * driven it, it must be inert on every ordinary board — the same rule the
 * `variadicPrototype` and `portLinkPrototype` flags follow.
 */
export function portLanesEnabled(): boolean {
	if (typeof window === 'undefined') return false
	return new URLSearchParams(window.location.search).get('portLanes') === '1'
}
