const ENABLED = true
const TAG = 'MindVerse:'

export const logger = {
  info: (...args: unknown[]) => {
    if (ENABLED) console.info(TAG, ...args)
  },
  debug: (...args: unknown[]) => {
    if (ENABLED) console.debug(TAG, ...args)
  },
  error: (...args: unknown[]) => {
    if (ENABLED) console.error(TAG, ...args)
  },
}
