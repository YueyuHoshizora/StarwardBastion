import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const origin = 'https://game.test';

function worker(entries, online = true) {
  const handlers = {};
  const cache = new Map(entries.map(([path, body]) => [new URL(path, origin).href, body]));
  const normalize = (input) => new URL(typeof input === 'string' ? input : input.url, origin).href;
  const store = {
    async match(input, options = {}) {
      const url = normalize(input);
      const key = options.ignoreSearch
        ? [...cache.keys()].find((k) => k.split('?')[0] === url.split('?')[0]) : url;
      return cache.has(key) ? new Response(cache.get(key)) : undefined;
    },
    async put(input, response) { cache.set(normalize(input), await response.text()); },
  };
  runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open: async () => store },
    URL, Request, Response,
    fetch: async () => {
      if (!online) throw new Error('離線');
      return new Response('新版資源');
    },
  });
  return async (path, mode = 'cors') => {
    let result;
    handlers.fetch({
      request: { url: new URL(path, origin).href, method: 'GET', mode },
      respondWith: (promise) => { result = promise; },
      waitUntil: () => {},
    });
    return result;
  };
}

test('不同 hash 不得命中舊版快取，相同 hash 可離線使用', async () => {
  const entries = [['/src/ui/app.js?old', '舊版資源']];
  const online = worker(entries);
  assert.equal(await (await online('/src/ui/app.js?new')).text(), '新版資源');
  const offline = worker(entries, false);
  assert.equal(await (await offline('/src/ui/app.js?old')).text(), '舊版資源');
  assert.equal((await offline('/src/ui/app.js?new')).status, 504);
});

test('首頁優先更新，離線導覽才使用快取首頁', async () => {
  const entries = [['/', '舊首頁'], ['/index.html', '離線首頁']];
  assert.equal(await (await worker(entries)('/', 'navigate')).text(), '新版資源');
  assert.equal(await (await worker(entries, false)('/?from=bookmark', 'navigate')).text(), '離線首頁');
});
