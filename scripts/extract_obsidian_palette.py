#!/usr/bin/env python3
"""Read Obsidian's own default theme into two shipped SystemSketch palettes.

    python3 scripts/extract_obsidian_palette.py \
        --asar ~/.config/obsidian/obsidian-1.13.7.asar \
        --out src/theme/palettes/obsidian.ts

Obsidian ships its stylesheet inside an asar archive. This pulls `app.css` out
of it, finds the three blocks that define the default theme — `body {}` for
the scheme-independent variables, `.theme-light {}` and `.theme-dark {}` for
the rest — and resolves each variable the `[data-ss-theme='obsidian']` block
in `src/theme/tokens.css` reads, down to a literal, per scheme.

The variable names come from `tokens.css` itself rather than a second list
here, so the host mapping (live Obsidian) and the standalone palette (this
file's output) cannot name different variables and drift apart.

The emitted module records the asar, the app.css sha256, and every
variable's raw declaration beside the literal it resolved to.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS_CSS = ROOT / "src" / "theme" / "tokens.css"
TOKEN_ORDER = [
    "surface", "surfaceRaised", "surfaceSunken", "surfaceHover", "surfaceActive",
    "surfaceInverse", "text", "textMuted", "textFaint", "textInverse", "border",
    "accent", "accentText", "danger", "warning", "success", "codeSurface",
    "codeText", "shadow1", "shadow2",
]


def read_asar_file(asar: Path, name: str) -> bytes:
    with asar.open("rb") as handle:
        handle.read(4)
        header_size = struct.unpack("<I", handle.read(4))[0]
        handle.read(4)
        json_size = struct.unpack("<I", handle.read(4))[0]
        header = json.loads(handle.read(json_size).decode("utf8"))
        node = header["files"]
        for part in name.split("/"):
            node = node["files"][part] if "files" in node else node[part]
        handle.seek(8 + header_size + int(node["offset"]))
        return handle.read(node["size"])


def declarations(block: str) -> dict[str, str]:
    block = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
    out: dict[str, str] = {}
    depth = 0
    current = ""
    for char in block:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == ";" and depth == 0:
            if ":" in current:
                key, _, value = current.partition(":")
                out[key.strip()] = value.strip()
            current = ""
        else:
            current += char
    if ":" in current:
        key, _, value = current.partition(":")
        out[key.strip()] = value.strip()
    return out


def top_level_blocks(css: str) -> list[tuple[str, str]]:
    """Every `(selector, body)` at brace depth zero, in source order.

    Anything nested — a `@media` query, a `@supports` block — is skipped
    wholesale, which is the point: the default theme is what applies with no
    condition attached.
    """
    blocks: list[tuple[str, str]] = []
    depth = 0
    selector_start = 0
    body_start = 0
    selector = ""
    for index, char in enumerate(css):
        if char == "{":
            if depth == 0:
                selector = css[selector_start:index]
                body_start = index + 1
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                clean = re.sub(r"/\*.*?\*/", "", selector, flags=re.S).strip()
                blocks.append((clean, css[body_start:index]))
                selector_start = index + 1
    return blocks


def theme_blocks(css: str) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """The `body`, `.theme-light` and `.theme-dark` variable tables.

    Obsidian spreads its `body {}` declarations over several top-level blocks,
    so every one is merged in source order, later winning, exactly as the
    cascade would. Only the bare selectors count: `.is-mobile.theme-dark {}`
    and friends are overrides for other devices and are deliberately not read.
    """
    merged: dict[str, dict[str, str]] = {"body": {}, ".theme-light": {}, ".theme-dark": {}}
    for selector, body in top_level_blocks(css):
        if selector in merged:
            merged[selector].update(declarations(body))
    for selector, table in merged.items():
        if not table:
            raise SystemExit(f"could not find a top-level {selector} block")
    if "--accent-h" not in merged["body"]:
        raise SystemExit("the body blocks never declared --accent-h; is this Obsidian's app.css?")
    return merged["body"], merged[".theme-light"], merged[".theme-dark"]


class Resolver:
    def __init__(self, tables: list[dict[str, str]]):
        self.tables = tables
        self.trace: list[str] = []

    def raw(self, name: str) -> str | None:
        # Scheme block wins over body, the way the cascade does.
        for table in reversed(self.tables):
            if name in table:
                return table[name]
        return None

    def resolve(self, value: str, depth: int = 0) -> str:
        if depth > 12:
            raise SystemExit(f"variable chain too deep at {value}")
        value = value.strip()

        def substitute(match: re.Match[str]) -> str:
            name = match.group(1)
            fallback = match.group(2)
            raw = self.raw(name)
            if raw is None:
                if fallback is None:
                    raise SystemExit(f"{name} is not defined in Obsidian's app.css")
                return self.resolve(fallback, depth + 1)
            self.trace.append(f"{name} = {raw}")
            return self.resolve(raw, depth + 1)

        # var(--name) or var(--name, fallback) — fallbacks here never nest.
        value = re.sub(r"var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)", substitute, value)
        value = self.calc(value)
        value = self.hsl(value)
        value = self.color_mix(value)
        return value

    @staticmethod
    def calc(value: str) -> str:
        def evaluate(match: re.Match[str]) -> str:
            expression = match.group(1)
            unit = "%" if "%" in expression else ""
            numeric = expression.replace("%", "")
            if not re.fullmatch(r"[\d.\s+\-*/()]+", numeric):
                return match.group(0)
            result = eval(numeric, {"__builtins__": {}}, {})  # noqa: S307 — arithmetic only
            return f"{round(result, 4):g}{unit}"

        return re.sub(r"calc\(([^()]*)\)", evaluate, value)

    @staticmethod
    def hsl(value: str) -> str:
        def to_hex(match: re.Match[str]) -> str:
            hue, saturation, lightness = (float(part) for part in match.groups())
            red, green, blue = colorsys.hls_to_rgb(hue / 360, lightness / 100, saturation / 100)
            return "#%02x%02x%02x" % (round(red * 255), round(green * 255), round(blue * 255))

        return re.sub(r"hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)", to_hex, value)

    @staticmethod
    def color_mix(value: str) -> str:
        """`color-mix(in oklch, <colour> N%, transparent)` is <colour> at N% alpha."""

        def mix(match: re.Match[str]) -> str:
            colour, percent = match.group(1).strip(), float(match.group(2))
            named = {"black": "#000000", "white": "#ffffff"}
            colour = named.get(colour, colour)
            if re.fullmatch(r"#[0-9a-fA-F]{6}", colour):
                red, green, blue = (int(colour[index:index + 2], 16) for index in (1, 3, 5))
                return f"rgb({red} {green} {blue} / {percent:g}%)"
            return match.group(0)

        return re.sub(r"color-mix\(in \w+,\s*([^,]+?)\s+([\d.]+)%\s*,\s*transparent\)", mix, value)


def obsidian_token_sources() -> dict[str, str]:
    """`--ss-x: var(--obsidian-name, fallback)` pairs from tokens.css."""
    css = TOKENS_CSS.read_text(encoding="utf-8")
    match = re.search(r"\[data-ss-theme='obsidian'\]\s*\{([^}]*)\}", css)
    if not match:
        raise SystemExit("tokens.css has no [data-ss-theme='obsidian'] block")
    sources: dict[str, str] = {}
    for key, value in declarations(match.group(1)).items():
        if not key.startswith("--ss-"):
            continue
        token = re.sub(r"-([a-z0-9])", lambda m: m.group(1).upper(), key[len("--ss-"):])
        sources[token] = value
    missing = [token for token in TOKEN_ORDER if token not in sources]
    if missing:
        raise SystemExit(f"the obsidian block in tokens.css is missing {missing}")
    return sources


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asar", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "src" / "theme" / "palettes" / "obsidian.ts")
    args = parser.parse_args()

    css_bytes = read_asar_file(args.asar, "app.css")
    css = css_bytes.decode("utf8")
    sha = hashlib.sha256(css_bytes).hexdigest()
    version_match = re.search(r"obsidian-([\d.]+)\.asar$", args.asar.name)
    version = version_match.group(1) if version_match else "unknown"
    body, light, dark = theme_blocks(css)
    sources = obsidian_token_sources()

    palettes = []
    for scheme, table in (("light", light), ("dark", dark)):
        resolver = Resolver([body, table])
        tokens: dict[str, str] = {}
        traces: dict[str, list[str]] = {}
        for token in TOKEN_ORDER:
            resolver.trace = []
            # Strip the tokens.css fallback: the point is to read Obsidian, not
            # to echo our own guess back.
            source = re.sub(r"var\((--[\w-]+)\s*,.*\)$", r"var(\1)", sources[token])
            tokens[token] = resolver.resolve(source)
            traces[token] = list(resolver.trace)
        palettes.append((scheme, tokens, traces))

    lines = [
        "/**",
        " * Obsidian's default theme as two SystemSketch palettes.",
        " *",
        " * GENERATED by scripts/extract_obsidian_palette.py — do not edit by hand.",
        " *",
        f" * Read from Obsidian {version} ({args.asar}), app.css sha256 {sha[:12]}.",
        " * Each variable is the one the [data-ss-theme='obsidian'] host block in",
        " * tokens.css reads, resolved through Obsidian's own cascade to a literal, so",
        " * a board looks the same hosted in Obsidian and merely wearing its look.",
        " */",
        "import type { ThemePalette } from '../themeModel'",
        "",
    ]
    for scheme, tokens, traces in palettes:
        name = f"OBSIDIAN_{scheme.upper()}_PALETTE"
        lines += [
            f"export const {name}: ThemePalette = {{",
            f"  id: 'obsidian-{scheme}',",
            f"  label: 'Obsidian {scheme.capitalize()}',",
            f"  scheme: '{scheme}',",
            f"  source: 'Obsidian {version} default theme',",
            "  tokens: {",
        ]
        for token in TOKEN_ORDER:
            chain = " ← ".join(traces[token]) if traces[token] else "literal"
            lines.append(f"    // {sources[token].split(',')[0].replace('var(', '').rstrip(')')}: {chain}")
            lines.append(f"    {token}: {json.dumps(tokens[token])},")
        lines += ["  },", "}", ""]

    args.out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {args.out.relative_to(ROOT)} from Obsidian {version} (app.css sha256 {sha[:12]})")
    for scheme, tokens, _ in palettes:
        print(f"  {scheme}: " + ", ".join(f"{token}={tokens[token]}" for token in ("surface", "surfaceRaised", "text", "accent", "border")))


if __name__ == "__main__":
    main()
