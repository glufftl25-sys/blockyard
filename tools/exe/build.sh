#!/bin/sh
# Builds downloads/blockyard.exe from game.html. Run from the repo root: sh tools/exe/build.sh
set -e
cd "$(dirname "$0")"
cp ../../game.html game.html
[ -f go.mod ] || go mod init blockyard-exe >/dev/null 2>&1
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../../downloads/blockyard.exe .
rm -f game.html
echo "built downloads/blockyard.exe"
