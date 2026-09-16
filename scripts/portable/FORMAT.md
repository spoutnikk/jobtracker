# JobTracker backup format v1 — Portable 5.1

The common implementation is `apps/backend/src/portable/backup-format.ts`.
It uses only Node built-ins, with no NestJS, Prisma, database or Docker access.
No new workspace or dependency is required. A future maintenance container can
compile/copy this standalone module without starting the backend.

## Layout

```text
jobtracker-backup-<UTC timestamp>-<id>/
  manifest.json
  database.dump
  uploads.tar
```

The directory's final name is informational; names ending in `.partial` are
rejected. A future producer must write the manifest only after successful payload
creation, then rename the partial directory. Missing manifests are never valid.

## Manifest

All properties below are required. Unknown properties at every object level are
rejected. No configuration, DATABASE_URL, PostgreSQL password, .env, source absolute
path, physical Docker volume name or hostname belongs in the manifest or backup.

```json
{
  "formatVersion": 1,
  "backupId": "888e5955-2f73-44ad-a90b-cea4304875d6",
  "createdAt": "2026-09-16T12:00:00.000Z",
  "postgresql": { "serverVersion": "17.6", "pgDumpVersion": "17.6" },
  "migrations": [
    {
      "name": "20260816014000_add_query_indexes",
      "checksum": "<64 lowercase hex characters>"
    }
  ],
  "database": {
    "name": "database.dump",
    "size": 1234,
    "sha256": "<64 lowercase hex characters>"
  },
  "uploads": {
    "name": "uploads.tar",
    "size": 1024,
    "sha256": "<64 lowercase hex characters>"
  },
  "counts": { "documents": 0, "files": 0 },
  "uploadsPathPrefix": "uploads/"
}
```

The hash placeholders are illustrative, not valid manifest values.

- `backupId`: lowercase UUID-shaped identifier, generated once per backup.
- `createdAt`: real UTC date, exactly the millisecond ISO format produced by
  `Date.toISOString()` (four-digit year).
- PostgreSQL versions: normalized numeric `major.minor` or `major.minor.patch`,
  without distribution suffixes. These are metadata, not a target compatibility check.
- `migrations`: nonempty list of successfully applied Prisma migrations, each
  with a unique timestamp-prefixed name and its actual SHA-256 checksum. The future
  producer must read applied history, not infer it from the source tree.
- Payload sizes: positive safe integers in bytes; SHA-256 in lowercase hex.
  An empty uploads collection still has a nonempty TAR container.
- Counts: nonnegative safe integers. Documents count database rows; files count
  regular archived files. No equality is assumed (unreferenced files can exist).
- Paths recorded for documents use `uploads/`; archive file paths are relative to
  that directory. Future validation must reject unsupported document paths.

## API and checks

`validateManifest(value: unknown)` validates metadata synchronously.
`await validateBackup(directory)` validates the manifest and both payloads and
returns the typed manifest. It never creates, modifies, extracts or deletes files.
It reads payloads incrementally to compute SHA-256, checks their sizes, rejects
non-regular files/symlinks at the supplied directory and file paths, and limits the
manifest to 1 MiB. Callers must supply a stable directory: this is not a filesystem
sandbox against concurrent hostile replacement or symlinked ancestor directories.

Failures throw `BackupValidationError` with a stable `code` and descriptive message:
`INCOMPLETE_BACKUP`, `INVALID_PATH`, `MISSING_FILE`, `IO_ERROR`, `INVALID_JSON`,
`UNSUPPORTED_VERSION`, `INVALID_MANIFEST`, `SIZE_MISMATCH`, `HASH_MISMATCH`.
No manifest values or configuration secrets are echoed in validation errors.

## Scope boundary

Success means **v1 metadata and payload integrity**, not **safe to restore**.
The dump and TAR are opaque bytes in 5.1. Their internal validity, actual counts,
DB/file correspondence, migration compatibility and PostgreSQL target compatibility
are not verified. Matching hashes do not establish authenticity or exclude secrets
embedded in arbitrary payloads. Only trusted backups should be used.

Before any restoration in 5.2/5.3, validate TAR structure and entries using a vetted
reader, reject absolute/escaping paths, symlinks, hard links and special files,
check resource limits, inspect the dump, and reconcile documents with files.
No extraction, pg_dump, pg_restore, service lifecycle, CLI launcher, Docker setup,
replacement policy or restore capability is implemented here.

## Targeted validation

From the repository root:

```sh
pnpm --filter backend test --runInBand --runTestsByPath src/portable/backup-format.spec.ts
pnpm --filter backend exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck src/portable/backup-format.ts src/portable/backup-format.spec.ts
```

Tests create and remove their own unique OS temporary directories only. They use
opaque payload fixtures; they neither need nor access JobTracker volumes.
