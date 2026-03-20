FROM golang:1.22-bookworm AS go-builder

WORKDIR /app/api

COPY api/go.mod ./
RUN go mod download

COPY api ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
COPY --from=go-builder /app/server /app/api/server

WORKDIR /app/api

EXPOSE 8080

CMD ["./server"]
