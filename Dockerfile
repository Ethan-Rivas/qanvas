# Qanvas as a small static web server, for running it as a quantum-lab service.
#   docker build -t qanvas .
#   docker run --rm -p 127.0.0.1:8080:8080 qanvas
# The site is the same static files on every platform, so it's built once natively; npm and the bundler crash under QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /qanvas
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/bridge.sh /docker-entrypoint.d/40-qanvas-bridge.sh
USER root
# Group 0 and group write, like the rest of this image, so it also runs under an arbitrary user ID.
RUN mkdir /etc/nginx/qanvas && chown nginx:0 /etc/nginx/qanvas && chmod g+w /etc/nginx/qanvas
USER nginx
COPY --from=build /qanvas/dist /usr/share/nginx/html
EXPOSE 8080
