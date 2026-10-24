#!/bin/sh
# Prepara a versão X.Y.Z: atualiza package.json, Cargo.toml e os lockfiles, faz o commit e cria a
# tag vX.Y.Z. O push (git push --follow-tags) dispara o workflow que gera os instaladores.
set -e
cd "$(dirname "$0")/.."

VERSION=${1#v}
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "uso: $0 X.Y.Z ou X.Y.Z-beta.N" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "há mudanças não commitadas" >&2
  exit 1
fi

npm version "$VERSION" --no-git-tag-version >/dev/null
# Só a primeira ocorrência: as dependências mais abaixo também têm linhas `version = `.
sed -i.bak "1,/^version = /s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
rm src-tauri/Cargo.toml.bak
(cd src-tauri && cargo update -p pier --offline --quiet)

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
echo "Pronto. Publique com: git push --follow-tags"
