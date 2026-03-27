package controllers

import (
	"fmt"
	"net/http"
	"time"

	"insight/models"
	"insight/utils"

	"github.com/gin-gonic/gin"
)

type weeklyReportPeriod struct {
	Start string `json:"start"`
	End   string `json:"end"`
	Days  int    `json:"days"`
}

type weeklyReportSummary struct {
	TotalUsers   int64 `json:"total_users"`
	NewUsers     int64 `json:"new_users"`
	ActiveUsers  int64 `json:"active_users"`
	TotalEvents  int64 `json:"total_events"`
	TotalRecords int64 `json:"total_records"`
}

type weeklyReportData struct {
	Period               weeklyReportPeriod       `json:"period"`
	Summary              weeklyReportSummary      `json:"summary"`
	EventFunnel          []models.EventFunnelItem `json:"event_funnel"`
	Retention            []models.RetentionItem   `json:"retention"`
	ContactCoverage      models.ContactCoverage   `json:"contact_coverage"`
	ActivityDistribution []models.ActivityBucket  `json:"activity_distribution"`
	NewUsersTrend        []models.DailyCount      `json:"new_users_trend"`
}

// GetWeeklyReport returns a 30-day operational report snapshot.
func GetWeeklyReport(c *gin.Context) {
	const days = 30
	end := time.Now()
	start := end.AddDate(0, 0, -days)

	period := weeklyReportPeriod{
		Start: start.Format("2006-01-02"),
		End:   end.Format("2006-01-02"),
		Days:  days,
	}

	totalUsers, _ := models.CountUsers()
	newUsers, _ := models.CountUsersCreatedAfter(start)
	activeUsers, _ := models.CountActiveUsers()
	totalEvents, _ := models.CountEvents()
	totalRecords, _ := models.CountActivityRecords()

	summary := weeklyReportSummary{
		TotalUsers:   totalUsers,
		NewUsers:     newUsers,
		ActiveUsers:  activeUsers,
		TotalEvents:  totalEvents,
		TotalRecords: totalRecords,
	}

	eventFunnel, _ := models.GetEventFunnel()
	retention, _ := models.GetRetentionStats()
	coverage, _ := models.GetContactCoverage()
	distribution, _ := models.GetActivityDistribution()
	trend, _ := models.GetDailyNewUsers(start, end)

	utils.SuccessResponse(c, http.StatusOK, "success", weeklyReportData{
		Period:               period,
		Summary:              summary,
		EventFunnel:          eventFunnel,
		Retention:            retention,
		ContactCoverage:      coverage,
		ActivityDistribution: distribution,
		NewUsersTrend:        trend,
	})
}

// GenerateReport calls the AI to produce a Chinese weekly report.
func GenerateReport(c *gin.Context) {
	const days = 30
	end := time.Now()
	start := end.AddDate(0, 0, -days)

	totalUsers, _ := models.CountUsers()
	newUsers, _ := models.CountUsersCreatedAfter(start)
	activeUsers, _ := models.CountActiveUsers()
	totalEvents, _ := models.CountEvents()
	totalRecords, _ := models.CountActivityRecords()
	coverage, _ := models.GetContactCoverage()
	distribution, _ := models.GetActivityDistribution()
	eventFunnel, _ := models.GetEventFunnel()

	funnelStr := ""
	for _, ef := range eventFunnel {
		funnelStr += fmt.Sprintf("- %s（%s）: %d人\n", ef.EventName, ef.EventType, ef.Count)
	}

	distStr := ""
	for _, d := range distribution {
		distStr += fmt.Sprintf("- 活跃度%s: %d人\n", d.Range, d.Count)
	}

	promptData := fmt.Sprintf(
		"运营数据（最近%d天）：总开发者%d人，新增%d人，活跃%d人；活动数%d，参与人次%d；GitHub覆盖%.0f%%，Twitter覆盖%.0f%%，Telegram/微信覆盖%.0f%%。\n活跃度分布：\n%s活动参与情况：\n%s",
		days, totalUsers, newUsers, activeUsers, totalEvents, totalRecords,
		coverage.GithubPct, coverage.TwitterPct, coverage.TelegramPct,
		distStr, funnelStr,
	)

	system := "你是Monad生态运营分析师，根据提供的开发者社区运营数据，生成一份专业的中文周报，包含：数据概览、亮点分析、问题发现、运营建议，格式清晰，300字以内。"
	report, err := utils.CallKimi(system, promptData)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "生成周报失败: "+err.Error(), nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"report": report})
}
