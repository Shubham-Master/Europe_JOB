package models

import "time"

// Job represents a scraped job listing
type Job struct {
	ID             string             `json:"id"`
	SourceJobID    string             `json:"source_job_id,omitempty"`
	Title          string             `json:"title"`
	Company        string             `json:"company"`
	Location       string             `json:"location"`
	Country        string             `json:"country"`
	CountryCode    string             `json:"country_code,omitempty"`
	URL            string             `json:"url"`
	Description    string             `json:"description"`
	Salary         string             `json:"salary,omitempty"`
	Source         string             `json:"source"` // adzuna, indeed, rss, etc.
	EmploymentType string             `json:"employment_type,omitempty"`
	RemoteType     string             `json:"remote_type,omitempty"`
	MatchScore     float64            `json:"match_score"`
	ScoreBreakdown map[string]float64 `json:"score_breakdown,omitempty"`
	ScrapedAt      string             `json:"scraped_at"`
	PostedAt       string             `json:"posted_at,omitempty"`
	ExpiresAt      string             `json:"expires_at,omitempty"`
	Seen           bool               `json:"seen"`
	Saved          bool               `json:"saved"`
}

// Profile represents the parsed CV profile
type Profile struct {
	FullName           string     `json:"full_name"`
	CurrentTitle       string     `json:"current_title"`
	SeniorityLevel     string     `json:"seniority_level"`
	YearsOfExperience  int        `json:"years_of_experience"`
	TechnicalSkills    []string   `json:"technical_skills"`
	ProgrammingLangs   []string   `json:"programming_languages"`
	FrameworksAndTools []string   `json:"frameworks_and_tools"`
	Domains            []string   `json:"domains"`
	TopKeywords        []string   `json:"top_keywords"`
	TargetRoles        []string   `json:"target_roles"`
	Languages          []Language `json:"languages"`
}

type Language struct {
	Language    string `json:"language"`
	Proficiency string `json:"proficiency"`
}

// CoverLetterRequest is the input for cover letter generation
type CoverLetterRequest struct {
	JobID      string  `json:"job_id" binding:"required"`
	JobTitle   string  `json:"job_title"`
	Company    string  `json:"company"`
	Location   string  `json:"location"`
	JobURL     string  `json:"job_url"`
	JobDesc    string  `json:"job_description"`
	MatchScore float64 `json:"match_score"`
}

// CoverLetterResponse is the output from cover letter generation
type CoverLetterResponse struct {
	JobTitle        string   `json:"job_title"`
	Company         string   `json:"company"`
	CoverLetter     string   `json:"cover_letter"`
	TailoredBullets []string `json:"tailored_bullets"`
	MatchScore      float64  `json:"match_score"`
	MissingSkills   []string `json:"missing_skills"`
}

type GuideChatRequest struct {
	Message          string `json:"message" binding:"required"`
	Page             string `json:"page"`
	SelectedJobTitle string `json:"selected_job_title,omitempty"`
	CountryFilter    string `json:"country_filter,omitempty"`
	HasProfile       bool   `json:"has_profile,omitempty"`
}

type ActivateCVRequest struct {
	Filename string                 `json:"filename"`
	Profile  map[string]interface{} `json:"profile" binding:"required"`
}

type UserProfile struct {
	FullName        string   `json:"full_name"`
	WhatsAppNumber  string   `json:"whatsapp_number"`
	TargetCountries []string `json:"target_countries"`
}

type UpdateSavedJobRequest struct {
	Saved bool `json:"saved"`
}

// PipelineStatus tracks the current run
type PipelineStatus struct {
	Status      string    `json:"status"` // idle, running, done, error
	CurrentStep string    `json:"current_step"`
	LastRun     time.Time `json:"last_run"`
	JobsFound   int       `json:"jobs_found"`
	JobsMatched int       `json:"jobs_matched"`
	TopScore    float64   `json:"top_score"`
	Message     string    `json:"message"`
}

// APIResponse is a generic response wrapper
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}
