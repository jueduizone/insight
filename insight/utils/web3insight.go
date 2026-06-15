package utils

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

const defaultWeb3InsightBase = "https://api.web3insight.ai"

var ErrWeb3InsightNotFound = errors.New("web3insight user not found")

type Web3InsightUserResult struct {
	Data  map[string]interface{}
	Raw   interface{}
	Found bool
}

func web3InsightConfig() (baseURL, token string) {
	baseURL = strings.TrimRight(viper.GetString("web3insight.base_url"), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(os.Getenv("WEB3INSIGHT_BASE_URL"), "/")
	}
	if baseURL == "" {
		baseURL = defaultWeb3InsightBase
	}

	token = viper.GetString("web3insight.api_key")
	if strings.HasPrefix(token, "${") && strings.HasSuffix(token, "}") {
		token = os.Getenv(strings.TrimSuffix(strings.TrimPrefix(token, "${"), "}"))
	}
	if token == "" {
		token = os.Getenv("WEB3INSIGHT_API_KEY")
	}
	return baseURL, token
}

func newWeb3InsightRequest(method, path string, body io.Reader) (*http.Request, error) {
	baseURL, token := web3InsightConfig()
	if token == "" {
		return nil, fmt.Errorf("WEB3INSIGHT_API_KEY is not configured")
	}
	req, err := http.NewRequest(method, baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

// TriggerWeb3InsightAnalysis 触发批量用户分析，返回 task_id
func TriggerWeb3InsightAnalysis(githubLogins []string) (string, error) {
	githubURLs := make([]string, 0, len(githubLogins))
	for _, login := range githubLogins {
		login = normalizeGitHubLogin(login)
		if login != "" {
			githubURLs = append(githubURLs, "https://github.com/"+login)
		}
	}
	if len(githubURLs) == 0 {
		return "", fmt.Errorf("no valid github logins")
	}

	body, err := json.Marshal(map[string]interface{}{
		"intent":      "analyze_github_users",
		"description": "Analyze Monad Insight imported developers by GitHub profile URL.",
		"request_data": map[string]interface{}{
			"github_urls": githubURLs,
		},
	})
	if err != nil {
		return "", err
	}

	req, err := newWeb3InsightRequest("POST", "/v1/custom/analysis/users", bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("web3insight create analysis failed: status=%d body=%s", resp.StatusCode, truncateResponse(respBytes))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}
	if err := web3InsightEnvelopeError(result); err != nil {
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
func FetchWeb3InsightUser(githubLogin string) (*Web3InsightUserResult, error) {
	githubLogin = normalizeGitHubLogin(githubLogin)
	if githubLogin == "" {
		return nil, ErrWeb3InsightNotFound
	}

	req, err := newWeb3InsightRequest("GET", "/v1/event/users/"+githubLogin, nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return &Web3InsightUserResult{Found: false, Raw: map[string]interface{}{"status": "not_found"}}, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("web3insight fetch user failed: status=%d body=%s", resp.StatusCode, truncateResponse(respBytes))
	}

	var raw interface{}
	if err := json.Unmarshal(respBytes, &raw); err != nil {
		return nil, err
	}
	if result, ok := raw.(map[string]interface{}); ok {
		if err := web3InsightEnvelopeError(result); err != nil {
			return nil, err
		}
	}

	data, found := unwrapWeb3InsightUser(raw)
	return &Web3InsightUserResult{Data: data, Raw: raw, Found: found}, nil
}

func web3InsightEnvelopeError(result map[string]interface{}) error {
	if len(result) == 0 {
		return nil
	}
	if code, ok := numericValue(result["code"]); ok && code != 0 && code != 200 {
		return fmt.Errorf("web3insight API error code=%.0f message=%s", code, responseMessage(result))
	}
	if status, ok := numericValue(result["status_code"]); ok && status >= 400 {
		return fmt.Errorf("web3insight API error status_code=%.0f message=%s", status, responseMessage(result))
	}
	if success, ok := result["success"].(bool); ok && !success {
		return fmt.Errorf("web3insight API error message=%s", responseMessage(result))
	}
	return nil
}

func numericValue(value interface{}) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case json.Number:
		f, err := typed.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func responseMessage(result map[string]interface{}) string {
	for _, key := range []string{"message", "msg", "detail", "error"} {
		if value := strings.TrimSpace(fmt.Sprint(result[key])); value != "" && value != "<nil>" {
			return value
		}
	}
	return "unknown"
}

func unwrapWeb3InsightUser(raw interface{}) (map[string]interface{}, bool) {
	switch v := raw.(type) {
	case map[string]interface{}:
		if data, ok := v["data"]; ok {
			return unwrapWeb3InsightUser(data)
		}
		if len(v) == 0 {
			return nil, false
		}
		return v, true
	case []interface{}:
		if len(v) == 0 {
			return nil, false
		}
		if data, ok := v[0].(map[string]interface{}); ok {
			return data, true
		}
	}
	return nil, false
}

func normalizeGitHubLogin(login string) string {
	login = strings.TrimSpace(login)
	login = strings.TrimSuffix(login, "/")
	if idx := strings.LastIndex(login, "/"); idx >= 0 {
		login = login[idx+1:]
	}
	login = strings.TrimPrefix(login, "@")
	return strings.TrimSpace(login)
}

func truncateResponse(body []byte) string {
	s := string(body)
	if len(s) > 500 {
		return s[:500] + "..."
	}
	return s
}
