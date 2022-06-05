#!/bin/bash
set -euo pipefail

user="fish"
group="fish"
port=8264

userspec="$(id -u "${user}"):$(id -g "${group}")"
scriptdir="$(dirname "$0")"
tmpdir="$(mktemp -d)"
CGO_ENABLED=0 go build -o "${tmpdir}/main" "${scriptdir}/main.go"
cp -R "${scriptdir}/static" "${tmpdir}/static"
sudo chown -R "${userspec}" "${tmpdir}"
sudo chroot --userspec "${userspec}" "${tmpdir}" /main --port="${port}"
