package main

import (
	"log"
	"net/http"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/Shubham-Master/europe-job-api/internal/handlers"
	"github.com/Shubham-Master/europe-job-api/internal/middleware"
	"github.com/Shubham-Master/europe-job-api/internal/scheduler"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load config
	cfg := config.Load()

	// Set Gin mode
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Init router
	r := gin.New()
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())

	// Init handlers
	h := handlers.New(cfg)

	// ─── Routes ───────────────────────────────────────────────────────────────

	// Health check
	r.GET("/health", h.Health)

	// API v1
	v1 := r.Group("/api/v1")
	{
		// Jobs
		jobs := v1.Group("/jobs")
		{
			jobs.GET("", h.GetJobs)           // GET  /api/v1/jobs?country=DE&min_score=70
			jobs.GET("/:id", h.GetJob)         // GET  /api/v1/jobs/:id
			jobs.PUT("/:id/seen", h.MarkJobSeen) // PUT  /api/v1/jobs/:id/seen
		}

		// CV
		cv := v1.Group("/cv")
		{
			cv.POST("/parse", h.ParseCV)     // POST /api/v1/cv/parse (multipart)
			cv.GET("/profile", h.GetProfile) // GET  /api/v1/cv/profile
		}

		// Cover Letter
		v1.POST("/cover-letter", h.GenerateCoverLetter) // POST /api/v1/cover-letter
		v1.POST("/guide-chat", h.GuideChat)             // POST /api/v1/guide-chat

		// Pipeline
		pipeline := v1.Group("/pipeline")
		{
			pipeline.POST("/run", h.RunPipeline)        // POST /api/v1/pipeline/run
			pipeline.POST("/stop", h.StopPipeline)       // POST /api/v1/pipeline/stop
			pipeline.POST("/restart", h.RestartPipeline) // POST /api/v1/pipeline/restart
			pipeline.GET("/status", h.GetPipelineStatus) // GET  /api/v1/pipeline/status
		}
	}

	// 404 handler
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
	})

	// Start scheduler
	s := scheduler.New(cfg)
	s.Start()
	defer s.Stop()

	// Start server
	log.Printf("🚀 Europe Job API running on :%s", cfg.Port)
	log.Printf("📍 Health check: http://localhost:%s/health", cfg.Port)
	log.Printf("📍 API base:     http://localhost:%s/api/v1", cfg.Port)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal("❌ Server failed:", err)
	}
}
