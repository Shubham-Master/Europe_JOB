package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	Env            string
	GeminiKey      string
	GeminiModel    string
	AdzunaAppID    string
	AdzunaAppKey   string
	SupabaseURL    string
	SupabaseKey    string
	TelegramToken  string
	TelegramChatID string
	PythonPath     string
}

func Load() *Config {
	if err := godotenv.Load("../.env"); err != nil {
		log.Println("⚠️  No .env file found, using system env vars")
	}

	return &Config{
		Port:           getEnv("PORT", "8080"),
		Env:            getEnv("ENV", "development"),
		GeminiKey:      getEnv("GEMINI_API_KEY", getEnv("GOOGLE_API_KEY", "")),
		GeminiModel:    getEnv("GEMINI_MODEL", "gemini-2.5-flash-lite"),
		AdzunaAppID:    getEnv("ADZUNA_APP_ID", ""),
		AdzunaAppKey:   getEnv("ADZUNA_APP_KEY", ""),
		SupabaseURL:    getEnv("SUPABASE_URL", ""),
		SupabaseKey:    getEnv("SUPABASE_KEY", ""),
		TelegramToken:  getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID: getEnv("TELEGRAM_CHAT_ID", ""),
		PythonPath:     getEnv("PYTHON_PATH", "python3"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
