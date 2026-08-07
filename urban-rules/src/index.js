/**
 * Urban Rules — local planning limits, applied before geometry exists.
 *
 * The first consumer of the AI extension points (Sprint 28.3, ADR-0028), and it
 * exercises both:
 *
 * 1. a **Skill** — `urban-rules.maxBuildableArea`, a pure synchronous
 *    computation the platform can resolve by id like any built-in one;
 * 2. a **planning-stage provider** on the `programme` stage — it reads the Space
 *    Programme the platform synthesised and hands back a richer one, carrying
 *    the site's limits and a warning when the programme exceeds them.
 *
 * ## Why this is knowledge and not behaviour
 *
 * Nothing here draws, moves or deletes anything, and nothing here can. A stage
 * provider is handed an artefact and a read-only snapshot; it returns an
 * artefact. Whether that ever becomes a wall is three stages away and the user's
 * decision, through the one approval mechanism (ADR-0027.1 Rules 1 and 7).
 *
 * ## Plain ES module JavaScript, on purpose
 *
 * This file is read as text and evaluated from a `data:` URL when hot-reloaded
 * from a Development Repository — no bundler, no TypeScript, no `node_modules`.
 * So it cannot `import` a bare specifier, and the service token below is written
 * out by hand: tokens resolve by their `name`, so `{ name: 'ai' }` is exactly
 * what importing `AiExtensionServiceToken` would give.
 *
 * ## Staying a Skill rather than becoming a Provider
 *
 * ADR-0027 drew the synchronous boundary "before Urban Rules and Thermal
 * arrive", and this is that case. The rules below are a **table**, so the
 * computation is a pure function of its inputs and belongs in a Skill. The day
 * it needs a live cadastre lookup it stops being one — asynchrony implies I/O,
 * I/O implies a result that depends on more than the inputs, and that is a
 * Provider. The host refuses an async skill at registration rather than letting
 * that happen quietly.
 */

const AiExtensionServiceToken = { name: 'ai' };
const PreferencesServiceToken = { name: 'preferences' };

/**
 * The local plan, as a table. Replace these with your own jurisdiction's.
 *
 * Deliberately data rather than code: the whole argument for putting this in a
 * package is that zoning changes on a different cadence from the application,
 * and a table is what a non-programmer can be trusted to edit.
 */
const DEFAULTS = Object.freeze({
  plotAreaSquareMetres: 500,
  siteCoverageRatio: 0.4,
  maxStoreys: 2
});

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function readLimits(preferences) {
  const read = (key) => {
    try {
      const value = preferences?.get?.(`com.archisimple.urban-rules.${key}`);
      return isFiniteNumber(value) ? value : DEFAULTS[key];
    } catch {
      // A preference store that throws is not a reason to stop applying the
      // local plan; the defaults are a complete, valid table on their own.
      return DEFAULTS[key];
    }
  };
  return {
    plotAreaSquareMetres: read('plotAreaSquareMetres'),
    siteCoverageRatio: read('siteCoverageRatio'),
    maxStoreys: read('maxStoreys')
  };
}

/**
 * Maximum buildable floor area: footprint × storeys.
 *
 * Footprint is the plot area times the coverage ratio; the storeys multiplier is
 * capped at what the plan permits, so asking for five storeys where two are
 * allowed does not quietly grant five.
 */
function computeMaxBuildableArea(limits, requestedStoreys) {
  const storeys = Math.max(1, Math.min(Math.floor(requestedStoreys || 1), limits.maxStoreys));
  const footprint = limits.plotAreaSquareMetres * limits.siteCoverageRatio;
  return {
    footprintSquareMetres: round(footprint),
    storeys,
    maxFloorAreaSquareMetres: round(footprint * storeys)
  };
}

/** Two decimals: an area limit is a planning figure, not a measurement. */
const round = (value) => Number(value.toFixed(2));

/**
 * The Skill.
 *
 * Synchronous, side-effect free, and a function of its arguments alone — it
 * reads no preference and no global, because a skill whose answer depends on
 * what happens to be installed is not reproducible.
 */
const maxBuildableAreaSkill = {
  id: 'urban-rules.maxBuildableArea',
  summary: 'Compute the maximum buildable floor area permitted on a plot.',
  execute: (input) => {
    const plotArea = input?.plotAreaSquareMetres;
    if (!isFiniteNumber(plotArea) || plotArea <= 0) {
      return {
        ok: false,
        failure: {
          code: 'invalid_input',
          message: 'plotAreaSquareMetres must be a number greater than zero.',
          details: { input: 'plotAreaSquareMetres', value: plotArea }
        }
      };
    }
    const coverage = isFiniteNumber(input?.siteCoverageRatio)
      ? input.siteCoverageRatio
      : DEFAULTS.siteCoverageRatio;
    if (coverage <= 0 || coverage > 1) {
      return {
        ok: false,
        failure: {
          code: 'invalid_input',
          message: 'siteCoverageRatio must be greater than zero and at most one.',
          details: { input: 'siteCoverageRatio', value: coverage }
        }
      };
    }
    const maxStoreys = isFiniteNumber(input?.maxStoreys) ? input.maxStoreys : DEFAULTS.maxStoreys;
    return {
      ok: true,
      value: computeMaxBuildableArea(
        {
          plotAreaSquareMetres: plotArea,
          siteCoverageRatio: coverage,
          maxStoreys
        },
        input?.storeys ?? maxStoreys
      )
    };
  }
};

/**
 * The planning-stage provider.
 *
 * Returns a **new** programme every time it has something to say, and the input
 * unchanged when it does not. It never writes to `programme` — the host freezes
 * the artefact before handing it over, so an attempted write throws and the
 * provider is dropped for that call rather than corrupting an artefact a pending
 * proposal may already hold.
 */
function createProgrammeRules(preferences, logger) {
  return {
    id: 'urban-rules.programme',
    stage: 'programme',
    enrich: (programme) => {
      if (!programme || !Array.isArray(programme.spaces)) {
        return programme;
      }

      const limits = readLimits(preferences);
      const buildable = computeMaxBuildableArea(limits, programme.storeys);
      const requested = isFiniteNumber(programme.totalArea) ? programme.totalArea : 0;

      const assumptions = [
        `Local plan: plot ${limits.plotAreaSquareMetres} m², site coverage ${Math.round(limits.siteCoverageRatio * 100)}%, up to ${limits.maxStoreys} storey${limits.maxStoreys === 1 ? '' : 's'}.`,
        `Maximum buildable floor area is ${buildable.maxFloorAreaSquareMetres} m² over ${buildable.storeys} storey${buildable.storeys === 1 ? '' : 's'} (footprint ${buildable.footprintSquareMetres} m²).`
      ];

      const warnings = [];
      if (requested > buildable.maxFloorAreaSquareMetres) {
        warnings.push(
          `The programme totals ${requested} m², which exceeds the ${buildable.maxFloorAreaSquareMetres} m² the local plan permits. Reduce the programme or seek consent before laying it out.`
        );
      }
      if (programme.storeys > limits.maxStoreys) {
        warnings.push(
          `The programme assumes ${programme.storeys} storeys; the local plan permits ${limits.maxStoreys}.`
        );
      }

      logger?.info?.(
        `applied local plan: ${buildable.maxFloorAreaSquareMetres} m² permitted, ${requested} m² requested`
      );

      // A fresh object, and fresh arrays. Spreading the frozen input is safe;
      // pushing into `programme.warnings` would not be.
      return {
        ...programme,
        assumptions: [...(programme.assumptions ?? []), ...assumptions],
        warnings: [...(programme.warnings ?? []), ...warnings]
      };
    }
  };
}

export function activate(context) {
  const { services, subscriptions, logger } = context;

  const ai = services.get(AiExtensionServiceToken);
  const preferences = services.getOptional?.(PreferencesServiceToken);

  // Both registrations go into `subscriptions`, so disabling or uninstalling
  // this package removes exactly what it added (ADR-0021 Rule 5).
  subscriptions.add(ai.registerSkill(maxBuildableAreaSkill));
  subscriptions.add(ai.registerPlanningStage(createProgrammeRules(preferences, logger)));

  logger.info('urban rules active: skill + programme stage provider registered');
}

export function deactivate() {}

// Exported for the starter test. The application never reads these.
export const __testing = { computeMaxBuildableArea, maxBuildableAreaSkill, createProgrammeRules };
