import {
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  type TLUiDialogProps,
} from 'tldraw'
import type { ComponentProps, ReactNode } from 'react'
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_PRESETS,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  updateInterfaceScale,
  useInterfaceScale,
} from './interfaceScale'
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

const SETTINGS_CATEGORIES = [
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
] as const

export function SystemSketchSettingsDialog(_props: TLUiDialogProps) {
  const percent = useInterfaceScale()

  return (
    <div className="systemsketch-settings" data-testid="systemsketch-settings-dialog">
      <TldrawUiDialogHeader className="systemsketch-settings__header">
        <SettingsGearIcon className="systemsketch-settings__title-icon" />
        <TldrawUiDialogTitle>Settings</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody className="systemsketch-settings__body">
        <nav className="systemsketch-settings__nav" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={category.id === 'interface' ? 'is-active' : undefined}
              aria-current={category.id === 'interface' ? 'page' : undefined}
              disabled={category.id !== 'interface'}
              title={category.id === 'interface' ? undefined : `${category.label} settings are coming later`}
            >
              {category.icon}
              <span>{category.label}</span>
            </button>
          ))}
        </nav>
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
      </TldrawUiDialogBody>
    </div>
  )
}
