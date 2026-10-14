#!/bin/bash
# Cloud sessions start with no plugins installed; enabledPlugins in
# settings.json is not enough on its own. Install them here.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

claude plugin marketplace add obra/superpowers-marketplace >/dev/null 2>&1 || true
claude plugin install superpowers@superpowers-marketplace >/dev/null 2>&1 || true
claude plugin install mattpocock-skills@claude-plugins-official >/dev/null 2>&1 || true
exit 0
