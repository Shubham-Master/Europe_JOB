package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/Shubham-Master/europe-job-api/internal/store"
	"github.com/gin-gonic/gin"
)

func TestGetUserProfileFallsBackToActiveCVWhenProfilesTableMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/rest/v1/user_profiles":
			http.Error(w, `{"code":"PGRST205","message":"Could not find the table 'public.user_profiles' in the schema cache"}`, http.StatusNotFound)
		case "/rest/v1/cv_versions":
			if got := r.URL.Query().Get("user_id"); got != "eq.user-1" {
				t.Fatalf("expected user_id filter for active CV lookup, got %q", got)
			}
			io.WriteString(w, `[{"id":"cv-1","filename":"cv.pdf","profile_json":{"full_name":"Alice CV"},"full_name":"Alice CV","current_title":"Platform Engineer","parsed_at":"2026-03-21T10:00:00Z"}]`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	h := &Handler{
		cfg:   &config.Config{},
		store: store.NewSupabaseStore(server.URL, "test-key"),
	}

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "user-1")
		c.Next()
	})
	router.GET("/api/v1/profile", h.GetUserProfile)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/profile", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Success bool                   `json:"success"`
		Data    map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !resp.Success {
		t.Fatalf("expected success response: %s", rec.Body.String())
	}
	if got := resp.Data["full_name"]; got != "Alice CV" {
		t.Fatalf("expected fallback full_name from active CV, got %#v", got)
	}
}

func TestUpdateUserProfileRejectsEmptyCountries(t *testing.T) {
	gin.SetMode(gin.TestMode)

	h := &Handler{cfg: &config.Config{}}
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "user-1")
		c.Next()
	})
	router.PUT("/api/v1/profile", h.UpdateUserProfile)

	body := strings.NewReader(`{"full_name":"Alice","target_countries":[]}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/profile", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}

	if !strings.Contains(rec.Body.String(), "Select at least one Europe or UK country") {
		t.Fatalf("unexpected error response: %s", rec.Body.String())
	}
}

func TestCreateProfileFileForUserUsesUniqueTempFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/rest/v1/cv_versions":
			io.WriteString(w, `[{"id":"cv-1","filename":"cv.pdf","profile_json":{"full_name":"Alice CV","current_title":"Platform Engineer"},"full_name":"Alice CV","current_title":"Platform Engineer","parsed_at":"2026-03-21T10:00:00Z"}]`)
		case "/rest/v1/user_profiles":
			io.WriteString(w, `[{"user_id":"user-1","full_name":"Alice Target","whatsapp_number":"+353123","target_countries":["ie","pt","se"]}]`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	supabaseStore := store.NewSupabaseStore(server.URL, "test-key")

	pathA, err := createProfileFileForUser("user-1", supabaseStore)
	if err != nil {
		t.Fatalf("create first profile file: %v", err)
	}
	defer os.Remove(pathA)

	pathB, err := createProfileFileForUser("user-1", supabaseStore)
	if err != nil {
		t.Fatalf("create second profile file: %v", err)
	}
	defer os.Remove(pathB)

	if pathA == pathB {
		t.Fatalf("expected unique temp files, got same path %q", pathA)
	}

	for _, path := range []string{pathA, pathB} {
		if filepath.Ext(path) != ".json" {
			t.Fatalf("expected json temp file, got %q", path)
		}
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read temp file %q: %v", path, err)
		}

		var payload map[string]interface{}
		if err := json.Unmarshal(content, &payload); err != nil {
			t.Fatalf("decode temp file %q: %v", path, err)
		}

		if got := payload["preferred_name"]; got != "Alice Target" {
			t.Fatalf("expected merged preferred_name, got %#v", got)
		}
		if got := payload["whatsapp_number"]; got != "+353123" {
			t.Fatalf("expected merged whatsapp_number, got %#v", got)
		}
		targetCountries, ok := payload["target_countries"].([]interface{})
		if !ok || len(targetCountries) != 3 {
			t.Fatalf("expected merged target_countries, got %#v", payload["target_countries"])
		}
	}
}

func TestNormalizeTargetCountriesSupportsExpandedEurope(t *testing.T) {
	got := normalizeTargetCountries([]string{"ie", "PT", "xx", "de", "DE", "se", "  ", "lu"})
	want := []string{"ie", "pt", "de", "se", "lu"}

	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for idx := range want {
		if got[idx] != want[idx] {
			t.Fatalf("expected %v, got %v", want, got)
		}
	}
}

func TestResolvedCommandPathKeepsBinaryNameButResolvesRelativePaths(t *testing.T) {
	if got := resolvedCommandPath("python3"); got != "python3" {
		t.Fatalf("expected bare binary name to stay untouched, got %q", got)
	}

	got := resolvedCommandPath("../venv/bin/python")
	if !filepath.IsAbs(got) {
		t.Fatalf("expected relative path to become absolute, got %q", got)
	}
	if !strings.HasSuffix(got, filepath.Join("venv", "bin", "python")) {
		t.Fatalf("expected resolved path to end with venv/bin/python, got %q", got)
	}
}

func TestIsSupabaseConflictTargetError(t *testing.T) {
	if !isSupabaseConflictTargetError(errors.New(`supabase POST jobs failed: {"code":"42P10","message":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}`)) {
		t.Fatalf("expected 42P10 on-conflict error to be detected")
	}

	if isSupabaseConflictTargetError(errors.New("some other error")) {
		t.Fatalf("did not expect unrelated error to be detected as conflict-target error")
	}
}
