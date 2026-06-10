# ============================================================
# Stage 1: 依赖安装 & 构建
# ============================================================
FROM node:18-slim AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY .npmrc package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# ============================================================
# Stage 2: 生产运行镜像
# ============================================================
FROM node:18-slim AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# 从构建阶段复制 standalone 输出
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# 复制启动脚本
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]