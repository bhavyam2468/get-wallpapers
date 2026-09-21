// Twelve wallpaper sources behind one interface.
//
// Each source returns [{ url, name, ext, width, height, credit }].
// `keyEnv` marks sources that need a free API key; the CLI asks for it and
// explains where to get one, rather than failing with a 401.

const JSON_HEADERS = { Accept: 'application/json', 'User-Agent': UA() };

function UA() {
  return 'wallgrab/1.0 (+https://github.com/bhavyam2468/get-wallpapers)';
}

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { ...JSON_HEADERS, ...headers }, redirect: 'follow' });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error('server answered with HTML instead of JSON (rate limited or blocked?)');
  }
  return JSON.parse(text);
}

const extFrom = (url, fallback = 'jpg') => {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/\.(jpe?g|png|webp|gif|avif|bmp)$/i);
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : fallback;
  } catch {
    return fallback;
  }
};

const safeFile = (s, max = 70) =>
  (s || 'wallpaper')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, max) || 'wallpaper';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch pages until we have `count` items. Handles per-API page caps. */
async function paginate(pageSize, count, fetchPage, delay = 220) {
  const out = [];
  for (let page = 1; out.length < count; page++) {
    const items = await fetchPage(page, pageSize);
    if (!items || items.length === 0) break;
    out.push(...items);
    if (items.length < pageSize) break; // last page
    if (out.length < count) await sleep(delay);
  }
  return out.slice(0, count);
}

// ─────────────────────────────────────────────────────────────── wallhaven

const wallhaven = {
  id: 'wallhaven',
  name: 'Wallhaven',
  blurb: 'the community giant — 19k+ minimal, 12k+ abstract, full-res originals',
  keyEnv: null,
  defaults: { query: 'minimal', count: 100 },
  extra: [
    {
      key: 'resolution',
      label: 'at',
      value: '2560x1440',
      options: ['any', '1920x1080', '2560x1440', '3440x1440', '3840x2160', '5120x2880', '7680x4320'],
      hint: 'minimum resolution',
    },
    {
      key: 'sort',
      label: 'sorted by',
      value: 'favorites',
      options: ['favorites', 'toplist', 'date_added', 'views', 'random', 'relevance'],
    },
    {
      key: 'ratio',
      label: 'shaped',
      value: '16x9',
      options: ['any', '16x9', '16x10', '21x9', '32x9', '9x16', '4x3', '1x1'],
    },
    {
      key: 'color',
      label: 'tinted',
      value: 'any',
      options: ['any', '660000', '990000', 'cc0000', 'cc3333', 'ea4c88', '993399',
        '663399', '333399', '0066cc', '0099cc', '66cccc', '77cc33', '669900',
        '336600', '666600', '999900', 'cccc33', 'ffff00', 'ffcc33', 'ff9900',
        'ff6600', 'cc6633', '996633', '663300', '000000', '999999', 'cccccc',
        '424153', 'ffffff'],
      hint: 'dominant colour hex',
    },
    {
      key: 'category',
      label: 'kind',
      value: 'general',
      options: ['general', 'anime', 'people', 'general+anime', 'all'],
    },
  ],
  async search({ query, count, resolution, sort, ratio, color, category }) {
    const catMap = {
      general: '100', anime: '010', people: '001',
      'general+anime': '110', all: '111',
    };
    return paginate(24, count, async (page) => {
      const p = new URLSearchParams({
        q: query, page: String(page), purity: '100',
        categories: catMap[category] || '111',
        sorting: sort || 'favorites', order: 'desc',
      });
      if (resolution && resolution !== 'any') p.set('atleast', resolution);
      if (ratio && ratio !== 'any') p.set('ratios', ratio);
      if (color && color !== 'any') p.set('colors', color.replace('#', ''));

      const data = await getJSON(`https://wallhaven.cc/api/v1/search?${p}`);
      return (data.data || []).map((w) => {
        const [width, height] = (w.resolution || '0x0').split('x').map(Number);
        return {
          url: w.path,
          name: `wallhaven_${w.id}_${w.resolution}`,
          ext: extFrom(w.path),
          width, height,
          credit: `wallhaven · ${w.id}`,
        };
      });
    });
  },
};

// ─────────────────────────────────────────────────────────────────── nasa

const nasa = {
  id: 'nasa',
  name: 'NASA',
  blurb: 'public-domain deep space, ultra-high resolution, no key needed',
  keyEnv: null,
  defaults: { query: 'nebula', count: 60 },
  extra: [],
  async search({ query, count }) {
    return paginate(100, count, async (page) => {
      const p = new URLSearchParams({
        q: query, media_type: 'image', page: String(page), per_page: '100',
      });
      const data = await getJSON(`https://images-api.nasa.gov/search?${p}`);
      return (data.collection?.items || [])
        .map((it) => {
          const link = it.links?.[0]?.href;
          if (!link) return null;
          // prefer the original, then large, then whatever we got
          const orig = link.replace(/~(large|medium|small|thumb)\./, '~orig.');
          return {
            url: orig,
            name: `nasa_${safeFile(it.data?.[0]?.nasa_id || it.data?.[0]?.title, 60)}`,
            ext: extFrom(link),
            width: 0, height: 0,
            credit: `NASA · ${it.data?.[0]?.photographer || 'public domain'}`,
          };
        })
        .filter(Boolean);
    });
  },
};

// ───────────────────────────────────────────────────────────────── openverse

const openverse = {
  id: 'openverse',
  name: 'Openverse',
  blurb: '600M+ openly-licensed images, filtered by license for you',
  keyEnv: null,
  defaults: { query: 'abstract', count: 60 },
  extra: [
    {
      key: 'license',
      label: 'licensed',
      value: 'any',
      options: ['any', 'all-cc', 'cc0', 'by', 'by-sa', 'public-domain-mark'],
    },
    {
      key: 'size',
      label: 'sized',
      value: 'any',
      options: ['any', 'small', 'medium', 'large'],
    },
  ],
  async search({ query, count, license, size }) {
    return paginate(50, count, async (page) => {
      const p = new URLSearchParams({ q: query, page: String(page), page_size: '50' });
      const licMap = {
        'all-cc': 'cc0,by,by-sa,by-nd,by-nc,by-nc-sa,by-nc-nd',
        'public-domain-mark': 'public-domain-mark',
      };
      if (license && license !== 'any') p.set('license', licMap[license] || license);
      if (size && size !== 'any') p.set('size', size);

      const data = await getJSON(`https://api.openverse.org/v1/images/?${p}`);
      return (data.results || []).map((r) => ({
        url: r.url,
        name: `openverse_${safeFile(r.title || r.id, 60)}`,
        ext: extFrom(r.url),
        width: r.width || 0, height: r.height || 0,
        credit: `${r.license?.toUpperCase()} · ${r.creator || 'unknown'}`,
      }));
    });
  },
};

// ───────────────────────────────────────────────────────────────────── met

const met = {
  id: 'met',
  name: 'The Met',
  blurb: 'Metropolitan Museum highlights — paintings as maximalist wallpapers',
  keyEnv: null,
  defaults: { query: 'abstract', count: 40 },
  extra: [],
  async search({ query, count }) {
    const q = new URLSearchParams({ q: query, isHighlight: 'true', hasImages: 'true' });
    const found = await getJSON(`https://collectionapi.metmuseum.org/public/collection/v1/search?${q}`);
    const ids = (found.objectIDs || []).slice(0, Math.min(count * 2, 250));
    if (!ids.length) return [];

    const out = [];
    for (const id of ids) {
      if (out.length >= count) break;
      try {
        const o = await getJSON(
          `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
        );
        if (!o.primaryImage) continue;
        out.push({
          url: o.primaryImage,
          name: `met_${safeFile(o.title || String(id), 60)}`,
          ext: extFrom(o.primaryImage),
          width: 0, height: 0,
          credit: `The Met · ${o.artistDisplayName || 'unknown'} · public domain`,
        });
      } catch { /* skip a single bad record */ }
      await sleep(60);
    }
    return out;
  },
};

// ─────────────────────────────────────────────────────────────────── artic

const artic = {
  id: 'artic',
  name: 'Art Institute of Chicago',
  blurb: '132k+ works served over IIIF, any resolution you ask for',
  keyEnv: null,
  defaults: { query: 'abstract', count: 40 },
  extra: [
    {
      key: 'iiifWidth',
      label: 'rendered at',
      value: '2000px',
      options: ['843px', '1686px', '2000px', '3000px', 'full'],
      hint: 'IIIF render width',
    },
  ],
  async search({ query, count, iiifWidth }) {
    const w = (iiifWidth || '2000px').replace('px', '');
    return paginate(50, count, async (page) => {
      const p = new URLSearchParams({
        q: query, limit: '50', page: String(page),
        fields: 'id,title,image_id,artist_display,date_display',
      });
      const data = await getJSON(`https://api.artic.edu/api/v1/artworks/search?${p}`);
      return (data.data || [])
        .filter((a) => a.image_id)
        .map((a) => ({
          url: `https://www.artic.edu/iiif/2/${a.image_id}/full/,${w},/0/default.jpg`,
          name: `artic_${safeFile(a.title || String(a.id), 60)}`,
          ext: 'jpg',
          width: 0, height: 0,
          credit: `Art Institute of Chicago · ${a.artist_display || 'unknown'}`,
        }));
    });
  },
};

// ────────────────────────────────────────────────────────────────── picsum

const picsum = {
  id: 'picsum',
  name: 'Lorem Picsum',
  blurb: 'infinite random photography, rendered to any size you want',
  keyEnv: null,
  defaults: { query: 'any', count: 50 },
  extra: [
    {
      key: 'size',
      label: 'at',
      value: '3840x2160',
      options: ['1920x1080', '2560x1440', '3840x2160', '5120x2880', '1080x1920', '1440x2560'],
      hint: 'rendered size',
    },
    {
      key: 'mode',
      label: 'style',
      value: 'color',
      options: ['color', 'grayscale', 'blurred'],
    },
  ],
  async search({ count, size, mode }) {
    const [w, h] = (size || '3840x2160').split('x');
    const pool = [];
    for (let page = 1; pool.length < count * 2 && page <= 6; page++) {
      const list = await getJSON(`https://picsum.photos/v2/list?page=${page}&limit=100`);
      if (!Array.isArray(list) || !list.length) break;
      pool.push(...list);
      await sleep(150);
    }
    return pool.slice(0, count).map((img) => {
      let u = `https://picsum.photos/id/${img.id}/${w}/${h}`;
      if (mode === 'grayscale') u += '?grayscale';
      if (mode === 'blurred') u += '?blur=2';
      return {
        url: u,
        name: `picsum_${img.id}_${w}x${h}${mode === 'grayscale' ? '_gray' : ''}`,
        ext: 'jpg',
        width: +w, height: +h,
        credit: `Lorem Picsum · ${img.author}`,
      };
    });
  },
};

// ────────────────────────────────────────────────────────────────── github

const github = {
  id: 'github',
  name: 'GitHub collection',
  blurb: 'curated wallpaper repos — hundreds of images, no git clone needed',
  keyEnv: null,
  defaults: { query: 'AngelJumbo/gruvbox-wallpapers', count: 150 },
  extra: [
    {
      key: 'repo',
      label: 'repo',
      value: 'AngelJumbo/gruvbox-wallpapers',
      options: [
        'AngelJumbo/gruvbox-wallpapers', 'D3Ext/aesthetic-wallpapers',
        'linuxdotexe/nordic-wallpapers', 'dharmx/walls', 'rose-pine/wallpapers',
        'makccr/wallpapers', 'vyrx-dev/Wallpapers', 'elementary/wallpapers',
        'Narmis-E/onedark-wallpapers', 'vinceliuice/WhiteSur-wallpapers',
      ],
      hint: 'owner/name — type your own',
      freeform: true,
    },
    {
      key: 'filter',
      label: 'matching',
      value: 'any',
      options: ['any', 'abstract', 'minimal', 'dark', '4k', 'nature', 'gradient'],
      hint: 'substring of the file path',
    },
    {
      key: 'pick',
      label: 'picking',
      value: 'largest',
      options: ['largest', 'first', 'random'],
    },
  ],
  async search({ count, repo, filter, pick }) {
    const r = (repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) {
      throw new Error(`repo "${r}" should look like owner/name, e.g. dharmx/walls`);
    }
    const meta = await getJSON(`https://api.github.com/repos/${r}`);
    const branch = meta.default_branch || 'main';
    const tree = await getJSON(
      `https://api.github.com/repos/${r}/git/trees/${branch}?recursive=1`,
    );

    const IMG = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
    let files = (tree.tree || [])
      .filter((e) => e.type === 'blob' && IMG.test(e.path) && (e.size || 0) > 100 * 1024)
      .filter((e) => !filter || filter === 'any' || e.path.toLowerCase().includes(filter.toLowerCase()))
      .map((e) => ({ path: e.path, size: e.size || 0 }));

    if (tree.truncated) {
      throw new Error(
        `GitHub truncated the file list for ${r} — the repo is too big. ` +
        `Try a narrower --filter or a smaller repo.`,
      );
    }
    if (!files.length) throw new Error(`no images matched in ${r}`);

    if (pick === 'largest') files.sort((a, b) => b.size - a.size);
    if (pick === 'random') files.sort(() => Math.random() - 0.5);

    return files.slice(0, count).map((f) => ({
      url: `https://raw.githubusercontent.com/${r}/${branch}/${encodeURI(f.path).replace(/#/g, '%23')}`,
      name: `${safeFile(f.path.split('/').pop().replace(IMG, ''), 60)}`,
      ext: (f.path.match(IMG) || ['.jpg'])[0].slice(1).toLowerCase().replace('jpeg', 'jpg'),
      width: 0, height: 0,
      credit: `github · ${r}`,
    }));
  },
};

// ───────────────────────────────────────────────────────────────── reddit

const reddit = {
  id: 'reddit',
  name: 'Reddit',
  blurb: 'top posts from wallpaper subreddits (can be blocked from datacenter IPs)',
  keyEnv: null,
  defaults: { query: 'wallpaper', count: 100 },
  extra: [
    {
      key: 'subreddit',
      label: 'from r/',
      value: 'wallpaper',
      options: ['wallpaper', 'wallpapers', 'MinimalWallpaper', 'WidescreenWallpaper',
        'Amoledbackgrounds', 'EarthPorn', 'SpacePorn', 'ImaginaryLandscapes',
        'CyberpunkWallpapers', 'Animewallpaper', 'WallpaperRequests'],
      freeform: true,
    },
    {
      key: 'window',
      label: 'top of',
      value: 'year',
      options: ['hour', 'day', 'week', 'month', 'year', 'all'],
    },
  ],
  async search({ count, subreddit, window: win }) {
    const sub = (subreddit || 'wallpaper').replace(/^r\//, '');
    let after = null;
    const out = [];
    while (out.length < count) {
      const p = new URLSearchParams({ t: win || 'year', limit: '100', raw_json: '1' });
      if (after) p.set('after', after);
      const data = await getJSON(`https://www.reddit.com/r/${sub}/top.json?${p}`);
      const kids = data.data?.children || [];
      if (!kids.length) break;
      for (const k of kids) {
        const d = k.data;
        if (d.over_18 || d.stickied) continue;
        let url = d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');
        if (!url && /\.(jpe?g|png|webp)$/i.test(d.url || '')) url = d.url;
        if (!url || d.is_video || d.post_hint === 'hosted:video') continue;
        out.push({
          url,
          name: `reddit_${safeFile(d.title, 60)}_${d.id}`,
          ext: extFrom(url),
          width: d.preview?.images?.[0]?.source?.width || 0,
          height: d.preview?.images?.[0]?.source?.height || 0,
          credit: `r/${sub} · ${d.score} pts · u/${d.author}`,
        });
        if (out.length >= count) break;
      }
      after = data.data?.after;
      if (!after) break;
      await sleep(600);
    }
    return out.slice(0, count);
  },
};

// ─────────────────────────────────────────────────────────────── keyed ones

const unsplash = {
  id: 'unsplash',
  name: 'Unsplash',
  blurb: 'professional photography — the best minimal & abstract library',
  keyEnv: 'UNSPLASH_ACCESS_KEY',
  keyHint: 'free key → https://unsplash.com/developers (new "Demo" app, 50 req/hr)',
  defaults: { query: 'minimal', count: 90 },
  extra: [
    {
      key: 'orientation',
      label: 'oriented',
      value: 'landscape',
      options: ['landscape', 'portrait', 'squarish', 'any'],
    },
    {
      key: 'sort',
      label: 'sorted by',
      value: 'relevant',
      options: ['relevant', 'latest'],
    },
  ],
  async search({ query, count, orientation, sort }, key) {
    return paginate(30, count, async (page) => {
      const p = new URLSearchParams({ query, page: String(page), per_page: '30' });
      if (orientation && orientation !== 'any') p.set('orientation', orientation);
      if (sort) p.set('order_by', sort);
      const data = await getJSON(`https://api.unsplash.com/search/photos?${p}`, {
        Authorization: `Client-ID ${key}`,
        'Accept-Version': 'v1',
      });
      return (data.results || []).map((r) => ({
        url: `${r.urls.raw}&fm=jpg&q=85`,
        name: `unsplash_${safeFile(r.slug || r.id, 60)}`,
        ext: 'jpg',
        width: r.width || 0, height: r.height || 0,
        credit: `Unsplash · ${r.user?.name || 'unknown'} · unsplash.com/license`,
      }));
    }, 1200); // demo tier is 50 req/hr — go slow
  },
};

const pexels = {
  id: 'pexels',
  name: 'Pexels',
  blurb: 'editorial-quality stock, strong on minimal & architecture',
  keyEnv: 'PEXELS_API_KEY',
  keyHint: 'free key → https://www.pexels.com/api/ (200 req/hr)',
  defaults: { query: 'minimalist', count: 100 },
  extra: [
    {
      key: 'orientation',
      label: 'oriented',
      value: 'landscape',
      options: ['landscape', 'portrait', 'square', 'any'],
    },
    {
      key: 'color',
      label: 'tinted',
      value: 'any',
      options: ['any', 'black_and_white', 'black', 'white', 'yellow', 'orange',
        'red', 'purple', 'magenta', 'green', 'teal', 'blue'],
    },
  ],
  async search({ query, count, orientation, color }, key) {
    return paginate(80, count, async (page) => {
      const p = new URLSearchParams({ query, page: String(page), per_page: '80' });
      if (orientation && orientation !== 'any') p.set('orientation', orientation);
      if (color && color !== 'any') p.set('color', color);
      const data = await getJSON(`https://api.pexels.com/v1/search?${p}`, {
        Authorization: key,
      });
      return (data.photos || []).map((r) => ({
        url: r.src.original,
        name: `pexels_${r.id}_${safeFile(r.alt, 50)}`,
        ext: extFrom(r.src.original),
        width: r.width || 0, height: r.height || 0,
        credit: `Pexels · ${r.photographer}`,
      }));
    }, 300);
  },
};

const pixabay = {
  id: 'pixabay',
  name: 'Pixabay',
  blurb: '4M+ photos, illustrations and vectors — best for graphic abstracts',
  keyEnv: 'PIXABAY_API_KEY',
  keyHint: 'free key → https://pixabay.com/api/docs/',
  defaults: { query: 'abstract', count: 100 },
  extra: [
    {
      key: 'imageType',
      label: 'kind',
      value: 'all',
      options: ['all', 'photo', 'illustration', 'vector'],
    },
    {
      key: 'orientation',
      label: 'oriented',
      value: 'horizontal',
      options: ['horizontal', 'vertical', 'any'],
    },
    {
      key: 'color',
      label: 'tinted',
      value: 'any',
      options: ['any', 'grayscale', 'transparent', 'red', 'orange', 'yellow',
        'green', 'turquoise', 'blue', 'lilac', 'pink', 'white', 'black', 'brown'],
    },
  ],
  async search({ query, count, imageType, orientation, color }, key) {
    return paginate(200, count, async (page) => {
      const p = new URLSearchParams({
        key, q: query, page: String(page), per_page: '200', safesearch: 'true',
      });
      if (imageType && imageType !== 'all') p.set('image_type', imageType);
      if (orientation && orientation !== 'any') p.set('orientation', orientation);
      if (color && color !== 'any') p.set('colors', color);
      const data = await getJSON(`https://pixabay.com/api/?${p}`);
      return (data.hits || []).map((r) => ({
        url: r.largeImageURL,
        name: `pixabay_${r.id}_${safeFile(r.tags?.split(',')[0], 50)}`,
        ext: extFrom(r.largeImageURL),
        width: r.imageWidth || 0, height: r.imageHeight || 0,
        credit: `Pixabay · ${r.user} · pixabay.com/service/license`,
      }));
    }, 300);
  },
};

export const SOURCES = [
  wallhaven, unsplash, nasa, openverse, pexels, pixabay,
  artic, met, picsum, github, reddit,
];

export const byId = (id) => SOURCES.find((s) => s.id === id);

/** Formats each source can actually produce, used to constrain the format token. */
export const FORMATS = ['jpg', 'png', 'webp', 'gif', 'avif', 'any'];
