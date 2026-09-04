import { T } from 'tldraw'

/** Control-flow exits are semantic metadata, never a second kind of cable. */
export const CONTROL_ICON_KINDS = ['break', 'continue'] as const
export type ControlIconKind = (typeof CONTROL_ICON_KINDS)[number]

/** One source-backed exit that a Loop or Branch arm owns. */
export const ControlIcon = T.object({
	kind: T.literalEnum(...CONTROL_ICON_KINDS),
	line: T.number,
})
export type ControlIcon = T.TypeOf<typeof ControlIcon>

/** The fixed visual widths keep a header's icon column scannable. */
export const CONTROL_ICON_GAP = 3

export function controlIconWidth(icon: ControlIcon): number {
	return icon.kind === 'break' ? 20 : 28
}

export function controlIconRowWidth(icons: readonly ControlIcon[] | undefined): number {
	if (!icons?.length) return 0
	return icons.reduce((width, icon) => width + controlIconWidth(icon), 0)
		+ CONTROL_ICON_GAP * Math.max(0, icons.length - 1)
}
