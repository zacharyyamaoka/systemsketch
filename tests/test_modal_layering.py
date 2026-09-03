"""Guard the portal and layer contract for full-surface application modals.

tldraw's InFrontOfTheCanvas slot is itself a layer-250 stacking context. A
larger z-index on one of its descendants cannot cover panel or menu chrome, so
modal backdrops must escape through EditorPortal before using the shared modal
layer token.
"""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_command_palette_uses_the_full_surface_modal_contract() -> None:
    palette = (
        PROJECT_ROOT / "src" / "commands" / "SystemSketchCommandPalette.tsx"
    ).read_text(encoding="utf-8")
    commands_css = (
        PROJECT_ROOT / "src" / "commands" / "commands.css"
    ).read_text(encoding="utf-8")
    tokens = (
        PROJECT_ROOT / "src" / "theme" / "tokens.css"
    ).read_text(encoding="utf-8")

    assert "<EditorPortal>" in palette
    assert palette.index("<EditorPortal>") < palette.index(
        'className="systemsketch-command-palette__backdrop"'
    ) < palette.index("</EditorPortal>")
    assert "z-index: var(--systemsketch-layer-modal);" in commands_css
    assert "z-index: calc(var(--tl-layer-panels)" not in commands_css
    assert (
        "--systemsketch-layer-modal: var(--tl-layer-canvas-overlays, 500);"
        in tokens
    )
