# Peripheral masks

For a peripheral photo that is not on a white studio background (`"mask": true` in
`scripts/peripherals.json`): `<Commons file name>.png`, white where the thing is, black
where it is not. `scripts/build-peripherals.mjs` scales it to the photo it fetches and keeps
only what is white.

They were made from the Commons thumbnail 1200 px wide:

1. The background taken away by IMG.LY's segmentation model
   ([`@imgly/background-removal-node`](https://www.npmjs.com/package/@imgly/background-removal-node),
   its `medium` model), not a dependency of the theme.
2. Its alpha made 1-bit at 170, then opened by 2 px (eroded, then grown back) so thin
   remnants of the background, shelf wires or a cable on the table, go.
3. By hand where that was not enough: the Coleco Adam's mask is cleared below the keyboard,
   where the shelf it stands on shows.
