# -----------------------------
# Build Stage
# -----------------------------
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy the go.mod file and fetch dependencies
COPY go.mod ./
RUN go mod download

# Copy the rest of the application code
COPY . .

# Compile the Go application statically
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/finance-api

# -----------------------------
# Final Stage
# -----------------------------
# Using a tiny Alpine image for production
FROM alpine:latest

WORKDIR /root/

# Copy the compiled binary from the builder stage
COPY --from=builder /app/finance-api .

# Expose the application port
EXPOSE 8080

# Run the Go API
CMD ["./finance-api"]