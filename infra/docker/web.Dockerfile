FROM node:22-alpine

WORKDIR /app/apps/web

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY apps/web/package.json apps/web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY apps/web ./
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
