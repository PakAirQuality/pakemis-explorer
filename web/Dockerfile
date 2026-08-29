# The static export (next.config.ts: output "export") served by nginx. The page talks to the
# API at NEXT_PUBLIC_API_BASE from the browser (CORS is open on the API); in production the
# same files sit on Firebase Hosting, whose rewrite forwards /api/v1/emissions/** to Cloud Run.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1/emissions
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
# one-release fallback: the old origin-only variable still resolves (lib/api.ts appends the prefix)
ARG NEXT_PUBLIC_PAKEMIS_API=
ENV NEXT_PUBLIC_PAKEMIS_API=$NEXT_PUBLIC_PAKEMIS_API
RUN npm run build && rm -rf out/tiles

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 3000
