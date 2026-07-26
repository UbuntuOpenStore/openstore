import assert from 'node:assert/strict';
import { test, describe } from 'node:test';

import * as messages from '../utils/error-messages';
import { downloadFile } from './download-file';

function createReq(overrides: Record<string, any> = {}) {
  return {
    file: undefined,
    body: {},
    originalUrl: '/test',
    on: () => {},
    ...overrides,
  } as any;
}

function createRes() {
  const res: any = {
    statusCode: undefined,
    body: undefined,
    headersSent: false,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.send = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

describe('downloadFile middleware', () => {
  test('calls next when req.file is present', async () => {
    let called = false;
    const req = createReq({ file: { path: '/tmp/test' } });
    const res = createRes();
    const next = () => {
      called = true;
    };

    await downloadFile(req, res, next);
    assert.ok(called);
  });

  test('calls next when req.body is missing', async () => {
    let called = false;
    const req = createReq({ body: undefined });
    const res = createRes();
    const next = () => {
      called = true;
    };

    await downloadFile(req, res, next);
    assert.ok(called);
  });

  test('calls next when downloadUrl is not provided', async () => {
    let called = false;
    const req = createReq({ body: {} });
    const res = createRes();
    const next = () => {
      called = true;
    };

    await downloadFile(req, res, next);
    assert.ok(called);
  });

  test('returns error for completely invalid URL', async () => {
    const req = createReq({ body: { downloadUrl: 'not-a-url' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for URL with no protocol', async () => {
    const req = createReq({ body: { downloadUrl: 'example.com/file.click' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for ftp:// protocol', async () => {
    const req = createReq({ body: { downloadUrl: 'ftp://example.com/file.click' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for file:// protocol', async () => {
    const req = createReq({ body: { downloadUrl: 'file:///etc/passwd' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for javascript: protocol', async () => {
    const req = createReq({ body: { downloadUrl: 'javascript:alert(1)' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for empty string', async () => {
    const req = createReq({ body: { downloadUrl: '' } });
    const res = createRes();

    // Empty string is falsy so it falls through to next()
    let called = false;
    await downloadFile(req, res, () => {
      called = true;
    });
    assert.ok(called);
  });

  test('returns error for URL with only whitespace', async () => {
    const req = createReq({ body: { downloadUrl: '   ' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for URL with no path segment', async () => {
    const req = createReq({ body: { downloadUrl: 'https://example.com' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_FILENAME);
  });

  test('returns error for URL with root path only', async () => {
    const req = createReq({ body: { downloadUrl: 'https://example.com/' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_FILENAME);
  });

  test('returns error for URL without .click extension', async () => {
    const req = createReq({ body: { downloadUrl: 'https://example.com/file.zip' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_FILENAME);
  });

  test('returns error for URL with IPv4 address', async () => {
    const req = createReq({ body: { downloadUrl: 'http://127.0.0.1/file.click' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for URL with IPv6 address', async () => {
    const req = createReq({ body: { downloadUrl: 'http://[::1]/file.click' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });

  test('returns error for URL with localhost hostname', async () => {
    const req = createReq({ body: { downloadUrl: 'http://localhost/file.click' } });
    const res = createRes();

    await downloadFile(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, messages.INVALID_URL);
  });
});
