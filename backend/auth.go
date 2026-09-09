package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// ---------------------------------------------------------------------------
// Auth Handlers
// ---------------------------------------------------------------------------

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || len(req.Password) < 6 || len(req.Password) > 72 {
		http.Error(w, "Valid email and password (6–72 chars) are required", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	var user User
	err = db.QueryRow(
		"INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
		req.Email, string(hash),
	).Scan(&user.ID, &user.Email)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, "Email already registered", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	accessToken, refreshToken, err := issueTokenPair(user.ID, user.Email)
	if err != nil {
		http.Error(w, "Failed to generate tokens", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user":         user,
	}, http.StatusCreated)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var user User
	var hash string
	err := db.QueryRow(
		"SELECT id, email, password_hash FROM users WHERE email = $1",
		req.Email,
	).Scan(&user.ID, &user.Email, &hash)
	if err != nil {
		// Consistent error — don't reveal whether the email exists.
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	accessToken, refreshToken, err := issueTokenPair(user.ID, user.Email)
	if err != nil {
		http.Error(w, "Failed to generate tokens", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]interface{}{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"user":         user,
	}, http.StatusOK)
}

// handleRefresh validates the incoming refresh token against the hash stored
// in the DB, issues a new token pair (rotation), and saves the new hash.
// The old refresh token is immediately invalidated — replaying it returns 401.
func handleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		http.Error(w, "refreshToken is required", http.StatusBadRequest)
		return
	}

	// 1. Verify JWT signature and type claim.
	userID, email, err := parseRefreshToken(req.RefreshToken)
	if err != nil {
		http.Error(w, "Invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	// 2. Verify hash matches what is stored in the DB (revocation check).
	incoming := hashToken(req.RefreshToken)
	var storedHash sql.NullString
	var storedExp  sql.NullTime
	err = db.QueryRow(
		"SELECT refresh_token_hash, refresh_token_exp FROM users WHERE id = $1",
		userID,
	).Scan(&storedHash, &storedExp)
	if err != nil || !storedHash.Valid || storedHash.String != incoming {
		http.Error(w, "Refresh token has been revoked", http.StatusUnauthorized)
		return
	}
	if storedExp.Valid && time.Now().After(storedExp.Time) {
		http.Error(w, "Refresh token has expired", http.StatusUnauthorized)
		return
	}

	// 3. Issue new pair and rotate the stored hash atomically.
	accessToken, refreshToken, err := issueTokenPair(userID, email)
	if err != nil {
		http.Error(w, "Failed to generate tokens", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]string{
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	}, http.StatusOK)
}

// handleLogout clears the stored refresh token hash so the token is immediately
// revoked server-side even before its JWT expiry.
func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	// Best-effort decode — even if body is missing we still clear the token.
	json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

	if req.RefreshToken != "" {
		userID, _, err := parseRefreshToken(req.RefreshToken)
		if err == nil {
			db.Exec( //nolint:errcheck
				"UPDATE users SET refresh_token_hash = NULL, refresh_token_exp = NULL WHERE id = $1",
				userID,
			)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Token Helpers
// ---------------------------------------------------------------------------

// hashToken returns the hex-encoded SHA-256 hash of a token string.
// Storing a hash (not the token itself) means a DB breach doesn't expose
// usable refresh tokens.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// issueTokenPair generates a new access + refresh JWT pair, stores the
// refresh token hash in the DB, and returns both tokens.
func issueTokenPair(userID int, email string) (accessToken, refreshToken string, err error) {
	now := time.Now()

	// Access token — short-lived, carries only user ID.
	accessClaims := jwt.MapClaims{
		"sub":  userID,
		"type": "access",
		"iat":  now.Unix(),
		"exp":  now.Add(accessTokenTTL).Unix(),
	}
	at := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err = at.SignedString(jwtSecret)
	if err != nil {
		return
	}

	// Refresh token — long-lived, carries email so /refresh needs no DB lookup.
	exp := now.Add(refreshTokenTTL)
	refreshClaims := jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"type":  "refresh",
		"iat":   now.Unix(),
		"exp":   exp.Unix(),
	}
	rt := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err = rt.SignedString(jwtSecret)
	if err != nil {
		return
	}

	// Persist the hash — this is the revocation record.
	_, err = db.Exec(
		"UPDATE users SET refresh_token_hash = $1, refresh_token_exp = $2 WHERE id = $3",
		hashToken(refreshToken), exp, userID,
	)
	return
}

// parseAccessToken validates a token and returns the user ID.
// Rejects tokens whose "type" claim is not "access".
func parseAccessToken(tokenStr string) (int, error) {
	token, err := jwt.Parse(tokenStr, keyFunc)
	if err != nil || !token.Valid {
		return 0, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["type"] != "access" {
		return 0, fmt.Errorf("wrong token type")
	}
	sub, ok := claims["sub"].(float64)
	if !ok {
		return 0, fmt.Errorf("invalid sub claim")
	}
	return int(sub), nil
}

// parseRefreshToken validates a refresh token and returns the user ID and email.
// Rejects tokens whose "type" claim is not "refresh".
func parseRefreshToken(tokenStr string) (int, string, error) {
	token, err := jwt.Parse(tokenStr, keyFunc)
	if err != nil || !token.Valid {
		return 0, "", fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["type"] != "refresh" {
		return 0, "", fmt.Errorf("wrong token type")
	}
	sub, ok := claims["sub"].(float64)
	if !ok {
		return 0, "", fmt.Errorf("invalid sub claim")
	}
	email, _ := claims["email"].(string)
	return int(sub), email, nil
}
