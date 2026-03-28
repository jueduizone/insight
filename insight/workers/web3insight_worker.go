package workers

import (
	"encoding/json"
	"fmt"
	"insight/models"
	"insight/utils"
	"log"
	"time"
)

// RunWeb3InsightWorker 启动 Web3Insight 数据同步 worker
// 每 6 小时跑一次，对有 github 但没有 web3insight_id 的用户批量同步
func RunWeb3InsightWorker() {
	go func() {
		// 启动时先跑一次
		time.Sleep(2 * time.Minute) // 等后端完全启动
		syncWeb3InsightBatch()

		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			syncWeb3InsightBatch()
		}
	}()
}

func syncWeb3InsightBatch() {
	// 优先同步有 github 但没有 web3insight_id 的用户（最多 50 个）
	users, err := models.GetUsersWithGithubNoWeb3Insight(50)
	if err != nil {
		log.Printf("[web3insight_worker] failed to query users: %v", err)
		return
	}
	if len(users) == 0 {
		log.Printf("[web3insight_worker] no users to sync")
		return
	}
	log.Printf("[web3insight_worker] syncing %d users", len(users))

	for _, u := range users {
		data, err := utils.FetchWeb3InsightUser(u.Github)
		if err != nil {
			log.Printf("[web3insight_worker] failed to fetch user %d (%s): %v", u.ID, u.Github, err)
			time.Sleep(500 * time.Millisecond)
			continue
		}

		// 更新 web3insight_id 和 github_stats
		if w3id, ok := data["web3insight_id"].(string); ok && w3id != "" {
			u.Web3InsightId = w3id
		}
		if stats, err := json.Marshal(data); err == nil {
			u.GithubStats = stats
		}
		if err := models.UpdateUser(&u); err != nil {
			log.Printf("[web3insight_worker] failed to update user %d: %v", u.ID, err)
		} else {
			log.Printf("[web3insight_worker] synced user %d (%s)", u.ID, u.Github)
		}
		time.Sleep(300 * time.Millisecond) // 避免频繁请求
	}
	fmt.Printf("[web3insight_worker] batch done, synced %d users\n", len(users))
}
