# Installing Geometry Dash Mods (Geode) on iPhone 13 / iOS 26.3 using Windows 10

This is the full walkthrough for a **non-jailbroken iPhone 13 on iOS 26.3**, set
up from a **Windows 10 PC**. You only need the PC once — after setup you manage
everything from the phone.

Method: **SideStore** (installed with the **iloader** tool). After setup,
SideStore re-signs apps wirelessly and auto-renews the certificate, so you don't
have to reconnect to the PC every week.

---

## What you'll need

On the **PC**:
- [ ] **iTunes for Windows** — install from <https://www.apple.com/itunes/download/win64>
      (the Apple-website version, *not* the Microsoft Store one — it installs the
      Apple Mobile Device USB drivers SideStore needs).
- [ ] **iloader** — download the Windows installer ONLY from the official source:
      <https://github.com/nab138/iloader/releases> (or <https://iloader.app>).
      iloader is free and open source — it NEVER asks for a donation, your email,
      or offers "premium IPAs". Avoid lookalike sites like `iloader.site` that
      demand payment to "unlock downloads"; those are scams.
- [ ] **Geode launcher IPA** — download `Geode-*.ipa` from
      <https://github.com/geode-sdk/ios-launcher/releases/latest>
- [ ] A **USB-to-Lightning cable** (iPhone 13 uses Lightning).

On the **iPhone**:
- [ ] **Geometry Dash already installed** from the App Store.
- [ ] A **passcode** set (required for pairing).
- [ ] A free **Apple ID** — a *secondary* Apple ID is strongly recommended, since
      SideStore uses it to sign apps.
- [ ] **StosVPN** (a.k.a. LocalDevVPN) from the App Store — SideStore uses it to
      refresh over Wi-Fi.

---

## Part 1 — Prepare the PC

1. Install **iTunes** from Apple's website and open it once so the drivers load.
2. Download **iloader** ONLY from <https://github.com/nab138/iloader/releases>
   (or <https://iloader.app>) and run the installer. It is free — if any page asks
   you to "donate to unlock downloads" or enter your email, it's a fake; close it.
   If you hit permission errors later, right-click iloader → **Run as administrator**.

## Part 2 — Connect and install SideStore

1. Plug the iPhone into the PC with USB. On the phone, tap **Trust** and enter
   your passcode.
2. Open **iloader** and **sign in with your Apple ID** (use the secondary one).
3. In iloader, **select your iPhone**, then go to the **Installers** section.
4. Click **Install SideStore (Stable)**.
   *(Choose "Stable" — you're on iOS 26.3, which is below 26.4. "Nightly" is only
   for 26.4+.)*
5. Wait for it to finish. **SideStore** now appears on your home screen, and
   iloader has placed the pairing file that lets it work wirelessly.

## Part 3 — Trust SideStore and enable Developer Mode (on the iPhone)

1. Go to **Settings → General → VPN & Device Management**, tap your Apple ID
   under *Developer App*, and tap **Trust**.
2. Go to **Settings → Privacy & Security → Developer Mode**, turn it **On**, and
   **restart** the phone. After it reboots, tap **Turn On** when asked.
3. Open the **StosVPN / LocalDevVPN** app you installed and turn the VPN **on**.
   (You'll flip this on whenever you launch or refresh Geode.)

## Part 4 — Install the Geode launcher

1. Get the `Geode-*.ipa` you downloaded onto the phone — easiest is to **email it
   to yourself**, save it to the **Files app** / iCloud Drive, *or* keep the
   phone plugged in and add it straight from iloader.
2. Open **SideStore** on the phone → **My Apps** tab → tap the **`+`** button →
   select the **Geode IPA**.
3. SideStore signs and installs it; **Geode** appears on your home screen.

> Alternative: in SideStore go to **Sources → `+`**, add the Geode AltSource, then
> **Browse → Games → Geode → Free**. Updates can land a bit later this way.

## Part 5 — Launch Geode (pick one)

Open the **Geode** app. The first launch copies your installed Geometry Dash and
patches it. Then choose how mods run:

### Option A — JIT-less (easy, recommended to start)
Popular mods (Click Between Frames, Eclipse, Globed, etc.) work fine this way.
1. In Geode, tap **Enable JIT-Less**.
2. Tap **Import SideStore Certificate**.
3. Tap **Test JIT-Less Mode** to confirm it works.
4. Tap **Launch**.

### Option B — Full mod support via JIT (for iOS 26, uses StikDebug)
Only do this if a mod specifically needs JIT.
1. Install **StikDebug** through SideStore (add its IPA the same way as Geode).
2. Plug the phone into the PC, open **iloader**, find **Manage Pairing File**, and
   click **Place** next to StikDebug.
3. Turn on **StosVPN/LocalDevVPN**, open **StikDebug**, and follow its prompts.
4. **iOS 26 note:** in StikDebug settings, enable **Silent Audio** and
   **Background Location** (and **Always Run Scripts** if your device shows as
   *Non-TXM*). These keep JIT alive in the background.
5. Back in **Geode**, tap **Launch**.

## Part 6 — Install mods

1. Open **Geode** and tap the **Geode** button in the main menu.
2. Browse the mod list and install what you want — they download right inside the
   app. Restart the game if a mod asks you to.

---

## Ongoing use (no PC needed)

- **To play:** turn on StosVPN, open Geode, tap **Launch**.
- **Weekly refresh:** the free signing certificate lasts 7 days. With StosVPN on,
  open Geode (or SideStore) and tap **Refresh All**. SideStore can also auto-renew
  in the background, so often you just need the VPN on and Wi-Fi connected.
- **On cellular:** enable StosVPN, turn on **Airplane Mode**, tap **Launch**, then
  once Geode opens turn Airplane Mode and the VPN back off.

## Troubleshooting

- **iPhone not detected in iloader:** confirm iTunes is installed (Apple-site
  version), try another USB port/cable, re-tap **Trust**, and run iloader as admin.
- **"Untrusted Developer":** redo Part 3 step 1 (VPN & Device Management → Trust).
- **App won't open / "expired":** the 7-day cert lapsed — turn on StosVPN and
  **Refresh All**.
- **Mods not loading:** make sure you launched *through the Geode app*, not the
  normal Geometry Dash icon.

---

## Notes

- You need your own legally installed Geometry Dash. This only adds the
  open-source **Geode** loader, which patches *your* copy.
- **TrollStore won't work** on your phone — its CoreTrust exploit was patched in
  iOS 17.0.1, so it stops at ~iOS 17.0. SideStore is the right path for iOS 26.3.

### Links
- Geode: <https://geode-sdk.org>
- Geode iOS launcher / IPA: <https://github.com/geode-sdk/ios-launcher/releases/latest>
- Official iOS install docs: <https://github.com/geode-sdk/ios-launcher/blob/main/MODERN-IOS-INSTALL.md>
- iloader (official only): <https://github.com/nab138/iloader/releases> · <https://iloader.app>
  (do **not** use `iloader.site` — it's a scam clone that demands payment)
- SideStore: <https://sidestore.io> · <https://docs.sidestore.io>
