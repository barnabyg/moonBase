# Unsigned releases on GitHub that update themselves

The desktop app (ADR-0010) is released on GitHub Releases, and the installed game updates itself from there with electron-updater. Pushing a version tag publishes a release (`.github/workflows/release.yml`). The installer is not code-signed.

We chose not to sign because every certificate that names the maintainer as publisher costs money every year, and the game has no budget for it:

- An OV certificate from a certificate authority, whose key since 2023 must live in hardware or a paid cloud signing service to be usable from CI.
- Azure Artifact Signing, which only takes individual developers in the USA and Canada.

The only free route, SignPath Foundation, needs an OSI-approved open-source licence, which the game doesn't have, and names "SignPath Foundation" as the publisher, not the maintainer.

The cost is that Windows SmartScreen warns "Unknown publisher" when a player first runs the installer, and they must choose More info > Run anyway. A signed installer warns too until its certificate has built a reputation, so signing would shorten the warning's life rather than remove it. Updates the game downloads itself should not be checked by SmartScreen, as it checks files a browser marks as downloaded; this is not yet confirmed with a published release.

Without a signature, an update is trusted because it comes over HTTPS from the repository's own releases, and electron-updater checks the download against the SHA-512 hash in the release's `latest.yml` before installing it. Anyone who can publish a release to the repository can ship code to every player, so publishing stays limited to the maintainer.

## Considered options

- **A paid certificate (OV, or Azure Artifact Signing).** Shows the maintainer's name, and electron-updater could check that each update is signed by the same publisher. Rejected on cost; can be added later without changing anything players have installed, as long as `appId` stays the same.
- **SignPath Foundation.** Free, but needs an open-source licence, a decision about the game that shouldn't be made to get a certificate, and shows SignPath Foundation's name.
- **A self-signed certificate.** Free, but Windows doesn't trust it, so SmartScreen still shows an unknown publisher.
- **No auto-update, a download page only.** Players would have to notice and install each release by hand, and many would stay on old versions.
