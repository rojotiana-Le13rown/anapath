# ---------- Builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Les variables NEXT_PUBLIC_* sont figées au build. Passe-les en build args si besoin :
#   docker build --build-arg NEXT_PUBLIC_AUTH_LOGIN_URL=... .
ARG NEXT_PUBLIC_AUTH_LOGIN_URL
ENV NEXT_PUBLIC_AUTH_LOGIN_URL=$NEXT_PUBLIC_AUTH_LOGIN_URL

RUN npm run build

# ---------- Runtime ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# `next start --port 3031` (défini dans le script start)
EXPOSE 3031
CMD ["npm", "run", "start"]
