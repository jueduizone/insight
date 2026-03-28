package workers

import (
	"encoding/json"
	"log"
	"time"

	"insight/models"
)

// RunActivityScoreWorker starts a background goroutine that recomputes activity scores every 24 hours.
func RunActivityScoreWorker() {
	go func() {
		for {
			computeAllScores()
			time.Sleep(24 * time.Hour)
		}
	}()
}

func computeAllScores() {
	users, err := models.GetAllUsersForScore()
	if err != nil {
		log.Printf("[activity_score] failed to get users: %v", err)
		return
	}
	log.Printf("[activity_score] computing scores for %d users", len(users))
	for _, u := range users {
		score := 0

		// 基础：参与活动次数
		count, _ := models.CountActivityRecordsByUserID(u.ID)
		switch {
		case count >= 3:
			score += 30
		case count == 2:
			score += 20
		case count == 1:
			score += 10
		}

		// 有 GitHub 账号
		if u.Github != "" {
			score += 10
		}

		// Web3Insight 数据已同步
		if u.Web3InsightId != "" {
			score += 10
		}

		// AI 画像已生成
		if u.Notes != "" {
			score += 10
		}

		// GitHub 活跃度（github_worker 采集后生效）
		if len(u.GithubStats) > 0 {
			var gs GitHubStats
			if err := json.Unmarshal(u.GithubStats, &gs); err == nil {
				if gs.TotalCommits7d > 0 {
					score += 40
				} else if gs.TotalCommits30d > 10 {
					score += 20
				} else if gs.TotalCommits30d > 0 {
					score += 10
				}
			}
		}

		if err := models.UpdateUserActivityScore(u.ID, score); err != nil {
			log.Printf("[activity_score] failed to update score for user %d: %v", u.ID, err)
		}
	}
}
