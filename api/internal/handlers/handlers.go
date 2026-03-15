package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os/exec"
	"sync"
	"time"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/Shubham-Master/europe-job-api/internal/models"
	"github.com/gin-gonic/gin"
)

// In-memory store (will be replaced by Supabase later)
var (
	jobStore      []models.Job
	jobMu         sync.RWMutex
	pipelineState = models.PipelineStatus{Status: "idle"}
)

type Handler struct {
	cfg *config.Config
}

func New(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
}

// ─── Health ──────────────────────────────────────────────────────────────────

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: gin.H{
			"status":  "ok",
			"version": "0.1.0",
			"time":    time.Now().Format(time.RFC3339),
		},
	})
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

// GetJobs returns all scraped jobs, optionally filtered
func (h *Handler) GetJobs(c *gin.Context) {
	country := c.Query("country")
	minScore := c.Query("min_score")

	jobMu.RLock()
	defer jobMu.RUnlock()

	filtered := []models.Job{}
	for _, job := range jobStore {
		if country != "" && job.Country != country {
			continue
		}
		if minScore != "" {
			var score float64
			if _, err := parseFloat(minScore, &score); err == nil && job.MatchScore < score {
				continue
			}
		}
		filtered = append(filtered, job)
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    filtered,
	})
}

// GetJob returns a single job by ID
func (h *Handler) GetJob(c *gin.Context) {
	id := c.Param("id")

	jobMu.RLock()
	defer jobMu.RUnlock()

	for _, job := range jobStore {
		if job.ID == id {
			c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: job})
			return
		}
	}

	c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "job not found"})
}

// MarkJobSeen marks a job as seen
func (h *Handler) MarkJobSeen(c *gin.Context) {
	id := c.Param("id")

	jobMu.Lock()
	defer jobMu.Unlock()

	for i, job := range jobStore {
		if job.ID == id {
			jobStore[i].Seen = true
			c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "marked as seen"})
			return
		}
	}

	c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "job not found"})
}

// ─── CV ───────────────────────────────────────────────────────────────────────

// ParseCV accepts a CV PDF upload and runs the Python cv_parser
func (h *Handler) ParseCV(c *gin.Context) {
	file, err := c.FormFile("cv")
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "no file uploaded"})
		return
	}

	// Save to temp location
	tmpPath := "/tmp/" + file.Filename
	if err := c.SaveUploadedFile(file, tmpPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "failed to save file"})
		return
	}

	// Run Python CV parser
	cmd := exec.Command(h.cfg.PythonPath,
		"../cv_parser/cv_parser.py",
		tmpPath,
		"../data/profile.json",
	)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "CV parsing failed: " + stderr.String(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "CV parsed successfully",
		Data:    gin.H{"output": out.String()},
	})
}

// GetProfile returns the current parsed CV profile
func (h *Handler) GetProfile(c *gin.Context) {
	data, err := readJSONFile("../data/profile.json")
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No profile found. Please upload your CV first.",
		})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: data})
}

// ─── Cover Letter ─────────────────────────────────────────────────────────────

// GenerateCoverLetter calls Python to generate a tailored cover letter
func (h *Handler) GenerateCoverLetter(c *gin.Context) {
	var req models.CoverLetterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	// Will call python ai_tools/cover_letter.py in next phase
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Cover letter generation coming soon!",
		Data:    req,
	})
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

// RunPipeline manually triggers the full scrape + match pipeline
func (h *Handler) RunPipeline(c *gin.Context) {
	if pipelineState.Status == "running" {
		c.JSON(http.StatusConflict, models.APIResponse{
			Success: false,
			Error:   "Pipeline is already running",
		})
		return
	}

	// Run async
	go runPipelineAsync(h.cfg)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Pipeline started",
	})
}

// GetPipelineStatus returns current pipeline run status
func (h *Handler) GetPipelineStatus(c *gin.Context) {
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    pipelineState,
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func runPipelineAsync(cfg *config.Config) {
	pipelineState = models.PipelineStatus{
		Status:  "running",
		LastRun: time.Now(),
		Message: "Scraping jobs...",
	}

	// TODO: call scraper, matcher, notifier Python scripts
	time.Sleep(2 * time.Second) // placeholder

	pipelineState = models.PipelineStatus{
		Status:  "done",
		LastRun: time.Now(),
		Message: "Pipeline complete (scrapers coming soon)",
	}
}

func readJSONFile(path string) (map[string]interface{}, error) {
	data, err := exec.Command("cat", path).Output()
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func parseFloat(s string, f *float64) (float64, error) {
	var val float64
	_, err := bytes.NewBufferString(s), error(nil)
	if err2 := json.Unmarshal([]byte(s), &val); err2 != nil {
		return 0, err2
	}
	*f = val
	return val, err
}
