# Pass recordings

Files saved with **Save last detection** in the app (`*.kinetic`) can be dropped
here. `pnpm test` replays each one through the analysis and prints what it
measures, so detection and measurement problems seen on a real field can be
reproduced and fixed off-device.

A recording holds the greyscale frames of one pass plus the frames just
before it, the detector's track, and the settings used at the time.
