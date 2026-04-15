package routes

import (
	"insight/controllers"
	"insight/middlewares"

	"github.com/gin-gonic/gin"
)

func SetupRouter(r *gin.Engine) {
	r.Use(middlewares.Cors())

	r.POST("/v1/login", controllers.HandleLogin)

	auth := r.Group("/v1", middlewares.JWT(""))
	{
		auth.POST("/admin/users", controllers.CreateAdminUser)

		auth.GET("/users", controllers.QueryUsers)
		auth.POST("/users", controllers.CreateUser)
		auth.GET("/users/:id", controllers.GetUser)
		auth.GET("/users/:id/activity", controllers.GetUserActivity)
		auth.POST("/users/:id/sync-web3insight", controllers.SyncUserWeb3Insight)
		auth.POST("/users/:id/generate-profile", controllers.GenerateUserProfile)

		auth.GET("/projects", controllers.QueryProjects)
		auth.POST("/projects", controllers.CreateProject)
		auth.POST("/projects/hackathon/import", controllers.ImportHackathonCSV)
		auth.GET("/projects/:id", controllers.GetProject)
		auth.PUT("/projects/:id", controllers.UpdateProject)
		auth.DELETE("/projects/:id", controllers.DeleteProject)

		auth.PUT("/users/me/password", controllers.ChangePassword)

		auth.GET("/events", controllers.QueryEvents)
		auth.POST("/events", controllers.CreateEvent)
		auth.GET("/events/:id", controllers.GetEvent)
		auth.PUT("/events/:id", controllers.UpdateEvent)
		auth.DELETE("/events/:id", controllers.DeleteEvent)
		auth.POST("/events/:id/import", controllers.ImportCSV)
		auth.GET("/events/:id/records", controllers.GetEventRecords)
		auth.GET("/events/:id/analysis", controllers.AnalyzeEvent)

		auth.POST("/operation-logs", controllers.CreateLog)
		auth.GET("/operation-logs", controllers.GetLogs)

		auth.GET("/stats", controllers.GetStats)

		auth.POST("/suggest-mapping", controllers.SuggestFieldMapping)

		auth.GET("/reports/weekly", controllers.GetWeeklyReport)
		auth.GET("/reports/generate", controllers.GenerateReport)
	}
}
