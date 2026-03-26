package middlewares

import (
	"time"

	"github.com/gin-gonic/gin"
)

// LeakyBucketRateLimiter 创建一个基于漏桶算法的限流中间件，超限立即返回 429
func LeakyBucketRateLimiter(rate int) gin.HandlerFunc {
	tokens := make(chan struct{}, rate)
	for i := 0; i < rate; i++ {
		tokens <- struct{}{}
	}
	go func() {
		ticker := time.NewTicker(time.Second / time.Duration(rate))
		defer ticker.Stop()
		for range ticker.C {
			select {
			case tokens <- struct{}{}:
			default:
			}
		}
	}()

	return func(c *gin.Context) {
		select {
		case <-tokens:
			c.Next()
		default:
			c.AbortWithStatusJSON(429, gin.H{"code": 429, "message": "Too many requests"})
		}
	}
}
