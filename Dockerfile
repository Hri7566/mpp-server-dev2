FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile

FROM base AS prerelease 
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ENV NODE_ENV=production
# uncomment to enable testing
#RUN bun test

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src src/
COPY --from=prerelease /usr/src/app/config config/
COPY --from=prerelease /usr/src/app/public public/
COPY --from=prerelease /usr/src/app/prisma prisma/
COPY --from=prerelease /usr/src/app/logs logs/
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=prerelease /usr/src/app/tsconfig.json .
COPY --from=prerelease /usr/src/app/.env .
COPY --from=prerelease /usr/src/app/scripts .
COPY --from=prerelease /usr/src/app/mppkey .
RUN bunx prisma generate
RUN apt-get update
RUN apt-get install -y openssl

USER root
ENTRYPOINT [ "bun", "run", "start" ]
