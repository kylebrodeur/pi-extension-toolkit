# Retrofitting an Existing Pi Extension

Working reference for bringing an older Pi extension up to this template's standard.
Do these steps in order — some depend on earlier ones.

---

## Checklist

### 1. Fix `biome.json` schema URL

**Before:**
```json
{ "$schema": "https://biomejs.dev" }
```
**After:**
```json
{ "$schema": "https://biomejs.dev/schemas/latest/schema.json" }
```

Gotcha: the bare domain URL silently fails validation — Biome loads but rules
may not apply as expected. Always use the full schema path.

---

### 2. Fix `package.json` — version, files, exports, pi manifest

**Before:**
```json
{
  "version": "1.0.0",
  "main": "./dist/index.js"
}
```
**After:**
```json
{
  "version": "0.1.0",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./dist"]
  }
}
```

- `"files"` is critical — without it `npm publish` ships `src/`, `node_modules`
  symlinks, and your dotfiles.
- `"keywords": ["pi-package"]` makes the package discoverable in Pi's registry.
- `"pi".extensions` tells Pi where to find the built entry points.

---

### 3. Move `@sinclair/typebox` to devDependencies

TypeBox is only used to build tool parameter schemas — it doesn't ship at runtime.

```bash
npm uninstall @sinclair/typebox
npm install --save-dev @sinclair/typebox
```

If you're importing `Type` from typebox in `src/`, nothing changes in your code —
only where the dep lives in `package.json`.

---

### 4. Install / upgrade Husky v9 and create pre-commit hook

```bash
npm install --save-dev husky
npx husky init
```

Replace the generated `.husky/pre-commit` with:

```sh
npx biome check --write .
git add -A
npx tsc --noEmit
```

Gotcha: Husky v9 dropped the `"prepare": "husky install"` pattern. The new
script is just `"prepare": "husky"`. Update `package.json` accordingly.

Gotcha: After `biome check --write` modifies files, you **must** `git add -A`
before the commit proceeds, or your staged snapshot won't include the fixes.
The hook above does this.

---

### 5. Fix GitHub Actions — registry URL and Node version

File: `.github/workflows/release.yml`

**Before:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    registry-url: "https://npmjs.org"
```
**After:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
    registry-url: "https://registry.npmjs.org"
```

- `https://npmjs.org` doesn't set `NODE_AUTH_TOKEN` correctly — publishes fail
  silently or with auth errors. The correct URL is `https://registry.npmjs.org`.
- Node 22 is the active LTS as of April 2026. Node 20 reaches EOL April 2026.

Also ensure the publish step includes `--provenance`:
```yaml
- run: npm publish --provenance --access public
```

Provenance requires `id-token: write` in the job permissions block:
```yaml
permissions:
  contents: read
  id-token: write
```

---

### 6. Verify `tsconfig.json`

No changes needed if you already have:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true
  }
}
```

If `module`/`moduleResolution` are `"CommonJS"` or `"Node"`, update both to
`"NodeNext"` — Pi's loader expects ESM-compatible output.

---

## Common Gotchas

| Gotcha | Fix |
|---|---|
| `biome.json` schema URL is bare domain | Use `https://biomejs.dev/schemas/latest/schema.json` |
| npm publish auth fails in CI | `registry-url` must be `https://registry.npmjs.org` (not `https://npmjs.org`) |
| Husky hook doesn't stage biome fixes | Add `git add -A` after `biome check --write .` in pre-commit |
| `npm publish` ships source files | Add `"files": ["dist", "README.md"]` to `package.json` |
| Extension not found by Pi | Add `"pi": { "extensions": ["./dist"] }` and `"keywords": ["pi-package"]` |
| TypeBox in dependencies instead of devDeps | `npm install --save-dev @sinclair/typebox` |
| Node 20 EOL warning in CI | Set `node-version: "22"` in setup-node step |
