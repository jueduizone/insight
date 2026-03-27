package workers

import (
	"log"
	"strings"
	"time"

	"insight/models"
	"insight/utils"
)

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
		result, err := utils.CallKimi(
			"你是一个项目名称提取助手。只提取项目名，不做任何解释。",
			"从以下项目描述中提取项目名称，多个项目用逗号分隔，只返回项目名，不要其他文字。描述："+u.ProjectsRaw,
		)
		if err != nil {
			log.Printf("[project_cleaner] failed to clean user %d: %v", u.ID, err)
			continue
		}
		now := time.Now()
		if err := models.MarkProjectsCleaned(u.ID, strings.TrimSpace(result), now); err != nil {
			log.Printf("[project_cleaner] failed to mark user %d: %v", u.ID, err)
		} else {
			log.Printf("[project_cleaner] cleaned user %d: %s", u.ID, strings.TrimSpace(result))
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
