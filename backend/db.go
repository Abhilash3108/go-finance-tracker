package main

import (
    "context"
    "database/sql"
    "embed"
    "encoding/json"
    "errors"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/golang-migrate/migrate/v4"
    "github.com/golang-migrate/migrate/v4/database/postgres"
    "github.com/golang-migrate/migrate/v4/source/iofs"
    _ "github.com/lib/pq"
)

// migrationsFS embeds all SQL migration files into the binary at compile time.
// No filesystem path resolution needed at runtime.
//
//go:embed migrations
var migrationsFS embed.FS

// initDB opens the Postgres connection and runs any pending migrations.
func initDB(dbURL string) {
    var err error
    db, err = sql.Open("postgres", dbURL)
    if err != nil {
        log.Fatal("Failed to open DB: ", err)
    }

    // Tune the connection pool for a low-memory environment (512 MB RAM).
    // Supabase Session pooler allows 15 connections per client by default;
    // keeping well below that avoids pool exhaustion and caps memory usage.
    db.SetMaxOpenConns(5)              // at most 5 concurrent DB connections
    db.SetMaxIdleConns(2)              // keep 2 warm; release the rest
    db.SetConnMaxLifetime(5 * time.Minute)  // recycle connections every 5 min
    db.SetConnMaxIdleTime(2 * time.Minute)  // close idle connections after 2 min

    if err = db.Ping(); err != nil {
        log.Fatal("Database unreachable: ", err)
    }

    driver, err := postgres.WithInstance(db, &postgres.Config{})
    if err != nil {
        log.Fatal("Failed to create migration driver: ", err)
    }

    // iofs reads directly from the embedded FS — "migrations" is the directory
    // name inside the embed, matching the //go:embed directive above.
    src, err := iofs.New(migrationsFS, "migrations")
    if err != nil {
        log.Fatal("Failed to create migration source: ", err)
    }

    m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
    if err != nil {
        log.Fatal("Failed to initialise migrations: ", err)
    }
    if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
        log.Fatal("Migration failed: ", err)
    }
    log.Println("✅ Database migrated and connected")
}

// mustEnv reads an environment variable and calls log.Fatalf if it is unset.
func mustEnv(key string) string {
    v := os.Getenv(key)
    if v == "" {
        log.Fatalf("required environment variable %q is not set", key)
    }
    return v
}

// contextWithUserID stores a userID in the request context.
func contextWithUserID(ctx context.Context, userID int) context.Context {
    return context.WithValue(ctx, contextUserID, userID)
}

// userIDFromContext retrieves the userID stored by authMiddleware.
func userIDFromContext(r *http.Request) int {
    if id, ok := r.Context().Value(contextUserID).(int); ok {
        return id
    }
    return 0
}

// jsonResponse writes a JSON-encoded response with the given status code.
func jsonResponse(w http.ResponseWriter, data interface{}, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(data)
}