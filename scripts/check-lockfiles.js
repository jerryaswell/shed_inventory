/**
 * Fails a lock file in which a dependency would install without a tamper
 * check (jerryaswell/self_mgmt#67).
 *
 * `npm ci` verifies a tarball against the entry's `integrity` only when the
 * entry has one. An `npm install` run over a node_modules tree it did not
 * fetch (resolving a lock-file conflict on one platform, say) can rewrite the
 * lock with entries that carry neither `resolved` nor `integrity`, and neither
 * `npm ci` nor `npm audit` says a word about it. So every installed entry here
 * must carry:
 *
 *   - an `integrity` holding a well-formed sha512 hash, which is what the
 *     registry has published for every package since npm 5; and
 *   - a `resolved` that is exactly the registry's tarball for that package and
 *     version, so an entry cannot be pointed at another host, or at another
 *     package's tarball and its matching hash.
 *
 * Entries that legitimately carry neither are left alone: the root (`""`) and
 * any other folder of this repository (a key outside node_modules), a
 * workspace `link` whose target is one of those folders, and an `inBundle`
 * dependency nested under its parent's node_modules, which arrives inside the
 * parent's tarball and so under the parent's hash. That last exemption is
 * narrow on purpose: `inBundle` is only a flag in the lock file, so an entry
 * that claims it at the top level, or that carries a `resolved` or `integrity`
 * of its own (npm fetches such an entry), is checked like any other.
 *
 * Usage: node scripts/check-lockfiles.js <package-lock.json>...
 * Exits 0 when every file is clean, 1 when one is not (naming each entry), and
 * 2 when it is used wrongly or a file cannot be read as a lock file.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REGISTRY = 'https://registry.npmjs.org/';

// One sha512 SRI token: the algorithm, then 64 bytes of base64 (88 characters,
// the last two padding). `integrity` may hold several tokens, space-separated.
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;

const NODE_MODULES = 'node_modules/';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The name a `node_modules/...` key installs, or the entry's own for an alias. */
function packageName(key, entry) {
  if (typeof entry.name === 'string') return entry.name;
  return key.slice(key.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
}

/** The registry's tarball URL for `name` at `version`. */
export function tarballUrl(name, version) {
  return `${REGISTRY}${name}/-/${name.split('/').pop()}-${version}.tgz`;
}

/**
 * Every problem in a parsed lock file, each as `<key>: <problem>`. An empty
 * list means every entry that installs from the registry carries a hash and
 * the registry's own URL.
 */
export function lockFindings(lock) {
  if (!isObject(lock) || !isObject(lock.packages)) {
    return ['no `packages` map: lockfileVersion 2 or 3 is needed'];
  }
  const { packages } = lock;
  const out = [];
  for (const [key, entry] of Object.entries(packages)) {
    if (!key.startsWith(NODE_MODULES) && !key.includes(`/${NODE_MODULES}`)) continue;
    if (!isObject(entry)) {
      out.push(`${key}: not an object`);
      continue;
    }
    if (entry.inBundle === true && key.includes(`/${NODE_MODULES}`) && entry.resolved === undefined && entry.integrity === undefined) continue;
    if (entry.link === true) {
      if (typeof entry.resolved !== 'string' || !isObject(packages[entry.resolved]) || entry.resolved.includes(NODE_MODULES)) {
        out.push(`${key}: a link to ${JSON.stringify(entry.resolved)}, which is not a folder the lock file holds`);
      }
      continue;
    }
    const tokens = typeof entry.integrity === 'string' ? entry.integrity.split(/\s+/) : [];
    if (entry.integrity === undefined) out.push(`${key}: no integrity`);
    else if (!tokens.some((t) => SHA512.test(t))) out.push(`${key}: integrity holds no sha512 hash`);
    if (entry.resolved === undefined) {
      out.push(`${key}: no resolved`);
    } else {
      const expected = tarballUrl(packageName(key, entry), entry.version);
      if (entry.resolved !== expected) {
        out.push(`${key}: resolved is ${JSON.stringify(entry.resolved)}, not the registry's ${expected}`);
      }
    }
  }
  return out;
}

/**
 * Check each file, writing findings through `err` and a closing line through
 * `out`. Returns the exit status.
 */
export function checkLockfiles(files, { read = (f) => readFileSync(f, 'utf8'), out = console.log, err = console.error } = {}) {
  if (!files.length) {
    err('usage: node scripts/check-lockfiles.js <package-lock.json>...');
    return 2;
  }
  let bad = 0;
  for (const file of files) {
    let lock;
    try {
      lock = JSON.parse(read(file));
    } catch (e) {
      err(`${file}: cannot be read as JSON (${e.name})`);
      return 2;
    }
    for (const finding of lockFindings(lock)) {
      err(`::error file=${file}::${file}: ${finding}`);
      bad++;
    }
  }
  if (bad) {
    err(`${bad} lock ${bad === 1 ? 'entry' : 'entries'} would install without a tamper check, or from somewhere other than the registry's tarball`);
    return 1;
  }
  out(`every installed entry in ${files.join(', ')} carries a sha512 integrity and the registry's tarball URL`);
  return 0;
}

function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) process.exitCode = checkLockfiles(process.argv.slice(2));
