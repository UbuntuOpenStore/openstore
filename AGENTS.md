# OpenStore

## Project Overview

The OpenStore is the official app source for the Ubuntu Touch mobile OS. The repository consists of:

- `packages/openstore-api`: Express.js TypeScript backend API
- `packages/openstore-web`: Astro.js frontend with Preact components
- `packages/click-parser`: Node.js utility for parsing Ubuntu Touch click packages
- `packages/openstore-dpkg`: C library to run `dpkg --compare-versions` version comparisons

## Architecture

### API (packages/openstore-api)

- **Framework**: Express.js with TypeScript
- **Database**: MongoDB for storage, Meilisearch for search functionality
- **Auth**: Passport.js with GitHub, GitLab, and API key authentication
- **API Versions**: Supports multiple API versions (v3, v4) for backward compatibility
- **Core Models**:
  - `Package`: Apps with revisions, ratings, downloads tracking
  - `User`: Authentication and app ownership
  - `Review`: User feedback on apps
  - `RatingCount`: Aggregated ratings stats

### Web Frontend (packages/openstore-web)

- **Framework**: Astro with Preact components
- **UI**: TailwindCSS with shadcn/ui components
- **Localization**: i18next with gettext (.po files) for translations
- **Routes**: File-based routing with language prefixing

### Click Parser (packages/click-parser)

- Parser for Ubuntu Touch .click package format
- Extracts metadata, icons, and application info

## Development Workflow

```bash
# API tests - all
npm run test -w openstore-api
# API tests - one file
npm run test:file -w openstore-api

# Type checking
npm run type-check -w openstore-api
npm run check -w openstore-web

# Linting
npm run lint -w openstore-api
```

## Project-Specific Patterns

### API Response Format

```typescript
// Success format
{
  success: true,
  data: { /* response data */ }
}

// Error format
{
  success: false,
  message: "Error message",
  data: { /* optional additional details */ }
}
```

### Internationalization

- Use the `t()` function for translations in frontend components
- The value passed to the `t()` function is the string to be translated, not a key
- When translation strings are needed inside Preact components, pass them as props from the Astro page
- Translation strings are extracted from source to `.pot` files
- Run `npm run pot-file` to update translation templates
- Run `npm run convert-po` to generate JSON files from .po files

## Code style

### API
- relative imports (no path aliases)
- import groups sorted by oxfmt (node builtins, packages, then local)
- Handlers are standalone `async function name(req: Request, res: Response)` registered on an express `Router` and wrapped with `asyncErrorWrapper(fn, 'message')`
- respond via `success(res, ...)`/`error(res, MESSAGE, status)` from `../utils`, with message constants in `utils/error-messages.ts`
- API DB models live in `src/db/<name>/` split into `model.ts`, `types.ts`, `statics.ts`/`methods.ts`, `index.ts` (mongoose, typed `I<Name>`, `I<Name>Methods`, `<Name>Model`; `serialize()` methods shape API output).
- API tests are colocated `*.test.ts` using `node:test` + `node:assert/strict` + `supertest`; use `factory` from `src/tests/factory` and `waitForMongoose`/`cleanMongoose`/`closeMongoose` from `src/tests/utils`.

### Web
- Preact `.tsx` components (use `class`, not `className`) and `.astro` files
- Tailwind + shadcn-style primitives in `src/components/ui`
- `@/*` alias for `src/*`
- shared logic in `src/lib`.

### Comment styles
Comments should be terse, and we should prefer comments that answer the question of "why is this code here?" and not "what is this code doing?". Comments that explain what code is doing are generally not very helpful, and they likely indicate a larger problem related to code complexity.

## Functions and Methods
- Try to use less than 50 lines of code. Split longer functions up into smaller ones.
- Keep functions and methods concise and focused on a single responsibility.
- Avoid creating helper methods of 5 or less lines unless they are used in 3 or more places.
- Helper functions should serve more than one caller unless splitting up from a longer function.
