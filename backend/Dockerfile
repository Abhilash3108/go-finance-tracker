# -----------------------------
# Build Stage
# -----------------------------
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy everything first so go mod tidy sees all imports
COPY . .

# Resolve and download modules (runs after source copy so new imports are found)
RUN go mod tidy && go mod download

# Compile statically — migrations are embedded via //go:embed
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/finance-api

# -----------------------------
# Final Stage
# -----------------------------
FROM alpine:3.19

WORKDIR /root/

# Only the binary is needed — migrations are embedded inside it
COPY --from=builder /app/finance-api .

EXPOSE 8080

CMD ["./finance-api"]

