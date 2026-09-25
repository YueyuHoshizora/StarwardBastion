import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLang, MESSAGES, LOCALES } from '../src/i18n/index.js';

const root = 'https://starward-bastion.yustellar.dev/';

test('網址指定語系優先，其他參數與錨點不影響選擇', () => {
  assert.equal(resolveLang(`${root}?from=share&lang=ko#game`), 'ko');
  assert.equal(resolveLang(`${root}?lang=zh`), 'zh');
  assert.equal(resolveLang(`${root}?lang=ja`), 'ja');
  assert.equal(resolveLang(`${root}?lang=en`), 'en');
});

test('未指定或指定無效語系時預設英文，不受瀏覽器語言影響', () => {
  assert.equal(resolveLang(root), 'en');
  assert.equal(resolveLang(`${root}?lang=unknown`), 'en');
  assert.equal(resolveLang(`${root}?lang=`), 'en');
  assert.equal(resolveLang(`${root}?lang=constructor`), 'en');
});

test('各語系提供相同翻譯與插值參數，切換語言不缺少必要資訊', () => {
  const keys = Object.keys(MESSAGES.zh).sort();
  const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const lang of Object.keys(LOCALES)) {
    assert.deepEqual(Object.keys(MESSAGES[lang]).sort(), keys, `${lang} 翻譯項目`);
    for (const key of keys) {
      assert.deepEqual(parameters(MESSAGES[lang][key]), parameters(MESSAGES.zh[key]), `${lang}/${key} 參數`);
    }
  }
});
