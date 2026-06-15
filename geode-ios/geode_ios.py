#!/usr/bin/env python3
"""
Geode iOS Helper
================

A small, friendly command-line assistant for installing **Geode** -- the
mod loader for *Geometry Dash* -- on an iPhone or iPad.

It does the annoying parts for you:

  * figures out which installation method fits your device and setup,
  * downloads the correct official Geode launcher file (``.ipa`` or ``.tipa``)
    straight from the Geode team's GitHub releases,
  * prints a clear, numbered checklist tailored to your answers.

It does NOT pirate the game, bypass purchases, or do anything sketchy. You
still need your own legally installed copy of Geometry Dash. This tool only
helps you set up the open-source Geode loader (https://geode-sdk.org).

Usage
-----
    python3 geode_ios.py              # interactive wizard (recommended)
    python3 geode_ios.py wizard       # same as above
    python3 geode_ios.py methods      # explain every install method
    python3 geode_ios.py latest       # show the latest Geode release
    python3 geode_ios.py download     # download the launcher .ipa
    python3 geode_ios.py download --trollstore   # download the .tipa instead
    python3 geode_ios.py --help

No third-party packages required -- just Python 3.8+.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GEODE_SITE = "https://geode-sdk.org"
IOS_LAUNCHER_REPO = "geode-sdk/ios-launcher"
RELEASES_PAGE = f"https://github.com/{IOS_LAUNCHER_REPO}/releases/latest"
API_LATEST = f"https://api.github.com/repos/{IOS_LAUNCHER_REPO}/releases/latest"
INSTALL_DOCS = f"https://github.com/{IOS_LAUNCHER_REPO}/blob/main/MODERN-IOS-INSTALL.md"

MIN_IOS = 14  # Geode launcher needs iOS 14 or newer.


# ---------------------------------------------------------------------------
# Tiny terminal helpers (no external deps)
# ---------------------------------------------------------------------------

def _supports_color() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


_COLOR = _supports_color()


def c(text: str, code: str) -> str:
    if not _COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def bold(t: str) -> str:
    return c(t, "1")


def green(t: str) -> str:
    return c(t, "32")


def yellow(t: str) -> str:
    return c(t, "33")


def cyan(t: str) -> str:
    return c(t, "36")


def red(t: str) -> str:
    return c(t, "31")


def header(title: str) -> None:
    line = "=" * max(len(title), 40)
    print()
    print(cyan(line))
    print(cyan(bold(title)))
    print(cyan(line))


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{bold('?')} {prompt}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        print(yellow("Cancelled."))
        sys.exit(130)
    return answer or (default or "")


def ask_choice(prompt: str, options: list[tuple[str, str]]) -> str:
    """Ask a numbered multiple-choice question. Returns the chosen key."""
    print()
    print(bold(prompt))
    for i, (_key, label) in enumerate(options, start=1):
        print(f"  {cyan(str(i))}. {label}")
    while True:
        raw = ask("Enter a number", default="1")
        try:
            idx = int(raw)
            if 1 <= idx <= len(options):
                return options[idx - 1][0]
        except ValueError:
            pass
        print(red("  Please type one of the numbers shown above."))


def ask_yes_no(prompt: str, default: bool = False) -> bool:
    d = "y" if default else "n"
    while True:
        raw = ask(f"{prompt} (y/n)", default=d).lower()
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print(red("  Please answer y or n."))


# ---------------------------------------------------------------------------
# GitHub release lookup / download
# ---------------------------------------------------------------------------

class ReleaseError(Exception):
    pass


def fetch_latest_release() -> dict:
    """Return the latest ios-launcher release JSON from the GitHub API."""
    req = urllib.request.Request(
        API_LATEST,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "geode-ios-helper",
        },
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        raise ReleaseError(
            f"GitHub returned HTTP {e.code}. You may be rate-limited; "
            f"set the GITHUB_TOKEN environment variable or download manually "
            f"from {RELEASES_PAGE}"
        ) from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise ReleaseError(
            f"Could not reach GitHub ({e}). Check your internet connection, "
            f"or download manually from {RELEASES_PAGE}"
        ) from e


def pick_asset(release: dict, trollstore: bool) -> dict | None:
    """Choose the right downloadable asset for the requested method."""
    wanted_ext = ".tipa" if trollstore else ".ipa"
    assets = release.get("assets", [])
    matches = [a for a in assets if a.get("name", "").lower().endswith(wanted_ext)]
    if not matches:
        return None
    # Prefer the smallest matching asset name (usually the plain launcher).
    matches.sort(key=lambda a: len(a.get("name", "")))
    return matches[0]


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def download_asset(asset: dict, dest_dir: str) -> str:
    url = asset["browser_download_url"]
    name = asset["name"]
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, name)
    total = asset.get("size", 0)

    print(f"Downloading {bold(name)} ({human_size(total)})")
    print(cyan(f"  from {url}"))

    req = urllib.request.Request(url, headers={"User-Agent": "geode-ios-helper"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
            downloaded = 0
            chunk = 1024 * 64
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                out.write(buf)
                downloaded += len(buf)
                if total:
                    pct = downloaded * 100 // total
                    bar = "#" * (pct // 4)
                    sys.stdout.write(
                        f"\r  [{bar:<25}] {pct:3d}%  "
                        f"{human_size(downloaded)}/{human_size(total)}"
                    )
                    sys.stdout.flush()
    except (urllib.error.URLError, TimeoutError) as e:
        raise ReleaseError(f"Download failed: {e}") from e
    print()
    print(green(f"  Saved to {dest}"))
    return dest


# ---------------------------------------------------------------------------
# Install-method knowledge base
# ---------------------------------------------------------------------------

METHODS = {
    "trollstore": {
        "title": "TrollStore (best, but only on supported iOS versions)",
        "support": "Full mod support, never expires, no weekly refresh.",
        "needs": "A device whose iOS version is exploitable by TrollStore.",
        "file": ".tipa",
        "steps": [
            "Make sure TrollStore is already installed on your device.",
            "Run:  python3 geode_ios.py download --trollstore",
            "Transfer the downloaded .tipa to your device (AirDrop, or open the "
            "file in the Files app).",
            "Open the .tipa with TrollStore and tap Install.",
            "Launch 'Geode' from your home screen. It will copy your installed "
            "Geometry Dash and patch it once.",
            "Open the in-app mod browser and install mods like Geode menu, "
            "BetterEdit, Globed, etc.",
        ],
    },
    "sidestore": {
        "title": "SideStore (recommended for most non-jailbroken devices)",
        "support": "JIT-less mods out of the box; can reach full support with JIT.",
        "needs": "A computer for first-time setup and a free Apple ID. "
                 "Re-sign weekly.",
        "file": ".ipa",
        "steps": [
            "On a computer, set up SideStore for your device (https://sidestore.io). "
            "This pairs your device once so you no longer need the computer for "
            "future refreshes.",
            "Install the 'LocalDevVPN' (or StosVPN) app from the App Store and "
            "turn it on -- SideStore uses it to refresh over Wi-Fi.",
            "Enable Developer Mode: Settings > Privacy & Security > Developer Mode, "
            "then restart.",
            "Run:  python3 geode_ios.py download",
            "Get the downloaded .ipa onto your device (AirDrop / Files / iCloud).",
            "In SideStore: My Apps tab > '+' > pick the Geode .ipa > install.",
            "Open 'Geode', let it patch Geometry Dash, then install mods from the "
            "in-app browser.",
            "Remember: refresh SideStore and Geode about once a week so the app "
            "signature does not expire.",
        ],
    },
    "altstore": {
        "title": "AltStore (similar to SideStore, very popular)",
        "support": "JIT-less mods out of the box; full support possible with JIT.",
        "needs": "A computer running AltServer and a free Apple ID. Re-sign weekly.",
        "file": ".ipa",
        "steps": [
            "Install AltServer on your computer and AltStore on your device "
            "(https://altstore.io). Keep AltServer running on the same Wi-Fi for "
            "refreshes, or use the Wi-Fi sync option.",
            "Run:  python3 geode_ios.py download",
            "Transfer the .ipa to your device.",
            "In AltStore: My Apps > '+' > select the Geode .ipa > install with your "
            "Apple ID.",
            "Open 'Geode', let it patch Geometry Dash, then install mods.",
            "Refresh roughly weekly so the 7-day free certificate does not expire.",
        ],
    },
    "certificate": {
        "title": "Paid developer / enterprise certificate (advanced)",
        "support": "Full support; longer-lived signature, but more storage and setup.",
        "needs": "A real signing certificate (paid Apple Developer or enterprise). "
                 "Heavier and pricier; only if you know you need it.",
        "file": ".ipa",
        "steps": [
            "Sign the Geode .ipa with your certificate using a tool like Sideloadly, "
            "ESign, or your own signing pipeline.",
            "Run:  python3 geode_ios.py download   (to grab the unsigned .ipa first)",
            "Install the signed app, open 'Geode', and patch Geometry Dash.",
            "Note: the enterprise route can use 400 MB+ and may require re-patching "
            "whenever you change mods -- prefer TrollStore or SideStore if you can.",
        ],
    },
}


def print_method(key: str) -> None:
    m = METHODS[key]
    header(m["title"])
    print(f"{bold('Mod support:')} {m['support']}")
    print(f"{bold('What you need:')} {m['needs']}")
    print(f"{bold('Launcher file:')} {m['file']}")
    print()
    print(bold("Steps:"))
    for i, step in enumerate(m["steps"], start=1):
        wrapped = textwrap.fill(
            step, width=76, initial_indent=f"  {i}. ", subsequent_indent="     "
        )
        print(wrapped)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_methods(_args) -> int:
    header("How to run Geometry Dash mods on iOS (Geode)")
    print(textwrap.fill(
        "Apple does not allow modded apps on the App Store, so every method "
        "below installs the open-source Geode launcher by 'sideloading'. The "
        "launcher copies your own installed Geometry Dash and patches it so you "
        "can browse and install mods from inside the app.", width=76))
    print(f"\nLearn more: {cyan(GEODE_SITE)}   Docs: {cyan(INSTALL_DOCS)}")
    for key in ("trollstore", "sidestore", "altstore", "certificate"):
        print_method(key)
    print()
    print(yellow("Not sure which to pick? Run:  python3 geode_ios.py wizard"))
    return 0


def cmd_latest(_args) -> int:
    header("Latest Geode iOS launcher release")
    try:
        rel = fetch_latest_release()
    except ReleaseError as e:
        print(red(str(e)))
        return 1
    print(f"{bold('Version:')} {rel.get('tag_name', '?')}  "
          f"({rel.get('name', '')})")
    print(f"{bold('Published:')} {rel.get('published_at', '?')}")
    print(f"{bold('Page:')} {cyan(rel.get('html_url', RELEASES_PAGE))}")
    print()
    print(bold("Downloadable files:"))
    for a in rel.get("assets", []):
        print(f"  - {a['name']}  ({human_size(a.get('size', 0))})")
    return 0


def cmd_download(args) -> int:
    header("Download the Geode launcher")
    try:
        rel = fetch_latest_release()
    except ReleaseError as e:
        print(red(str(e)))
        print(yellow(f"\nManual download: {RELEASES_PAGE}"))
        return 1

    asset = pick_asset(rel, trollstore=args.trollstore)
    kind = ".tipa (TrollStore)" if args.trollstore else ".ipa (sideloading)"
    if asset is None:
        print(red(f"No {kind} file found in release {rel.get('tag_name')}"))
        print(yellow(f"Browse the assets manually: {RELEASES_PAGE}"))
        return 1

    print(f"{bold('Release:')} {rel.get('tag_name')}   {bold('File type:')} {kind}")
    try:
        path = download_asset(asset, args.output)
    except ReleaseError as e:
        print(red(str(e)))
        return 1

    print()
    print(green(bold("Done! Next steps:")))
    method = "trollstore" if args.trollstore else "sidestore"
    print(f"  Your file: {bold(path)}")
    print(f"  Follow the '{METHODS[method]['title']}' steps:")
    print(f"    python3 geode_ios.py methods")
    return 0


def cmd_wizard(args) -> int:
    header("Geode iOS setup wizard")
    print(textwrap.fill(
        "Answer a few quick questions and I'll pick the easiest install method "
        "for your device, then offer to download the right file.", width=76))

    # 1. iOS version sanity check.
    ver_raw = ask("\nWhat iOS version is your device on? (e.g. 17.4)", default="")
    major = None
    if ver_raw:
        try:
            major = int(ver_raw.split(".")[0])
        except ValueError:
            major = None
    if major is not None and major < MIN_IOS:
        print(red(f"\nGeode needs iOS {MIN_IOS} or newer. iOS {ver_raw} won't work."))
        return 1

    # 2. TrollStore?
    has_trollstore = ask_yes_no(
        "Do you already have TrollStore installed?", default=False)
    if has_trollstore:
        print(green("\nGreat -- TrollStore is the smoothest option (no weekly "
                    "refresh, full mod support)."))
        method = "trollstore"
    else:
        # 3. Comfort / computer access steers SideStore vs AltStore.
        choice = ask_choice(
            "How do you want to install? (you'll need a computer once for setup)",
            [
                ("sidestore", "SideStore -- refresh over Wi-Fi after first setup "
                              "(recommended)"),
                ("altstore", "AltStore -- keep a computer on the same Wi-Fi to "
                             "refresh"),
                ("certificate", "I have a paid/enterprise signing certificate "
                                "(advanced)"),
            ],
        )
        method = choice

    print_method(method)

    # Offer the download right away.
    print()
    if ask_yes_no("Download the matching Geode file now?", default=True):
        dl_args = argparse.Namespace(
            trollstore=(method == "trollstore"),
            output=args.output,
        )
        return cmd_download(dl_args)

    print(yellow("\nWhen you're ready, run:"))
    if method == "trollstore":
        print("  python3 geode_ios.py download --trollstore")
    else:
        print("  python3 geode_ios.py download")
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="geode_ios.py",
        description="Friendly helper for installing Geode (Geometry Dash mods) "
                    "on iOS.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(f"""\
            Examples:
              python3 geode_ios.py                 run the interactive wizard
              python3 geode_ios.py methods         explain every install method
              python3 geode_ios.py latest          show the newest Geode release
              python3 geode_ios.py download        download the launcher .ipa
              python3 geode_ios.py download --trollstore

            More info: {GEODE_SITE}
        """),
    )
    sub = p.add_subparsers(dest="command")

    sub.add_parser("wizard", help="interactive setup wizard (default)")
    sub.add_parser("methods", help="explain every install method")
    sub.add_parser("latest", help="show the latest Geode release")

    dl = sub.add_parser("download", help="download the Geode launcher")
    dl.add_argument(
        "--trollstore", action="store_true",
        help="download the .tipa (for TrollStore) instead of the .ipa",
    )

    # Shared option.
    for sp in (p, sub.choices["download"], sub.choices["wizard"]):
        sp.add_argument(
            "-o", "--output", default="downloads",
            help="folder to save downloads into (default: ./downloads)",
        )
    return p


def main(argv: list[str] | None = None) -> int:
    # Let `python3 geode_ios.py methods | head` exit quietly instead of
    # raising BrokenPipeError when the reader closes early.
    try:
        import signal
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    except (ImportError, AttributeError, ValueError):
        pass  # Windows / non-main thread: no SIGPIPE to handle.

    parser = build_parser()
    args = parser.parse_args(argv)
    command = args.command or "wizard"

    dispatch = {
        "wizard": cmd_wizard,
        "methods": cmd_methods,
        "latest": cmd_latest,
        "download": cmd_download,
    }
    try:
        return dispatch[command](args)
    except KeyboardInterrupt:
        print()
        print(yellow("Cancelled."))
        return 130
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    sys.exit(main())
