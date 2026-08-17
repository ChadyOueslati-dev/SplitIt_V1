# Multi-stage build: install once, ship a slim runtime image.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user.
RUN addgroup -S splitit && adduser -S splitit -G splitit

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=splitit:splitit . .

USER splitit
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
