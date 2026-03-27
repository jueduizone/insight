package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const zenmuxURL = "https://zenmux.ai/api/v1/chat/completions"
const zenmuxToken = "sk-ss-v1-196d706809b60c6ccf68e30afa1a711ce1b834674822781bd972b3885ab640e0"

// CallKimi calls the Zenmux/Kimi API with the given system and user prompts.
func CallKimi(systemPrompt, userPrompt string) (string, error) {
	body, err := json.Marshal(map[string]interface{}{
		"model": "kimi-k2.5",
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens":  3000,
		"temperature": 1,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", zenmuxURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+zenmuxToken)

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

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", err
	}

	choices, ok := result["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid choice format")
	}
	msg, ok := choice["message"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid message format")
	}
	content, ok := msg["content"].(string)
	if !ok {
		return "", fmt.Errorf("invalid content format")
	}

	return content, nil
}

// GenerateProfile calls Zenmux/Kimi API to generate a developer profile.
func GenerateProfile(prompt string) (string, error) {
	return CallKimi(
		"你是 Monad 生态运营助手，根据开发者的活动参与信息生成简洁的开发者画像，用中文，100-200字，重点描述：技术背景、参与活动情况、已有项目、对 Monad/Web3 的兴趣方向。",
		prompt,
	)
}
