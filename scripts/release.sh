#!/usr/bin/env bash
# Publishes this commit as a GitHub release that Forma's build downloads and bundles: builds
# the theme, packs dist/ reproducibly into cyber-<version>.tar.gz and attaches it to the release
# v<version> (the version in public/theme.json). Then pin it in Forma:
#
#   scripts/release.sh
#   ../Forma/scripts/pin-cyber.sh <version>
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

if [ -n "$(git status --porcelain)" ]; then
  echo "release: uncommitted changes; release a commit" >&2
  exit 1
fi
commit="$(git rev-parse HEAD)"
if ! git branch -r --contains "$commit" | grep -q .; then
  echo "release: $commit is not pushed" >&2
  exit 1
fi
version="$(node -p "require('./public/theme.json').version")"
tag="v$version"
if gh release view "$tag" >/dev/null 2>&1; then
  echo "release: $tag exists; bump the version in public/theme.json and package.json" >&2
  exit 1
fi

npm run build >/dev/null

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
file="cyber-$version.tar.gz"
tar -C dist --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -cf - . \
  | gzip -9n > "$out/$file"
sha256="$(sha256sum "$out/$file" | cut -d' ' -f1)"

gh release create "$tag" "$out/$file" --target "$commit" --title "Cyber $version" \
  --notes "Cyber $version, for Forma to bundle. sha256 \`$sha256\`."
echo "released Cyber $version ($commit), $sha256"
