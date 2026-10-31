import { catalogue } from "./catalogue";

/** Lowercases a name, except one, such as the Rover or a Workshop, that the glossary always capitalises. */
export function inSentence(label: string): string {
  return label === catalogue.rover.label ||
    label === "Workshop" ||
    label === "Greenhouse" ||
    label === "Buried Habitat"
    ? label
    : label.toLowerCase();
}
