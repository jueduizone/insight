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

		if len(u.GithubStats) > 0 {
			var gs GitHubStats
			if err := json.Unmarshal(u.GithubStats, &gs); err == nil {
				if gs.TotalCommits7d > 0 {
					score += 40
				}
				if gs.TotalCommits30d > 10 {
					score += 30
				}
			}
		}

		count, _ := models.CountActivityRecordsByUserID(u.ID)
		if count >= 2 {
			score += 20
		}

		if u.Web3InsightId != "" {
			score += 10
		}

		if err := models.UpdateUserActivityScore(u.ID, score); err != nil {
			log.Printf("[activity_score] failed to update score for user %d: %v", u.ID, err)
		}
	}
}
