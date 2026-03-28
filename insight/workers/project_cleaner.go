package workers

import (
	"log"
	"strings"
	"time"

	"insight/models"
	"insight/utils"
)

// noisePatterns lists lowercase keywords that indicate no real project name was provided.
var noisePatterns = []string{
	"没有", "无", "none", "solo", "现场组队", "有一些", "随便", "待定", "n/a", "na",
	"暂无", "不知道", "还没有", "没想好", "无项目", "没项目", "自己", "独立",
}

// isNoiseContent returns true if the raw string contains only noise (no real project name).
func isNoiseContent(raw string) bool {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return true
	}
	// Short strings that exactly match or start with a noise keyword are noise.
	for _, p := range noisePatterns {
		if s == p {
			return true
		}
	}
	// Very short raw text (≤6 chars) that contains a noise keyword.
	if len([]rune(s)) <= 6 {
		for _, p := range noisePatterns {
			if strings.Contains(s, p) {
				return true
			}
		}
	}
	return false
}

// CleanProjects queries users with uncleaned projects_raw and calls Kimi to extract project names.
func CleanProjects() {
	users, err := models.GetUsersForProjectsCleaning(50)
	if err != nil {
		log.Printf("[project_cleaner] failed to query users: %v", err)
		return
	}
	if len(users) == 0 {
		return
	}
	log.Printf("[project_cleaner] cleaning %d users", len(users))
	for _, u := range users {
		now := time.Now()

		// Pre-filter obvious noise to avoid unnecessary AI calls.
		if isNoiseContent(u.ProjectsRaw) {
			if err := models.MarkProjectsCleaned(u.ID, "", now); err != nil {
				log.Printf("[project_cleaner] failed to mark user %d as noise: %v", u.ID, err)
			} else {
				log.Printf("[project_cleaner] noise detected for user %d, marked empty", u.ID)
			}
			time.Sleep(50 * time.Millisecond)
			continue
		}

		result, err := utils.CallKimi(
			"你是一个项目名称提取助手。",
			"从以下项目描述中提取真实项目名称。规则：\n"+
				"1. 如果没有真实项目名（例如：没有/无/none/solo/现场组队/有一些/随便/待定/N/A 等），只返回空字符串。\n"+
				"2. 如果有真实项目名，用英文逗号分隔返回所有项目名，不要其他文字。\n"+
				"描述："+u.ProjectsRaw,
		)
		if err != nil {
			log.Printf("[project_cleaner] failed to clean user %d: %v", u.ID, err)
			continue
		}

		cleaned := strings.TrimSpace(result)
		// Treat AI-returned noise keywords as empty.
		if isNoiseContent(cleaned) {
			cleaned = ""
		}

		if err := models.MarkProjectsCleaned(u.ID, cleaned, now); err != nil {
			log.Printf("[project_cleaner] failed to mark user %d: %v", u.ID, err)
		} else {
			log.Printf("[project_cleaner] cleaned user %d: %q", u.ID, cleaned)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// StartProjectCleaner starts a background goroutine that cleans projects every 5 minutes.
func StartProjectCleaner() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			CleanProjects()
		}
	}()
}
