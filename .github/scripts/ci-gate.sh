#!/usr/bin/env bash
# Decides whether a CI job runs its heavy steps, and writes the tree it would
# vouch for.
#
# A documentation-only pull request skips them. So does a push to main whose
# git tree already passed the same job in a pull request run: after a squash
# merge main usually holds exactly the tree the pull request tested, and
# testing it again proves nothing new. A pull request run that passed leaves
# an artifact named after the job and the tree; a push looks for it. Anything
# else, including an API error, runs the full gate.
#
# Usage: ci-gate.sh <job>   (reads EVENT_NAME, PR_NUMBER, GH_TOKEN)
set -euo pipefail

job="$1"
tree="$(git rev-parse 'HEAD^{tree}')"
docs_only=false
full=true

# Decided here rather than with `paths-ignore`: a workflow skipped by path
# filters leaves a required check pending forever. An empty file list counts
# as code.
if [ "$EVENT_NAME" = "pull_request" ]; then
  changed="$(gh api --paginate "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/files" --jq '.[].filename')"
  if [ -n "$changed" ] && ! grep -qvE '^docs/|\.md$' <<< "$changed"; then
    docs_only=true
  fi
fi

if [ "$docs_only" = "true" ]; then
  full=false
elif [ "$EVENT_NAME" = "push" ]; then
  # Only artifacts from runs on this repository's own branches count.
  passed="$(gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?name=ci-passed-$job-$tree" \
    --jq '[.artifacts[] | select(.expired == false and .workflow_run.head_repository_id == .workflow_run.repository_id)] | length')" \
    || passed=0
  if [ "$passed" -gt 0 ]; then
    full=false
    echo "::notice::$job already passed on tree $tree in a pull request run; skipping the heavy steps."
  fi
fi

echo "$tree" > "$RUNNER_TEMP/verified-tree.txt"
{
  echo "docs_only=$docs_only"
  echo "tree=$tree"
  echo "full=$full"
} | tee -a "$GITHUB_OUTPUT"
