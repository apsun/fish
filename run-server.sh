#!/bin/bash
set -euo pipefail

usergroup="fish:fish"
port=8264

scriptdir="$(dirname "$0")"
tmpdir="$(mktemp -d)"
CGO_ENABLED=0 go build -o "${tmpdir}/main" "${scriptdir}/main.go"
cp -R "${scriptdir}/static" "${tmpdir}/static"
sudo chown -R "${usergroup}" "${tmpdir}"
sudo chroot --userspec "${usergroup}" "${tmpdir}" /main --port="${port}"
