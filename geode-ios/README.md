# Geode iOS Helper

A small, friendly command-line assistant that makes it **straightforward to run
[Geometry Dash](https://www.robtopgames.com/) mods on iPhone and iPad** using
the open-source [**Geode**](https://geode-sdk.org) mod loader.

iOS makes modding awkward: there are several install methods depending on your
iOS version and whether you have a jailbreak/TrollStore, you have to grab the
right launcher file, and some methods need a weekly refresh. This tool walks you
through it:

- **Recommends** the easiest install method for *your* device.
- **Downloads** the correct official Geode launcher file automatically
  (`.ipa` for sideloading, `.tipa` for TrollStore) from the Geode team's
  GitHub releases.
- **Prints a clear, numbered checklist** tailored to your answers.

It is **not** a pirate tool. You still need your own legally installed copy of
Geometry Dash. This only sets up the open-source Geode loader, which then
patches *your* installed game so you can browse and install mods from inside the
app.

## Requirements

- Python 3.8+ (no third-party packages needed)
- An iPhone/iPad on **iOS 14 or newer**
- Geometry Dash already installed on the device

## Quick start

```bash
# 1. Run the interactive wizard — answer 2–3 questions
python3 geode_ios.py

# It will recommend a method and offer to download the right file for you.
```

That's it. Follow the on-screen checklist to finish installing on your device.

## Commands

| Command | What it does |
| --- | --- |
| `python3 geode_ios.py` | Interactive wizard (recommended) |
| `python3 geode_ios.py wizard` | Same as above |
| `python3 geode_ios.py methods` | Explain every install method with pros/cons |
| `python3 geode_ios.py latest` | Show the newest Geode launcher release |
| `python3 geode_ios.py download` | Download the launcher `.ipa` (for sideloading) |
| `python3 geode_ios.py download --trollstore` | Download the `.tipa` (for TrollStore) |
| `python3 geode_ios.py --help` | Full help |

Use `-o FOLDER` to choose where downloads are saved (default: `./downloads`).

## Which method should I use?

The wizard picks for you, but in short:

| Method | Best for | Mod support | Weekly refresh? |
| --- | --- | --- | --- |
| **TrollStore** | Devices on a TrollStore-supported iOS | Full | No |
| **SideStore** | Most non-jailbroken devices | JIT-less out of the box | Yes (over Wi-Fi) |
| **AltStore** | If you already use AltStore | JIT-less out of the box | Yes |
| **Paid/enterprise cert** | Advanced users with a real cert | Full | Rarely |

Popular mods like CBF, Eclipse, and Globed work even on JIT-less ("partial")
support, so SideStore is a great default if you don't have TrollStore.

## Notes & troubleshooting

- **`HTTP 403` when downloading:** GitHub is rate-limiting anonymous requests.
  Set a token with `export GITHUB_TOKEN=ghp_...` and retry, or download
  manually from the
  [releases page](https://github.com/geode-sdk/ios-launcher/releases/latest).
- **Getting the file onto your phone:** AirDrop from a Mac, or save it to the
  Files app / iCloud Drive and open it from there.
- **Developer Mode:** On iOS 16+, enable
  *Settings → Privacy & Security → Developer Mode* before sideloading.

## Credits & links

- Geode mod loader: <https://geode-sdk.org>
- Geode iOS launcher (source of the launcher files this tool downloads):
  <https://github.com/geode-sdk/ios-launcher>
- Official iOS install docs:
  <https://github.com/geode-sdk/ios-launcher/blob/main/MODERN-IOS-INSTALL.md>

This project is an independent helper and is not affiliated with the Geode team
or RobTop Games. Mod your own games responsibly.

## License

MIT — see [LICENSE](LICENSE).
