# Changelog

All notable changes to Moopit Tetris. Versions follow [Semantic Versioning](https://semver.org/):
new features bump the middle number (1.**2**.0), fixes and small tweaks bump the last (1.2.**1**).
The current version is shown at the bottom of the ⚙ settings panel and comes from `package.json`.

## [1.2.0] - 2026-09-20

### Added
- Settings: turn the **Hold piece** feature off (hides the Hold panel and the HOLD button; the C / Shift key does nothing).
- Settings: choose how many **Next pieces** are shown (None, 1–5; phones show at most 3).
- Settings: new **Dark indigo** theme, chosen from a **Theme** menu (Dark, Dark indigo, Light).
- The app version is shown in the settings panel.
- This changelog.

### Changed
- Touch buttons rearranged: ◀ on the far left, ▶ on the far right, with HOLD, ▼, ⤓ (hard drop) and ↻ (rotate) between them.
- "Light mode" checkbox replaced by the Theme menu (existing Dark / Light choices are kept).

## [1.1.1] - 2026-09-20

### Fixed
- Phone layout: the board no longer runs underneath the touch buttons. The board size is now measured from the space
  actually available (browser bars included) instead of being estimated from the window height.
- The "Moopit ♡" watermark no longer touches the buttons.

## [1.1.0] - 2026-09-20

### Changed
- Much larger game grid on phones: the touch buttons are one slim row along the bottom and the board gets the freed height.
- Holding **Down** now speeds the piece up (about 10× normal) instead of dropping it instantly.
  Holding Down for more than 1 second drops it instantly, once per press.
- Smaller Hold / Next panels on narrow phones so nothing is clipped.

## [1.0.1] - 2026-09-20

### Changed
- Personal notes added to the start screen and the game-over screen.

## [1.0.0] - 2026-09-20

### Added
- First release at tetris.moopit.fun: classic 10×20 Tetris with all 7 pieces, SRS rotation and wall kicks, ghost piece,
  hold, next-piece preview, soft and hard drop, scoring, levels and game over.
- Loving messages, gentle pause message, sparkles and hearts on line clears.
- Dark default theme, optional light and high-contrast modes.
- Generated chill-techno music and sound effects with separate on/off and volume controls.
- Touch controls, keyboard controls, offline support (installable PWA).
- AWS hosting: private S3 bucket behind CloudFront with HTTPS, described in CloudFormation.
