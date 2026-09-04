"""The token layer's gates.

`src/theme/tokens.css` is the only place in `src/` allowed to hold a chrome
colour literal. Everything else names a token, so a theme is a table of values
and no stylesheet ever learns what a host is. This file is what stops that
migrating back one file at a time — and what keeps the CSS vocabulary, the
TypeScript vocabulary and the host list from drifting apart.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC = PROJECT_ROOT / "src"
TOKENS_CSS = SRC / "theme" / "tokens.css"
THEME_MODEL = SRC / "theme" / "themeModel.ts"
WORKSPACE_CSS = SRC / "workspace" / "local-workspace.css"


def tldraw_css() -> Path:
    """tldraw's stylesheet, resolved the way Node would: this checkout's
    node_modules first, then each parent's — a worktree nested inside the main
    checkout has no node_modules of its own."""
    for base in (PROJECT_ROOT, *PROJECT_ROOT.parents):
        candidate = base / "node_modules" / "tldraw" / "tldraw.css"
        if candidate.is_file():
            return candidate
    raise AssertionError("tldraw/tldraw.css not found in any node_modules above the repo")


TLDRAW_CSS = tldraw_css()

# A hex colour, an rgb()/hsl() function, or the two named colours a light-only
# stylesheet reaches for. `white-space` and `black-listed` are not colours, so
# the named forms require a non-word, non-hyphen neighbour on each side.
COLOR_LITERAL = re.compile(
    r"#[0-9a-fA-F]{3,8}\b"
    r"|\brgba?\("
    r"|\bhsla?\("
    r"|(?<![\w-])(?:white|black)(?![\w-])"
)

# A line may keep a literal if it says why with this marker. It is for the
# handful of values that are document content living in a chrome file — a
# swatch of a shape colour — never for a colour the theme should own.
CONTENT_MARKER = "/* ss-content:"

# Whole files that are content, not chrome, with the reason each one is.
CONTENT_FILES: dict[str, str] = {
    "src/appearance/appearance.css": (
        "the FigJam appearance pill: a spec-measured dark pill (rgb 30,30,30) and the "
        "22-swatch palette a person picks shape colours from. The swatches are document "
        "content; the pill's surface equals --ss-surface-inverse and is the appearance "
        "track's live file, to be pointed at that token when the track lands."
    ),
    "src/blocks/ui/hit-area-overlay.css": (
        "a debug instrument: the reds outline hit areas for the browser journeys and are "
        "compiled out of released builds."
    ),
}


def css_files() -> list[Path]:
    return sorted(path for path in SRC.rglob("*.css"))


def strip_comments(css: str) -> str:
    """Blank every comment, keeping newlines so line numbers still point home."""
    return re.sub(
        r"/\*.*?\*/",
        lambda match: re.sub(r"[^\n]", " ", match.group(0)),
        css,
        flags=re.S,
    )


def declarations_in_block(css: str, selector_pattern: str) -> dict[str, str]:
    match = re.search(selector_pattern + r"\s*\{([^}]*)\}", css)
    if not match:
        raise AssertionError(f"tokens.css has no block matching {selector_pattern}")
    out: dict[str, str] = {}
    for line in strip_comments(match.group(1)).split(";"):
        if ":" in line:
            key, _, value = line.partition(":")
            out[key.strip()] = value.strip()
    return out


def per_theme_tokens(css: str, selector_pattern: str) -> list[str]:
    return sorted(key for key in declarations_in_block(css, selector_pattern) if key.startswith("--ss-"))


def kebab(name: str) -> str:
    return "--ss-" + re.sub(r"([A-Z0-9])", lambda m: "-" + m.group(1).lower(), name)


class ChromeColourLiteralTests(unittest.TestCase):
    def test_tokens_css_is_the_only_stylesheet_with_a_chrome_colour_literal(self) -> None:
        offenders: list[str] = []
        for path in css_files():
            relative = path.relative_to(PROJECT_ROOT).as_posix()
            if path == TOKENS_CSS or relative in CONTENT_FILES:
                continue
            source = path.read_text(encoding="utf-8")
            raw_lines = source.splitlines()
            for number, line in enumerate(strip_comments(source).splitlines(), 1):
                if CONTENT_MARKER in raw_lines[number - 1]:
                    continue
                if COLOR_LITERAL.search(line):
                    offenders.append(f"{relative}:{number}: {raw_lines[number - 1].strip()}")
        self.assertEqual(
            offenders,
            [],
            "chrome colour literals outside src/theme/tokens.css — name a token instead:\n"
            + "\n".join(offenders),
        )

    def test_every_content_file_in_the_allowlist_exists_and_still_needs_it(self) -> None:
        for relative, reason in CONTENT_FILES.items():
            path = PROJECT_ROOT / relative
            with self.subTest(file=relative):
                self.assertTrue(path.is_file(), f"{relative} is allowlisted but gone")
                self.assertGreater(len(reason), 40, "an allowlist entry needs a real reason")
                literals = [
                    line for line in strip_comments(path.read_text(encoding="utf-8")).splitlines()
                    if COLOR_LITERAL.search(line)
                ]
                self.assertTrue(literals, f"{relative} has no literals left; drop it from the allowlist")

    def test_content_markers_carry_a_reason(self) -> None:
        for path in css_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if CONTENT_MARKER in line:
                    reason = line.split(CONTENT_MARKER, 1)[1].split("*/", 1)[0].strip()
                    self.assertGreater(
                        len(reason), 4,
                        f"{path.relative_to(PROJECT_ROOT)}:{number} marks content without saying why",
                    )


class VocabularyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.css = TOKENS_CSS.read_text(encoding="utf-8")
        self.model = THEME_MODEL.read_text(encoding="utf-8")

    def test_the_css_and_typescript_vocabularies_are_the_same_list(self) -> None:
        names = re.search(r"TOKEN_NAMES = \[(.*?)\] as const", self.model, flags=re.S)
        assert names is not None, "themeModel.ts lost TOKEN_NAMES"
        ts_tokens = sorted(kebab(name) for name in re.findall(r"'(\w+)'", names.group(1)))
        css_tokens = per_theme_tokens(self.css, r"\[data-ss-theme='systemsketch'\] \.tl-container")
        self.assertEqual(css_tokens, ts_tokens)

    def test_every_theme_block_supplies_the_whole_vocabulary(self) -> None:
        vocabulary = per_theme_tokens(self.css, r"\[data-ss-theme='systemsketch'\] \.tl-container")
        for selector in (
            r"\[data-ss-theme='vscode'\]",
            r"\[data-ss-theme='obsidian'\]",
            r":where\(\[data-ss-theme\]\)",
            r":where\(\[data-ss-theme\]\[data-ss-color-scheme='dark'\]\)",
        ):
            with self.subTest(block=selector):
                self.assertEqual(per_theme_tokens(self.css, selector), vocabulary)

    def test_every_known_host_has_a_theme_block(self) -> None:
        hosts = re.search(r"KNOWN_HOST_THEMES = \[(.*?)\] as const", self.model, flags=re.S)
        assert hosts is not None, "themeModel.ts lost KNOWN_HOST_THEMES"
        for host in re.findall(r"'([\w-]+)'", hosts.group(1)):
            with self.subTest(host=host):
                self.assertIn(f"[data-ss-theme='{host}']", self.css)

    def test_the_prepaint_script_knows_the_same_hosts(self) -> None:
        hosts = re.search(r"KNOWN_HOST_THEMES = \[(.*?)\] as const", self.model, flags=re.S)
        assert hosts is not None
        expected = sorted(re.findall(r"'([\w-]+)'", hosts.group(1)))
        html = (PROJECT_ROOT / "index.html").read_text(encoding="utf-8")
        prepaint = re.search(r"var known = \[(.*?)\]", html)
        assert prepaint is not None, "index.html lost its pre-paint host list"
        self.assertEqual(sorted(re.findall(r"'([\w-]+)'", prepaint.group(1))), expected)

    def test_every_token_a_stylesheet_reads_is_defined(self) -> None:
        defined = set(re.findall(r"(--ss-[\w-]+)\s*:", self.css))
        for path in css_files():
            for name in set(re.findall(r"var\((--ss-[\w-]+)", path.read_text(encoding="utf-8"))):
                with self.subTest(file=path.name, token=name):
                    self.assertIn(name, defined, f"{path.name} reads {name}, which tokens.css never defines")

    def test_every_tldraw_token_a_stylesheet_reads_exists_in_tldraw(self) -> None:
        """`--tl-color-text-2` was referenced eight times and never existed."""
        tldraw = TLDRAW_CSS.read_text(encoding="utf-8")
        defined = set(re.findall(r"(--tl-[\w-]+)\s*:", tldraw))
        for path in css_files():
            for name in set(re.findall(r"var\((--tl-[\w-]+)", path.read_text(encoding="utf-8"))):
                with self.subTest(file=path.name, token=name):
                    self.assertIn(name, defined, f"{path.name} reads {name}, which tldraw {TLDRAW_CSS.name} never defines")

    def test_the_default_theme_derives_from_tldraw_inside_the_container(self) -> None:
        block = declarations_in_block(self.css, r"\[data-ss-theme='systemsketch'\] \.tl-container")
        derived = [key for key, value in block.items() if key.startswith("--ss-") and "var(--tl-" in value]
        # Everything except the FigJam pill's two fixed values.
        self.assertGreaterEqual(len(derived), len(block) - 2)
        self.assertNotIn("[data-ss-theme='systemsketch'] {", self.css, "declared above .tl-container, --tl-* would resolve to nothing")

    def test_a_palette_repaints_tldraws_own_ui(self) -> None:
        block = declarations_in_block(self.css, r"\[data-ss-theme\]:not\(\[data-ss-theme='systemsketch'\]\) \.tl-container")
        for token in ("--tl-color-background", "--tl-color-panel", "--tl-color-text-1", "--tl-color-divider", "--tl-color-selected"):
            with self.subTest(token=token):
                self.assertIn(token, block)
                self.assertIn("var(--ss-", block[token])


class GeneratedPaletteTests(unittest.TestCase):
    """The shipped Dark Modern palette was read from the theme file installed
    here. If that file changes — a Cursor or VS Code update — the palette is
    stale and `npm run theme:import` must be re-run."""

    THEME_DIRS = (
        Path("/usr/share/cursor/resources/app/extensions/theme-defaults/themes"),
        Path("/usr/share/code/resources/app/extensions/theme-defaults/themes"),
        Path("/snap/code/current/usr/share/code/resources/app/extensions/theme-defaults/themes"),
    )

    def test_dark_modern_matches_the_theme_file_installed_here(self) -> None:
        import hashlib

        generated = (SRC / "theme" / "palettes" / "darkModern.ts").read_text(encoding="utf-8")
        recorded = dict(re.findall(r"\*\s+(\S+dark_\w+\.json) \(sha256 ([0-9a-f]{12})\)", generated))
        self.assertTrue(recorded, "darkModern.ts lost its provenance lines")
        installed = next((d for d in self.THEME_DIRS if (d / "dark_modern.json").is_file()), None)
        if installed is None:
            self.skipTest("no VS Code / Cursor theme-defaults on this machine")
        for recorded_path, digest in recorded.items():
            name = Path(recorded_path).name
            with self.subTest(file=name):
                actual = hashlib.sha256((installed / name).read_bytes()).hexdigest()[:12]
                self.assertEqual(actual, digest, f"{name} changed since the palette was generated; run npm run theme:import")


class RootStampTests(unittest.TestCase):
    def test_both_lanes_stamp_the_theme_on_their_root(self) -> None:
        app = (SRC / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("data-ss-theme={theme.theme}", app)
        self.assertIn("data-ss-color-scheme={theme.scheme}", app)
        self.assertIn("installBoardTheme(editor)", app)
        embedded = (SRC / "embed" / "EmbeddedCanvas.tsx").read_text(encoding="utf-8")
        self.assertIn("resolveHostTheme(bridge?.host)", embedded)
        self.assertIn("data-ss-theme={hostTheme}", embedded)
        # The board follows the host, not a pinned light.
        self.assertIn("updateUserPreferences({ colorScheme })", embedded)
        self.assertNotIn("updateUserPreferences({ colorScheme: 'light' })", embedded)

    def test_app_owned_portals_use_the_single_themed_host(self) -> None:
        """A portal that defaults to body loses the active appearance.

        The host is deliberately a React context, rather than a selector
        repeated in each overlay. This keeps every current portal tied to the
        ThemeRoot and makes an unthemed fallback an explicit review failure.
        """
        app = (SRC / "App.tsx").read_text(encoding="utf-8")
        workspace = (SRC / "workspace" / "LocalWorkspace.tsx").read_text(encoding="utf-8")
        recorder = (SRC / "recorder" / "RecorderControls.tsx").read_text(encoding="utf-8")

        self.assertIn("<ThemePortalContext.Provider value={portalContainer}>", app)
        self.assertIn('data-testid="systemsketch-theme-portal-root"', app)
        self.assertIn("ref={setPortalContainer}", app)

        self.assertIn("const portalContainer = useThemePortalContainer()", workspace)
        self.assertIn("<Dialog.Portal container={portalContainer}>", workspace)
        self.assertNotIn("document.querySelector<HTMLElement>('.systemsketch-theme-root')", workspace)
        self.assertNotIn("<Dialog.Portal>", workspace)

        self.assertIn("const portalContainer = useThemePortalContainer()", recorder)
        self.assertIn("portalContainer,", recorder)
        self.assertNotIn("?? document.body", recorder)


class NativeWorkspaceControlTests(unittest.TestCase):
    def test_workspace_text_inputs_own_their_theme_ink_and_typeface(self) -> None:
        """Native form ink follows the browser/OS unless the app claims it.

        The grouped rule is deliberately checked through its last selector: if
        Rename, Save As, Export, or Filter ever fall out of that workspace-wide
        boundary, the five-theme browser sweep is no longer the first alarm.
        """
        css = WORKSPACE_CSS.read_text(encoding="utf-8")
        block = declarations_in_block(
            css,
            r"\.systemsketch-workspace-dialog input\[type='search'\]",
        )
        self.assertEqual(block.get("color"), "var(--ss-text)")
        self.assertEqual(block.get("caret-color"), "var(--ss-text)")
        self.assertEqual(block.get("font-family"), "inherit")

        placeholder = declarations_in_block(
            css,
            r"\.systemsketch-workspace-dialog input::placeholder",
        )
        self.assertEqual(placeholder.get("color"), "var(--ss-text-muted)")
        self.assertEqual(placeholder.get("opacity"), "1")

    def test_workspace_buttons_own_their_theme_ink_and_typeface(self) -> None:
        """Places, Recents, and icon-only buttons must not use UA ink."""
        css = WORKSPACE_CSS.read_text(encoding="utf-8")
        block = declarations_in_block(
            css,
            r"\.systemsketch-workspace-dialog button",
        )
        self.assertEqual(block.get("color"), "var(--ss-text)")
        self.assertEqual(block.get("font-family"), "inherit")

        current_path = declarations_in_block(
            css,
            r"\.systemsketch-workspace-browser > aside button\.is-current small",
        )
        self.assertEqual(current_path.get("color"), "var(--ss-text)")


if __name__ == "__main__":
    unittest.main()
