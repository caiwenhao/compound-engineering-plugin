#!/usr/bin/env bash
set -euo pipefail

replace_existing="no"
target="codex"

while [[ "${1:-}" == --* ]]; do
  case "${1}" in
    --replace)
      replace_existing="yes"
      shift
      ;;
    --target)
      target="${2:-}"
      shift 2
      ;;
    *)
      echo "error: unknown option '${1}'" >&2
      exit 1
      ;;
  esac
done

repo_root="${1:-}"

if [[ -z "${repo_root}" ]]; then
  echo "usage: $0 [--replace] [--target claude|codex|both] /path/to/compound-engineering-plugin" >&2
  exit 1
fi

if [[ "${target}" != "claude" && "${target}" != "codex" && "${target}" != "both" ]]; then
  echo "error: invalid target '${target}' (expected claude, codex, or both)" >&2
  exit 1
fi

if [[ ! -d "${repo_root}/plugins/compound-engineering" ]]; then
  echo "error: not a compound-engineering repo root: ${repo_root}" >&2
  exit 1
fi

if [[ "${target}" == "codex" || "${target}" == "both" ]] && ! command -v codex >/dev/null 2>&1; then
  echo "error: codex CLI is not installed or not on PATH" >&2
  exit 1
fi

if [[ "${target}" == "claude" || "${target}" == "both" ]] && ! command -v claude >/dev/null 2>&1; then
  echo "error: claude CLI is not installed or not on PATH" >&2
  exit 1
fi

sync_codex_local_cache() {
  local marketplace_name="$1"
  local plugin_name="compound-engineering"
  local plugin_root="${repo_root}/plugins/${plugin_name}"
  local version
  local cache_root
  local target_dir

  version="$(
    python3 - "${plugin_root}/.codex-plugin/plugin.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    print(json.load(handle)["version"])
PY
  )"

  cache_root="${HOME}/.codex/plugins/cache/${marketplace_name}/${plugin_name}"
  target_dir="${cache_root}/${version}"

  mkdir -p "${cache_root}"
  rm -rf "${target_dir}"
  mkdir -p "${target_dir}"

  tar -C "${plugin_root}" \
    --exclude ".git" \
    --exclude "node_modules" \
    --exclude ".DS_Store" \
    -cf - . | tar -C "${target_dir}" -xf -

  echo "Synced Codex local plugin cache: ${target_dir}"
}

install_target() {
  local cli="$1"
  local plugin_spec="$2"
  local marketplace_name="compound-engineering-plugin"
  local log_file
  log_file="$(mktemp -t install-local-ce.XXXXXX.log)"

  if [[ "${cli}" == "claude" ]]; then
    if claude plugin marketplace add "${repo_root}" >"${log_file}" 2>&1; then
      cat "${log_file}"
    else
      if grep -q "already added from a different source" "${log_file}"; then
        if [[ "${replace_existing}" != "yes" ]]; then
          cat "${log_file}" >&2
          echo "rerun with --replace after explicit user confirmation to replace the existing marketplace source" >&2
          rm -f "${log_file}"
          exit 2
        fi
        claude plugin marketplace remove "${marketplace_name}"
        claude plugin marketplace add "${repo_root}"
      else
        cat "${log_file}" >&2
        rm -f "${log_file}"
        exit 1
      fi
    fi
    claude plugin marketplace update "${marketplace_name}"
    claude plugin install "${plugin_spec}"
    claude plugin update "${plugin_spec}"
  else
    if codex plugin marketplace add "${repo_root}" >"${log_file}" 2>&1; then
      cat "${log_file}"
    else
      if grep -q "already added from a different source" "${log_file}"; then
        if [[ "${replace_existing}" != "yes" ]]; then
          cat "${log_file}" >&2
          echo "rerun with --replace after explicit user confirmation to replace the existing marketplace source" >&2
          rm -f "${log_file}"
          exit 2
        fi
        codex plugin marketplace remove "${marketplace_name}"
        codex plugin marketplace add "${repo_root}"
      else
        cat "${log_file}" >&2
        rm -f "${log_file}"
        exit 1
      fi
    fi
    sync_codex_local_cache "${marketplace_name}"
    bun run "${repo_root}/src/index.ts" install "${repo_root}/plugins/compound-engineering" --to codex
  fi

  rm -f "${log_file}"
}

case "${target}" in
  claude)
    install_target "claude" "compound-engineering@compound-engineering-plugin"
    echo "verified: local marketplace and Claude Code plugin installed"
    ;;
  codex)
    install_target "codex" "compound-engineering"
    echo "verified: local marketplace and Codex agents installed"
    ;;
  both)
    install_target "claude" "compound-engineering@compound-engineering-plugin"
    install_target "codex" "compound-engineering"
    echo "verified: local marketplace and Claude Code/Codex installs completed"
    ;;
esac
