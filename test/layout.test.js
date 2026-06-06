import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { escHtml, layout } from '../views/layout.js';

describe('escHtml', () => {
  test('escapes &', () => assert.equal(escHtml('a & b'), 'a &amp; b'));
  test('escapes <', () => assert.equal(escHtml('<div>'), '&lt;div&gt;'));
  test('escapes >', () => assert.equal(escHtml('a > b'), 'a &gt; b'));
  test('escapes "', () => assert.equal(escHtml('"hello"'), '&quot;hello&quot;'));
  test('escapes all four chars', () => assert.equal(escHtml('& < > "'), '&amp; &lt; &gt; &quot;'));
  test('escapes attribute context', () => assert.equal(escHtml('<a href="/">'), '&lt;a href=&quot;/&quot;&gt;'));
  test('leaves safe strings unchanged', () => assert.equal(escHtml('hello world'), 'hello world'));
  test('handles empty string', () => assert.equal(escHtml(''), ''));
  test('coerces numbers to string', () => assert.equal(escHtml(42), '42'));
});

describe('layout', () => {
  test('starts with DOCTYPE', () => {
    assert.ok(layout('T', '').startsWith('<!DOCTYPE html>'));
  });

  test('includes the title', () => {
    assert.ok(layout('My Page', '').includes('<title>My Page</title>'));
  });

  test('HTML-escapes the title', () => {
    assert.ok(layout('<evil>', '').includes('<title>&lt;evil&gt;</title>'));
  });

  test('includes body HTML verbatim', () => {
    const body = '<p class="x">hello</p>';
    assert.ok(layout('T', body).includes(body));
  });

  test('wraps body in <body> tags', () => {
    const html = layout('T', '<p>hi</p>');
    assert.match(html, /<body>[\s\S]*<\/body>/);
  });
});
