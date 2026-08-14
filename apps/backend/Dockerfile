FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend apps/backend

RUN pnpm --filter backend exec prisma generate
RUN pnpm --filter backend build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/backend/node_modules apps/backend/node_modules
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/apps/backend/generated apps/backend/generated
COPY --from=build /app/apps/backend/package.json apps/backend/package.json

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/src/main.js"]