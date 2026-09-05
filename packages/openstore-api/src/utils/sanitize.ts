// SPDX-License-Identifier: AGPL-3.0-or-later
import sanitizeHtml from 'sanitize-html';

export function sanitize(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\r/g, '')
    .trim();
}
