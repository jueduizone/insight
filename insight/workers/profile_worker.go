package workers

import (
	"insight/models"
	"insight/utils"
	"log"
	"strings"
	"time"
)

// RunProfileWorker 启动 AI 画像批量生成 worker
// 每天凌晨 2 点跑一次，对有活动记录但没有 notes 的用户批量生成
func RunProfileWorker() {
	go func() {
		// 启动时等待 5 分钟再跑（避免启动时并发太多）
		time.Sleep(5 * time.Minute)
		generateProfilesBatch()

		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			generateProfilesBatch()
		}
	}()
}

func generateProfilesBatch() {
	// 查有活动记录但没有 notes（画像）的 member 用户，最多 30 个
	users, err := models.GetUsersWithoutProfile(30)
	if err != nil {
		log.Printf("[profile_worker] failed to query users: %v", err)
		return
	}
	if len(users) == 0 {
		log.Printf("[profile_worker] no users to generate profile for")
		return
	}
	log.Printf("[profile_worker] generating profiles for %d users", len(users))

	for _, u := range users {
		// 数据不足的跳过
		if u.Github == "" && u.Intro == "" && u.MonadExperience == "" && u.ExistingProjects == "" {
			continue
		}

		records, err := models.GetRecordsByUserID(u.ID)
		if err != nil || len(records) == 0 {
			continue
		}

		// 组装 prompt
		var sb strings.Builder
		sb.WriteString("开发者信息：\n")
		sb.WriteString("用户名: " + u.Username + "\n")
		if u.Github != "" {
			sb.WriteString("GitHub: " + u.Github + "\n")
		}
		if u.Intro != "" {
			sb.WriteString("简介: " + u.Intro + "\n")
		}
		if u.MonadExperience != "" {
			sb.WriteString("Monad经验: " + u.MonadExperience + "\n")
		}
		if u.ExistingProjects != "" {
			sb.WriteString("已有项目: " + u.ExistingProjects + "\n")
		}
		sb.WriteString("\n参与活动记录：\n")
		for _, r := range records {
			sb.WriteString("- " + r.Event.Name)
			if r.Award != "" {
				sb.WriteString("，获奖: " + r.Award)
			}
			if r.Role != "" {
				sb.WriteString("，角色: " + r.Role)
			}
			sb.WriteString("\n")
		}

		profile, err := utils.GenerateProfile(sb.String())
		if err != nil {
			log.Printf("[profile_worker] failed to generate profile for user %d: %v", u.ID, err)
			time.Sleep(2 * time.Second)
			continue
		}

		u.Notes = profile
		if err := models.UpdateUser(&u); err != nil {
			log.Printf("[profile_worker] failed to save profile for user %d: %v", u.ID, err)
		} else {
			log.Printf("[profile_worker] generated profile for user %d (%s)", u.ID, u.Username)
		}
		time.Sleep(1 * time.Second) // 限速，避免 API 超限
	}
}
