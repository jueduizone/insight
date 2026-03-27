package workers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"insight/models"
)

const GitHubAPIBase = "https://api.github.com"

type GitHubStats struct {
	Login           string   `json:"login"`
	PublicRepos     int      `json:"public_repos"`
	Followers       int      `json:"followers"`
	TotalCommits7d  int      `json:"total_commits_7d"`
	TotalCommits30d int      `json:"total_commits_30d"`
	ActiveRepos     []string `json:"active_repos"`
	Languages       []string `json:"languages"`
	LastActiveAt    string   `json:"last_active_at"`
	FetchedAt       string   `json:"fetched_at"`
}

type githubUserResp struct {
	Login       string `json:"login"`
	PublicRepos int    `json:"public_repos"`
	Followers   int    `json:"followers"`
}

type githubEvent struct {
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"created_at"`
	Repo      struct {
		Name string `json:"name"`
	} `json:"repo"`
	Payload struct {
		Commits []struct {
			Message string `json:"message"`
		} `json:"commits"`
		Size int `json:"size"`
	} `json:"payload"`
}

func githubGet(url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "DevInsight/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("github api returned %d for %s", resp.StatusCode, url)
	}
	return io.ReadAll(resp.Body)
}

// FetchGitHubUser fetches basic info and recent events for a GitHub user.
func FetchGitHubUser(login string) (*GitHubStats, error) {
	data, err := githubGet(fmt.Sprintf("%s/users/%s", GitHubAPIBase, login))
	if err != nil {
		return nil, err
	}
	var userInfo githubUserResp
	if err := json.Unmarshal(data, &userInfo); err != nil {
		return nil, err
	}

	eventsData, err := githubGet(fmt.Sprintf("%s/users/%s/events/public?per_page=100", GitHubAPIBase, login))
	if err != nil {
		return nil, err
	}
	var events []githubEvent
	if err := json.Unmarshal(eventsData, &events); err != nil {
		return nil, err
	}

	now := time.Now()
	sevenDaysAgo := now.AddDate(0, 0, -7)
	thirtyDaysAgo := now.AddDate(0, 0, -30)

	commits7d := 0
	commits30d := 0
	repoSet := map[string]bool{}
	lastActive := ""

	for _, ev := range events {
		if ev.Type != "PushEvent" {
			continue
		}
		size := ev.Payload.Size
		if size == 0 {
			size = len(ev.Payload.Commits)
		}
		if ev.CreatedAt.After(sevenDaysAgo) {
			commits7d += size
		}
		if ev.CreatedAt.After(thirtyDaysAgo) {
			commits30d += size
		}
		if !repoSet[ev.Repo.Name] && len(repoSet) < 10 {
			repoSet[ev.Repo.Name] = true
		}
		if lastActive == "" {
			lastActive = ev.CreatedAt.Format(time.RFC3339)
		}
	}

	activeRepos := make([]string, 0, len(repoSet))
	for r := range repoSet {
		activeRepos = append(activeRepos, r)
	}

	return &GitHubStats{
		Login:           login,
		PublicRepos:     userInfo.PublicRepos,
		Followers:       userInfo.Followers,
		TotalCommits7d:  commits7d,
		TotalCommits30d: commits30d,
		ActiveRepos:     activeRepos,
		Languages:       []string{},
		LastActiveAt:    lastActive,
		FetchedAt:       now.Format(time.RFC3339),
	}, nil
}

// RunGitHubWorker starts a background goroutine that collects GitHub stats every 24 hours.
func RunGitHubWorker() {
	go func() {
		for {
			collectAllUsers()
			time.Sleep(24 * time.Hour)
		}
	}()
}

func collectAllUsers() {
	users, err := models.GetAllUsersWithGithub()
	if err != nil {
		log.Printf("[github_worker] failed to get users: %v", err)
		return
	}
	log.Printf("[github_worker] collecting GitHub stats for %d users", len(users))
	for _, u := range users {
		stats, err := FetchGitHubUser(u.Github)
		if err != nil {
			log.Printf("[github_worker] failed to fetch %s: %v", u.Github, err)
		} else {
			b, _ := json.Marshal(stats)
			if err := models.UpdateUserGithubStats(u.ID, b); err != nil {
				log.Printf("[github_worker] failed to save stats for %s: %v", u.Github, err)
			} else {
				log.Printf("[github_worker] updated %s: commits7d=%d commits30d=%d", u.Github, stats.TotalCommits7d, stats.TotalCommits30d)
			}
		}
		time.Sleep(1 * time.Second)
	}
}
