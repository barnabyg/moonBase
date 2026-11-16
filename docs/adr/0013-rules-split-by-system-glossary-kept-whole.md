# The rules are split by system; the glossary stays whole

Every change to what the game does or says updates `docs/rules.md` and, for a new term, `GLOSSARY.md` (AGENTS.md). By November 2026 the rules ran to 386 lines and 105 KB, many of them paragraphs over 1,000 characters, so an agent read thousands of words, or guessed with searches, to change one passage (#345).

- **The rules are split by system**, into `docs/rules/`: one file for each of what were its sections (Power, Radiation, Plants, Research and the Tech Tree, and the rest), with `docs/rules/README.md` holding the conventions that hold throughout and an index. A change touches one system, so it reads that file alone; the largest, Plants, is about 100 lines. Links between systems go from file to file.
- **The glossary stays one file.** It is about 400 lines but 25 KB, one short entry for each settled term with the words to avoid, and is looked up by term rather than read through (`docs/agents/domain.md`). The domain-docs convention this repository follows expects a single `GLOSSARY.md` at the root, and a term's entry names others, which one file keeps a search away.
- **`docs/balancing.md` stays one file**, but keeps only today's numbers and the reasons for them; dated change notes and superseded figures move to `docs/balancing-history.md` when their numbers are replaced (`docs/adding-content.md`, "Changing a number").

## Considered options

- **Keep the rules whole and rely on search.** That is what AGENTS.md conceded ("The file is long"), and a search finds the line but not the passage around it that a change has to stay consistent with.
- **Split the glossary by area too.** Its entries are short, so a file per area would save little reading and scatter terms that are defined against each other.
