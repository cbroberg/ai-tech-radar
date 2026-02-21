FROM oven/bun:1-slim

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY src/ ./src/
COPY public/ ./public/

EXPOSE 3000

CMD ["bun", "run", "src/index.js"]
