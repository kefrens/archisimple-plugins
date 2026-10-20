/**
 * The service's outcome codes (Sprint 002.5a DEC-11). Every failure is one of
 * these, by name: "no chapter found" is never "no rules". 002.6a maps each
 * code to a phrase; 002.5b added its four (DEC-10).
 */

export const ERROR_STATUS = Object.freeze({
  invalid_request: 400,
  not_found: 404,
  version_changed: 409,
  rate_limited: 429,
  source_unavailable: 502,
  source_refused: 502,
  document_too_large: 422,
  not_a_pdf: 422,
  document_unreadable: 422,
  no_text_layer: 422,
  zone_chapter_not_found: 422,
  chapter_too_large: 422,
  // Sprint 002.5b DEC-10.
  not_cached: 404,
  busy: 503,
  extraction_unavailable: 503,
  extraction_failed: 502,
  // An unexpected exception: its message is never answered or logged.
  internal_error: 500
});

export class ServiceError extends Error {
  /**
   * @param {keyof typeof ERROR_STATUS} code
   * @param {Record<string, unknown>} [details] public facts only — identifiers,
   *   counts, codes; never a document's text and never a user's name, since a
   *   detail is both answered and logged.
   */
  constructor(code, details = {}) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
    this.details = details;
  }
}
