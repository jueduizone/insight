package controllers

import (
	"net/http"
	"time"

	"insight/models"
	"insight/utils"

	"github.com/gin-gonic/gin"
)

type StatsResponse struct {
	TotalUsers         int64 `json:"total_users"`
	NewUsers7d         int64 `json:"new_users_7d"`
	ActiveUsers        int64 `json:"active_users"`
	TotalEvents        int64 `json:"total_events"`
	TotalProjects      int64 `json:"total_projects"`
	TotalRecords       int64 `json:"total_records"`
	Web3InsightCount   int64 `json:"web3insight_count"`    // 已同步 Web3Insight 数据的用户数
	HasGithubCount     int64 `json:"has_github_count"`      // 有 GitHub 的用户数
	HasProfileCount    int64 `json:"has_profile_count"`     // 已生成 AI 画像的用户数
}

func GetStats(c *gin.Context) {
	totalUsers, _ := models.CountUsers()
	newUsers7d, _ := models.CountUsersCreatedAfter(time.Now().AddDate(0, 0, -7))
	activeUsers, _ := models.CountActiveUsers()
	totalEvents, _ := models.CountEvents()
	totalProjects, _ := models.CountProjects()
	totalRecords, _ := models.CountActivityRecords()
	web3insightCount, _ := models.CountUsersWithWeb3Insight()
	hasGithubCount, _ := models.CountUsersWithGithub()
	hasProfileCount, _ := models.CountUsersWithProfile()

	utils.SuccessResponse(c, http.StatusOK, "success", StatsResponse{
		TotalUsers:       totalUsers,
		NewUsers7d:       newUsers7d,
		ActiveUsers:      activeUsers,
		TotalEvents:      totalEvents,
		TotalProjects:    totalProjects,
		TotalRecords:     totalRecords,
		Web3InsightCount: web3insightCount,
		HasGithubCount:   hasGithubCount,
		HasProfileCount:  hasProfileCount,
	})
}
