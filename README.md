# Cyber

Forma's default theme: systems grouped by kind (consoles, handhelds, computers, arcade, virtual
consoles, educational, ports, engines) and an All games tile, a page per system with its circuit board, logo, console
photo, story and curiosities, then its games. Under the categories, shortcuts: favourites, and
magazines, collections and recommended games, which say they are coming in a later version.
Built for TVs and handhelds alike.

Cyber shows the library this one way: its `theme.json` lists the one view it shows, so Forma
offers no views list. Start opens Forma's own menu, drawn by Forma over the theme; Cyber's look
and sorting are settings declared in `public/theme.json`, which Forma's menu shows under
Interface. The Engines picture (`public/art/engines.svg`) is drawn for Cyber.

A Forma theme like any other: it talks to Forma only through
[`@ramraiders/forma-sdk`](https://github.com/RAMRaiders/Forma/blob/main/docs/sdk.md), and Forma
bundles a pinned build of it. New themes start from the separate template project, not from here.

## Setup

The SDK comes from GitHub Packages. Give npm a token that can read packages, in your **user**
`~/.npmrc` (never in this repo):

```ini
//npm.pkg.github.com/:_authToken=<token with read:packages>
```

With the GitHub CLI: `gh auth refresh -s read:packages`, then use `gh auth token`.

```sh
npm install
npm run dev      # in a browser, on the SDK's mock library
npm run verify   # format, lint, typecheck, tests, build, unused code
```

## Building for Forma

`npm run build` writes the theme to `dist/` (`theme.json`, `index.html`, assets). The manual
**Build** workflow does the same in CI and uploads `dist/` as the `forma-theme-cyber` artifact.

To try a build on a Batocera box, copy `dist/` to `/userdata/themes-forma/cyber/` and pick
**Cyber** in Forma.

## Releasing to Forma

Forma's build downloads Cyber from this repository's releases. To ship a new Cyber, bump the
version in `public/theme.json` and `package.json`, commit and push, then:

```sh
scripts/release.sh                        # builds, packs dist/ as cyber-<version>.tar.gz, releases v<version>
../Forma/scripts/pin-cyber.sh <version>   # in Forma: records the version, commit and checksum
```
