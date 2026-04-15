package workers

import (
	"encoding/json"
	"log"
	"math"
	"strings"
	"time"

	"insight/models"
)

// RunActivityScoreWorker starts a background goroutine that recomputes activity scores every 24 hours.
// It runs once immediately on startup, then every 24 hours.
func RunActivityScoreWorker() {
	go func() {
		computeAllScores()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			computeAllScores()
		}
	}()
}

// techLangScores maps programming languages to their contribution score.
var techLangScores = map[string]int{
	"Rust":       5,
	"Solidity":   5,
	"TypeScript": 3,
	"Go":         2,
	"Python":     2,
}

// hasRealProjectContent returns true if existing_projects contains non-noise real project names.
func hasRealProjectContent(s string) bool {
	if strings.TrimSpace(s) == "" {
		return false
	}
	// Re-use the noise detector from project_cleaner.go (same package).
	return !isNoiseContent(s)
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
				// github_score = min(40, commits_30d*2 + followers/10 + repos/5)
				githubScore := gs.TotalCommits30d*2 + gs.Followers/10 + gs.PublicRepos/5
				if githubScore > 40 {
					githubScore = 40
				}
				score += githubScore

				// monad_score = min(25, round(monad_commits/20.0))
				monadScore := int(math.Round(float64(gs.MonadCommits) / 20.0))
				if monadScore > 25 {
					monadScore = 25
				}
				score += monadScore

				// tech_score: Rust=5, Solidity=5, TypeScript=3, Go=2, Python=2, max 15
				techScore := 0
				for _, lang := range gs.Languages {
					if s, ok := techLangScores[lang]; ok {
						techScore += s
					}
				}
				if techScore > 15 {
					techScore = 15
				}
				score += techScore
			}
		}

		// project_score = 20 if projects_cleaned=true AND existing_projects has real content
		if u.ProjectsCleaned && hasRealProjectContent(u.ExistingProjects) {
			score += 20
		}

		if err := models.UpdateUserActivityScore(u.ID, score); err != nil {
			log.Printf("[activity_score] failed to update score for user %d: %v", u.ID, err)
		}
	}
}
