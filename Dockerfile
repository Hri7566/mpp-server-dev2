FROM oven/bun:latest AS base
WORKDIR /usr/src/app

COPY src src
COPY public public
COPY config config
COPY *.json ./
COPY mppkey ./mppkey

RUN bun install
RUN bunx prisma generate

# Mount ./prisma to /usr/src/app/prisma

EXPOSE 8443/tcp
ENTRYPOINT [ "bun", "." ]
