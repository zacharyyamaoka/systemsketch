import { getDefaultBlockProps, type BlockShapeProps } from './blockModel'

/** The authored block type that opts into the Type definition presentation. */
export const TYPE_BLOCK_TYPE = 'type'

/** One source line, preserved as text but annotated with its readable pieces. */
export interface TypeAttribute {
  id: string
  line: number
  indent: number
  raw: string
  name: string
  type: string
  value: string
  children: TypeAttribute[]
}

/** A parser failure stays a visible text line instead of becoming a validation error. */
export function parseTypeAttributeSource(source: string): TypeAttribute[] {
  const roots: TypeAttribute[] = []
	const stack: TypeAttribute[] = []
	const lines = source.replace(/\r\n?/g, '\n').split('\n')
	let classIndent: number | null = null
	let docstringQuote: `'''` | '"""' | null = null

	lines.forEach((rawLine, line) => {
		const trimmed = rawLine.trim()
		if (docstringQuote) {
			if (trimmed.includes(docstringQuote)) docstringQuote = null
			return
		}
		if (trimmed === '' || trimmed.startsWith('#')) return
		const openingQuote = trimmed.startsWith('"""') ? '"""' : trimmed.startsWith("'''") ? "'''" : null
		if (openingQuote) {
			// A one-line class docstring opens and closes immediately. Otherwise,
			// suppress its prose until the matching closing delimiter.
			if (trimmed.slice(3).includes(openingQuote)) return
			docstringQuote = openingQuote
			return
		}
    const indent = rawLine.length - rawLine.trimStart().length
    if (/^class\s+[A-Za-z_]\w*(?:\[[^\]]+\])?\s*(?:\([^)]*\))?\s*:$/.test(trimmed)) {
      classIndent = indent
      return
    }
    // A pasted NamedTuple class body carries one extra authoring indent. It is
    // not semantic nesting, so remove it before drawing the Type's tree.
    const relativeIndent = classIndent !== null && indent > classIndent
      ? indent - classIndent - 4
      : indent
    const match = /^([A-Za-z_]\w*)\s*:\s*([^=]+?)(?:\s*=\s*(.*))?$/.exec(trimmed)
    const attribute: TypeAttribute = match
      ? {
          id: `${line}:${match[1]}`,
          line,
          indent: Math.max(0, relativeIndent),
          raw: rawLine,
          name: match[1],
          type: match[2].trim(),
          value: (match[3] ?? '').trim(),
          children: [],
        }
      : {
          id: `${line}:raw`,
          line,
          indent: Math.max(0, relativeIndent),
          raw: rawLine,
          name: trimmed,
          type: '',
          value: '',
          children: [],
        }

    while (stack.length > 0 && attribute.indent <= stack[stack.length - 1]!.indent) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(attribute)
    else roots.push(attribute)
    stack.push(attribute)
  })
  return roots
}

export function typeAttributeDisplay(attribute: Pick<TypeAttribute, 'name' | 'type' | 'value'>): string {
  const hint = attribute.type ? `: ${attribute.type}` : ''
  const value = attribute.value ? ` = ${attribute.value}` : ''
  return `${attribute.name}${hint}${value}`
}

export function isTypeBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
  return props.blockType.trim().toLowerCase() === TYPE_BLOCK_TYPE
}

/**
 * A Type is a Block-shaped definition, not a new dataflow engine. Its one body
 * is text because Python annotations already have mature, composable syntax.
 * The canvas tree is a read projection that can be dense without becoming a
 * parallel editable schema.
 */
export function createTypeProps(base = getDefaultBlockProps()): BlockShapeProps {
  const port = { w: 380, h: 264 }
  const expanded = { w: 560, h: 460 }
  return {
    ...base,
    title: base.title || 'Type',
    description: '',
    blockType: TYPE_BLOCK_TYPE,
    icon: 'Braces',
    attributeSource: base.attributeSource || 'field: Type',
    view: 'port',
    w: port.w,
    h: port.h,
    views: {
      ...base.views,
      port,
      expanded,
    },
    inputs: [],
    outputs: [],
  }
}
