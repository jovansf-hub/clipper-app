FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      curl \
      ca-certificates \
      xz-utils \
      unzip && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile 2>/dev/null || bun install --production

COPY src/ ./src/

EXPOSE 8080

CMD ["bun", "run", "src/server.ts"]
