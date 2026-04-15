package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const arkURL   = "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
const arkToken = "1d3727fc-1df5-43d1-93ee-2ea2dd4e88c3"

// 字段映射用 GLM（轻量快）
const modelGLM = "glm-4.7"

// 活动分析报告用 Kimi（长文生成）
const modelKimi = "kimi-k2.5"

// callArk is the internal helper to call the Volcengine Ark Coding Plan API (OpenAI-compatible).
// Retries up to 2 times on timeout/network error.
func callArk(model string, maxTokens int, temperature float64, systemPrompt, userPrompt string) (string, error) {
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

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequest("POST", arkURL, bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+arkToken)

		client := &http.Client{Timeout: 90 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
			continue
		}
		defer resp.Body.Close()

		respBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			lastErr = err
			continue
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
	return "", fmt.Errorf("AI request failed after 3 attempts: %v", lastErr)
}

// CallKimi uses GLM for fast, lightweight tasks (field mapping, extraction).
func CallKimi(systemPrompt, userPrompt string) (string, error) {
	return callArk(modelGLM, 500, 0.3, systemPrompt, userPrompt)
}

// GenerateProfile uses GLM to generate a structured developer profile.
func GenerateProfile(prompt string) (string, error) {
	return callArk(modelGLM, 1200, 0.7,
		`你是 Monad 生态开发者运营助手，根据提供的开发者信息生成结构化画像。
严格按以下 Markdown 格式输出，不要添加额外标题或说明，无法判断的项填"未知"：

## 开发者画像
（2-3句综合描述该开发者的背景、技能和生态参与情况）

## 角色定位
（从以下选一个最符合的：前端/后端/全栈/智能合约/产品/设计/其他）

## 技术潜力 ⭐[1-5]星
（1句理由，依据技术栈、GitHub 活跃度、语言深度）

## 商业潜力 ⭐[1-5]星
（1句理由，依据项目经验、商业意识、已有产品）

## Monad 关联度 ⭐[1-5]星
（1句理由，依据 monad_commits 数量、参会次数、Monad 相关表述）

## 运营建议
（针对 Monad 生态运营团队的1-2条具体建议，如：邀请参与 Monad 生态项目/重点孵化/邀请线下活动/普通维护等）`,
		prompt,
	)
}

// AnalyzeEvent uses GLM for long-form activity analysis reports.
func AnalyzeEvent(systemPrompt, userPrompt string) (string, error) {
	return callArk(modelGLM, 600, 0.3, systemPrompt, userPrompt)
}
