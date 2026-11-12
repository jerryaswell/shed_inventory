#!/usr/bin/env bash
#
# Say whether a commit is still the head of main on a remote (jerryaswell/self_mgmt#388).
#
# The deploy's apply job calls this before anything else, with its run's
# commit (GITHUB_SHA) and `origin`, and changes nothing unless it exits 0. A
# run whose commit main has moved past, which is a slow run reaching the apply
# group after a newer one, or a re-run of an old run, so applies nothing.
#
# The head is read from the remote with `git ls-remote`, at the moment of the
# call, and only the ref named exactly refs/heads/main counts: ls-remote's
# pattern also matches any ref that merely ends in it, such as a branch
# `a/refs/heads/main`.
#
# Exits 0 when <commit> is main's head on <remote>, and 1 when it is not,
# printing both commits. Exit 2 is a usage error, a <commit> that is not a
# full lowercase object name, or a head that could not be read: a failed
# ls-remote, no main branch, or an answer that is not one object name. Only
# commit hashes are printed.
#
# Usage: scripts/main-head-check.sh <commit> <remote>

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <commit> <remote>" >&2
  exit 2
fi

commit=$1
remote=$2

# A full SHA-1 or SHA-256 object name. Bash matches ^ and $ against the whole
# value, so a value of two lines is not one.
is_object_name() {
  [[ $1 =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]]
}

if ! is_object_name "$commit"; then
  echo "main-head-check: '$commit' is not a full commit hash." >&2
  exit 2
fi

# --exit-code: no matching ref at all is a failure (2), not an empty answer.
if ! answer=$(git ls-remote --exit-code "$remote" refs/heads/main); then
  echo "main-head-check: could not read refs/heads/main from $remote." >&2
  exit 2
fi

head=$(awk -F '\t' '$2 == "refs/heads/main" { print $1 }' <<<"$answer")
if ! is_object_name "$head"; then
  echo "main-head-check: $remote has no single refs/heads/main to compare with." >&2
  exit 2
fi

if [ "$head" = "$commit" ]; then
  echo "$commit is the head of main on $remote."
  exit 0
fi

echo "$commit is not the head of main on $remote, which is now $head."
exit 1
