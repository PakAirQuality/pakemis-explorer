FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_PAKEMIS_API=http://localhost:8000
ENV NEXT_PUBLIC_PAKEMIS_API=$NEXT_PUBLIC_PAKEMIS_API
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
