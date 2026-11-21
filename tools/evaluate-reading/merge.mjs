/**
 * Merging several reads of one chapter (Sprint 002.39, Epic 1).
 *
 * Two reads of the same text give the same rule with different cuts of its passage (the model stops its quotation
 * at another word), so the service's own key (which holds the passage) treats them as two rules. Here a rule is
 * the same rule when its kind, sector, statement, limit and strip are the same **and its passage overlaps** the
 * other's in the chapter's text (the rules' `offset`s are in one coordinate system for one chapter). The merged rule
 * keeps the longer passage, the best confidence and every condition and exception once, and carries an
 * **agreement**: the number of distinct reads that gave it (`readers` says which).
 *
 * Pure: no model, no file. Used by the harness to measure what a second read would add; nothing in the service
 * calls it.
 */

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const strip = (r) => (r.strip === undefined ? null : r.strip);

/** The same kind of rule about the same thing, whatever its passage. */
function sameRule(a, b) {
  return (
    a.kind === b.kind &&
    (a.sector ?? null) === (b.sector ?? null) &&
    a.statement === b.statement &&
    sameJson(a.limit, b.limit) &&
    sameJson(strip(a), strip(b))
  );
}

const overlaps = (a, b) =>
  a.offset !== undefined &&
  b.offset !== undefined &&
  a.offset.start < b.offset.end &&
  b.offset.start < a.offset.end;

const CONFIDENCE = ['low', 'medium', 'high'];
const best = (a, b) => (CONFIDENCE.indexOf(b) > CONFIDENCE.indexOf(a) ? b : a);
const once = (lists) => [...new Set(lists.flat())];
const span = (r) => (r.offset === undefined ? 0 : r.offset.end - r.offset.start);

/**
 * @param {object[][]} reads the rules of each read (`result.rules` of a run), in the service's shape
 * @returns {object[]} the merged rules in the chapter's order, each with `agreement` and `readers`
 */
export function mergeReads(reads) {
  const items = reads.flatMap((rules, reader) => rules.map((rule) => ({ rule, reader })));
  // Union-find over the items: two are joined when they are the same rule and their passages overlap.
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (sameRule(items[i].rule, items[j].rule) && overlaps(items[i].rule, items[j].rule)) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map();
  items.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  return [...groups.values()]
    .map((group) => {
      const longest = group.reduce((a, b) => (span(b.rule) > span(a.rule) ? b : a)).rule;
      const readers = [...new Set(group.map((g) => g.reader))].sort((a, b) => a - b);
      return {
        ...longest,
        conditions: once(group.map((g) => g.rule.conditions ?? [])),
        exceptions: once(group.map((g) => g.rule.exceptions ?? [])),
        confidence: group.map((g) => g.rule.confidence).reduce(best, 'low'),
        agreement: readers.length,
        readers
      };
    })
    .sort((a, b) => (a.offset?.start ?? 0) - (b.offset?.start ?? 0));
}
