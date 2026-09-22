// Reading and writing the level files on disk, for the dev server and the tools.
//
// The game fetches levels over http (src/levels.js); everything that runs in
// node -- the dev server saving from the editor, the audit, the starter-level
// script -- goes through here, so there is one place that knows the layout:
// levels/index.json for the order, and one file per level, 01.json, 02.json...
//
//   node tools/book.mjs import <file>   split a one-file book (the editor's
//                                       download, or an old levels.json) into levels/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT, LEVEL_DIR, emptyBook, splitBook } from '../src/levels.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, '..');

/** Every level, in play order, as the files have them. No index is no levels. */
export function readBook(root = ROOT) {
  const dir = path.join(root, LEVEL_DIR);
  const indexFile = path.join(dir, 'index.json');
  if (!fs.existsSync(indexFile)) return { ...emptyBook(), files: [] };
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  if (index.format !== FORMAT) throw new Error(`levels/index.json is format ${index.format}, expected ${FORMAT}`);
  const levels = index.levels.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  return { format: FORMAT, levels, files: index.levels };
}

/**
 * Write the whole book: a file per level and the index. Level files the new
 * order no longer uses -- the book got shorter -- are removed, and so is the
 * old single-file levels.json if it is still there.
 */
export function writeBook(book, root = ROOT) {
  const dir = path.join(root, LEVEL_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const { index, files } = splitBook(book);
  const keep = new Set(files.map(([name]) => name));
  for (const [name, text] of files) fs.writeFileSync(path.join(dir, name), text);
  fs.writeFileSync(path.join(dir, 'index.json'), index);
  for (const name of fs.readdirSync(dir)) {
    if (/^\d+\.json$/.test(name) && !keep.has(name)) fs.rmSync(path.join(dir, name));
  }
  const old = path.join(dir, 'levels.json');
  if (fs.existsSync(old)) fs.rmSync(old);
  return files.map(([name]) => name);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  if (command !== 'import' || !file) {
    console.log('usage: node tools/book.mjs import <file>');
    process.exit(1);
  }
  const book = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (book.format !== FORMAT || !Array.isArray(book.levels)) {
    console.log(`${file} is not a level book (format ${FORMAT})`);
    process.exit(1);
  }
  const names = writeBook(book);
  console.log(`wrote ${names.length} levels to ${LEVEL_DIR}/ (${names[0]} .. ${names[names.length - 1]}) and ${LEVEL_DIR}/index.json`);
}
