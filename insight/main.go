package main

import (
	_ "insight/config"
	"insight/logger"
	"insight/middlewares"
	"insight/routes"
	"insight/workers"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func main() {
	// 初始化日志
	logFile := viper.GetString("log.file")
	logLevel := viper.GetString("log.level")
	logger.Init(logFile, logLevel)

	workers.RunGitHubWorker()
	workers.RunActivityScoreWorker()
	workers.StartProjectCleaner()
	workers.RunWeb3InsightWorker()
	workers.RunProfileWorker()

	r := gin.Default()
	r.Use(middlewares.Cors())
	routes.SetupRouter(r)
	r.Run(":8081")
}
