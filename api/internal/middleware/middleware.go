package middleware

import (
        "log"
        "time"
        "github.com/gin-gonic/gin"
)

func Logger() gin.HandlerFunc {
        return func(c *gin.Context) {
                start := time.Now()
                c.Next()
                log.Printf("[%s] %s | %d | %v", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start))
        }
}

func CORS() gin.HandlerFunc {
        return func(c *gin.Context) {
                c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
                c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
                if c.Request.Method == "OPTIONS" {
                        c.AbortWithStatus(204)
                        return
                }
                c.Next()
        }
}
