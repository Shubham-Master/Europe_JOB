package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/Shubham-Master/europe-job-api/internal/models"
	"github.com/Shubham-Master/europe-job-api/internal/store"
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
	pipelineMu      sync.RWMutex
	pipelineCancelMu sync.Mutex
	pipelineCancels = map[string]context.CancelFunc{}
)

const (
	profileJSONPath = "../data/profile.json"
	rawJobsJSONPath = "../data/jobs_raw.json"
	matchedJobsPath = "../data/jobs_matched.json"
	pipelineRunTimeout = 5 * time.Minute
)

var (
	errPipelineStopped  = errors.New("pipeline stopped by user")
	errPipelineTimedOut = errors.New("pipeline timed out")
)

type Handler struct {
	cfg   *config.Config
	store *store.SupabaseStore
}

func New(cfg *config.Config) *Handler {
	return &Handler{
		cfg:   cfg,
		store: store.NewSupabaseStore(cfg.SupabaseURL, cfg.SupabaseKey),
	}
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
	userID := currentUserID(c)
	country := c.Query("country")
	minScore := c.Query("min_score")

	if h.store != nil && h.store.Enabled() {
		jobs, err := h.store.GetJobs(userID, country, minScore)
		if err == nil {
			jobMu.Lock()
			jobStore = jobs
			jobMu.Unlock()

			c.JSON(http.StatusOK, models.APIResponse{
				Success: true,
				Data:    jobs,
			})
			return
		}

		log.Printf("⚠️  Supabase jobs fetch failed, falling back to disk: %v", err)
	}

	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

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
	userID := currentUserID(c)
	id := c.Param("id")

	if h.store != nil && h.store.Enabled() {
		job, err := h.store.GetJobByExternalKey(userID, id)
		if err == nil && job != nil {
			c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: job})
			return
		}
		if err != nil {
			log.Printf("⚠️  Supabase job lookup failed, falling back to disk: %v", err)
		}
	}

	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

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
	userID := currentUserID(c)
	id := c.Param("id")

	if h.store != nil && h.store.Enabled() {
		if err := h.store.MarkJobSeen(userID, id); err != nil {
			log.Printf("⚠️  Supabase seen update failed, falling back to disk: %v", err)
		} else {
			jobMu.Lock()
			for i, job := range jobStore {
				if job.ID == id {
					jobStore[i].Seen = true
					break
				}
			}
			jobMu.Unlock()

			c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "marked as seen"})
			return
		}
	}

	if err := loadJobsFromDisk(matchedJobsPath); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "failed to load saved jobs: " + err.Error(),
		})
		return
	}

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
	userID := currentUserID(c)
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

	profileData, err := readJSONFile(profileJSONPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "CV parsed but profile could not be loaded back",
		})
		return
	}

	if h.store != nil && h.store.Enabled() {
		if _, err := h.store.SaveCVVersion(userID, profileData, file.Filename); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Error:   "CV parsed but failed to save profile to Supabase: " + err.Error(),
			})
			return
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "CV parsed successfully",
		Data: gin.H{
			"output":  out.String(),
			"profile": profileData,
		},
	})
}

// GetProfile returns the current parsed CV profile
func (h *Handler) GetProfile(c *gin.Context) {
	data, err := h.loadProfileData(currentUserID(c))
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
	userID := currentUserID(c)
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

	profilePath, cleanupProfile, err := h.ensureLocalProfileFile(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No parsed CV profile found. Upload your CV first.",
		})
		return
	}
	defer cleanupProfile()

	job := h.buildJobPayload(userID, req)
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
		profilePath,
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

	if h.store != nil && h.store.Enabled() {
		if err := h.store.SaveCoverLetter(userID, job, data); err != nil {
			log.Printf("⚠️  Cover letter saved locally but not persisted to Supabase: %v", err)
		}
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Cover letter generated successfully",
		Data:    data,
	})
}

// GuideChat answers short onboarding questions about this app.
func (h *Handler) GuideChat(c *gin.Context) {
	var req models.GuideChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    buildGuideReply(req),
	})
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

// RunPipeline manually triggers the full scrape + match pipeline
func (h *Handler) RunPipeline(c *gin.Context) {
	userID := currentUserID(c)
	state := h.latestPipelineState(userID)
	if state.Status == "running" {
		c.JSON(http.StatusConflict, models.APIResponse{
			Success: false,
			Error:   "Pipeline is already running. Stop it or wait for it to finish.",
		})
		return
	}

	if _, cleanupProfile, err := h.ensureLocalProfileFile(userID); err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No parsed CV profile found. Upload your CV first.",
		})
		return
	} else {
		cleanupProfile()
	}

	// Run async
	go runPipelineAsync(userID, h.cfg, h.store)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Pipeline started",
	})
}

// StopPipeline cancels an active pipeline run.
func (h *Handler) StopPipeline(c *gin.Context) {
	userID := currentUserID(c)
	cancel := takePipelineCancel(userID)
	state := h.latestPipelineState(userID)

	if cancel == nil && state.Status != "running" {
		c.JSON(http.StatusOK, models.APIResponse{
			Success: true,
			Message: "Pipeline is not running",
			Data:    state,
		})
		return
	}

	if cancel != nil {
		cancel()
	}

	state.Status = "error"
	state.Message = "Pipeline stopped by user."
	persistPipelineState(h.store, userID, "", state)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Pipeline stopped",
		Data:    state,
	})
}

// RestartPipeline stops any active run and starts a fresh one.
func (h *Handler) RestartPipeline(c *gin.Context) {
	userID := currentUserID(c)
	if cancel := takePipelineCancel(userID); cancel != nil {
		cancel()
	}

	if _, cleanupProfile, err := h.ensureLocalProfileFile(userID); err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "No parsed CV profile found. Upload your CV first.",
		})
		return
	} else {
		cleanupProfile()
	}

	go runPipelineAsync(userID, h.cfg, h.store)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Pipeline restarted",
	})
}

// GetPipelineStatus returns current pipeline run status
func (h *Handler) GetPipelineStatus(c *gin.Context) {
	userID := currentUserID(c)
	state := h.latestPipelineState(userID)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    state,
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func buildGuideReply(req models.GuideChatRequest) gin.H {
	message := strings.ToLower(strings.TrimSpace(req.Message))
	page := req.Page
	selectedJob := strings.TrimSpace(req.SelectedJobTitle)
	country := strings.TrimSpace(req.CountryFilter)

	reply := "I can help you move through this page faster. Ask what to do next, why something looks empty, or which step is worth fixing first."
	route := "none"

	switch {
	case strings.Contains(message, "help"), strings.Contains(message, "benefit"), strings.Contains(message, "why should"):
		reply = "This page is here to save you time. Instead of guessing the next step, you can ask what is missing, what to click next, or how to improve the result already on screen."
	case strings.Contains(message, "filter"):
		reply = "Filters narrow jobs by country, keywords, and score. Start with the country first, then increase the minimum score only after results are already visible."
		if country != "" && strings.ToLower(country) != "all" {
			reply = "Filters narrow jobs by country, keywords, and score. You are currently focused on " + country + ", so keep that country filter and adjust the score gradually instead of jumping too high."
		}
		route = "/jobs"
	case strings.Contains(message, "start"):
		reply = "Start on My CV, upload your latest PDF, then run Pipeline once. After that, open Jobs, review the best matches, and generate a cover letter for a selected role."
		route = "/cv"
	case strings.Contains(message, "no jobs"), strings.Contains(message, "missing"), strings.Contains(message, "empty"):
		reply = "If no jobs are showing yet, the most common reason is that Pipeline has not run against your latest CV. Upload your CV first, then run Pipeline once and refresh Jobs."
		route = "/pipeline"
	case strings.HasPrefix(page, "/cover-letter") && selectedJob == "":
		reply = "The Cover Letter page stays empty until you select a role in Jobs. Pick a job there first, then come back here to generate tailored content."
		route = "/jobs"
	case strings.HasPrefix(page, "/cover-letter"):
		reply = "This page uses the role selected from Jobs. If the content looks outdated, return to Jobs, choose the role again, and regenerate the cover letter."
		route = "/jobs"
	case strings.HasPrefix(page, "/pipeline"):
		reply = "Pipeline scrapes roles, matches them against your CV, and prepares ranked results. Run it after every important CV update so your matches stay relevant."
		route = "/pipeline"
	case strings.HasPrefix(page, "/cv"):
		reply = "Upload a clean PDF resume with readable headings and bullet points. Once parsing finishes, your profile preview and CV history will appear here."
	case !req.HasProfile:
		reply = "Before anything else, upload your CV on My CV. The rest of the app becomes useful only after your profile is parsed."
		route = "/cv"
	}

	return gin.H{
		"reply":           reply,
		"suggested_route": route,
	}
}

func runPipelineAsync(userID string, cfg *config.Config, supabaseStore *store.SupabaseStore) {
	startedAt := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), pipelineRunTimeout)
	registerPipelineCancel(userID, cancel)
	defer func() {
		cancel()
		clearPipelineCancel(userID)
	}()

	state := models.PipelineStatus{
		Status:      "running",
		CurrentStep: "scrape",
		LastRun:     startedAt,
		Message:     "Scraping jobs...",
		JobsFound:   0,
		JobsMatched: 0,
		TopScore:    0,
	}

	cvVersionID := ""
	pipelineRunID := ""
	if supabaseStore != nil && supabaseStore.Enabled() {
		cvVersion, err := supabaseStore.GetActiveCVVersion(userID)
		if err != nil {
			log.Printf("⚠️  Could not load active CV version from Supabase: %v", err)
		} else if cvVersion != nil {
			cvVersionID = cvVersion.ID
		}

		runID, err := supabaseStore.CreatePipelineRun(userID, cvVersionID, state)
		if err != nil {
			log.Printf("⚠️  Could not create pipeline run in Supabase: %v", err)
		} else {
			pipelineRunID = runID
		}
	}
	persistPipelineState(supabaseStore, userID, pipelineRunID, state)

	profilePath, cleanupProfile, err := createProfileFileForPipeline(userID, supabaseStore)
	if err != nil {
		failPipeline(&state, startedAt, "No parsed CV profile found. Upload your CV first.", supabaseStore, userID, pipelineRunID)
		return
	}
	defer cleanupProfile()

	tmpDir, err := os.MkdirTemp("", "pipeline-run-*")
	if err != nil {
		failPipeline(&state, startedAt, "Could not prepare pipeline workspace.", supabaseStore, userID, pipelineRunID)
		return
	}
	defer os.RemoveAll(tmpDir)

	rawJobsPath := filepath.Join(tmpDir, "jobs_raw.json")
	matchedJobsFilePath := filepath.Join(tmpDir, "jobs_matched.json")

	if _, err := runPythonScript(ctx, cfg, "scraper/scraper.py", profilePath, rawJobsPath); err != nil {
		failPipeline(&state, startedAt, pipelineStepError("scraper", err), supabaseStore, userID, pipelineRunID)
		return
	}

	rawJobs, err := readJobsFile(rawJobsPath)
	if err != nil {
		failPipeline(&state, startedAt, "Could not read scraped jobs: "+err.Error(), supabaseStore, userID, pipelineRunID)
		return
	}

	state.Status = "running"
	state.CurrentStep = "match"
	state.LastRun = startedAt
	state.JobsFound = len(rawJobs)
	state.Message = "Matching jobs to your CV..."
	persistPipelineState(supabaseStore, userID, pipelineRunID, state)

	if _, err := runPythonScript(ctx, cfg, "matcher/matcher.py", profilePath, rawJobsPath, matchedJobsFilePath, "0"); err != nil {
		failPipeline(&state, startedAt, pipelineStepError("matcher", err), supabaseStore, userID, pipelineRunID)
		return
	}

	matchedJobs, err := readJobsFile(matchedJobsFilePath)
	if err != nil {
		failPipeline(&state, startedAt, "Could not read matched jobs: "+err.Error(), supabaseStore, userID, pipelineRunID)
		return
	}

	jobMu.Lock()
	jobStore = matchedJobs
	jobMu.Unlock()

	if supabaseStore != nil && supabaseStore.Enabled() {
		if err := supabaseStore.SyncJobsAndMatches(userID, cvVersionID, rawJobs, matchedJobs); err != nil {
			failPipeline(&state, startedAt, "Could not persist jobs to Supabase: "+err.Error(), supabaseStore, userID, pipelineRunID)
			return
		}
	}

	topScore := 0.0
	if len(matchedJobs) > 0 {
		topScore = matchedJobs[0].MatchScore
	}

	state.Status = "running"
	state.CurrentStep = "filter"
	state.LastRun = startedAt
	state.JobsFound = len(rawJobs)
	state.JobsMatched = len(matchedJobs)
	state.TopScore = topScore
	state.Message = "Preparing matched jobs..."
	persistPipelineState(supabaseStore, userID, pipelineRunID, state)

	if cfg.TelegramToken != "" && cfg.TelegramChatID != "" {
		state.Status = "running"
		state.CurrentStep = "notify"
		state.Message = "Sending Telegram digest..."
		persistPipelineState(supabaseStore, userID, pipelineRunID, state)

		if _, err := runPythonScript(ctx, cfg, "notifier/telegram.py", "digest", matchedJobsFilePath, profilePath); err != nil {
			failPipeline(&state, startedAt, pipelineStepError("notification", err), supabaseStore, userID, pipelineRunID)
			return
		}
	}

	finalMessage := "Pipeline complete"
	if cfg.TelegramToken == "" || cfg.TelegramChatID == "" {
		finalMessage = "Pipeline complete (Telegram skipped)"
	}

	state.Status = "done"
	state.CurrentStep = "done"
	state.LastRun = startedAt
	state.JobsFound = len(rawJobs)
	state.JobsMatched = len(matchedJobs)
	state.TopScore = topScore
	state.Message = finalMessage
	persistPipelineState(supabaseStore, userID, pipelineRunID, state)
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

func failPipeline(state *models.PipelineStatus, lastRun time.Time, message string, supabaseStore *store.SupabaseStore, userID, pipelineRunID string) {
	state.Status = "error"
	state.LastRun = lastRun
	state.Message = message
	persistPipelineState(supabaseStore, userID, pipelineRunID, *state)
}

func runPythonScript(ctx context.Context, cfg *config.Config, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, cfg.PythonPath, args...)
	cmd.Dir = ".."

	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			return "", errPipelineStopped
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return "", errPipelineTimedOut
		}

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

func (h *Handler) buildJobPayload(userID string, req models.CoverLetterRequest) models.Job {
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
		return job
	}

	if h.store != nil && h.store.Enabled() {
		found, err := h.store.GetJobByExternalKey(userID, req.JobID)
		if err == nil && found != nil {
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
			if job.Source == "" {
				job.Source = found.Source
			}
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

func (h *Handler) loadProfileData(userID string) (map[string]interface{}, error) {
	if h.store != nil && h.store.Enabled() {
		cvVersion, err := h.store.GetActiveCVVersion(userID)
		if err != nil {
			return nil, err
		}
		if cvVersion != nil {
			return cvVersion.ProfileJSON, nil
		}
	}

	return readJSONFile(profileJSONPath)
}

func (h *Handler) ensureLocalProfileFile(userID string) (string, func(), error) {
	if h.store != nil && h.store.Enabled() {
		path, err := createProfileFileForUser(userID, h.store)
		if err == nil {
			return path, func() { os.Remove(path) }, nil
		}
	}

	if _, err := os.Stat(profileJSONPath); err != nil {
		return "", nil, err
	}

	return profileJSONPath, func() {}, nil
}

func writeJSONMap(path string, payload map[string]interface{}) error {
	if err := os.MkdirAll("../data", 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o644)
}

func persistPipelineState(supabaseStore *store.SupabaseStore, userID, pipelineRunID string, state models.PipelineStatus) {
	setPipelineState(normalizePipelineState(state))

	if supabaseStore == nil || !supabaseStore.Enabled() || pipelineRunID == "" {
		return
	}

	if err := supabaseStore.UpdatePipelineRun(userID, pipelineRunID, state); err != nil {
		log.Printf("⚠️  Failed to update pipeline state in Supabase: %v", err)
	}
}

func currentUserID(c *gin.Context) string {
	value, _ := c.Get("user_id")
	userID, _ := value.(string)
	return strings.TrimSpace(userID)
}

func (h *Handler) latestPipelineState(userID string) models.PipelineStatus {
	state := getPipelineState()

	if h.store != nil && h.store.Enabled() {
		latest, err := h.store.GetLatestPipelineStatus(userID)
		if err != nil {
			log.Printf("⚠️  Failed to fetch latest pipeline status from Supabase: %v", err)
		} else if latest != nil {
			state = mergePipelineStates(state, *latest)
		}
	}

	return normalizePipelineState(state)
}

func defaultPipelineStatus() models.PipelineStatus {
	return models.PipelineStatus{
		Status:      "idle",
		CurrentStep: "idle",
		Message:     "Pipeline has not run yet",
	}
}

func getPipelineState() models.PipelineStatus {
	pipelineMu.RLock()
	defer pipelineMu.RUnlock()
	return pipelineState
}

func setPipelineState(state models.PipelineStatus) {
	pipelineMu.Lock()
	pipelineState = state
	pipelineMu.Unlock()
}

func mergePipelineStates(inMemory, persisted models.PipelineStatus) models.PipelineStatus {
	inMemory = normalizePipelineState(inMemory)
	persisted = normalizePipelineState(persisted)

	switch {
	case inMemory.Status == "idle" && !persisted.LastRun.IsZero():
		return persisted
	case persisted.LastRun.After(inMemory.LastRun):
		return persisted
	case inMemory.Status != "idle":
		return inMemory
	default:
		return persisted
	}
}

func normalizePipelineState(state models.PipelineStatus) models.PipelineStatus {
	if state.Status == "" {
		return defaultPipelineStatus()
	}

	if state.Status == "running" && !state.LastRun.IsZero() && time.Since(state.LastRun) > pipelineRunTimeout {
		state.Status = "error"
		state.Message = "Previous pipeline run timed out. You can restart it now."
	}

	return state
}

func pipelineOwnerKey(userID string) string {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return "public"
	}
	return userID
}

func registerPipelineCancel(userID string, cancel context.CancelFunc) {
	pipelineCancelMu.Lock()
	pipelineCancels[pipelineOwnerKey(userID)] = cancel
	pipelineCancelMu.Unlock()
}

func takePipelineCancel(userID string) context.CancelFunc {
	pipelineCancelMu.Lock()
	defer pipelineCancelMu.Unlock()

	key := pipelineOwnerKey(userID)
	cancel := pipelineCancels[key]
	delete(pipelineCancels, key)
	return cancel
}

func clearPipelineCancel(userID string) {
	pipelineCancelMu.Lock()
	delete(pipelineCancels, pipelineOwnerKey(userID))
	pipelineCancelMu.Unlock()
}

func pipelineStepError(step string, err error) string {
	switch {
	case errors.Is(err, errPipelineStopped):
		return "Pipeline stopped by user."
	case errors.Is(err, errPipelineTimedOut):
		return "Pipeline timed out while " + step + " was running. Try again or narrow the search."
	default:
		return strings.Title(step) + " failed: " + err.Error()
	}
}

func tempProfilePathForUser(userID string) string {
	return filepath.Join(os.TempDir(), "eurojobs-profile-"+sanitizeFileComponent(userID)+".json")
}

func createProfileFileForUser(userID string, supabaseStore *store.SupabaseStore) (string, error) {
	if supabaseStore == nil || !supabaseStore.Enabled() {
		return "", os.ErrNotExist
	}

	path := tempProfilePathForUser(userID)
	_, err := supabaseStore.RestoreActiveProfile(userID, path)
	if err != nil {
		return "", err
	}

	return path, nil
}

func createProfileFileForPipeline(userID string, supabaseStore *store.SupabaseStore) (string, func(), error) {
	if supabaseStore != nil && supabaseStore.Enabled() {
		path, err := createProfileFileForUser(userID, supabaseStore)
		if err == nil {
			return path, func() { os.Remove(path) }, nil
		}
	}

	if _, err := os.Stat(profileJSONPath); err != nil {
		return "", nil, err
	}

	return profileJSONPath, func() {}, nil
}

func sanitizeFileComponent(value string) string {
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '-'
	}, value)
	if clean == "" {
		return "user"
	}
	return clean
}
