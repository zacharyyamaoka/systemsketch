import {
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  type TLUiDialogProps,
} from 'tldraw'
import { useRef, useState, type ChangeEvent, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_PRESETS,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  updateInterfaceScale,
  useInterfaceScale,
} from './interfaceScale'
import {
  sameChoice,
  SYSTEMSKETCH_SWATCHES,
  themeOptions,
  type SwatchTokens,
  type ThemeOption,
  type ThemePalette,
} from '../theme/themeModel'
import { BUILT_IN_PALETTES } from '../theme/palettes'
import {
  addImportedPalette,
  removeImportedPalette,
  updateThemeChoice,
  useImportedPalettes,
  useThemeChoice,
} from '../theme/themeStore'
import { paletteFromVsCodeTheme, parseVsCodeThemeText, slugify } from '../theme/vscodeTheme'
import './interface-settings.css'

export function SettingsGearIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M7.95 2.7h4.1l.52 2.05c.36.15.7.35 1.02.58l2.03-.59 2.05 3.55-1.52 1.47a6.8 6.8 0 0 1 0 1.18l1.52 1.47-2.05 3.55-2.03-.59c-.32.23-.66.43-1.02.58L12.05 18h-4.1l-.52-2.05a6.43 6.43 0 0 1-1.02-.58l-2.03.59-2.05-3.55 1.52-1.47a6.8 6.8 0 0 1 0-1.18L2.33 8.29l2.05-3.55 2.03.59c.32-.23.66-.43 1.02-.58L7.95 2.7Z" />
      <circle cx="10" cy="10.35" r="2.35" />
    </svg>
  )
}

function CategoryIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {children}
    </svg>
  )
}

type SettingsCategoryId = 'general' | 'appearance' | 'interface' | 'shortcuts' | 'about'

const SETTINGS_CATEGORIES: readonly { id: SettingsCategoryId; label: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: <CategoryIcon><path d="M4 5.5h12M4 10h12M4 14.5h12" /><circle cx="7" cy="5.5" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="8.5" cy="14.5" r="1.4" /></CategoryIcon>,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <CategoryIcon><circle cx="10" cy="10" r="6.5" /><path d="M10 3.5a6.5 6.5 0 0 0 0 13Z" /></CategoryIcon>,
  },
  {
    id: 'interface',
    label: 'Interface',
    icon: <CategoryIcon><rect x="3.5" y="4" width="13" height="12" rx="2" /><path d="M3.5 7.5h13M7.5 7.5V16" /></CategoryIcon>,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: <CategoryIcon><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M6 8h.01M9 8h.01M12 8h.01M15 8h.01M6 11h.01M9 11h.01M12 11h3M7 13h6" /></CategoryIcon>,
  },
  {
    id: 'about',
    label: 'About',
    icon: <CategoryIcon><circle cx="10" cy="10" r="6.5" /><path d="M10 9v4M10 6.7h.01" /></CategoryIcon>,
  },
]

const OPEN_CATEGORIES: readonly SettingsCategoryId[] = ['appearance', 'interface']

/** The category the dialog opens on; a caller may ask for another. */
export interface SystemSketchSettingsDialogProps extends TLUiDialogProps {
  category?: SettingsCategoryId
}

export function SystemSketchSettingsDialog({ category: initial }: SystemSketchSettingsDialogProps) {
  const [category, setCategory] = useState<SettingsCategoryId>(initial ?? 'interface')

  return (
    <div className="systemsketch-settings" data-testid="systemsketch-settings-dialog" data-category={category}>
      <TldrawUiDialogHeader className="systemsketch-settings__header">
        <SettingsGearIcon className="systemsketch-settings__title-icon" />
        <TldrawUiDialogTitle>Settings</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody className="systemsketch-settings__body">
        <nav className="systemsketch-settings__nav" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((item) => {
            const open = OPEN_CATEGORIES.includes(item.id)
            const active = item.id === category
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'is-active' : undefined}
                aria-current={active ? 'page' : undefined}
                disabled={!open}
                title={open ? undefined : `${item.label} settings are coming later`}
                data-testid={`systemsketch-settings-category-${item.id}`}
                onClick={() => setCategory(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        {category === 'appearance' ? <AppearancePanel /> : <InterfacePanel />}
      </TldrawUiDialogBody>
    </div>
  )
}

function InterfacePanel() {
  const percent = useInterfaceScale()

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="interface-scale-title">
      <div className="systemsketch-settings__eyebrow">Interface</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="interface-scale-title">Interface scale</h2>
          <p>Make menus, panels, and the toolbar easier to see on high-resolution displays.</p>
        </div>
        <output aria-live="polite" htmlFor="systemsketch-interface-scale">{percent}%</output>
      </div>

      <div className="systemsketch-settings__slider-row">
        <span aria-hidden="true">A</span>
        <input
          id="systemsketch-interface-scale"
          type="range"
          min={MIN_INTERFACE_SCALE}
          max={MAX_INTERFACE_SCALE}
          step={INTERFACE_SCALE_STEP}
          value={percent}
          aria-valuetext={`${percent}%`}
          onChange={(event) => updateInterfaceScale(Number(event.currentTarget.value))}
        />
        <span className="large" aria-hidden="true">A</span>
      </div>

      <div className="systemsketch-settings__presets" aria-label="Interface scale presets">
        {INTERFACE_SCALE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={preset === percent ? 'is-active' : undefined}
            aria-pressed={preset === percent}
            onClick={() => updateInterfaceScale(preset)}
          >
            {preset}%
          </button>
        ))}
      </div>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>This changes the app interface only. Canvas zoom and board files stay unchanged.</p>
        </div>
      </div>

      <button
        type="button"
        className="systemsketch-settings__reset"
        disabled={percent === DEFAULT_INTERFACE_SCALE}
        onClick={() => updateInterfaceScale(DEFAULT_INTERFACE_SCALE)}
      >
        Reset to 100%
      </button>
    </section>
  )
}

/**
 * A miniature of the theme: its canvas, a panel on it, a line of text and the
 * accent. Painted from the palette's own values — those are data, not chrome,
 * which is why they may be inline here. "Match system" shows both halves.
 */
function ThemeSwatch({ option, palettes }: { option: ThemeOption; palettes: readonly ThemePalette[] }) {
  const halves: SwatchTokens[] = option.choice.kind === 'palette'
    ? [swatchOf(palettes, option.id)]
    : option.scheme === 'system'
      ? [SYSTEMSKETCH_SWATCHES.light, SYSTEMSKETCH_SWATCHES.dark]
      : [SYSTEMSKETCH_SWATCHES[option.scheme]]
  return (
    <span className="systemsketch-theme-swatch" aria-hidden="true" data-halves={halves.length}>
      {halves.map((tokens, index) => (
        <span
          key={index}
          className="systemsketch-theme-swatch__half"
          style={{
            '--swatch-surface': tokens.surface,
            '--swatch-raised': tokens.surfaceRaised,
            '--swatch-text': tokens.text,
            '--swatch-accent': tokens.accent,
            '--swatch-border': tokens.border,
          } as CSSProperties}
        >
          <i className="systemsketch-theme-swatch__panel" />
          <i className="systemsketch-theme-swatch__accent" />
        </span>
      ))}
    </span>
  )
}

function swatchOf(palettes: readonly ThemePalette[], id: string): SwatchTokens {
  const palette = palettes.find((item) => item.id === id)
  return palette ? palette.tokens : SYSTEMSKETCH_SWATCHES.light
}

function AppearancePanel() {
  const choice = useThemeChoice()
  const imported = useImportedPalettes()
  const options = themeOptions(BUILT_IN_PALETTES, imported)
  const palettes = [...BUILT_IN_PALETTES, ...imported]
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [importMessage, setImportMessage] = useState<{ kind: 'error' | 'note'; text: string } | null>(null)

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const theme = parseVsCodeThemeText(await file.text())
      if (!theme.colors || Object.keys(theme.colors).length === 0) {
        throw new Error(`${file.name} has no "colors" table, so it is not a VS Code colour theme.`)
      }
      const name = theme.name ?? file.name.replace(/\.jsonc?$/i, '')
      const { palette, fallbacks } = paletteFromVsCodeTheme(theme, {
        id: `imported:${slugify(name)}`,
        label: name,
        source: `Imported from ${file.name}`,
      })
      addImportedPalette(palette)
      setImportMessage(fallbacks.length
        ? {
            kind: 'note',
            text: `Imported ${name}. It did not name ${fallbacks.length} of the ${Object.keys(palette.tokens).length} tokens (${fallbacks.join(', ')}); those use VS Code's defaults.`,
          }
        : { kind: 'note', text: `Imported ${name}; every token came from the theme itself.` })
    } catch (cause) {
      setImportMessage({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      input.value = ''
    }
  }

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="appearance-title">
      <div className="systemsketch-settings__eyebrow">Appearance</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="appearance-title">Color theme</h2>
          <p>The board, its menus and every panel wear one theme. Import a VS Code or Cursor theme file to use it here.</p>
        </div>
      </div>

      <div className="systemsketch-theme-list" role="radiogroup" aria-label="Color theme" data-testid="systemsketch-theme-list">
        {options.map((option) => {
          const active = sameChoice(option.choice, choice)
          return (
            <div key={option.id} className={`systemsketch-theme-option${active ? ' is-active' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`systemsketch-theme-option-${option.id}`}
                onClick={() => updateThemeChoice(option.choice)}
              >
                <ThemeSwatch option={option} palettes={palettes} />
                <span className="systemsketch-theme-option__text">
                  <span className="systemsketch-theme-option__label">{option.label}</span>
                  <span className="systemsketch-theme-option__detail">{option.detail}</span>
                </span>
              </button>
              {option.removable ? (
                <button
                  type="button"
                  className="systemsketch-theme-option__remove"
                  aria-label={`Remove ${option.label}`}
                  title="Remove this imported theme"
                  onClick={() => removeImportedPalette(option.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>Shape colours are part of each board and look the same in every theme; only the app around them changes.</p>
        </div>
      </div>

      <div className="systemsketch-settings__actions">
        <button
          type="button"
          className="systemsketch-settings__import"
          data-testid="systemsketch-theme-import-button"
          onClick={() => fileInput.current?.click()}
        >
          Import VS Code theme…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.jsonc,application/json"
          hidden
          data-testid="systemsketch-theme-import"
          onChange={(event) => void onImportFile(event)}
        />
        <span className="systemsketch-settings__hint">
          A theme's <code>.json</code> from VS Code, Cursor or the marketplace.
        </span>
      </div>
      {importMessage ? (
        <p
          className={`systemsketch-settings__message is-${importMessage.kind}`}
          role={importMessage.kind === 'error' ? 'alert' : 'status'}
          data-testid="systemsketch-theme-import-message"
        >
          {importMessage.text}
        </p>
      ) : null}
    </section>
  )
}
