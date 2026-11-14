# Mesh AI API

A TypeScript, Node.js, and Express API scaffold for the Mesh AI project. The
project uses ESLint and Prettier to support consistent code quality.

## What’s included

- An Express server with feature-specific route files for authentication, chats,
  documents, and queries, mounted through a centralized router.
- Controllers for chats, documents, messages, and query handling.
- Middleware for JSON request parsing and request logging.
- Error handling for unknown routes and server errors.
- A reusable cosine similarity helper in `src/utils/vector-search.ts` for
  embedding-based ranking.
- A dedicated message controller in `src/controllers/messages.ts` for fetching and
  creating chat messages.
- A Postman collection with requests and response checks for the API endpoints,
  saved at `postman/mesh-ai.postman_collection.json`.

## Development

- `npm run dev` starts the development server.
- `npm run build` compiles the TypeScript project.
- `npm run lint` checks the source code with ESLint.
- `npm test` builds the project and runs the API integration tests.