package workers

import (
	"encoding/json"
	"fmt"
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

		hasBasicInfo := u.Github != "" || u.Intro != "" || u.MonadExperience != "" || u.ExistingProjects != ""
		hasGithubStats := len(u.GithubStats) > 0 && string(u.GithubStats) != "null"
		hasExtraCSV := len(u.ExtraCSVData) > 0 && string(u.ExtraCSVData) != "null"

		if !hasBasicInfo && !hasGithubStats && !hasExtraCSV {
			// 数据不足，标记避免重复处理
			models.UpdateUserNotes(u.ID, models.InsufficientDataMarker)
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

		// GitHub Stats
		if hasGithubStats {
			var gs map[string]interface{}
			if err := json.Unmarshal(u.GithubStats, &gs); err == nil {
				sb.WriteString("\nGitHub 数据：\n")
				if v, ok := gs["public_repos"]; ok {
					sb.WriteString(fmt.Sprintf("  公开仓库数: %.0f\n", toFloat(v)))
				}
				if v, ok := gs["followers"]; ok {
					sb.WriteString(fmt.Sprintf("  粉丝数: %.0f\n", toFloat(v)))
				}
				if v, ok := gs["total_commits_30d"]; ok && toFloat(v) > 0 {
					sb.WriteString(fmt.Sprintf("  近30天commit数: %.0f\n", toFloat(v)))
				}
				if v, ok := gs["monad_commits"]; ok && toFloat(v) > 0 {
					sb.WriteString(fmt.Sprintf("  Monad相关commits: %.0f\n", toFloat(v)))
				}
				if langs, ok := gs["languages"]; ok {
					if langSlice, ok := langs.([]interface{}); ok && len(langSlice) > 0 {
						langStrs := make([]string, 0, len(langSlice))
						for _, l := range langSlice {
							if s, ok := l.(string); ok {
								langStrs = append(langStrs, s)
							}
						}
						if len(langStrs) > 0 {
							sb.WriteString("  常用语言: " + strings.Join(langStrs, ", ") + "\n")
						}
					}
				}
				if v, ok := gs["bio"]; ok && v != nil && v != "" {
					sb.WriteString(fmt.Sprintf("  GitHub简介: %v\n", v))
				}
				if v, ok := gs["location"]; ok && v != nil && v != "" {
					sb.WriteString(fmt.Sprintf("  所在地: %v\n", v))
				}
				if v, ok := gs["is_chinese_dev"]; ok {
					if b, ok := v.(bool); ok && b {
						sb.WriteString("  疑似中国开发者: 是\n")
					}
				}
			}
		}

		// Extra CSV fields —— 优先提取关键维度，其余作补充
		if hasExtraCSV {
			var extra map[string]string
			if err := json.Unmarshal(u.ExtraCSVData, &extra); err == nil && len(extra) > 0 {
				// 关键字段优先展示（顺序固定，便于 AI 理解）
				keyFields := []struct{ keys []string; label string }{
					{[]string{"角色", "职业角色", "role", "职位", "岗位"}, "CSV角色"},
					{[]string{"Web3经验", "web3_experience", "Web3年限", "区块链经验"}, "Web3经验"},
					{[]string{"技术栈", "tech_stack", "技能", "skills", "技术方向"}, "技术栈"},
					{[]string{"主要编程语言", "编程语言", "language", "languages"}, "主要语言"},
					{[]string{"工作年限", "工作经验", "经验年限", "years_of_experience"}, "工作年限"},
					{[]string{"所在城市", "城市", "city", "location"}, "所在城市"},
					{[]string{"公司", "company", "雇主", "employer"}, "所在公司"},
					{[]string{"学历", "education", "学校", "毕业院校"}, "学历"},
					{[]string{"开源贡献", "开源经历", "open_source"}, "开源贡献"},
					{[]string{"项目名称", "项目", "project", "代表项目"}, "代表项目"},
				}
				sb.WriteString("\n来自报名表的补充信息：\n")
				printed := make(map[string]bool)
				for _, kf := range keyFields {
					for _, k := range kf.keys {
						if v, ok := extra[k]; ok && strings.TrimSpace(v) != "" {
							sb.WriteString(fmt.Sprintf("  %s: %s\n", kf.label, v))
							printed[k] = true
							break
						}
					}
				}
				// 剩余字段全量输出
				for k, v := range extra {
					if !printed[k] && strings.TrimSpace(v) != "" {
						sb.WriteString(fmt.Sprintf("  %s: %s\n", k, v))
					}
				}
			}
		}

		// 活动记录 —— 统计参会次数、获奖情况
		sb.WriteString("\n参与活动记录：\n")
		awardCount := 0
		for _, r := range records {
			sb.WriteString("- " + r.Event.Name)
			if r.Award != "" {
				sb.WriteString("，获奖: " + r.Award)
				awardCount++
			}
			if r.Role != "" {
				sb.WriteString("，角色: " + r.Role)
			}
			// Include extra activity fields if present
			if len(r.ExtraData) > 0 && string(r.ExtraData) != "null" {
				var ed map[string]string
				if err := json.Unmarshal(r.ExtraData, &ed); err == nil {
					for k, v := range ed {
						if strings.TrimSpace(v) != "" {
							sb.WriteString(fmt.Sprintf("，%s: %s", k, v))
						}
					}
				}
			}
			sb.WriteString("\n")
		}
		sb.WriteString(fmt.Sprintf("参会总次数: %d\n", len(records)))
		if awardCount > 0 {
			sb.WriteString(fmt.Sprintf("获奖次数: %d\n", awardCount))
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

// toFloat safely converts interface{} numbers to float64
func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	}
	return 0
}


