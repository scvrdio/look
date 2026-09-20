const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, mocks = {}, context = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: n => mocks[n] ?? require(n), process: { env: {} }, URLSearchParams, AbortSignal, ...context });
  return module.exports;
}
const links = load('src/lib/kinopoisk.ts');
test('Kinopoisk button preserves native link navigation, including inside Telegram', () => {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/components/series/KinopoiskButton.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  let haptics = 0;
  const mocks = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'swr': () => ({ data: links.kinopoiskPage(4786341, 'series'), isLoading: false }),
    '@/lib/fetcher': { fetcher: () => {} },
    '@/lib/kinopoisk': links,
    '@/lib/haptics': { hapticImpact: () => haptics++ },
    '@/types/telegram': { getTelegramWebApp: () => ({ initData: 'signed', openLink: () => assert.fail('Must not force browser navigation') }) },
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] ?? require(name) });
  for (const [seriesId, url] of [
    ['movie:447301', 'https://www.kinopoisk.ru/film/447301/'],
    ['169', 'https://www.kinopoisk.ru/series/4786341/'],
  ]) {
    const button = module.exports.KinopoiskButton({ seriesId, title: 'Title' });
    assert.equal(button.type, 'a');
    assert.equal(button.props.href, url);
    assert.equal(button.props.target, '_blank');
    assert.equal(button.props.rel, 'noopener noreferrer');
    button.props.onClick({ preventDefault: () => assert.fail('Native navigation must remain enabled') });
  }
  assert.equal(haptics, 2);
});
test('film and series URLs use Kinopoisk IDs and encode fallback queries', () => {
  assert.equal(links.kinopoiskPage(447301, 'movie').url, 'https://www.kinopoisk.ru/film/447301/');
  assert.equal(links.kinopoiskPage(655800, 'series').url, 'https://www.kinopoisk.ru/series/655800/');
  assert.throws(() => links.kinopoiskPage(-169, 'series'));
  const fallback = links.kinopoiskSearch('A & B?');
  assert.equal(new URL(fallback.url).searchParams.get('kp_query'), 'A & B?');
  assert.equal(fallback.exact, false);
});
test('matching requires a unique exact IMDb ID and series kind', () => {
  const candidate = { id: 655800, type: 'tv-series', externalId: { imdb: 'tt2085059' } };
  assert.equal(links.matchingKinopoiskSeries([candidate], 'tt2085059'), 655800);
  assert.equal(links.matchingKinopoiskSeries([candidate], 'tt0000000'), null);
  assert.equal(links.matchingKinopoiskSeries([{ ...candidate, type: 'movie' }], 'tt2085059'), null);
  assert.equal(links.matchingKinopoiskSeries([candidate, { ...candidate, id: 2 }], 'tt2085059'), null);
});
test('resolver uses server key, verifies returned ID, and safely handles outages', async () => {
  const show = { name: 'Black Mirror', externals: { imdb: 'tt2085059' } };
  let calls = 0;
  const resolver = (fetch, env = { POISKKINO_API_KEY: 'test' }) => load('src/lib/kinopoisk-server.ts', { './kinopoisk': links }, { process: { env }, fetch }).resolveSeriesKinopoisk;
  const resolve = resolver(async (url, options) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('externalId.imdb'), show.externals.imdb);
    assert.equal(options.headers['X-API-KEY'], 'test');
    return { ok: true, json: async () => ({ docs: [{ id: 655800, isSeries: true, externalId: { imdb: 'tt2085059' } }] }) };
  });
  assert.equal((await resolve(show)).exact, true);
  assert.equal((await resolve({ name: 'Unknown' })).exact, false);
  assert.equal(calls, 1);
  assert.equal((await resolver(async () => { throw Error('timeout'); })(show)).exact, false);
  assert.equal((await resolver(async () => { throw Error('must not fetch'); }, {})(show)).exact, false);
});
