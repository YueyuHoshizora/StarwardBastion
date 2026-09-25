import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLang, MESSAGES, LOCALES } from '../src/i18n/index.js';

const root = 'https://starward-bastion.yustellar.dev/';

test('網址語系優先於瀏覽器偏好，其他參數與錨點不影響選擇', () => {
  assert.equal(resolveLang(`${root}?from=share&lang=ko#game`, ['zh-TW', 'ja']), 'ko');
  assert.equal(resolveLang(`${root}?lang=zh`, ['en-US']), 'zh');
});

test('缺少或無效的語系參數依瀏覽器語言順序選擇，不支援時回退英文', () => {
  assert.equal(resolveLang(root, ['zh-Hant-TW']), 'zh');
  assert.equal(resolveLang(root, ['ja-JP', 'en-US']), 'ja');
  assert.equal(resolveLang(root, ['fr-FR', 'ko-KR', 'en']), 'ko');
  assert.equal(resolveLang(`${root}?lang=unknown`, ['en-GB', 'ja']), 'en');
  assert.equal(resolveLang(`${root}?lang=`, ['ja-JP']), 'ja');
  assert.equal(resolveLang(`${root}?lang=constructor`, ['fr-FR']), 'en');
  assert.equal(resolveLang(root, []), 'en');
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
