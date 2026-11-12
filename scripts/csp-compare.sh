#!/usr/bin/env bash
#
# Compare two Content-Security-Policy values, directive by directive (jerryaswell/self_mgmt#246).
#
# The deploy's "Verify security headers are served" step calls this with the
# policy Terraform builds (`terraform output -raw site_csp`, which is
# `local.csp` in modules/aws/amplify/main.tf) and the header the site served.
#
# Each value is split on `;`. Each piece is trimmed, runs of whitespace inside
# it become one space, and empty pieces are dropped, so `a 'x';b` and
# `a  'x' ; b ;` are the same policy, as a browser parses them. The two lists
# must then be equal in full and in the same order. The header is generated
# from that one list, so even a reordering means the served policy was written
# from something else, such as a customHttp.yml shipped in the bundle, which
# Amplify lets override the app's own headers.
#
# Exits 0 when they match. On a mismatch it prints the two values, the
# directives missing from the served one and the ones it has that were not
# expected (a directive served twice is unexpected once), and exits 1. Exit 2
# is a usage error, or an expected policy with no directives in it. Both
# values are public response headers, and nothing else is printed.
#
# Usage: scripts/csp-compare.sh <expected-csp> <served-csp>

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <expected-csp> <served-csp>" >&2
  exit 2
fi

# One directive per line, in order.
directives() {
  printf '%s' "$1" | awk 'BEGIN { RS = ";" } {
    gsub(/[[:space:]]+/, " ")
    sub(/^ /, "")
    sub(/ $/, "")
    if ($0 != "") print
  }'
}

# The lines of $1 left over once each line of $2 has cancelled one equal line
# of $1: comm on sorted input pairs duplicates off one for one.
only_in() {
  LC_ALL=C comm -23 <(lines "$1" | LC_ALL=C sort) <(lines "$2" | LC_ALL=C sort)
}
lines() {
  if [ -n "$1" ]; then printf '%s\n' "$1"; fi
}

expected=$(directives "$1")
served=$(directives "$2")

if [ -z "$expected" ]; then
  echo "$0: the expected policy has no directives" >&2
  exit 2
fi

if [ "$expected" = "$served" ]; then
  exit 0
fi

missing=$(only_in "$expected" "$served")
unexpected=$(only_in "$served" "$expected")

echo "expected: $1"
echo "served:   $2"
if [ -n "$missing" ]; then
  echo "missing from the served header:"
  printf '%s\n' "$missing" | sed 's/^/  - /'
fi
if [ -n "$unexpected" ]; then
  echo "unexpected in the served header:"
  printf '%s\n' "$unexpected" | sed 's/^/  + /'
fi
if [ -z "$missing" ] && [ -z "$unexpected" ]; then
  echo "the same directives, in a different order:"
  lines "$served" | sed 's/^/  /'
fi
exit 1
