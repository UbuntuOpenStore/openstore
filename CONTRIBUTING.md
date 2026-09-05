# Contributing

## License

This project is licensed under **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later).

By submitting a contribution (patch, pull request, merge request, or any other form), you agree to license your contribution under AGPL-3.0-or-later.

Some files in `packages/openstore-api/src/` are dual-licensed under `GPL-3.0-or-later OR AGPL-3.0-or-later` because they contain pre-existing contributions from earlier authors. New contributions to those files follow the same dual-license terms.

Translation files (`*.po`, `*.pot`) remain under **GPL-3.0-or-later** to preserve compatibility with the existing translation contributors.

The vendored `packages/openstore-dpkg/dpkg/` directory contains upstream code under GPL-2 and is not part of this project's licensing.

## How to add a file

Add the appropriate SPDX header to the top of any new source file:

- AGPL-3.0-or-later (default): `// SPDX-License-Identifier: AGPL-3.0-or-later`
- Translation (.po/.pot): `# SPDX-License-Identifier: GPL-3.0-or-later`

For `.css` files use block comments: `/* SPDX-License-Identifier: AGPL-3.0-or-later */`
