#!/usr/bin/env node
/**
 * Is a free local transcription good enough to offer beside Sonnet? (Sprint 002.30, Epic 1.)
 *
 *     node tools/measure-transcription.mjs run   --candidate lmstudio|tesseract --pages <dir> --out <dir> [--from 59 --to 75]
 *                                                [--endpoint http://…/v1 --model qwen/qwen3-vl-8b] [--tesseract <node_modules dir>]
 *     node tools/measure-transcription.mjs score --reference <dir> --candidates <dir>[,<dir>…] [--corrections <json>] [--report <md>]
 *
 * `run` makes one candidate's transcript of each page image `p<N>.jpg` in `--pages`, one page at a time, timed, into
 * `--out/<candidate>-p<N>.json` (`{ text, seconds, truncated }`); a page already there is skipped. It calls only the
 * address you give (the owner's LM Studio, a local model: free) or runs an OCR in this process; it never calls a paid
 * provider. tesseract.js is **not** a dependency of this repository: pass the folder of a scratch install.
 *
 * `score` compares each candidate's folder with the reference transcripts (`--reference/<model>-p<N>.json`, the
 * provider's own answer, e.g. `claude-sonnet-5-5-p59.json`) and applies the rule pre-registered in Sprint 002.30
 * (`DECISION_RULE`). `--corrections` is a JSON list of `{ page, from, to, note }` replacements the reader made to the
 * reference after looking at the page image (the reference is not ground truth). Nothing here prints a page's text
 * beyond the figures that differ.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DECISION_RULE, decide, scoreTranscription } from './measure-transcription/score.mjs';

export const PROMPT =
  'This is one scanned page of a French lotissement regulation (règlement). Transcribe its text exactly as written, in French, ' +
  'keeping article numbers and numbering (e.g. 09-03), headings and lists in reading order. If the page is rotated, read it as a person would. ' +
  'Write [illisible] for anything you cannot read and [tampon] for a stamp. Do not summarise, translate or correct. ' +
  'Answer with the transcription only.';

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--'))
      out[argv[i].slice(2)] =
        argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

/** The text of a provider's saved answer (Anthropic's message): the text blocks, thinking left out. */
export function textOfAnswer(json) {
  if (typeof json?.text === 'string') return json.text;
  return (json?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * One chat completion over node:http, with no header or body timeout: a local 8B vision model can take minutes a page,
 * and `fetch` gives up on a response whose headers have not come in 300 s.
 */
function lmstudio({ endpoint, model, image }) {
  const body = JSON.stringify({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` }
          },
          { type: 'text', text: PROMPT }
        ]
      }
    ]
  });
  const url = new URL(`${endpoint.replace(/\/+$/u, '')}/chat/completions`);
  return new Promise((resolvePage, reject) => {
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        timeout: 0
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const choice = json.choices?.[0];
            resolvePage({
              text: choice?.message?.content ?? '',
              truncated: choice?.finish_reason === 'length',
              usage: json.usage
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(0);
    req.end(body);
  });
}

async function run(options) {
  const pages = resolve(options.pages);
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  const from = Number(options.from ?? 59);
  const to = Number(options.to ?? 75);
  const candidate = options.candidate;
  let worker;
  if (candidate === 'tesseract') {
    const mod = await import(
      pathToFileURL(join(resolve(options.tesseract), 'tesseract.js/src/index.js')).href
    );
    worker = await (mod.createWorker ?? mod.default.createWorker)('fra');
  } else if (candidate !== 'lmstudio') {
    throw new Error('--candidate is lmstudio or tesseract');
  }
  for (let n = from; n <= to; n += 1) {
    const dest = join(out, `${candidate}-p${n}.json`);
    if (existsSync(dest)) continue;
    const image = readFileSync(join(pages, `p${n}.jpg`));
    const started = Date.now();
    let answer;
    try {
      if (candidate === 'tesseract') {
        const { data } = await worker.recognize(image);
        answer = { text: data.text, truncated: false };
      } else {
        answer = await lmstudio({ endpoint: options.endpoint, model: options.model, image });
      }
    } catch (error) {
      answer = { text: '', truncated: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    answer.seconds = Math.round((Date.now() - started) / 100) / 10;
    writeFileSync(dest, JSON.stringify(answer));
    console.log(
      `${candidate} p${n}: ${answer.seconds}s${answer.error ? ` ERROR ${answer.error}` : ''}${answer.truncated ? ' TRUNCATED' : ''}`
    );
  }
  await worker?.terminate();
}

function loadPages(dir, prefix, from, to) {
  const pages = [];
  for (let n = from; n <= to; n += 1) {
    const file = join(dir, `${prefix}-p${n}.json`);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, 'utf8'));
    pages.push({
      page: n,
      text: textOfAnswer(json),
      seconds: json._seconds ?? json.seconds,
      truncated: json.truncated === true || json.stop_reason === 'max_tokens',
      usage: json.usage
    });
  }
  return pages;
}

const pct = (v) => (v === undefined ? '—' : `${(v * 100).toFixed(1)} %`);

function score(options) {
  const from = Number(options.from ?? 59);
  const to = Number(options.to ?? 75);
  const corrections = options.corrections
    ? JSON.parse(readFileSync(resolve(options.corrections), 'utf8'))
    : [];
  // A correction is `{ page, from, to }` (a replacement) or `{ page, append }` (a figure the reference missed): made by
  // the reader after looking at the page image.
  const corrected = (page, text) =>
    corrections
      .filter((c) => c.page === page)
      .reduce(
        (t, c) => (c.append === undefined ? t.split(c.from).join(c.to) : `${t}\n${c.append}`),
        text
      );
  const reference = loadPages(
    resolve(options.reference),
    options.model ?? 'claude-sonnet-5-5',
    from,
    to
  ).map((p) => ({
    ...p,
    text: corrected(p.page, p.text)
  }));
  const lines = [];
  const summary = [];
  for (const entry of String(options.candidates).split(',')) {
    const [dir, prefix] = entry.split(':');
    const candidates = loadPages(resolve(dir), prefix, from, to);
    const decision = decide(
      reference.map((r) => {
        const c = candidates.find((x) => x.page === r.page);
        return {
          page: r.page,
          reference: r.text,
          candidate: c?.text ?? '',
          truncated: c?.truncated === true
        };
      })
    );
    const seconds = candidates.reduce((s, c) => s + (c.seconds ?? 0), 0);
    summary.push({ prefix, decision, seconds, pages: candidates.length });
    lines.push(
      `\n### ${prefix}\n`,
      '| page | figures | articles | wrong | words | seconds |',
      '| ---- | ------- | -------- | ----- | ----- | ------- |'
    );
    for (const p of decision.pages) {
      const s = p.score;
      const c = candidates.find((x) => x.page === p.page);
      lines.push(
        `| ${p.page} | ${s.figures.found}/${s.figures.total} | ${s.articles.found}/${s.articles.total} | ${s.wrong.count}/${s.wrong.candidateFigures} | ${pct(s.words.recall)} | ${c?.seconds ?? '—'}${p.truncated ? ' (cut off)' : ''} |`
      );
    }
    lines.push(
      '',
      ...decision.conditions.map(
        (c) =>
          `- ${c.id} ${c.what}: **${c.id === 'G5' ? c.value : pct(c.value)}** (${c.id === 'G3' ? 'at most' : c.id === 'G5' ? 'must be' : 'at least'} ${c.id === 'G5' ? 0 : pct(c.threshold)}) → ${c.pass ? 'pass' : 'FAIL'}${c.pages?.length ? ` pages ${c.pages.join(', ')}` : ''}`
      )
    );
    lines.push(
      `- **Offered as a choice: ${decision.offered ? 'yes' : 'no'}** (the pre-registered, strict rule)`
    );
    // Informational, never the verdict: what the digits did when the unit's glyph is forgiven, and without the one table page.
    const pairs = reference.map((r) => {
      const c = candidates.find((x) => x.page === r.page);
      return {
        page: r.page,
        reference: r.text,
        candidate: c?.text ?? '',
        truncated: c?.truncated === true
      };
    });
    const info = (label, list, options) => {
      const d = decide(list, DECISION_RULE, options);
      lines.push(
        `- info, ${label}: ${d.conditions
          .slice(0, 4)
          .map((c) => `${c.id} ${pct(c.value)}`)
          .join(', ')}`
      );
    };
    info('units forgiven (m° read as m²)', pairs, { lenientUnits: true });
    info(
      'without page 74 (the table of 91 lots, 189 of the figures)',
      pairs.filter((p) => p.page !== 74),
      {}
    );
    info(
      'without page 74, units forgiven',
      pairs.filter((p) => p.page !== 74),
      { lenientUnits: true }
    );
  }
  // Sonnet and Haiku against the same reference are shown for scale (Sonnet is the reference itself).
  const text = [
    `Decision rule (Sprint 002.30): ${JSON.stringify(DECISION_RULE)}`,
    `Reference pages: ${reference.length}, corrections applied: ${corrections.length}`,
    ...lines
  ].join('\n');
  console.log(text);
  if (options.report) writeFileSync(resolve(options.report), `${text}\n`);
  return summary;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const options = args(process.argv.slice(3));
  const mode = process.argv[2];
  if (mode === 'run') await run(options);
  else if (mode === 'score') score(options);
  else {
    console.error('usage: measure-transcription.mjs run|score …');
    process.exit(2);
  }
}

export { score, run, scoreTranscription };
