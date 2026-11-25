# syntax=docker/dockerfile:1

# ---- Stage 1: build the static site ----
FROM node:26-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* values at build time, so they are passed as build args.
# (.env.local is never copied: see .dockerignore.)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---- Stage 2: serve with nginx ----
FROM nginx:alpine AS runtime

# nginx:alpine renders /etc/nginx/templates/*.template with envsubst at startup,
# which lets the Content-Security-Policy name the Supabase project URL.
ARG VITE_SUPABASE_URL
ENV SUPABASE_URL=$VITE_SUPABASE_URL
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
