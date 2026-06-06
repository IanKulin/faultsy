import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from '../routes/errors.js';

describe('isSafeUrl', () => {
  test('accepts http URLs', () => assert.equal(isSafeUrl('http://example.com'), true));
  test('accepts https URLs', () => assert.equal(isSafeUrl('https://example.com'), true));
  test('accepts https with path and query', () => assert.equal(isSafeUrl('https://sub.example.com/path?key=val&other=1'), true));
  test('accepts http with port', () => assert.equal(isSafeUrl('http://localhost:3000/page'), true));

  test('rejects ftp URLs', () => assert.equal(isSafeUrl('ftp://example.com'), false));
  test('rejects javascript: URLs', () => assert.equal(isSafeUrl('javascript:alert(1)'), false));
  test('rejects data: URLs', () => assert.equal(isSafeUrl('data:text/html,<h1>x</h1>'), false));
  test('rejects blob: URLs', () => assert.equal(isSafeUrl('blob:https://example.com/abc'), false));
  test('rejects plain strings', () => assert.equal(isSafeUrl('not a url'), false));
  test('rejects empty string', () => assert.equal(isSafeUrl(''), false));
  test('rejects relative paths', () => assert.equal(isSafeUrl('/just/a/path'), false));
});
