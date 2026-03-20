package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"strconv"
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
	pipelineState = models.PipelineStatus{
		Status:      "idle",
		CurrentStep: "idle",
		Message:     "Pipeline has not run yet",
	}
)

const (
	profileJSONPath = "../data/profile.json"
	rawJobsJSONPath = "../data/jobs_raw.json"
	matchedJobsPath = "../data/jobs_matched.json"
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
	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

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
	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

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
	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

	id := c.Param("id")

	jobMu.Lock()
	defer jobMu.Unlock()

	for i, job := range jobStore {
		if job.ID == id {
			jobStore[i].Seen = true
			if err := writeJobsToDisk(matchedJobsPath, jobStore); err != nil {
				c.JSON(http.StatusInternalServerError, models.APIResponse{
					Success: false,
					Error:   "failed to persist seen state",
				})
				return
			}
			c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "marked as seen"})
			return
		}
	}

	c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "job not found"})
}

// ─── CV ───────────────────────────────────────────────────────────────────────

// ParseCV accepts a CV PDF upload and runs the Python cv_parser
func (h *Handler) ParseCV(c *gin.Context) {
	if h.cfg.GeminiKey == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "GEMINI_API_KEY is missing. Add it to your .env before parsing a CV.",
		})
		return
	}

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
		profileJSONPath,
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
	data, err := readJSONFile(profileJSONPath)
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

	if h.cfg.GeminiKey == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "GEMINI_API_KEY is missing. Add it to your .env before generating cover letters.",
		})
		return
	}

	if _, err := os.Stat(profileJSONPath); err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No parsed CV profile found. Upload your CV first.",
		})
		return
	}

	job := h.buildJobPayload(req)
	if job.Title == "" && job.Company == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "job details are incomplete; send at least a title or company",
		})
		return
	}

	jobPath, err := writeTempJSON(job)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to prepare job payload",
		})
		return
	}
	defer os.Remove(jobPath)

	outputFile, err := os.CreateTemp("", "cover-letter-result-*.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to prepare cover letter output",
		})
		return
	}
	outputPath := outputFile.Name()
	outputFile.Close()
	defer os.Remove(outputPath)

	cmd := exec.Command(
		h.cfg.PythonPath,
		"../ai_tools/cover_letter.py",
		"--single",
		jobPath,
		profileJSONPath,
		outputPath,
	)
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = out.String()
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "cover letter generation failed: " + errMsg,
		})
		return
	}

	data, err := readJSONFile(outputPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "cover letter was generated but could not be read back",
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Cover letter generated successfully",
		Data:    data,
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

	if _, err := os.Stat(profileJSONPath); err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No parsed CV profile found. Upload your CV first.",
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
	startedAt := time.Now()
	updatePipelineStatus(func(state *models.PipelineStatus) {
		state.Status = "running"
		state.CurrentStep = "scrape"
		state.LastRun = startedAt
		state.Message = "Scraping jobs..."
		state.JobsFound = 0
		state.JobsMatched = 0
		state.TopScore = 0
	})

	if _, err := os.Stat(profileJSONPath); err != nil {
		failPipeline(startedAt, "No parsed CV profile found. Upload your CV first.")
		return
	}

	if _, err := runPythonScript(cfg, "scraper/scraper.py", "data/profile.json", "data/jobs_raw.json"); err != nil {
		failPipeline(startedAt, "Scraper failed: "+err.Error())
		return
	}

	rawJobs, err := readJobsFile(rawJobsJSONPath)
	if err != nil {
		failPipeline(startedAt, "Could not read scraped jobs: "+err.Error())
		return
	}

	updatePipelineStatus(func(state *models.PipelineStatus) {
		state.Status = "running"
		state.CurrentStep = "match"
		state.LastRun = startedAt
		state.JobsFound = len(rawJobs)
		state.Message = "Matching jobs to your CV..."
	})

	if _, err := runPythonScript(cfg, "matcher/matcher.py", "data/profile.json", "data/jobs_raw.json", "data/jobs_matched.json", "0"); err != nil {
		failPipeline(startedAt, "Matcher failed: "+err.Error())
		return
	}

	matchedJobs, err := readJobsFile(matchedJobsPath)
	if err != nil {
		failPipeline(startedAt, "Could not read matched jobs: "+err.Error())
		return
	}

	jobMu.Lock()
	jobStore = matchedJobs
	jobMu.Unlock()

	topScore := 0.0
	if len(matchedJobs) > 0 {
		topScore = matchedJobs[0].MatchScore
	}

	updatePipelineStatus(func(state *models.PipelineStatus) {
		state.Status = "running"
		state.CurrentStep = "filter"
		state.LastRun = startedAt
		state.JobsFound = len(rawJobs)
		state.JobsMatched = len(matchedJobs)
		state.TopScore = topScore
		state.Message = "Preparing matched jobs..."
	})

	if cfg.TelegramToken != "" && cfg.TelegramChatID != "" {
		updatePipelineStatus(func(state *models.PipelineStatus) {
			state.Status = "running"
			state.CurrentStep = "notify"
			state.LastRun = startedAt
			state.JobsFound = len(rawJobs)
			state.JobsMatched = len(matchedJobs)
			state.TopScore = topScore
			state.Message = "Sending Telegram digest..."
		})

		if _, err := runPythonScript(cfg, "notifier/telegram.py", "digest", "data/jobs_matched.json", "data/profile.json"); err != nil {
			failPipeline(startedAt, "Jobs matched, but Telegram digest failed: "+err.Error())
			return
		}
	}

	finalMessage := "Pipeline complete"
	if cfg.TelegramToken == "" || cfg.TelegramChatID == "" {
		finalMessage = "Pipeline complete (Telegram skipped)"
	}

	updatePipelineStatus(func(state *models.PipelineStatus) {
		state.Status = "done"
		state.CurrentStep = "done"
		state.LastRun = startedAt
		state.JobsFound = len(rawJobs)
		state.JobsMatched = len(matchedJobs)
		state.TopScore = topScore
		state.Message = finalMessage
	})
}

func readJSONFile(path string) (map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func readJobsFile(path string) ([]models.Job, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.Job{}, nil
		}
		return nil, err
	}

	var jobs []models.Job
	if len(data) == 0 {
		return []models.Job{}, nil
	}
	if err := json.Unmarshal(data, &jobs); err != nil {
		return nil, err
	}
	return jobs, nil
}

func parseFloat(s string, f *float64) (float64, error) {
	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	*f = val
	return val, err
}

func loadJobsFromDisk(path string) error {
	jobs, err := readJobsFile(path)
	if err != nil {
		return err
	}

	jobMu.Lock()
	jobStore = jobs
	jobMu.Unlock()
	return nil
}

func writeJobsToDisk(path string, jobs []models.Job) error {
	if err := os.MkdirAll("../data", 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(jobs, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o644)
}

func updatePipelineStatus(mutator func(*models.PipelineStatus)) {
	mutator(&pipelineState)
}

func failPipeline(lastRun time.Time, message string) {
	updatePipelineStatus(func(state *models.PipelineStatus) {
		state.Status = "error"
		state.LastRun = lastRun
		state.Message = message
	})
}

func runPythonScript(cfg *config.Config, args ...string) (string, error) {
	cmd := exec.Command(cfg.PythonPath, args...)
	cmd.Dir = ".."

	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = out.String()
		}
		if errMsg == "" {
			errMsg = err.Error()
		}
		return "", errors.New(errMsg)
	}

	return out.String(), nil
}

func (h *Handler) buildJobPayload(req models.CoverLetterRequest) models.Job {
	job := models.Job{
		ID:          req.JobID,
		Title:       req.JobTitle,
		Company:     req.Company,
		Location:    req.Location,
		URL:         req.JobURL,
		Description: req.JobDesc,
		MatchScore:  req.MatchScore,
	}

	if found, ok := findJobByID(req.JobID); ok {
		if job.Title == "" {
			job.Title = found.Title
		}
		if job.Company == "" {
			job.Company = found.Company
		}
		if job.Location == "" {
			job.Location = found.Location
		}
		if job.URL == "" {
			job.URL = found.URL
		}
		if job.Description == "" {
			job.Description = found.Description
		}
		if job.MatchScore == 0 {
			job.MatchScore = found.MatchScore
		}
	}

	return job
}

func findJobByID(id string) (models.Job, bool) {
	jobMu.RLock()
	defer jobMu.RUnlock()

	for _, job := range jobStore {
		if job.ID == id {
			return job, true
		}
	}

	return models.Job{}, false
}

func writeTempJSON(payload interface{}) (string, error) {
	file, err := os.CreateTemp("", "job-payload-*.json")
	if err != nil {
		return "", err
	}
	defer file.Close()

	if err := json.NewEncoder(file).Encode(payload); err != nil {
		os.Remove(file.Name())
		return "", err
	}

	return file.Name(), nil
}
