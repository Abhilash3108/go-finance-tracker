package main

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------------------------------------------------------------------------
// Rate Limiter — brute-force protection for auth endpoints
// ---------------------------------------------------------------------------

const (
	rateLimitWindow   = 5 * time.Minute // sliding window
	rateLimitMaxTries = 10              // max attempts per IP per window
)

type ipEntry struct {
	count     int
	windowEnd time.Time
}

var (
	rateMu  sync.Mutex
	rateMap = make(map[string]*ipEntry)
)

// startRateCleanup runs a background goroutine that removes stale IP entries
// every 10 minutes so the map doesn't grow unbounded on a free-tier server.
func startRateCleanup() {
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			rateMu.Lock()
			for ip, e := range rateMap {
				if now.After(e.windowEnd) {
					delete(rateMap, ip)
				}
			}
			rateMu.Unlock()
		}
	}()
}

// rateLimitMiddleware rejects requests from an IP that has exceeded
// rateLimitMaxTries failed-or-attempted auth calls within rateLimitWindow.
// It wraps the handler and counts every request (not just failures) so that
// automated credential-stuffing is throttled even before bcrypt runs.
func rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract the real client IP — honour X-Forwarded-For set by Caddy.
		ip := r.Header.Get("X-Forwarded-For")
		if ip == "" {
			ip, _, _ = net.SplitHostPort(r.RemoteAddr)
		} else {
			// X-Forwarded-For may be "client, proxy1, proxy2" — take leftmost.
			ip = strings.TrimSpace(strings.SplitN(ip, ",", 2)[0])
		}

		now := time.Now()
		rateMu.Lock()
		e, ok := rateMap[ip]
		if !ok || now.After(e.windowEnd) {
			// New window.
			rateMap[ip] = &ipEntry{count: 1, windowEnd: now.Add(rateLimitWindow)}
			rateMu.Unlock()
			next.ServeHTTP(w, r)
			return
		}
		e.count++
		over := e.count > rateLimitMaxTries
		rateMu.Unlock()

		if over {
			http.Error(w, "Too many requests — try again later", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

// corsMiddleware stamps CORS headers on every response and handles OPTIONS
// preflight requests. The allowed origin is read from the ALLOWED_ORIGIN env
// var so it is correct in both development and production without a rebuild.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == allowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Vary", "Origin")

		// Preflight — no further processing needed.
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// authMiddleware validates the Bearer token on every protected request and
// injects the numeric user ID into the request context.
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Missing or invalid Authorization header", http.StatusUnauthorized)
			return
		}
		userID, err := parseAccessToken(strings.TrimPrefix(authHeader, "Bearer "))
		if err != nil {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(contextWithUserID(r.Context(), userID)))
	})
}

// keyFunc is the jwt.Keyfunc used by all token parse calls.
func keyFunc(t *jwt.Token) (interface{}, error) {
	if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
		return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
	}
	return jwtSecret, nil
}
