package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const Web3InsightToken = "eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiIxIiwiaXNzIjoid2ViM2luc2lnaHRzLmFwcCIsImV4cCI6MTc5MzA2NDA4OSwidHlwZSI6ImFkbWluIiwiZXh0cmEiOnsiY2xhaW1zIjp7ImFsbG93ZWRfcm9sZXMiOlsidXNlciIsImFkbWluIl0sImRlZmF1bHRfcm9sZSI6InVzZXIiLCJ1c2VyX2lkIjoiMSJ9fX0.Rl39YXUbdrM-0V_fLbdgSLdpL3QxUWyPXdGSl_S6Y3Q"

const Web3InsightBase = "https://api.web3insight.ai"

// TriggerWeb3InsightAnalysis 触发批量用户分析，返回 task_id
func TriggerWeb3InsightAnalysis(githubLogins []string) (string, error) {
	githubURLs := make([]string, 0, len(githubLogins))
	for _, login := range githubLogins {
		if login != "" {
			githubURLs = append(githubURLs, "https://github.com/"+login)
		}
	}
	if len(githubURLs) == 0 {
		return "", fmt.Errorf("no valid github logins")
	}

	body, err := json.Marshal(map[string]interface{}{
		"github_urls": githubURLs,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", Web3InsightBase+"/v1/custom/analysis/users", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+Web3InsightToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}

	// Try to extract task_id from common response shapes
	if data, ok := result["data"].(map[string]interface{}); ok {
		if taskID, ok := data["task_id"].(string); ok {
			return taskID, nil
		}
	}
	if taskID, ok := result["task_id"].(string); ok {
		return taskID, nil
	}

	return "", nil
}

// FetchWeb3InsightUser 获取单个用户的 Web3Insight 数据
func FetchWeb3InsightUser(githubLogin string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/v1/event/users/%s", Web3InsightBase, githubLogin)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+Web3InsightToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, err
	}

	// Unwrap if wrapped in a standard response envelope
	if code, ok := result["code"].(float64); ok && code == 200 {
		if data, ok := result["data"].(map[string]interface{}); ok {
			return data, nil
		}
	}

	return result, nil
}
