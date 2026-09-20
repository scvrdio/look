const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function renderGate(status, library = undefined, error = undefined) {
  const module = { exports: {} };
  let requestedKey;
  const element = (type, props) => ({ type, props });
  const swr = key => { requestedKey = key; return { data: library, error }; };
  swr.SWRConfig = 'SWRConfig';
  swr.useSWRConfig = () => ({ mutate: () => {} });
  const mocks = {
    react: {
      createContext: () => ({ Provider: 'AuthProvider' }),
      useState: () => [status, () => {}], useRef: value => ({ current: value }),
      useCallback: callback => callback, useMemo: callback => callback(), useEffect: () => {},
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    swr,
    'lottie-react': 'Lottie',
    'framer-motion': { AnimatePresence: 'Presence', motion: { div: 'motion.div' }, useReducedMotion: () => false },
    '../../public/lottie.json': {},
    '@/lib/fetcher': { fetcher: () => {} },
    '@/types/telegram': { getTelegramInitData: () => '' },
  };
  const code = ts.transpileModule(fs.readFileSync('src/app/providers.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] ?? require(name) });
  const child = { type: 'Home', props: {} };
  const gate = module.exports.Providers({ children: child }).props.children;
  const tree = gate.type(gate.props);
  const [content, presence] = tree.props.children;
  return { content, loader: presence.props.children, requestedKey, child };
}

test('startup uses the same animation during login and initial library loading', () => {
  for (const status of ['checking', 'authenticated']) {
    const view = renderGate(status);
    assert.equal(view.content, null);
    assert.equal(view.loader.props.role, 'status');
    assert.equal(view.loader.props.children.props.children.type, 'Lottie');
    assert.equal(view.requestedKey, status === 'checking' ? null : '/api/series');
  }
});

test('loaded empty/nonempty library and background refresh render the page without loader', () => {
  for (const data of [[], [{ id: '169' }]]) {
    const view = renderGate('authenticated', data);
    assert.equal(view.content, view.child);
    assert.equal(view.loader, null);
  }
});

test('library errors reveal the page error state instead of an endless loader', () => {
  const view = renderGate('authenticated', undefined, new Error('offline'));
  assert.equal(view.content, view.child);
  assert.equal(view.loader, null);
});

test('authentication errors retain a retry action and dismiss loader', () => {
  for (const status of ['failed', 'unavailable']) {
    const view = renderGate(status);
    assert.equal(view.loader, null);
    assert.equal(view.content.type, 'main');
    assert.equal(view.content.props.children[0].props.role, 'alert');
    assert.equal(typeof view.content.props.children[1].props.onClick, 'function');
    assert.equal(view.requestedKey, null);
  }
});
