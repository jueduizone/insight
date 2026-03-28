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
// 启动后立即批量跑完所有有 github 的用户，之后每 6 小时检查新增
func RunWeb3InsightWorker() {
	go func() {
		time.Sleep(2 * time.Minute)
		// 持续处理直到全部同步
		for {
			n := syncWeb3InsightBatch(100)
			if n == 0 {
				break
			}
			log.Printf("[web3insight_worker] synced %d users, continuing...", n)
			time.Sleep(3 * time.Second)
		}
		log.Printf("[web3insight_worker] initial sync complete")

		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			syncWeb3InsightBatch(100)
		}
	}()
}

func syncWeb3InsightBatch(limit int) int {
	users, err := models.GetUsersWithGithubNoWeb3Insight(limit)
	if err != nil {
		log.Printf("[web3insight_worker] failed to query users: %v", err)
		return 0
	}
	if len(users) == 0 {
		return 0
	}
	log.Printf("[web3insight_worker] syncing %d users", len(users))

	synced := 0
	for _, u := range users {
		data, err := utils.FetchWeb3InsightUser(u.Github)
		if err != nil {
			log.Printf("[web3insight_worker] failed user %d (%s): %v", u.ID, u.Github, err)
			// 标记空值避免重复请求
			u.Web3InsightId = "not_found"
			models.UpdateUser(&u)
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if w3id, ok := data["web3insight_id"].(string); ok && w3id != "" {
			u.Web3InsightId = w3id
		} else {
			u.Web3InsightId = "not_found"
		}
		if stats, err := json.Marshal(data); err == nil {
			u.GithubStats = stats
		}
		if err := models.UpdateUser(&u); err != nil {
			log.Printf("[web3insight_worker] failed to update user %d: %v", u.ID, err)
		} else {
			synced++
		}
		time.Sleep(200 * time.Millisecond)
	}
	fmt.Printf("[web3insight_worker] batch done, synced %d/%d\n", synced, len(users))
	return synced
}
