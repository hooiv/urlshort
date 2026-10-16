# OpenAPI spec

`GET /api/openapi.json` returns an OpenAPI 3.1 document for the core REST API (links, tags, bulk edit, analytics) including accepted API-key scopes per operation (`x-required-scopes-any-of`). Operations are declared in `src/lib/openapi.ts`; `openapi.test.ts` fails if a documented path has no route file or the route does not export that HTTP method.
