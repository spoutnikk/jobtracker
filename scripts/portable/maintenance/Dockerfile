FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
# Explicit source copies: no env, uploads, backups or repository metadata.
COPY apps/backend/src apps/backend/src
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/scripts apps/backend/scripts
COPY apps/backend/prisma.config.ts apps/backend/prisma.config.ts
COPY apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/nest-cli.json apps/backend/
COPY packages/shared/src packages/shared/src
RUN pnpm --filter backend exec prisma generate \
    && pnpm --filter backend build

FROM node:24-bookworm-slim AS runtime
# Official PGDG Bookworm repository, scoped signing key; client major is explicit.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && mkdir -p /usr/share/postgresql-common/pgdg \
    && curl --fail --silent --show-error --location \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       --output /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 tar \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PATH="/usr/lib/postgresql/17/bin:$PATH"
WORKDIR /app
COPY --from=build /app/apps/backend/dist/src/portable/backup-cli.js ./backup-cli.js
COPY --from=build /app/apps/backend/dist/src/portable/backup-producer.js ./backup-producer.js
COPY --from=build /app/apps/backend/dist/src/portable/backup-format.js ./backup-format.js
ENTRYPOINT ["node", "/app/backup-cli.js"]
