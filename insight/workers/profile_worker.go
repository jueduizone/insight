package workers

import (
	"insight/models"
	"insight/utils"
	"log"
	"strings"
	"time"
)

// RunProfileWorker 启动 AI 画像批量生成 worker
// 启动后立即跑，持续处理直到所有用户都有画像，之后每 6 小时检查一次新增用户
func RunProfileWorker() {
	go func() {
		time.Sleep(3 * time.Minute) // 等后端完全启动
		// 持续跑直到没有待处理用户
		for {
			n := generateProfilesBatch(50) // 每批 50 个
			if n == 0 {
				break
			}
			log.Printf("[profile_worker] processed %d users, continuing...", n)
			time.Sleep(5 * time.Second) // 批次间间隔，避免 API 过载
		}
		log.Printf("[profile_worker] initial batch complete")

		// 之后每 6 小时检查新增
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			generateProfilesBatch(50)
		}
	}()
}

// generateProfilesBatch 处理一批没有画像的用户，返回处理数量
func generateProfilesBatch(limit int) int {
	users, err := models.GetUsersWithoutProfile(limit)
	if err != nil {
		log.Printf("[profile_worker] failed to query users: %v", err)
		return 0
	}
	if len(users) == 0 {
		return 0
	}
	log.Printf("[profile_worker] generating profiles for %d users", len(users))

	processed := 0
	for _, u := range users {
		processed++ // 不管成功失败都算处理过
		if u.Github == "" && u.Intro == "" && u.MonadExperience == "" && u.ExistingProjects == "" {
			// 数据不足，标记避免重复处理
			models.UpdateUserNotes(u.ID, "（数据不足，待补充）")
			continue
		}

		records, err := models.GetRecordsByUserID(u.ID)
		if err != nil || len(records) == 0 {
			continue
		}

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
			log.Printf("[profile_worker] failed for user %d: %v", u.ID, err)
			time.Sleep(2 * time.Second)
			continue
		}

		u.Notes = profile
		if err := models.UpdateUserNotes(u.ID, profile); err != nil {
			log.Printf("[profile_worker] failed to save profile for user %d: %v", u.ID, err)
		} else {
			processed++
		}
		time.Sleep(500 * time.Millisecond) // API 限速
	}
	return processed
}
