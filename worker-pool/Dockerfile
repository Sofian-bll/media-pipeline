FROM oven/bun:1

RUN apt-get update && apt-get install -y --no-install-recommends openssh-client && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY src/ ./src/

ENV DB_PATH=/data/worker-pool.db
EXPOSE 3501

ENTRYPOINT ["bun", "run", "src/server.ts"]
