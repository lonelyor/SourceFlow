FROM --platform=$BUILDPLATFORM node:21 AS node-build

ARG NPM_REGISTRY=

WORKDIR /app
ADD app/package.json app/pnpm* app/.npmrc .

RUN <<EORUN
set -e
corepack enable
corepack install --global $(node -e 'console.log(require("./package.json").packageManager)')
npm config set registry ${NPM_REGISTRY}
pnpm install --silent
EORUN

ADD app/ .
RUN <<EORUN
set -e
pnpm run build
mkdir /artifacts
mv appearance stage guide changelogs /artifacts/
EORUN

FROM golang:1.25-alpine AS go-build

RUN <<EORUN
set -e
apk add --no-cache gcc musl-dev
go env -w GO111MODULE=on
go env -w CGO_ENABLED=1
EORUN

WORKDIR /kernel
ADD kernel/go.* .
ADD third_party/go/ /third_party/go/
RUN --mount=type=cache,target=/root/.cache/go-build --mount=type=cache,target=/go/pkg \
    go mod download

ADD kernel/ .
RUN --mount=type=cache,target=/root/.cache/go-build --mount=type=cache,target=/go/pkg \
    go build -tags fts5 -v -ldflags "-s -w"

FROM alpine:latest
LABEL maintainer="By lonelyor"

RUN apk add --no-cache ca-certificates tzdata su-exec

ENV TZ=Asia/Shanghai
ENV HOME=/home/sourceflow
ENV RUN_IN_CONTAINER=true
EXPOSE 6806

WORKDIR /opt/sourceflow/
COPY --from=go-build --chmod=755 /kernel/kernel /opt/sourceflow/kernel
COPY --from=go-build --chmod=755 /kernel/entrypoint.sh /opt/sourceflow/entrypoint.sh
RUN sed -i 's/\r$//' /opt/sourceflow/entrypoint.sh
COPY --from=node-build /artifacts .

ENTRYPOINT ["/opt/sourceflow/entrypoint.sh"]
CMD ["/opt/sourceflow/kernel"]
