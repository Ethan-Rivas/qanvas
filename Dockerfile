# Qanvas as a small static web server, for running it as a quantum-lab service.
#   docker build -t qanvas .
#   docker run --rm -p 127.0.0.1:8080:8080 qanvas
FROM node:22-alpine AS build
WORKDIR /qanvas
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /qanvas/dist /usr/share/nginx/html
EXPOSE 8080
