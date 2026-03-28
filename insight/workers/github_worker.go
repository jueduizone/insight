package workers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"insight/models"
	"insight/utils"
)

const GitHubAPIBase = "https://api.github.com"

type GitHubStats struct {
	Login           string   `json:"login"`
	Name            string   `json:"name"`
	Location        string   `json:"location"`
	Bio             string   `json:"bio"`
	Company         string   `json:"company"`
	PublicRepos     int      `json:"public_repos"`
	Followers       int      `json:"followers"`
	Following       int      `json:"following"`
	TotalCommits7d  int      `json:"total_commits_7d"`
	TotalCommits30d int      `json:"total_commits_30d"`
	ActiveRepos     []string `json:"active_repos"`
	Languages       []string `json:"languages"`
	LastActiveAt    string   `json:"last_active_at"`
	FetchedAt       string   `json:"fetched_at"`
	// OpenDevData fields
	MonadCommits    int  `json:"monad_commits,omitempty"`
	IsChineseDev    bool `json:"is_chinese_dev,omitempty"`
}

type githubUserResp struct {
	Login       string `json:"login"`
	Name        string `json:"name"`
	Location    string `json:"location"`
	Bio         string `json:"bio"`
	Company     string `json:"company"`
	PublicRepos int    `json:"public_repos"`
	Followers   int    `json:"followers"`
	Following   int    `json:"following"`
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

func getGitHubPAT() string {
	return os.Getenv("GITHUB_PAT")
}

func githubGet(url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "DevInsight/1.0")
	if pat := getGitHubPAT(); pat != "" {
		req.Header.Set("Authorization", "token "+pat)
	}
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

// fetchUserRepos 获取用户所有 repo 并统计语言
func fetchUserRepos(login string) (map[string]int, error) {
	langs := make(map[string]int)
	page := 1
	for page <= 5 { // 最多 500 个 repo
		url := fmt.Sprintf("%s/users/%s/repos?per_page=100&page=%d&sort=pushed", GitHubAPIBase, login, page)
		data, err := githubGet(url)
		if err != nil {
			break
		}
		var repos []struct {
			Language string `json:"language"`
		}
		if err := json.Unmarshal(data, &repos); err != nil {
			break
		}
		if len(repos) == 0 {
			break
		}
		for _, r := range repos {
			if r.Language != "" {
				langs[r.Language]++
			}
		}
		page++
	}
	return langs, nil
}

// FetchGitHubUser fetches comprehensive GitHub stats including languages and OpenDevData.
func FetchGitHubUser(login string) (*GitHubStats, error) {
	// Basic user info
	data, err := githubGet(fmt.Sprintf("%s/users/%s", GitHubAPIBase, login))
	if err != nil {
		return nil, err
	}
	var userInfo githubUserResp
	if err := json.Unmarshal(data, &userInfo); err != nil {
		return nil, err
	}

	// Events for commit activity
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

	// Fetch languages
	langMap, _ := fetchUserRepos(login)
	languages := make([]string, 0, len(langMap))
	type langCount struct {
		lang  string
		count int
	}
	langList := make([]langCount, 0, len(langMap))
	for lang, count := range langMap {
		langList = append(langList, langCount{lang, count})
	}
	sort.Slice(langList, func(i, j int) bool {
		return langList[i].count > langList[j].count
	})
	for _, lc := range langList {
		languages = append(languages, lc.lang)
	}

	stats := &GitHubStats{
		Login:           login,
		Name:            userInfo.Name,
		Location:        userInfo.Location,
		Bio:             userInfo.Bio,
		Company:         userInfo.Company,
		PublicRepos:     userInfo.PublicRepos,
		Followers:       userInfo.Followers,
		Following:       userInfo.Following,
		TotalCommits7d:  commits7d,
		TotalCommits30d: commits30d,
		ActiveRepos:     activeRepos,
		Languages:       languages,
		LastActiveAt:    lastActive,
		FetchedAt:       now.Format(time.RFC3339),
	}

	// Merge OpenDevData
	if monadDev := utils.LookupMonadDev(login); monadDev != nil {
		stats.MonadCommits = int(monadDev.MonadCommits)
		stats.IsChineseDev = monadDev.IsChinese
		if !stats.IsChineseDev {
			stats.IsChineseDev = utils.IsChineseDeveloper(userInfo.Location, monadDev.Country)
		}
	} else {
		// Fallback to location-based Chinese detection
		stats.IsChineseDev = utils.IsChineseDeveloper(userInfo.Location, "")
	}

	return stats, nil
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
				log.Printf("[github_worker] updated %s: commits7d=%d commits30d=%d langs=%d monad=%d chinese=%v",
					u.Github, stats.TotalCommits7d, stats.TotalCommits30d, len(stats.Languages), stats.MonadCommits, stats.IsChineseDev)
			}
		}
		time.Sleep(1 * time.Second)
	}
}
