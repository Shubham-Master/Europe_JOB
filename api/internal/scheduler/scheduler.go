package scheduler

import (
	"log"

	"github.com/Shubham-Master/europe-job-api/config"
	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	cron *cron.Cron
	cfg  *config.Config
}

func New(cfg *config.Config) *Scheduler {
	return &Scheduler{
		cron: cron.New(),
		cfg:  cfg,
	}
}

func (s *Scheduler) Start() {
	// Run pipeline every day at 8:00 AM
	s.cron.AddFunc("0 8 * * *", func() {
		log.Println("⏰ Scheduled pipeline starting...")
		// TODO: trigger scraper + matcher + notifier
		log.Println("✅ Scheduled pipeline done")
	})

	s.cron.Start()
	log.Println("📅 Scheduler started — pipeline runs daily at 8:00 AM")
}

func (s *Scheduler) Stop() {
	s.cron.Stop()
	log.Println("📅 Scheduler stopped")
}
