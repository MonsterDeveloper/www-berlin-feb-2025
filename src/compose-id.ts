import { customAlphabet } from "nanoid"
export const nanoid = customAlphabet(
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
)

export const ID_PREFIXES = {
  task: "ta",
  ideaFolder: "if",
  idea: "id",
  inferenceMessage: "im",
} as const

/**
 * Composes an unique ID by combining a prefix with a randomly generated string.
 *
 * @param prefix - The prefix to use for the ID.
 * @returns The composed ID.
 */
export function composeId(prefix: keyof typeof ID_PREFIXES) {
  return `${ID_PREFIXES[prefix]}_${nanoid(16)}`
}
