#!/usr/bin/env node
/**
 * One live, paid run of the uploaded-document reading on pages of a scan (Sprint 002.30, Epic 4):
 * the service's OWN routes — estimate, one transcription a page, then the reading — against a real AI service,
 * measured by the platform's own meter (the same price table as the product), with a spend ceiling.
 *
 *     node tools/measure-uploaded-reading.mjs --pages <dir of p<N>.jpg> [--from 59 --to 75] [--max-spend 2]
 *         [--platform ../archisimple] [--out docs/measurements/uploaded-reading-run.json] [--reference <dir of Sonnet transcripts>] [--confirm]
 *
 * Without `--confirm` it prints the estimate and calls nothing. With it, the platform's AI service is started
 * on loopback with the keys of its own `.env` (never printed) and a stand-in for the usage endpoint; the request goes
 * through `createService(...).handle(...)` exactly as the gateway hands it over. Only the pages named leave this machine.
 * The page images and the transcripts are NOT written anywhere by this tool: the output holds the rules, their
 * passages (the règlement's own words), counts, times and the spend.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLedgerStub } from './evaluate-reading/run.mjs';
import { decide } from './measure-transcription/score.mjs';
import { createService } from '../services/fr-urban-rules-service/src/service.mjs';
import { estimateReading } from '../services/fr-urban-rules-service/src/uploaded.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const options = {};
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--'))
    options[argv[i].slice(2)] =
      argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[(i += 1)];
}
if (options.pages === undefined) {
  console.error(
    'usage: node tools/measure-uploaded-reading.mjs --pages <dir> [--from 59 --to 75] [--max-spend 2] [--confirm]'
  );
  process.exit(2);
}
const from = Number(options.from ?? 59);
const to = Number(options.to ?? 75);
const pages = to - from + 1;
const maxSpend = Math.round(Number(options['max-spend'] ?? 2) * 1e6);
const estimate = estimateReading({ mode: 'image', pages });
console.log(
  `Estimate for ${pages} scanned pages (${from}-${to}): about $${estimate.aboutUsd} (between $${estimate.lowUsd} and $${estimate.highUsd}); ceiling $${maxSpend / 1e6}.`
);
if (options.confirm !== true) {
  console.log('Dry run: nothing was called. Add --confirm to spend.');
  process.exit(0);
}

const platform = resolve(ROOT, options.platform ?? '../archisimple');
const token = randomBytes(16).toString('hex');
const ledger = createLedgerStub({ token });
const ledgerPort = await ledger.listen(0);
const port = 4690;
const child = spawn('node', ['--env-file-if-exists=../../.env', '--import', 'tsx', 'src/main.ts'], {
  cwd: join(platform, 'apps/ai-service'),
  env: {
    ...process.env,
    AI_SERVICE_PORT: String(port),
    AI_SERVICE_DEFAULT_PROVIDER: 'anthropic',
    AI_SERVICE_REQUEST_TIMEOUT_MS: '600000',
    ACCOUNT_USAGE_URL: `http://127.0.0.1:${ledgerPort}`,
    ACCOUNT_USAGE_TOKEN: token,
    AI_SERVICE_TRUST_ACCOUNT_FEATURES: 'true'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
child.stderr.on('data', (d) => (stderr = (stderr + String(d)).slice(-1500)));
await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('the AI service did not start in 30 s')), 30_000);
  child.stdout.on('data', (d) => {
    if (/listening on/.test(String(d))) {
      clearTimeout(timer);
      ok();
    }
  });
  child.on('exit', (code) =>
    fail(
      new Error(
        `the AI service exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`
      )
    )
  );
});

const stop = async () => {
  child.kill();
  await ledger.close();
};
const spent = () => ledger.entries().reduce((n, e) => n + (e.costMicrousd ?? 0), 0);
try {
  const service = await createService({
    env: { FR_URBAN_RULES_LIMIT_READ_MINUTE: '1000' },
    log: () => {},
    dataDir: mkdtempSync(join(tmpdir(), 'fr-urban-rules-live-')),
    aiServiceUrl: `http://127.0.0.1:${port}`,
    fetcher: {},
    parse: async () => ({}),
    watch: false
  });
  const who = {
    limitKey: 'user:harness',
    userHash: 'harness',
    userSource: 'header',
    aiSubject: '00000000-0000-4000-8000-000000000030'
  };
  const request = (method, segments, body) => ({
    method,
    segments: ['v1', 'uploads', ...segments],
    query: new URLSearchParams(),
    body: body === undefined ? undefined : JSON.stringify(body),
    ...who
  });
  const pagesOut = [];
  const transcripts = [];
  const started = Date.now();
  for (let n = from; n <= to; n += 1) {
    if (spent() >= maxSpend) {
      console.log(`Spend ceiling reached before page ${n}: stopped.`);
      break;
    }
    const image = readFileSync(join(resolve(options.pages), `p${n}.jpg`)).toString('base64');
    const t0 = Date.now();
    // Sprint 002.30 Addendum A: a page is a job (202, then a poll); settled here into the `{ status, body }` this tool reads.
    const posted = await service.handle(
      request('POST', ['transcriptions'], {
        page: n,
        image: { mediaType: 'image/jpeg', data: image }
      })
    );
    let answer = posted;
    if (posted.status === 202) {
      await service.idle();
      const view = (await service.handle(request('GET', ['transcriptions', posted.body.jobId]))).body;
      answer =
        view.state === 'done'
          ? { status: 200, body: view.result }
          : { status: 502, body: { ...view.error, error: view.error.code } };
    }
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    if (answer.status !== 200) {
      console.log(`page ${n}: ${answer.status} ${answer.body.error}`);
      pagesOut.push({ page: n, seconds, error: answer.body.error });
      if (answer.body.error === 'ai_budget_exhausted') break;
      continue;
    }
    console.log(
      `page ${n}: ${seconds}s, ${answer.body.text.length} chars${answer.body.truncated ? ', CUT OFF' : ''}${answer.body.illegible ? ', mostly illegible' : ''}`
    );
    pagesOut.push({
      page: n,
      seconds,
      chars: answer.body.text.length,
      truncated: answer.body.truncated,
      illegible: answer.body.illegible
    });
    transcripts.push({
      page: n,
      text: answer.body.text,
      transcribed: true,
      truncated: answer.body.truncated
    });
  }
  // The meter delivers in the background.
  for (let i = 0; i < 80 && ledger.entries().length < transcripts.length; i += 1)
    await new Promise((r) => setTimeout(r, 100));
  const afterTranscription = spent();
  const transcriptionSeconds = Math.round((Date.now() - started) / 100) / 10;

  let reading;
  if (spent() < maxSpend && transcripts.length > 0) {
    const started2 = Date.now();
    const begun = await service.handle(
      request('POST', ['readings'], { documentId: 'peynier-reglement', pages: transcripts })
    );
    if (begun.status !== 202)
      throw new Error(`the reading was refused: ${begun.status} ${begun.body.error}`);
    await service.idle();
    const job = (await service.handle(request('GET', ['readings', begun.body.jobId]))).body;
    reading = { job, seconds: Math.round((Date.now() - started2) / 100) / 10 };
    console.log(
      `reading: ${job.state}, ${job.result?.rules?.length ?? 0} rules, ${reading.seconds}s`
    );
  }
  const settlementsWanted = transcripts.length + (reading?.job?.result?.chunks?.of ?? 0);
  for (let i = 0; i < 80 && ledger.entries().length < settlementsWanted; i += 1)
    await new Promise((r) => setTimeout(r, 100));
  const entries = ledger.entries();
  const sum = (list, key) => list.reduce((n, e) => n + (e[key] ?? 0), 0);
  const byKind = {};
  for (const e of entries) {
    const k = e.kind ?? 'unknown';
    byKind[k] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costMicrousd: 0 };
    byKind[k].calls += 1;
    byKind[k].inputTokens += e.inputTokens ?? 0;
    byKind[k].outputTokens += e.outputTokens ?? 0;
    byKind[k].costMicrousd += e.costMicrousd ?? 0;
  }
  // Digits: the new transcripts against the Sonnet transcripts of 2026-11-20 (a reference, not ground truth).
  let fidelity;
  if (options.reference !== undefined) {
    const reference = transcripts.map((t) => {
      const json = JSON.parse(
        readFileSync(join(resolve(options.reference), `claude-sonnet-5-5-p${t.page}.json`), 'utf8')
      );
      return {
        page: t.page,
        reference: json.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n'),
        candidate: t.text,
        truncated: t.truncated
      };
    });
    const verdict = decide(reference);
    fidelity = verdict.conditions.map((c) => ({ id: c.id, what: c.what, value: c.value }));
  }
  const result = reading?.job?.result;
  const output = {
    ran: new Date().toISOString().slice(0, 10),
    pages: { from, to, transcribed: transcripts.length },
    estimate: {
      aboutUsd: estimate.aboutUsd,
      lowUsd: estimate.lowUsd,
      highUsd: estimate.highUsd,
      microusd: estimate.microusd
    },
    measured: {
      costMicrousd: sum(entries, 'costMicrousd'),
      afterTranscriptionMicrousd: afterTranscription,
      byKind,
      transcriptionSeconds,
      readingSeconds: reading?.seconds,
      priceVersion: entries[0]?.priceVersion
    },
    pagesOut,
    fidelityAgainstEarlierSonnetTranscripts: fidelity,
    reading:
      reading === undefined
        ? undefined
        : {
            state: reading.job.state,
            error: reading.job.error,
            chunks: result?.chunks,
            dropped: result?.dropped,
            model: result?.model,
            truncatedPages: result?.reading?.truncatedPages,
            stopped: result?.stopped
          },
    // The règlement's own words and the checks' verdicts: no transcript, no image.
    rules: (result?.rules ?? []).map((r) => ({
      kind: r.kind,
      sector: r.sector,
      statement: r.statement,
      limit: r.limit,
      page: r.page,
      article: r.article,
      passage: r.passage,
      confidence: r.confidence,
      doubts: r.doubts,
      fromTranscript: r.fromTranscript,
      strip: r.strip
    }))
  };
  if (options.out !== undefined)
    writeFileSync(resolve(ROOT, options.out), JSON.stringify(output, null, 2));
  console.log(
    `\nMeasured: $${(output.measured.costMicrousd / 1e6).toFixed(3)} (estimate $${estimate.aboutUsd}); by kind ${JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, `${v.calls} calls, $${(v.costMicrousd / 1e6).toFixed(3)}`])))}`
  );
} finally {
  await stop();
}
