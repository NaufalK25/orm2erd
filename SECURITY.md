# Security Policy

## Supported Versions

`orm2erd` is in early development. Only the latest version published on npm receives security
fixes — please upgrade before reporting an issue to confirm it still reproduces.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately using one of these channels:

- [GitHub Security Advisories](https://github.com/NaufalK25/orm2erd/security/advisories/new) for
  this repository (preferred), or
- Email naufalkateni2001@gmail.com with a description of the issue, steps to reproduce, and the
  affected version.

You should expect an initial response within a few days. Once a fix is confirmed, we'll coordinate
on disclosure timing and credit before a patched release goes out.

## Scope and known risk surface

`orm2erd` reads ORM models/schema from a local project and generates diagram code from them. Its
parsing strategy differs by ORM (see [docs/adapters.md](./docs/adapters.md) for the current list
and details per ORM), and falls into two categories:

- **Static, DSL-based schemas** (e.g. Prisma's `schema.prisma`) are parsed via the ORM's own
  official parser — the schema file is data, never executed as code.
- **Code-defined models** (most other ORMs) are handled via **runtime introspection**: `orm2erd`
  actually imports the project's compiled/`tsx`-executed model files and reads the ORM's own
  computed metadata. This means **any code in those model files, and any of their transitive
  imports, runs with the same privileges as the `orm2erd` process itself.**

This is inherent to how those ORMs expose schema metadata (there's no static, non-executing
alternative), so it isn't itself a bug — but it does mean:

- Only run `orm2erd` against codebases you trust, the same way you'd only `npm install` or
  `require()` code you trust.
- Do not run `orm2erd` against untrusted/third-party repositories without reviewing the model
  files first.
- No network calls or database connections are made by `orm2erd` itself during extraction — it
  only reads local files and in-process ORM metadata.

If you find a way for `orm2erd` to execute unintended code, escape its working directory, or leak
data beyond what's needed to build the ERD (outside of the inherent runtime-import behavior
described above), please report it via the channels above.
