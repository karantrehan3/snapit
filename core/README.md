# @snapit/core

What a capture is, who may touch it, and where its bytes live — with no opinion about how
it is called.

This package exists so there is **one** implementation of that, shared by two very different
deployments:

|                         | Caller                         | Transport                                                     |
| ----------------------- | ------------------------------ | ------------------------------------------------------------- |
| **Local (the default)** | the desktop app's main process | none — the functions are called directly                      |
| **On-prem**             | the desktop app, over HTTPS    | `@snapit/server` puts a router in front of the same functions |

Nothing here imports `node:http`, takes a request, or writes a response. If that ever
changes, the local mode has quietly become a second implementation.

```
src/
├── services/      the API: (deps, actor, input) → result. Authorisation lives HERE.
├── domain/        ids · rbac · the capture manifest · record types
├── storage/       StorageProvider + local · S3/MinIO/R2 · Azure and GCS (shaped)
├── store/         MetadataStore + SecretStore contracts, and a JSON implementation
├── integrations/  a neutral payload, and adapters that render it (Jira, Slack)
├── report/        rewriting a bundle's report.html to point at storage
├── client/        the HTTP client the app uses when a server is configured
├── errors.ts      ServiceError — how a service says no, in any transport
└── range.ts       byte ranges, so a recording seeks
```

**Authorisation is in `services/`, never in a transport.** A check living in middleware is a
check the in-process caller skips, and the in-process caller is the desktop app.

Zero runtime dependencies, node builtins only — which is what lets electron-vite bundle it
straight into the app's main process.

```bash
npm test --workspace @snapit/core
```
