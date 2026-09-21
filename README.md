<div align="center">

```
██╗    ██╗ █████╗ ██╗     ██╗     ██████╗  ██████╗  █████╗ ██████╗
██║    ██║██╔══██╗██║     ██║    ██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗
██║ █╗ ██║███████║██║     ██║    ██║  ███╗██████╔╝███████║██████╔╝
██║███╗██║██╔══██║██║     ██║    ██║   ██║██╔══██╗██╔══██║██╔══██╗
╚███╔███╔╝██║  ██║███████╗███████╗╚██████╔╝██████╔╝██║  ██║██████╔╝
 ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝
```

### bulk wallpapers · eleven sources · zero dependencies

**One sentence. Arrow keys. A thousand wallpapers.**

```
npx --yes github:bhavyam2468/get-wallpapers
```

</div>

---

## What it looks like

You get a sentence you can *edit in place*. Move between the words with `←`/`→`,
cycle their values with `↑`/`↓`, or just start typing to filter and enter your own.

```
██╗    ██╗ █████╗ ██╗     ██╗     ██████╗  ██████╗  █████╗ ██████╗
██║    ██║██╔══██╗██║     ██║    ██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗
██║ █╗ ██║███████║██║     ██║    ██║  ███╗██████╔╝███████║██████╔╝
██║███╗██║██╔══██║██║     ██║    ██║   ██║██╔══██╗██╔══██║██╔══██╗
╚███╔███╔╝██║  ██║███████╗███████╗╚██████╔╝██████╔╝██║  ██║██████╔╝
 ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝

  bulk wallpapers · eleven sources · zero dependencies
  ↑↓ pick a value · ←→ move between them · ⏎ grab

────────────────────────────────────────────────────────────────────────────

  download  100  minimal  wallpapers from  wallhaven  as  any  into  ./wallpapers
                                              ▲
  ┌ choose a source ─────────────────────────────────┐
  │   wallhaven                                      │
  │   unsplash                                       │
  │   nasa                                           │
  │   openverse                                      │
  │   pexels                                         │
  │   pixabay                                        │
  │   artic                                          │
  │   · · · 11 options                               │
  └──────────────────────────────────────────────────┘

  ←→ move   ↑↓ value   type custom   ⏎ grab   esc quit
```

Hit `⏎` and it streams them down with a live bar:

```
  ⟡ searching Wallhaven for "minimal" (wanting 100)

  ✓ found 100 images

  ⠹ ██████████████░░░░░░░░░░░░  54/100  51✓ 3– 0✖ 187.2 MB @ 12.4 MB/s · eta 0:04

╭─ done ──────────────────────────────╮
│ 100 wallpapers saved  (348 MB)      │
│ 1.2s · ./wallpapers                 │
╰─────────────────────────────────────╯
```

## Install

No build step, no dependencies — Node 18+ is the only requirement.

**Any OS, straight from GitHub** *(the `npx` one-liner at the top)*
```bash
npx --yes github:bhavyam2468/get-wallpapers
```

**Global install**
```bash
# Linux / macOS
npm i -g github:bhavyam2468/get-wallpapers && wallgrab

# Windows (PowerShell)
npm i -g github:bhavyam2468/get-wallpapers; wallgrab

# Windows (cmd)
npm i -g github:bhavyam2468/get-wallpapers && wallgrab
```

**Clone it** *(guaranteed to work, no registry involved)*
```bash
# Linux / macOS
git clone https://github.com/bhavyam2468/get-wallpapers.git
cd get-wallpapers && node bin/wallgrab.mjs

# Windows (PowerShell)
git clone https://github.com/bhavyam2468/get-wallpapers.git
cd get-wallpapers; node bin/wallgrab.mjs
```

**Bun / Deno**
```bash
bunx github:bhavyam2468/get-wallpapers
deno run -A npm:github:bhavyam2468/get-wallpapers
```

## The sources

| id | name | key | what it's good for |
|---|---|---|---|
| `wallhaven` | Wallhaven | — | 19k+ minimal, 12k+ abstract, full-res originals, colour search |
| `nasa` | NASA | — | public-domain deep space at absurd resolution |
| `openverse` | Openverse | — | 600M+ openly-licensed images, filtered by licence |
| `artic` | Art Institute of Chicago | — | 132k+ works over IIIF, render at any width |
| `met` | The Met | — | museum highlights as maximalist wallpapers |
| `picsum` | Lorem Picsum | — | infinite random photography at any size |
| `github` | GitHub collection | — | curated wallpaper repos, no `git clone` needed |
| `reddit` | Reddit | — | top posts from wallpaper subreddits |
| `unsplash` | Unsplash | 🔑 | the best minimal & abstract photography |
| `pexels` | Pexels | 🔑 | editorial stock, strong on architecture |
| `pixabay` | Pixabay | 🔑 | vectors & illustrations for graphic abstracts |

**Eight need nothing at all.** Three want a free key:

```bash
export UNSPLASH_ACCESS_KEY=xxx    # https://unsplash.com/developers  (50 req/hr)
export PEXELS_API_KEY=xxx         # https://www.pexels.com/api/      (200 req/hr)
export PIXABAY_API_KEY=xxx        # https://pixabay.com/api/docs/
```

## Scripting it

Every token in the sentence is a flag. Add `--yes` to skip the editor:

```bash
# 250 top-favourited 4K minimal wallpapers
wallgrab --source wallhaven --query minimal --count 250 \
         --resolution 3840x2160 --sort favorites --ratio 16x9

# colour-matched to a gruvbox rice
wallgrab --source wallhaven --query abstract --color 458588 --count 100

# phone wallpapers
wallgrab --source wallhaven --query minimalism --ratio 9x16 --count 80

# pull a curated repo without cloning it
wallgrab --source github --repo D3Ext/aesthetic-wallpapers --count 400 --pick largest

# public-domain nebulae
wallgrab --source nasa --query "pillars of creation" --count 60

# CC0 abstracts only
wallgrab --source openverse --query abstract --license cc0 --count 100

# museum maximalism at 3000px wide
wallgrab --source artic --query "starry night" --iiifWidth 3000px --count 40

# grayscale ultrawide
wallgrab --source picsum --size 5120x2880 --mode grayscale --count 100

# reddit's best of the year
wallgrab --source reddit --subreddit WidescreenWallpaper --window year --count 100
```

`wallgrab --help` prints every flag. `wallgrab --sources` lists the sources.

## Source-specific options

These appear in the sentence automatically when you select their source.

| source | options |
|---|---|
| `wallhaven` | `--resolution` `--sort` `--ratio` `--color` `--category` |
| `github` | `--repo` `--filter` `--pick` |
| `reddit` | `--subreddit` `--window` |
| `picsum` | `--size` `--mode` |
| `artic` | `--iiifWidth` |
| `openverse` | `--license` `--size` |
| `unsplash` | `--orientation` `--sort` |
| `pexels` | `--orientation` `--color` |
| `pixabay` | `--imageType` `--orientation` `--color` |

Global: `--count` `--query` `--format` `--dir` `--jobs` `--theme`

## The `--format` flag is honest

`--format jpg` does **not** transcode. It reads the magic bytes of every
downloaded file and keeps only the ones that genuinely are that format — the
rest are counted as skipped and reported. If you want real conversion, pipe the
output through ImageMagick:

```bash
mogrify -format jpg -quality 90 ./wallpapers/*.png
```

## Themes

`--theme` recolours the banner gradient: `sunset` (default) · `ocean` · `grape` ·
`mint` · `ember` · `rose`

## How it works

```
bin/wallgrab.mjs      shebang shim → src/cli.mjs
src/cli.mjs           arg parsing, editor loop, orchestration, summary
src/tokens.mjs        the inline sentence editor (the fun part)
src/sources.mjs       all eleven providers behind one search() interface
src/download.mjs      concurrency pool, resume, magic-byte verification
src/banner.mjs        ANSI-shadow glyphs + gradient painting
src/ansi.mjs          colour, cursor, truecolour detection
```

Nothing is bundled, nothing is compiled. `package.json` has an empty
`dependencies` object on purpose.

Design notes worth knowing:

- **Resume is free.** Every write checks for an existing non-empty file first,
  so `Ctrl+C` mid-run costs you nothing — re-run the same command.
- **Format is verified, not assumed.** Files are checked against magic bytes
  (JPEG `FF D8`, PNG `89 50 4E`, WebP `RIFF`, AVIF `ftyp`, GIF, BMP) so a
  mislabelled `.jpg` from a CDN can't sneak into a `.png` folder.
- **Rate limits are respected.** Paginated sources sleep between pages, and
  429/5xx responses back off exponentially (2s → 8s → 32s). Unsplash's demo
  tier is 50 req/hr, so it paces itself at ~1.2s per page.
- **Truecolour degrades gracefully.** No 24-bit support? You get plain ANSI.
  `TERM=dumb` or `NO_COLOR=1`? You get plain text. It never prints garbage.

## Troubleshooting

**`HTTP 503` from wallhaven.cc** — Cloudflare rate-limited your IP. Wait 10–30
minutes, then retry with a lower `--count`. Wallhaven's *website* will still load
in your browser while its API is blocked; that's normal and temporary.

**`HTTP 403` from reddit** — Reddit blocks datacenter and VPN IPs aggressively.
Works fine from a home connection.

**Unsplash demo tier** — 50 requests/hour. At 30 results per page that's ~1500
images/hour. Don't fight it.

## Verified

What was actually run, not just written:

| check | result |
|---|---|
| `--version`, `--sources`, `--help` | ✅ pass |
| `picsum` search → download → save | ✅ 3 files, 398 KB, 0.3s |
| `github` repo listing → download | ✅ 2 files from gruvbox-wallpapers |
| editor token build / cycle / type-filter | ✅ unit-tested |
| source-specific token rebuild on switch | ✅ unit-tested |
| `wallhaven`, `nasa`, `openverse`, `artic`, `met` APIs | ✅ confirmed reachable |
| interactive TUI in a real terminal | ⚠️ not verified in CI |
| `npx github:…` from a clean machine | ⚠️ not verified — needs the repo public |

## License

MIT — © 2026 bhavyam2468

Wallpapers keep their own licences. Check `credit` on each item before you
redistribute anything. NASA and Met works are public domain; Openverse reports
per-image; Wallhaven and Reddit are user-uploaded and mixed.
