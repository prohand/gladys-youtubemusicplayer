// -----------------------------------------------------------------------------
// The log level, switchable from the Configuration screen.
//
// The SDK logger re-reads `process.env.LOG_LEVEL` on every line, so writing
// that variable is enough: it takes effect at once, for every logger already
// created, the SDK's own connection logs included. No restart needed.
//
// An operator who already set `LOG_LEVEL` on the container keeps it: their
// value is the baseline, read once at startup, and comes back when the switch
// goes off.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'logging' });

/** `LOG_LEVEL` as the container was started with (`undefined`: info). */
const BASELINE = process.env.LOG_LEVEL;

/**
 * Apply the log level a configuration asks for.
 * @param {{ detailed_logs?: boolean }} config normalized configuration
 * @returns {string} the level in force afterwards
 */
export function applyLogLevel(config) {
  const wanted = config?.detailed_logs ? 'debug' : BASELINE;
  const current = process.env.LOG_LEVEL;

  if (wanted === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = wanted;
  }

  // Said at info, so the line survives in both directions.
  if (current !== process.env.LOG_LEVEL) {
    logger.info(
      config?.detailed_logs
        ? 'Detailed logs turned on'
        : `Detailed logs turned off (level: ${process.env.LOG_LEVEL ?? 'info'})`,
    );
  }
  return process.env.LOG_LEVEL ?? 'info';
}
