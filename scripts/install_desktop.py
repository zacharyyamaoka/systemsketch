#!/usr/bin/env python3
"""Install the new SystemSketch release controller, icon, and dock entry."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from release import build_candidate, try_build_host_artifacts
from release_lib import (
    ReleaseError,
    default_release_home,
    install_controller,
    promote_candidate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_ID = "systemsketch"


def atomic_write(path: Path, content: bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.installing")
    temporary.write_bytes(content)
    temporary.chmod(mode)
    os.replace(temporary, path)


def desktop_entry(python: Path, launcher: Path, release_home: Path) -> str:
    stable = f"{python} {launcher} --open --release-home {release_home} %f"
    preview = f"{python} {launcher} --open --preview --release-home {release_home}"
    return f"""[Desktop Entry]
Version=1.0
Type=Application
Name=SystemSketch
GenericName=System whiteboard
Comment=Stock tldraw with a safe Stable and live Preview lane
Exec={stable}
TryExec={python}
Icon={APP_ID}
Terminal=false
Categories=Development;Graphics;
Keywords=Whiteboard;System;Design;Sketch;tldraw;
MimeType=application/vnd.systemsketch+json;application/vnd.tldraw+json;
StartupNotify=true
StartupWMClass={APP_ID}
Actions=TryPreview;

[Desktop Action TryPreview]
Name=Open Live Preview
Exec={preview}
"""


def mime_package() -> bytes:
    return b"""<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/vnd.systemsketch+json">
    <comment>SystemSketch document</comment>
    <glob pattern="*.systemsketch"/>
  </mime-type>
  <mime-type type="application/vnd.tldraw+json">
    <comment>tldraw document</comment>
    <glob pattern="*.tldr"/>
  </mime-type>
</mime-info>
"""


def refresh_command(command: str, *arguments: str) -> None:
    executable = shutil.which(command)
    if executable:
        subprocess.run(
            [executable, *arguments],
            check=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )


def remove_conflicting_icon_variants(icon_root: Path, canonical_icon: Path) -> None:
    """Remove exact-name legacy icons that can outrank the requested PNG."""
    for extension in (".png", ".svg", ".xpm"):
        for candidate in icon_root.glob(f"*/apps/{APP_ID}{extension}"):
            if candidate != canonical_icon:
                candidate.unlink(missing_ok=True)


def main() -> int:
    release_home = default_release_home()
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    try:
        build, _manifest = build_candidate(release_home)
        promote_candidate(release_home)
        launcher = install_controller(PROJECT_ROOT, release_home)
        try_build_host_artifacts(release_home, build)

        icon_source = PROJECT_ROOT / "assets" / "systemsketch.png"
        if not icon_source.is_file():
            raise ReleaseError(f"requested icon is missing: {icon_source}")
        icon_path = data_home / "icons" / "hicolor" / "512x512" / "apps" / f"{APP_ID}.png"
        desktop_path = data_home / "applications" / f"{APP_ID}.desktop"
        mime_path = data_home / "mime" / "packages" / f"{APP_ID}.xml"
        atomic_write(icon_path, icon_source.read_bytes())
        remove_conflicting_icon_variants(data_home / "icons" / "hicolor", icon_path)
        atomic_write(
            desktop_path,
            desktop_entry(Path(sys.executable).resolve(), launcher, release_home).encode(),
            0o755,
        )
        atomic_write(mime_path, mime_package())

        refresh_command("update-desktop-database", str(data_home / "applications"))
        refresh_command("update-mime-database", str(data_home / "mime"))
        refresh_command("gtk-update-icon-cache", "-f", "-t", str(data_home / "icons" / "hicolor"))
        validator = shutil.which("desktop-file-validate")
        if validator:
            subprocess.run([validator, str(desktop_path)], check=True)

        print(f"Installed SystemSketch {build} from {PROJECT_ROOT}")
        print(f"Dock entry: {desktop_path}")
        print(f"Icon: {icon_path}")
        print("The existing pyblocks-era windows were left running; the dock entry now targets ports 4321/4322.")
        return 0
    except (OSError, ReleaseError, subprocess.CalledProcessError) as cause:
        print(f"SystemSketch install error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
