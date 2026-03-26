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

		auth.GET("/projects", controllers.QueryProjects)
		auth.POST("/projects", controllers.CreateProject)
		auth.GET("/projects/:id", controllers.GetProject)

		auth.GET("/events", controllers.QueryEvents)
		auth.POST("/events", controllers.CreateEvent)
		auth.GET("/events/:id", controllers.GetEvent)
		auth.POST("/events/:id/import", controllers.ImportCSV)
		auth.GET("/events/:id/records", controllers.GetEventRecords)

		auth.POST("/operation-logs", controllers.CreateLog)
		auth.GET("/operation-logs", controllers.GetLogs)
	}
}
