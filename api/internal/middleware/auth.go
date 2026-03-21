package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/gin-gonic/gin"
)

type supabaseUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func RequireAuth(cfg *config.Config) gin.HandlerFunc {
	client := &http.Client{Timeout: 10 * time.Second}

	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		if strings.TrimSpace(cfg.SupabaseURL) == "" || strings.TrimSpace(cfg.SupabaseKey) == "" {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Supabase auth is not configured on the server"})
			return
		}

		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing bearer token"})
			return
		}

		token := strings.TrimSpace(authHeader[7:])
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Missing bearer token"})
			return
		}

		req, err := http.NewRequest(http.MethodGet, strings.TrimRight(cfg.SupabaseURL, "/")+"/auth/v1/user", nil)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Could not prepare auth request"})
			return
		}

		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("apikey", cfg.SupabaseKey)
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Could not verify your session"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Your session is invalid or expired"})
			return
		}

		var user supabaseUser
		if err := json.NewDecoder(resp.Body).Decode(&user); err != nil || strings.TrimSpace(user.ID) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Could not read user session"})
			return
		}

		c.Set("user_id", user.ID)
		c.Set("user_email", user.Email)
		c.Next()
	}
}
