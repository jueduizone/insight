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

// callZenmux is the internal helper to call the Zenmux API.
func callZenmux(model string, maxTokens int, temperature float64, systemPrompt, userPrompt string) (string, error) {
	body, err := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens":  maxTokens,
		"temperature": temperature,
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

	client := &http.Client{Timeout: 30 * time.Second}
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

// CallKimi uses gpt-4o-mini for fast, lightweight tasks (field mapping, extraction).
func CallKimi(systemPrompt, userPrompt string) (string, error) {
	return callZenmux("gpt-4o-mini", 500, 0.3, systemPrompt, userPrompt)
}

// GenerateProfile uses gpt-4o-mini to generate a structured developer profile.
func GenerateProfile(prompt string) (string, error) {
	return callZenmux("gpt-4o-mini", 800, 0.7,
		`你是 Monad 生态开发者运营助手，根据提供的开发者信息生成结构化画像。
严格按以下格式输出，每项不超过30字，无法判断时填"未知"：

【技术背景】主要技术栈或方向（如 Solidity/EVM/全栈/前端/Web3新手等）
【参与情况】参加活动次数及时间范围
【项目经历】有/无，代表项目名（如有）
【Monad意向】强/中/弱（根据描述和参与度判断）
【运营建议】值得重点跟进/普通维护/待激活（一句话说明原因）`,
		prompt,
	)
}
