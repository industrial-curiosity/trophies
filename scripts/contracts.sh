#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
foundry='ghcr.io/foundry-rs/foundry@sha256:32c8ea9ef052a440cb1620175987a3f49eff8b068a0c6a3d09ebf7f5f9a0e043'
sui='mysten/sui-tools@sha256:5336a71e37812bd6609a73a07bb99c267b3861c7670b7c49e20a6c9e5d5f1de6'
case "${1:-}" in
  setup)
    docker pull "$foundry"
    docker pull "$sui"
    docker run --rm --entrypoint forge -v "$root:/workspace" -w /workspace/contracts/evm "$foundry" install OpenZeppelin/openzeppelin-contracts@a6c749156e87b7b2f159c87a0ca19d323fcf35ac --no-git
    ;;
  evm)
    shift
    docker run --rm --entrypoint forge -v "$root:/workspace" -w /workspace/contracts/evm "$foundry" "$@"
    ;;
  sui)
    shift
    mkdir -p "$root/.tool-cache/sui/home"
    if [[ ! -f "$root/.tool-cache/sui/client.yaml" ]]; then
      cat > "$root/.tool-cache/sui/client.yaml" <<'CONFIG'
keystore:
  File: /workspace/.tool-cache/sui/keystore.json
active_address: null
envs:
  - alias: testnet
    rpc: http://127.0.0.1:9000
    ws: null
    basic_auth: null
active_env: testnet
CONFIG
      printf '[]\n' > "$root/.tool-cache/sui/keystore.json"
    fi
    docker run --rm --platform linux/amd64 --entrypoint sui -v "$root/.tool-cache/sui/home/.move:/root/.move" -v "$root:/workspace" -w /workspace/contracts/sui "$sui" "${1:?Missing Sui command}" --client.config /workspace/.tool-cache/sui/client.yaml "${@:2}"
    ;;
  test)
    "$0" evm test
    "$0" sui move test
    ;;
  *)
    echo 'Usage: scripts/contracts.sh setup | evm <forge args> | sui <sui args> | test' >&2
    exit 2
    ;;
esac
