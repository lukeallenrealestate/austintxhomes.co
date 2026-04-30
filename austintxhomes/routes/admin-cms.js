const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAdmin } = require('../../idx-search/middleware/authMiddleware');

const SITE_DIR = path.join(__dirname, '..', 'public', 'site');
const ALLOWED_DIRS = [
  path.join(__dirname, '..', 'public', 'site'),
  path.join(__dirname, '..', 'public', 'js'),
  path.join(__dirname, '..', 'public', 'css'),
  path.join(__dirname, '..', 'data'),
  path.join(__dirname, '..', 'templates'),
];

function isSafePath(filePath) {
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some(dir => resolved.startsWith(dir));
}

// GET /api/admin-cms/pages - list all pages with metadata
router.get('/pages', requireAdmin, (_req, res) => {
  const files = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'));
  const pages = files.map(f => {
  const filePath = path.join(SITE_DIR, f);
  const html = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] || '';
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return {
  slug: f.replace('.html', ''),
  filename: f,
  title: title.slice(0, 120),
  meta: meta.slice(0, 200),
  h1: h1.slice(0, 120),
  wordCount,
  modified: stat.mtime.toISOString()
  };
  });
  res.json(pages);
});

// GET /api/admin-cms/pages/:slug/source - read page source
router.get('/pages/:slug/source', requireAdmin, (req, res) => {
  const filePath = path.join(SITE_DIR, req.params.slug + '.html');
  if (!isSafePath(filePath) || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Page not found' });
  res.json({ source: fs.readFileSync(filePath, 'utf8') });
});

// POST /api/admin-cms/pages/:slug/edit - surgical element edit
router.post('/pages/:slug/edit', requireAdmin, (req, res) => {
  const { tag, oldText, newText, oldHref, newHref } = req.body;
  if (!oldText && !oldHref) return res.status(400).json({ error: 'Nothing to change' });

  const filePath = path.join(SITE_DIR, req.params.slug + '.html');
  if (!isSafePath(filePath) || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Page not found' });

  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Text replacement - find the old text inside the specified tag and replace
  if (oldText && newText && oldText !== newText) {
  const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Try to match within the specific tag first
  if (tag) {
  const tagRegex = new RegExp(`(<${tag}[^>]*>)([\\s\\S]*?)(\\s*</${tag}>)`, 'gi');
  let found = false;
  html = html.replace(tagRegex, (match, open, content, close) => {
  if (found) return match;
  if (content.includes(oldText)) {
  found = true;
  return open + content.replace(oldText, newText) + close;
  }
  return match;
  });
  if (found) changed = true;
  }
  // Fallback: global text replacement
  if (!changed && html.includes(oldText)) {
  html = html.replace(oldText, newText);
  changed = true;
  }
  }

  // Href replacement
  if (oldHref && newHref && oldHref !== newHref) {
  const hrefEscaped = oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hrefRegex = new RegExp(`href="${hrefEscaped}"`, 'g');
  if (hrefRegex.test(html)) {
  html = html.replace(hrefRegex, `href="${newHref}"`);
  changed = true;
  }
  // Also handle onclick for buttons
  const onclickRegex = new RegExp(`onclick="[^"]*${hrefEscaped}[^"]*"`, 'g');
  if (onclickRegex.test(html)) {
  html = html.replace(new RegExp(oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newHref);
  changed = true;
  }
  }

  if (!changed) {
  if (oldText === newText && oldHref === newHref) return res.json({ ok: true, slug: req.params.slug, noChange: true });
  return res.status(400).json({ error: 'Could not find the element to edit. Text may have changed.' });
  }

  fs.writeFileSync(filePath, html);
  res.json({ ok: true, slug: req.params.slug });
});

// POST /api/admin-cms/ai - proxy to Claude API
router.post('/ai', requireAdmin, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { action, elementText, elementTag, elementHref, pageTitle, pageSlug, customPrompt } = req.body;

  const prompts = {
  rewrite_text: `Rewrite this text to be more compelling and clear. Keep the same meaning and roughly the same length. Return ONLY the rewritten text, nothing else.\n\nOriginal:\n${elementText}`,
  rewrite_meta: `Rewrite this meta description for higher click-through rate on Google. Keep under 155 characters. Be specific and include a call to action. Return ONLY the new meta description.\n\nPage: ${pageTitle}\nCurrent meta: ${elementText}`,
  fix_link: `This ${elementTag || 'link'} on the page "${pageTitle}" currently points to "${elementHref}" but it seems broken or wrong. The link text is "${elementText}". Based on common site structure for a real estate website (austintxhomes.co), what should this link point to? Return ONLY the correct URL path (e.g., /buy or /neighborhoods/tarrytown), nothing else.`,
  improve_heading: `Improve this heading to be more engaging and SEO-friendly. Keep it concise. Return ONLY the improved heading.\n\nPage: ${pageTitle}\nCurrent heading: ${elementText}`,
  custom: customPrompt || `Help me with this element on my website:\nPage: ${pageTitle}\nElement: <${elementTag}>${elementText}</${elementTag}>${elementHref ? '\nLink: ' + elementHref : ''}`
  };

  const prompt = prompts[action] || prompts.custom;

  try {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }]
  })
  });
  const data = await r.json();
  const text = data.content?.[0]?.text || '';
  res.json({ suggestion: text.trim() });
  } catch (err) {
  console.error('[AI]', err.message);
  res.status(500).json({ error: 'AI request failed' });
  }
});

// POST /api/admin-cms/push-file - hot-push a file directly (for Claude Code remote edits)
router.post('/push-file', requireAdmin, (req, res) => {
  const { filePath: relPath, content } = req.body;
  if (!relPath || !content) return res.status(400).json({ error: 'filePath and content required' });
  const abs = path.join(__dirname, '..', relPath);
  if (!isSafePath(abs)) return res.status(403).json({ error: 'Path not allowed' });
  fs.writeFileSync(abs, content);

  // Bust Node's require cache for any .js module under templates/, data/, or routes/
  // so the running process picks up the new content on the next request without a
  // process restart. Static HTML/CSS/JS in /public is read from disk every request,
  // so they don't need this — but SSR templates do.
  let recached = false;
  if (relPath.endsWith('.js') && (relPath.startsWith('templates/') || relPath.startsWith('data/') || relPath.startsWith('routes/'))) {
    try {
      const resolved = require.resolve(abs);
      if (require.cache[resolved]) {
        delete require.cache[resolved];
        recached = true;
      }
    } catch (_) {}
  }

  res.json({ ok: true, path: relPath, recached });
});

module.exports = router;
