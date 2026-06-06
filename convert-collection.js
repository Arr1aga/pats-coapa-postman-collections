#!/usr/bin/env node
/**
 * Converts a Postman Collection v2.1 JSON to Postman YAML v3 format
 * for a local filesystem workspace.
 */

const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim();
}

/**
 * Minimal YAML serialiser – good enough for Postman request files.
 * Handles strings, numbers, booleans, null, arrays, and plain objects.
 */
function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);

  if (value === null || value === undefined) return 'null';

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return quoteYamlString(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map(item => {
        const rendered = toYaml(item, indent + 2);
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          // inline first key on the dash line
          const lines = rendered.split('\n');
          return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).join('\n')}`;
        }
        return `${pad}- ${rendered}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        const safeKey = /[:#&*!\[\]{}>|'",?]/.test(k) ? `'${k}'` : k;
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          const inner = toYaml(v, indent + 2);
          return `${pad}${safeKey}:\n${inner}`;
        }
        if (Array.isArray(v)) {
          if (v.length === 0) return `${pad}${safeKey}: []`;
          const inner = toYaml(v, indent + 2);
          return `${pad}${safeKey}:\n${inner}`;
        }
        // For string values that produce block scalars, we need to indent them properly
        const strVal = toYaml(v, indent);
        if (typeof v === 'string' && v.includes('\n')) {
          // block scalar: re-render with correct indent
          const blockIndent = indent + 2;
          const blockPad = ' '.repeat(blockIndent);
          const escaped = v.replace(/\n$/, '');
          const blockContent = escaped.split('\n').map(l => `${blockPad}${l}`).join('\n');
          return `${pad}${safeKey}: |-\n${blockContent}`;
        }
        return `${pad}${safeKey}: ${strVal}`;
      })
      .join('\n');
  }

  return String(value);
}

function quoteYamlString(str) {
  if (str === '') return "''";

  // Multi-line → block scalar (indentation handled by caller for object values)
  if (str.includes('\n')) {
    const escaped = str.replace(/\n$/, '');
    // Return just the marker + content with 2-space indent (base level)
    return `|-\n${escaped.split('\n').map(l => `  ${l}`).join('\n')}`;
  }

  // Needs quoting?
  const needsQuote =
    /[:{}&*!,[\]#|>'"%@`]/.test(str) ||
    /\{\{/.test(str) ||
    /^(true|false|null|yes|no|on|off)$/i.test(str) ||
    /^\d/.test(str) ||
    str.startsWith('-') ||
    str.startsWith('?') ||
    str.includes(': ');

  if (needsQuote) {
    // Use single quotes; escape internal single quotes by doubling them
    return `'${str.replace(/'/g, "''")}'`;
  }

  return str;
}

function buildYamlDoc(obj) {
  return toYaml(obj, 0) + '\n';
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function resolveUrl(urlObj) {
  if (!urlObj) return '';
  if (typeof urlObj === 'string') return urlObj;
  if (urlObj.raw) return urlObj.raw;
  return '';
}

// ── Auth conversion ───────────────────────────────────────────────────────────

function convertAuth(auth) {
  if (!auth) return undefined;
  const type = auth.type;
  if (!type || type === 'noauth') return { type: 'noauth' };

  const creds = auth[type];
  if (!creds) return { type };

  // v2.1 stores creds as array of {key,value} objects
  if (Array.isArray(creds)) {
    return { type, [type]: creds };
  }
  return { type, [type]: creds };
}

// ── Body conversion ───────────────────────────────────────────────────────────

function convertBody(body) {
  if (!body) return undefined;
  const mode = body.mode;
  if (!mode || mode === 'none') return undefined;

  const result = { mode };

  if (mode === 'raw') {
    result.raw = body.raw || '';
    if (body.options) result.options = body.options;
  } else if (mode === 'formdata') {
    result.formdata = (body.formdata || []).map(f => ({
      key: f.key,
      value: f.value,
      type: f.type || 'text',
      ...(f.description ? { description: f.description } : {}),
      ...(f.disabled !== undefined ? { disabled: f.disabled } : {}),
    }));
  } else if (mode === 'urlencoded') {
    result.urlencoded = (body.urlencoded || []).map(f => ({
      key: f.key,
      value: f.value,
      ...(f.description ? { description: f.description } : {}),
      ...(f.disabled !== undefined ? { disabled: f.disabled } : {}),
    }));
  } else if (mode === 'graphql') {
    result.graphql = body.graphql || {};
  } else if (mode === 'file') {
    result.file = body.file || {};
  }

  return result;
}

// ── Request conversion ────────────────────────────────────────────────────────

function convertRequest(item) {
  const req = item.request || {};
  const url = resolveUrl(req.url);

  const headers = (req.header || [])
    .filter(h => h.key)
    .map(h => ({
      key: h.key,
      value: h.value || '',
      ...(h.description ? { description: h.description } : {}),
      ...(h.disabled ? { disabled: true } : {}),
    }));

  const queryParams =
    req.url && typeof req.url === 'object' && req.url.query
      ? req.url.query
          .filter(q => q.key)
          .map(q => ({
            key: q.key,
            value: q.value || '',
            ...(q.description ? { description: q.description } : {}),
            ...(q.disabled ? { disabled: true } : {}),
          }))
      : undefined;

  const body = convertBody(req.body);
  const auth = convertAuth(req.auth);

  const requestObj = {
    method: req.method || 'GET',
    url,
    ...(headers.length ? { headers } : {}),
    ...(queryParams && queryParams.length ? { queryParams } : {}),
    ...(body ? { body } : {}),
    ...(auth ? { auth } : {}),
    ...(req.description ? { description: req.description } : {}),
  };

  const responses = (item.response || []).map(r => ({
    name: r.name || '',
    status: r.status || '',
    code: r.code,
    ...(r.header && r.header.length
      ? { header: r.header.map(h => ({ key: h.key, value: h.value })) }
      : {}),
    ...(r.body !== undefined ? { body: r.body } : {}),
  }));

  return {
    name: item.name,
    request: requestObj,
    response: responses,
  };
}

// ── Recursive item processor ──────────────────────────────────────────────────

function processItems(items, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  let order = 1000;

  for (const item of items) {
    if (item.item) {
      // It's a folder
      const folderName = sanitizeFilename(item.name);
      const folderDir = path.join(outputDir, folderName);
      fs.mkdirSync(folderDir, { recursive: true });

      // Write folder.yaml
      const folderMeta = { name: item.name };
      if (item.description) folderMeta.description = item.description;
      fs.writeFileSync(
        path.join(folderDir, 'folder.yaml'),
        buildYamlDoc(folderMeta)
      );

      processItems(item.item, folderDir);
    } else {
      // It's a request
      const reqName = sanitizeFilename(item.name);
      const reqFile = path.join(outputDir, `${reqName}.request.yaml`);

      const doc = convertRequest(item);
      // Add order
      doc.order = order;
      order += 1000;

      fs.writeFileSync(reqFile, buildYamlDoc(doc));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SOURCE = process.argv[2];
const OUTPUT_BASE = process.argv[3];

if (!SOURCE || !OUTPUT_BASE) {
  console.error('Usage: node convert-collection.js <source.json> <output-base-dir>');
  process.exit(1);
}

const raw = fs.readFileSync(SOURCE, 'utf8');
const collection = JSON.parse(raw);

const info = collection.info || {};
const collectionName = sanitizeFilename(info.name || 'collection');
const collectionDir = path.join(OUTPUT_BASE, collectionName);

fs.mkdirSync(collectionDir, { recursive: true });

// Write definition.yaml (collection metadata)
const resourcesDir = path.join(collectionDir, '.resources');
fs.mkdirSync(resourcesDir, { recursive: true });

const definition = {
  $kind: 'collection',
  name: info.name || collectionName,
  ...(info.description ? { description: info.description } : {}),
};

// Collection-level variables
if (collection.variable && collection.variable.length) {
  definition.variables = collection.variable.map(v => ({
    key: v.key,
    value: String(v.value || ''),
    ...(v.description ? { description: v.description } : {}),
    ...(v.disabled ? { disabled: true } : {}),
  }));
}

// Collection-level auth
if (collection.auth) {
  definition.auth = convertAuth(collection.auth);
}

fs.writeFileSync(
  path.join(resourcesDir, 'definition.yaml'),
  buildYamlDoc(definition)
);

// Process all items
processItems(collection.item || [], collectionDir);

// Summary
function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}

const total = countFiles(collectionDir);
console.log(`✅  Converted "${info.name}" → ${collectionDir}`);
console.log(`   ${total} files written.`);
