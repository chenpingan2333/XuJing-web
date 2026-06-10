FROM node:18 AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

# 显式安装 @tailwindcss/oxide 的 Linux x64 原生二进制
RUN npm install @tailwindcss/oxide-linux-x64-gnu

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

FROM node:18-slim AS runner

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]