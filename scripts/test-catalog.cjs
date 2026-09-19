const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, mocks = {}, context = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] ?? require(name), process: { env: {} }, Response, Request, AbortSignal, URL, console, ...context });
  return module.exports;
}

test('movie catalog accepts only films, never serial anime or TV shows', async () => {
  const catalog = load('src/lib/movie-catalog.ts', {}, {
    process: { env: { POISKKINO_API_KEY: 'test' } },
    fetch: async () => Response.json({ docs: [
      { id: 1, name: 'Movie', type: 'movie' },
      { id: 2, name: 'Cartoon', type: 'cartoon' },
      { id: 3, name: 'Show', type: 'tv-series' },
      { id: 4, name: 'Animated series', type: 'cartoon', isSeries: true },
      { id: -5, name: 'Bad', type: 'movie' },
    ] }),
  });
  assert.deepEqual(Array.from(await catalog.searchMovies('test'), m => m.id), [1, 2]);
});

function catalogFixture(movieFailure = false) {
  return load('src/lib/look-catalog.ts', {
    './subscriptions': { isDemoMode: () => false },
    './look-store': { libraryState: async () => ({ subscriptions: [], watched: [], paused: [] }), listMovies: async () => [{ id: 1, name: 'Movie', year: 2020, posterUrl: null, watched: true }] },
    './movie-catalog': { searchMovies: async () => { if (movieFailure) throw Error('offline'); return [{ id: 1, name: 'Query', year: 2020, posterUrl: null }]; } },
  }, { fetch: async url => Response.json(url.includes('/search/') ? [{ show: { id: 1, name: 'Query Show', premiered: '2020-01-01', image: null } }] : [
    { id: 1, season: 1, number: 1 }, { id: 2, season: 2, number: 1 },
    { id: 3, season: 0, number: 1 }, { id: 4, season: 2, number: null },
  ]) });
}

test('series counts exclude specials; films have separate identity and no counts', async () => {
  const { items } = await catalogFixture().catalogSearch('Query');
  const show = items.find(m => m.id === 1), film = items.find(m => m.id === -1);
  assert.equal(show.seasonsCount, 2); assert.equal(show.episodesCount, 2);
  assert.equal(film.type, 'movie'); assert.equal(film.seasonsCount, null);
  assert.equal(items[0].id, -1);
});

test('movie outage keeps series visible and reports partial results', async () => {
  const result = await catalogFixture(true).catalogSearch('Query');
  assert.equal(result.items.length, 1); assert.ok(result.warning);
});

test('includeMovies=0 excludes films; empty queries return no results', async () => {
  const catalog = catalogFixture();
  assert.equal((await catalog.catalogSearch('Query', false)).items.length, 1);
  assert.equal((await catalog.catalogSearch('   ')).items.length, 0);
});

test('saved movies have binary progress and no invented seasons', async () => {
  const data = await catalogFixture().bootstrap('123');
  assert.equal(data.series[0].id, 'movie:1');
  assert.equal(data.series[0].kind, 'movie');
  assert.equal(data.series[0].progress.percent, 100);
  assert.equal(data.seasonsBySeries['movie:1'].length, 0);
});

test('movie writes are account-scoped and never touch subscription cursors', async () => {
  const writes = [];
  const store = load('src/lib/look-store.ts', {
    './subscriptions': { isDemoMode: () => false, supabase: async (path, init) => { writes.push({ path, init }); return []; } },
  });
  await store.saveMovie('123', { id: 1, name: 'Movie', year: 2020, posterUrl: null });
  await store.updateMovie('123', 1, true);
  await store.updateMovie('123', 1, false);
  await store.updateMovie('123', 1, 'delete');
  assert.match(writes[0].init.headers.Prefer, /ignore-duplicates/);
  for (const write of writes) assert.ok(write.path.startsWith('look_movies?'));
  for (const write of writes.slice(1)) assert.match(write.path, /chat_id=eq.123&movie_id=eq.1/);
  assert.equal(JSON.parse(writes[1].init.body).watched, true);
  assert.equal(JSON.parse(writes[2].init.body).watched, false);
});

test('movie routes require login, validate input and reject another account’s film', async () => {
  let account = null;
  const saved = [], updates = [];
  const route = load('src/app/api/[...path]/route.ts', {
    '@/server_auth/getCurrentChatId': { getCurrentChatId: async () => account },
    '@/lib/look-catalog': {},
    '@/lib/kinopoisk': load('src/lib/kinopoisk.ts'),
    '@/lib/kinopoisk-server': {},
    '@/lib/subscriptions': { isDemoMode: () => false },
    '@/lib/movie-catalog': { getMovie: async id => ({ id, name: 'Film', year: null, posterUrl: null }) },
    '@/lib/look-store': {
      listMovies: async id => id === '123' ? [{ id: 10 }] : [],
      saveMovie: async (...args) => saved.push(args), updateMovie: async (...args) => updates.push(args),
    },
  });
  const request = (path, method = 'GET', body) => route[method](new Request('https://example.test/api/' + path, {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  }), { params: Promise.resolve({ path: path.split('/') }) });
  assert.equal((await request('movies/import', 'POST', { id: 10 })).status, 401);
  account = '123';
  assert.equal((await request('movies/import', 'POST', { id: -10 })).status, 400);
  assert.equal((await request('movies/import', 'POST', { id: 10 })).status, 201);
  assert.equal(saved[0][0], '123');
  assert.equal((await request('series/movie:10', 'PATCH', { completed: true })).status, 200);
  assert.deepEqual(Array.from(updates[0]), ['123', 10, true]);
  account = '456';
  assert.equal((await request('series/movie:10', 'PATCH', { completed: true })).status, 404);
  assert.equal((await request('series/movie:10', 'DELETE')).status, 404);
  assert.equal(updates.length, 1);
});
