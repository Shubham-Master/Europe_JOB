package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Shubham-Master/europe-job-api/internal/models"
)

type SupabaseStore struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

type CVVersion struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"user_id"`
	Filename     string                 `json:"filename"`
	ProfileJSON  map[string]interface{} `json:"profile_json"`
	FullName     string                 `json:"full_name"`
	CurrentTitle string                 `json:"current_title"`
	ParsedAt     time.Time              `json:"parsed_at"`
}

type supabaseJobRow struct {
	ID             string `json:"id"`
	ExternalKey    string `json:"external_key"`
	SourceJobID    string `json:"source_job_id"`
	ExternalURL    string `json:"external_url"`
	Title          string `json:"title"`
	Company        string `json:"company"`
	Location       string `json:"location"`
	Country        string `json:"country"`
	CountryCode    string `json:"country_code"`
	Description    string `json:"description"`
	SalaryText     string `json:"salary_text"`
	Source         string `json:"source"`
	EmploymentType string `json:"employment_type"`
	RemoteType     string `json:"remote_type"`
	ScrapedAt      string `json:"scraped_at"`
	PostedAt       string `json:"posted_at"`
	ExpiresAt      string `json:"expires_at"`
}

type jobMatchFeedRow struct {
	ID             string             `json:"id"`
	JobID          string             `json:"job_id"`
	CVVersionID    string             `json:"cv_version_id"`
	MatchScore     float64            `json:"match_score"`
	ScoreBreakdown map[string]float64 `json:"score_breakdown"`
	Status         string             `json:"status"`
	IsSeen         bool               `json:"is_seen"`
	Jobs           supabaseJobRow     `json:"jobs"`
}

type jobMatchIdentity struct {
	ID          string         `json:"id"`
	JobID       string         `json:"job_id"`
	CVVersionID string         `json:"cv_version_id"`
	MatchScore  float64        `json:"match_score"`
	Jobs        supabaseJobKey `json:"jobs"`
}

type supabaseJobKey struct {
	ExternalKey string `json:"external_key"`
}

type pipelineRunRow struct {
	ID          string    `json:"id"`
	Status      string    `json:"status"`
	CurrentStep string    `json:"current_step"`
	Message     string    `json:"message"`
	JobsFound   int       `json:"jobs_found"`
	JobsMatched int       `json:"jobs_matched"`
	TopScore    float64   `json:"top_score"`
	StartedAt   time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
}

type jobUpsertPayload struct {
	ExternalKey    string                 `json:"external_key"`
	Source         string                 `json:"source"`
	SourceJobID    string                 `json:"source_job_id"`
	ExternalURL    string                 `json:"external_url"`
	Title          string                 `json:"title"`
	Company        string                 `json:"company"`
	Location       string                 `json:"location"`
	Country        string                 `json:"country"`
	CountryCode    string                 `json:"country_code"`
	RemoteType     string                 `json:"remote_type"`
	EmploymentType string                 `json:"employment_type"`
	ListingStatus  string                 `json:"listing_status"`
	SalaryText     string                 `json:"salary_text"`
	Description    string                 `json:"description"`
	PostedAt       *string                `json:"posted_at"`
	ExpiresAt      *string                `json:"expires_at"`
	LastSeenAt     string                 `json:"last_seen_at"`
	ScrapedAt      string                 `json:"scraped_at"`
	RawPayload     map[string]interface{} `json:"raw_payload"`
}

type jobIdentityRow struct {
	ID          string `json:"id"`
	ExternalKey string `json:"external_key"`
}

type jobMatchUpsertPayload struct {
	UserID         string             `json:"user_id,omitempty"`
	JobID          string             `json:"job_id"`
	CVVersionID    string             `json:"cv_version_id"`
	MatchScore     float64            `json:"match_score"`
	ScoreBreakdown map[string]float64 `json:"score_breakdown"`
	MatchLabel     string             `json:"match_label"`
	MatchedAt      string             `json:"matched_at"`
}

func NewSupabaseStore(baseURL, apiKey string) *SupabaseStore {
	if strings.TrimSpace(baseURL) == "" || strings.TrimSpace(apiKey) == "" {
		return nil
	}

	return &SupabaseStore{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (s *SupabaseStore) Enabled() bool {
	return s != nil && s.baseURL != "" && s.apiKey != ""
}

func (s *SupabaseStore) SaveCVVersion(userID string, profile map[string]interface{}, filename string) (*CVVersion, error) {
	if !s.Enabled() {
		return nil, nil
	}

	payload := map[string]interface{}{
		"filename":             filename,
		"profile_json":         profile,
		"full_name":            stringValue(profile["full_name"]),
		"current_title":        stringValue(profile["current_title"]),
		"summary":              stringValue(profile["summary"]),
		"seniority_level":      fallbackString(stringValue(profile["seniority_level"]), "unknown"),
		"years_of_experience":  numericValue(profile["years_of_experience"]),
		"is_active":            true,
	}
	if strings.TrimSpace(userID) != "" {
		payload["user_id"] = userID
	}

	var rows []CVVersion
	if err := s.requestJSON(http.MethodPost, "cv_versions", nil, payload, "return=representation", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &rows[0], nil
}

func (s *SupabaseStore) GetActiveCVVersion(userID string) (*CVVersion, error) {
	if !s.Enabled() {
		return nil, nil
	}

	query := url.Values{}
	query.Set("select", "id,filename,profile_json,full_name,current_title,parsed_at")
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}
	query.Set("is_active", "is.true")
	query.Set("order", "parsed_at.desc")
	query.Set("limit", "1")

	var rows []CVVersion
	if err := s.requestJSON(http.MethodGet, "cv_versions", query, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &rows[0], nil
}

func (s *SupabaseStore) RestoreActiveProfile(userID, path string) (map[string]interface{}, error) {
	cv, err := s.GetActiveCVVersion(userID)
	if err != nil {
		return nil, err
	}
	if cv == nil {
		return nil, os.ErrNotExist
	}

	if err := writeJSONFile(path, cv.ProfileJSON); err != nil {
		return nil, err
	}

	return cv.ProfileJSON, nil
}

func (s *SupabaseStore) GetJobs(userID string, country string, minScore string) ([]models.Job, error) {
	if !s.Enabled() {
		return nil, nil
	}

	cv, err := s.GetActiveCVVersion(userID)
	if err != nil {
		return nil, err
	}
	if cv == nil {
		return []models.Job{}, nil
	}

	query := url.Values{}
	query.Set("select", "id,job_id,cv_version_id,match_score,score_breakdown,status,is_seen,jobs!inner(external_key,source_job_id,external_url,title,company,location,country,country_code,description,salary_text,source,employment_type,remote_type,scraped_at,posted_at,expires_at)")
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}
	query.Set("cv_version_id", "eq."+cv.ID)
	query.Set("order", "match_score.desc")

	if strings.TrimSpace(country) != "" {
		query.Set("jobs.country", "eq."+country)
	}
	if strings.TrimSpace(minScore) != "" {
		query.Set("match_score", "gte."+minScore)
	}

	var rows []jobMatchFeedRow
	if err := s.requestJSON(http.MethodGet, "job_matches", query, nil, "", &rows); err != nil {
		return nil, err
	}

	jobs := make([]models.Job, 0, len(rows))
	for _, row := range rows {
		jobs = append(jobs, flattenMatchRow(row))
	}

	return jobs, nil
}

func (s *SupabaseStore) GetJobByExternalKey(userID, externalKey string) (*models.Job, error) {
	if !s.Enabled() {
		return nil, nil
	}

	cv, err := s.GetActiveCVVersion(userID)
	if err != nil {
		return nil, err
	}
	if cv == nil {
		return nil, nil
	}

	query := url.Values{}
	query.Set("select", "id,job_id,cv_version_id,match_score,score_breakdown,status,is_seen,jobs!inner(external_key,source_job_id,external_url,title,company,location,country,country_code,description,salary_text,source,employment_type,remote_type,scraped_at,posted_at,expires_at)")
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}
	query.Set("cv_version_id", "eq."+cv.ID)
	query.Set("jobs.external_key", "eq."+externalKey)
	query.Set("limit", "1")

	var rows []jobMatchFeedRow
	if err := s.requestJSON(http.MethodGet, "job_matches", query, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	job := flattenMatchRow(rows[0])
	return &job, nil
}

func (s *SupabaseStore) MarkJobSeen(userID, externalKey string) error {
	if !s.Enabled() {
		return nil
	}

	cv, err := s.GetActiveCVVersion(userID)
	if err != nil {
		return err
	}
	if cv == nil {
		return nil
	}

	match, err := s.findMatchByExternalKey(userID, cv.ID, externalKey)
	if err != nil {
		return err
	}
	if match == nil {
		return nil
	}

	query := url.Values{}
	query.Set("id", "eq."+match.ID)

	payload := map[string]interface{}{
		"is_seen": true,
		"seen_at": time.Now().UTC().Format(time.RFC3339),
		"status":  "seen",
	}

	return s.requestJSON(http.MethodPatch, "job_matches", query, payload, "return=minimal", nil)
}

func (s *SupabaseStore) SyncJobsAndMatches(userID, cvVersionID string, rawJobs []models.Job, matchedJobs []models.Job) error {
	if !s.Enabled() || strings.TrimSpace(cvVersionID) == "" {
		return nil
	}

	combinedJobs := dedupeJobs(append(append([]models.Job{}, rawJobs...), matchedJobs...))

	identities, err := s.upsertJobs(combinedJobs)
	if err != nil {
		return err
	}

	if len(matchedJobs) == 0 {
		return nil
	}

	now := time.Now().UTC().Format(time.RFC3339)
	payloads := make([]jobMatchUpsertPayload, 0, len(matchedJobs))
	for _, job := range matchedJobs {
		jobID, ok := identities[normalizedExternalKey(job)]
		if !ok {
			continue
		}

		payloads = append(payloads, jobMatchUpsertPayload{
			UserID:         userID,
			JobID:          jobID,
			CVVersionID:    cvVersionID,
			MatchScore:     job.MatchScore,
			ScoreBreakdown: job.ScoreBreakdown,
			MatchLabel:     matchLabel(job.MatchScore),
			MatchedAt:      now,
		})
	}

	if len(payloads) == 0 {
		return nil
	}

	query := url.Values{}
	query.Set("on_conflict", "job_id,cv_version_id")

	return s.requestJSON(http.MethodPost, "job_matches", query, payloads, "resolution=merge-duplicates,return=minimal", nil)
}

func (s *SupabaseStore) SaveCoverLetter(userID string, job models.Job, data map[string]interface{}) error {
	if !s.Enabled() {
		return nil
	}

	cv, err := s.GetActiveCVVersion(userID)
	if err != nil {
		return err
	}
	if cv == nil {
		return nil
	}

	match, err := s.findMatchByExternalKey(userID, cv.ID, normalizedExternalKey(job))
	if err != nil {
		return err
	}

	if match == nil {
		jobRows, err := s.upsertJobs([]models.Job{job})
		if err != nil {
			return err
		}

		jobID, ok := jobRows[normalizedExternalKey(job)]
		if !ok {
			return nil
		}

		matchPayload := []jobMatchUpsertPayload{{
			UserID:         userID,
			JobID:          jobID,
			CVVersionID:    cv.ID,
			MatchScore:     job.MatchScore,
			ScoreBreakdown: job.ScoreBreakdown,
			MatchLabel:     matchLabel(job.MatchScore),
			MatchedAt:      time.Now().UTC().Format(time.RFC3339),
		}}

		query := url.Values{}
		query.Set("on_conflict", "job_id,cv_version_id")
		if err := s.requestJSON(http.MethodPost, "job_matches", query, matchPayload, "resolution=merge-duplicates,return=minimal", nil); err != nil {
			return err
		}

		match, err = s.findMatchByExternalKey(userID, cv.ID, normalizedExternalKey(job))
		if err != nil {
			return err
		}
		if match == nil {
			return nil
		}
	}

	payload := map[string]interface{}{
		"job_match_id":       match.ID,
		"job_id":             match.JobID,
		"cv_version_id":      cv.ID,
		"cover_letter":       stringValue(data["cover_letter"]),
		"tailored_bullets":   listValue(data["tailored_bullets"]),
		"missing_skills":     listValue(data["missing_skills"]),
		"keywords_to_add":    listValue(data["keywords_to_add"]),
		"ats_score_estimate": numericValue(data["ats_score_estimate"]),
		"generated_at":       time.Now().UTC().Format(time.RFC3339),
	}
	if strings.TrimSpace(userID) != "" {
		payload["user_id"] = userID
	}

	return s.requestJSON(http.MethodPost, "cover_letters", nil, payload, "return=minimal", nil)
}

func (s *SupabaseStore) CreatePipelineRun(userID, cvVersionID string, state models.PipelineStatus) (string, error) {
	if !s.Enabled() {
		return "", nil
	}

	payload := map[string]interface{}{
		"status":        state.Status,
		"current_step":  state.CurrentStep,
		"message":       state.Message,
		"jobs_found":    state.JobsFound,
		"jobs_matched":  state.JobsMatched,
		"top_score":     state.TopScore,
		"started_at":    state.LastRun.UTC().Format(time.RFC3339),
	}
	if strings.TrimSpace(userID) != "" {
		payload["user_id"] = userID
	}
	if strings.TrimSpace(cvVersionID) != "" {
		payload["cv_version_id"] = cvVersionID
	}

	var rows []pipelineRunRow
	if err := s.requestJSON(http.MethodPost, "pipeline_runs", nil, payload, "return=representation", &rows); err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", nil
	}

	return rows[0].ID, nil
}

func (s *SupabaseStore) UpdatePipelineRun(userID, runID string, state models.PipelineStatus) error {
	if !s.Enabled() || strings.TrimSpace(runID) == "" {
		return nil
	}

	query := url.Values{}
	query.Set("id", "eq."+runID)
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}

	payload := map[string]interface{}{
		"status":       state.Status,
		"current_step": state.CurrentStep,
		"message":      state.Message,
		"jobs_found":   state.JobsFound,
		"jobs_matched": state.JobsMatched,
		"top_score":    state.TopScore,
	}

	if state.Status == "done" || state.Status == "error" {
		payload["finished_at"] = time.Now().UTC().Format(time.RFC3339)
	}

	return s.requestJSON(http.MethodPatch, "pipeline_runs", query, payload, "return=minimal", nil)
}

func (s *SupabaseStore) GetLatestPipelineStatus(userID string) (*models.PipelineStatus, error) {
	if !s.Enabled() {
		return nil, nil
	}

	query := url.Values{}
	query.Set("select", "id,status,current_step,message,jobs_found,jobs_matched,top_score,started_at,finished_at")
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}
	query.Set("order", "started_at.desc")
	query.Set("limit", "1")

	var rows []pipelineRunRow
	if err := s.requestJSON(http.MethodGet, "pipeline_runs", query, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	row := rows[0]
	return &models.PipelineStatus{
		Status:      row.Status,
		CurrentStep: row.CurrentStep,
		LastRun:     row.StartedAt,
		JobsFound:   row.JobsFound,
		JobsMatched: row.JobsMatched,
		TopScore:    row.TopScore,
		Message:     row.Message,
	}, nil
}

func (s *SupabaseStore) upsertJobs(jobs []models.Job) (map[string]string, error) {
	if len(jobs) == 0 {
		return map[string]string{}, nil
	}

	now := time.Now().UTC().Format(time.RFC3339)
	payloads := make([]jobUpsertPayload, 0, len(jobs))
	for _, job := range jobs {
		externalKey := normalizedExternalKey(job)
		if externalKey == "" || strings.TrimSpace(job.URL) == "" {
			continue
		}

		scrapedAt := normalizedTimestamp(job.ScrapedAt)
		if scrapedAt == "" {
			scrapedAt = now
		}

		payloads = append(payloads, jobUpsertPayload{
			ExternalKey:    externalKey,
			Source:         normalizedSource(job.Source),
			SourceJobID:    fallbackString(job.SourceJobID, externalKey),
			ExternalURL:    job.URL,
			Title:          job.Title,
			Company:        job.Company,
			Location:       job.Location,
			Country:        job.Country,
			CountryCode:    job.CountryCode,
			RemoteType:     job.RemoteType,
			EmploymentType: job.EmploymentType,
			ListingStatus:  "active",
			SalaryText:     job.Salary,
			Description:    job.Description,
			PostedAt:       stringPointer(normalizedTimestamp(job.PostedAt)),
			ExpiresAt:      stringPointer(normalizedTimestamp(job.ExpiresAt)),
			LastSeenAt:     now,
			ScrapedAt:      scrapedAt,
			RawPayload:     rawPayload(job),
		})
	}

	if len(payloads) == 0 {
		return map[string]string{}, nil
	}

	query := url.Values{}
	query.Set("on_conflict", "external_key")

	var rows []jobIdentityRow
	if err := s.requestJSON(http.MethodPost, "jobs", query, payloads, "resolution=merge-duplicates,return=representation", &rows); err != nil {
		return nil, err
	}

	result := make(map[string]string, len(rows))
	for _, row := range rows {
		result[row.ExternalKey] = row.ID
	}

	return result, nil
}

func (s *SupabaseStore) findMatchByExternalKey(userID, cvVersionID, externalKey string) (*jobMatchIdentity, error) {
	query := url.Values{}
	query.Set("select", "id,job_id,cv_version_id,match_score,jobs!inner(external_key)")
	if strings.TrimSpace(userID) != "" {
		query.Set("user_id", "eq."+userID)
	}
	query.Set("cv_version_id", "eq."+cvVersionID)
	query.Set("jobs.external_key", "eq."+externalKey)
	query.Set("limit", "1")

	var rows []jobMatchIdentity
	if err := s.requestJSON(http.MethodGet, "job_matches", query, nil, "", &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &rows[0], nil
}

func (s *SupabaseStore) requestJSON(method, resource string, query url.Values, body interface{}, prefer string, out interface{}) error {
	if !s.Enabled() {
		return nil
	}

	endpoint := s.baseURL + "/rest/v1/" + resource
	if query != nil && len(query) > 0 {
		endpoint += "?" + query.Encode()
	}

	var payload io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, endpoint, payload)
	if err != nil {
		return err
	}

	req.Header.Set("apikey", s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase %s %s failed: %s", method, resource, strings.TrimSpace(string(bodyBytes)))
	}

	if out == nil {
		io.Copy(io.Discard, resp.Body)
		return nil
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
		return err
	}

	return nil
}

func flattenMatchRow(row jobMatchFeedRow) models.Job {
	return models.Job{
		ID:             row.Jobs.ExternalKey,
		SourceJobID:    row.Jobs.SourceJobID,
		Title:          row.Jobs.Title,
		Company:        row.Jobs.Company,
		Location:       row.Jobs.Location,
		Country:        row.Jobs.Country,
		CountryCode:    row.Jobs.CountryCode,
		URL:            row.Jobs.ExternalURL,
		Description:    row.Jobs.Description,
		Salary:         row.Jobs.SalaryText,
		Source:         row.Jobs.Source,
		EmploymentType: row.Jobs.EmploymentType,
		RemoteType:     row.Jobs.RemoteType,
		MatchScore:     row.MatchScore,
		ScoreBreakdown: row.ScoreBreakdown,
		ScrapedAt:      row.Jobs.ScrapedAt,
		PostedAt:       row.Jobs.PostedAt,
		ExpiresAt:      row.Jobs.ExpiresAt,
		Seen:           row.IsSeen,
	}
}

func normalizedExternalKey(job models.Job) string {
	if strings.TrimSpace(job.ID) != "" {
		return job.ID
	}
	if strings.TrimSpace(job.Source) != "" && strings.TrimSpace(job.URL) != "" {
		return job.Source + ":" + job.URL
	}
	return strings.TrimSpace(job.URL)
}

func normalizedTimestamp(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
		time.RFC1123Z,
		time.RFC1123,
		time.RFC822Z,
		time.RFC822,
	}

	for _, format := range formats {
		if parsed, err := time.Parse(format, value); err == nil {
			return parsed.UTC().Format(time.RFC3339)
		}
	}

	return ""
}

func rawPayload(job models.Job) map[string]interface{} {
	return map[string]interface{}{
		"id":              job.ID,
		"source_job_id":   job.SourceJobID,
		"title":           job.Title,
		"company":         job.Company,
		"location":        job.Location,
		"country":         job.Country,
		"country_code":    job.CountryCode,
		"url":             job.URL,
		"description":     job.Description,
		"salary":          job.Salary,
		"source":          job.Source,
		"employment_type": job.EmploymentType,
		"remote_type":     job.RemoteType,
		"match_score":     job.MatchScore,
		"score_breakdown": job.ScoreBreakdown,
		"scraped_at":      job.ScrapedAt,
		"posted_at":       job.PostedAt,
		"expires_at":      job.ExpiresAt,
		"seen":            job.Seen,
	}
}

func listValue(value interface{}) []string {
	if value == nil {
		return []string{}
	}

	items, ok := value.([]interface{})
	if !ok {
		if strings, ok := value.([]string); ok {
			return strings
		}
		return []string{}
	}

	result := make([]string, 0, len(items))
	for _, item := range items {
		if text := stringValue(item); text != "" {
			result = append(result, text)
		}
	}
	return result
}

func numericValue(value interface{}) interface{} {
	switch v := value.(type) {
	case nil:
		return nil
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		f, err := v.Float64()
		if err != nil {
			return nil
		}
		return f
	case string:
		if strings.TrimSpace(v) == "" {
			return nil
		}
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return nil
		}
		return f
	default:
		return nil
	}
}

func stringValue(value interface{}) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

func fallbackString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func stringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func matchLabel(score float64) string {
	switch {
	case score >= 75:
		return "Excellent"
	case score >= 55:
		return "Good"
	case score >= 35:
		return "Fair"
	default:
		return "Low"
	}
}

func writeJSONFile(path string, payload map[string]interface{}) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o644)
}

func dedupeJobs(jobs []models.Job) []models.Job {
	result := make([]models.Job, 0, len(jobs))
	seen := map[string]bool{}

	for _, job := range jobs {
		key := normalizedExternalKey(job)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, job)
	}

	return result
}

func normalizedSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "adzuna":
		return "adzuna"
	case "indeed", "indeed_rss":
		return "indeed_rss"
	case "eurojobs", "eurojobs_rss":
		return "eurojobs_rss"
	case "remotive":
		return "remotive"
	case "linkedin":
		return "linkedin"
	case "manual":
		return "manual"
	default:
		return "manual"
	}
}
