# OpenStore Copilot Instructions

## Project Overview

The OpenStore is the official app store for the Ubuntu Touch mobile OS. The repository consists of:

- `packages/openstore-api`: Express.js TypeScript backend API
- `packages/openstore-web`: Astro.js frontend with Preact components
- `packages/click-parser`: Node.js utility for parsing Ubuntu Touch click packages

## Architecture

### API (packages/openstore-api)

- **Framework**: Express.js with TypeScript
- **Database**: MongoDB for storage, Elasticsearch for search functionality
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

1. **Setup Environment**:
   ```bash
   # Add to /etc/hosts
   # 127.0.0.1   local.open-store.io

   # Start required services
   docker compose up -d

   # Start API in dev mode
   npm run dev -w openstore-api

   # Start frontend in dev mode
   npm run dev -w openstore-web
   ```

2. **Authentication**:
   - Copy `packages/openstore-api/.env.example` to `.env` and add GitHub/GitLab credentials

3. **Testing**:
   ```bash
   # API tests
   npm run test -w openstore-api

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
- Translation strings are extracted from source to `.pot` files
- Run `npm run pot-file` to update translation templates
- Run `npm run convert-po` to generate JSON files from .po files

### Device/Framework Compatibility

Apps in the OpenStore track compatibility with:
- `architecture`: Hardware platform (armhf, arm64, amd64, etc.)
- `channel`: Ubuntu Touch OS version (xenial, focal, etc.)
- `framework`: SDK version (ubuntu-sdk-16.04, ubuntu-sdk-20.04, etc.)

### Testing

- API test use node:test and supertest
- Use existing tests as examples for new tests

## Key Files

- `/packages/openstore-api/src/index.ts`: API entry point
- `/packages/openstore-api/src/api/index.ts`: API route registration
- `/packages/openstore-api/src/db/package/model.ts`: Package model definition
- `/packages/openstore-web/astro.config.mjs`: Astro configuration
- `/packages/openstore-web/src/pages/`: Frontend routes
- `/docker-compose.yml`: Development services (MongoDB, Elasticsearch, nginx)
