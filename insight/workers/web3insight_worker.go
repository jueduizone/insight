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
		login := extractGitHubLogin(u.Github)
		if login == "" {
			markWeb3InsightNoData(u.ID, "invalid_github", "")
			time.Sleep(100 * time.Millisecond)
			continue
		}

		result, err := utils.FetchWeb3InsightUser(login)
		if err != nil {
			log.Printf("[web3insight_worker] failed user %d (%s): %v", u.ID, login, err)
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if result == nil || !result.Found {
			if err := markWeb3InsightNoData(u.ID, "not_found", login); err != nil {
				log.Printf("[web3insight_worker] failed to persist no-data marker for user %d: %v", u.ID, err)
			} else {
				synced++
			}
			time.Sleep(200 * time.Millisecond)
			continue
		}

		w3id := extractWeb3InsightID(result.Data)
		raw, err := json.Marshal(result.Raw)
		if err != nil {
			log.Printf("[web3insight_worker] failed to marshal web3insight data for user %d: %v", u.ID, err)
			time.Sleep(200 * time.Millisecond)
			continue
		}
		if err := models.UpdateUserWeb3InsightData(u.ID, w3id, raw); err != nil {
			log.Printf("[web3insight_worker] failed to update web3insight data for user %d: %v", u.ID, err)
		} else {
			synced++
		}
		time.Sleep(200 * time.Millisecond)
	}
	fmt.Printf("[web3insight_worker] batch done, synced %d/%d\n", synced, len(users))
	return synced
}

func markWeb3InsightNoData(userID uint, status, githubLogin string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"status":       status,
		"github_login": githubLogin,
	})
	return models.UpdateUserWeb3InsightData(userID, "", body)
}

func extractWeb3InsightID(data map[string]interface{}) string {
	for _, key := range []string{"web3insight_id", "id", "user_id"} {
		if value, ok := data[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}
