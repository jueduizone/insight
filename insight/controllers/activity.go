package controllers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"insight/models"
	"insight/utils"
	"insight/workers"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// CreateEvent POST /v1/events
func CreateEvent(c *gin.Context) {
	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	event := models.ActivityEvent{
		Name:        req.Name,
		Type:        req.Type,
		Platform:    req.Platform,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		Description: req.Description,
	}

	if err := models.CreateActivityEvent(&event); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Event created", event)
}

// QueryEvents GET /v1/events
func QueryEvents(c *gin.Context) {
	var filter models.ActivityEventFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid query parameters", err.Error())
		return
	}

	events, total, err := models.QueryActivityEvents(filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch events", err.Error())
		return
	}

	// 附加每个活动的统计数据
	type EventWithStats struct {
		models.ActivityEvent
		ParticipantCount int `json:"participant_count"`
		AwardedCount     int `json:"awarded_count"`
	}
	result := make([]EventWithStats, 0, len(events))
	for _, e := range events {
		pCount, _ := models.GetActivityRecordCountByEventID(e.ID)
		aCount, _ := models.GetAwardedCountByEventID(e.ID)
		result = append(result, EventWithStats{
			ActivityEvent:    e,
			ParticipantCount: int(pCount),
			AwardedCount:     int(aCount),
		})
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"events":    result,
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

// GetEvent GET /v1/events/:id
func GetEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", event)
}

// UpdateEvent PUT /v1/events/:id
func UpdateEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	var req UpdateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	if req.Name != "" {
		event.Name = req.Name
	}
	event.Type = req.Type
	event.Platform = req.Platform
	event.Description = req.Description
	if !req.StartDate.IsZero() {
		event.StartDate = req.StartDate
	}
	if !req.EndDate.IsZero() {
		event.EndDate = req.EndDate
	}

	if err := models.UpdateActivityEvent(event); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Event updated", event)
}

// DeleteEvent DELETE /v1/events/:id
func DeleteEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	_, err = models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	count, err := models.GetActivityRecordCountByEventID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check records", err.Error())
		return
	}
	if count > 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "该活动已有参与者记录，无法删除", nil)
		return
	}

	if err := models.DeleteActivityEvent(uint(id)); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Event deleted", nil)
}

// ImportCSV POST /v1/events/:id/import
// mode=preview: parse CSV, return columns + first 5 rows (no DB write)
// mode=import:  import with field_mapping JSON
func ImportCSV(c *gin.Context) {
	eventID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid event ID", nil)
		return
	}

	// Verify event exists
	_, err = models.GetActivityEventByID(uint(eventID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	mode := c.DefaultPostForm("mode", "preview")

	if c.Request.ContentLength > 10*1024*1024 {
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge, "File too large (max 10MB)", nil)
		return
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Missing CSV file", err.Error())
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Failed to parse CSV", err.Error())
		return
	}

	if len(records) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "CSV file is empty", nil)
		return
	}

	headers := records[0]
	rows := records[1:]

	if mode == "preview" {
		preview := rows
		if len(preview) > 5 {
			preview = rows[:5]
		}
		utils.SuccessResponse(c, http.StatusOK, "Preview", gin.H{
			"columns": headers,
			"rows":    preview,
		})
		return
	}

	// mode == "import"
	mappingStr := c.PostForm("field_mapping")
	if mappingStr == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "field_mapping is required for import mode", nil)
		return
	}

	// field_mapping: { internal_field: csv_column_name }
	// e.g. {"email":"Email Address","username":"Full Name","github":"GitHub","wallet_address":"Wallet","award":"Prize"}
	var fieldMapping map[string]string
	if err := json.Unmarshal([]byte(mappingStr), &fieldMapping); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid field_mapping JSON", err.Error())
		return
	}

	// Build column index map: csv_column_name → index
	colIndex := make(map[string]int)
	for i, h := range headers {
		colIndex[strings.TrimSpace(h)] = i
	}

	// Helper: get value from a row by internal field name
	getValue := func(row []string, field string) string {
		col, ok := fieldMapping[field]
		if !ok {
			return ""
		}
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	created := 0
	merged := 0
	recordCreated := 0
	recordUpdated := 0
	var githubLogins []string

	for _, row := range rows {
		email := getValue(row, "email")
		github := getValue(row, "github")
		wallet := getValue(row, "wallet_address")
		username := getValue(row, "username")
		firstName := getValue(row, "first_name")
		lastName := getValue(row, "last_name")
		award := getValue(row, "award")
		role := getValue(row, "role")
		status := getValue(row, "status")
		wechat := getValue(row, "wechat")
		telegram := getValue(row, "telegram")
		existingProjects := getValue(row, "existing_projects")
		intro := getValue(row, "intro")
		monadExperience := getValue(row, "monad_experience")
		joinedAtStr := getValue(row, "joined_at")

		// Parse joined_at: try common formats
		var joinedAt *time.Time
		for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05Z", "2006/01/02 15:04:05", "2006-01-02"} {
			if t, err := time.Parse(layout, strings.TrimSpace(joinedAtStr)); err == nil {
				joinedAt = &t
				break
			}
		}

		// If username is empty but first/last name present, compose it (姓在前)
		if username == "" && (lastName != "" || firstName != "") {
			username = strings.TrimSpace(lastName + " " + firstName)
		}

		// Skip rows with no identity fields
		if email == "" && github == "" && wallet == "" && username == "" {
			continue
		}

		// Dedup: find existing user by priority
		var existingUser *models.User

		if email != "" {
			u, err := models.GetUserByEmail(email)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}
		if existingUser == nil && github != "" {
			u, err := models.GetUserByGithub(github)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}
		if existingUser == nil && wallet != "" {
			u, err := models.GetUserByWalletAddress(wallet)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}

		var userID uint
		if existingUser != nil {
			// Merge: update non-empty fields
			if email != "" && existingUser.Email == "" {
				existingUser.Email = email
			}
			if username != "" {
				existingUser.Username = username
			}
			if github != "" {
				existingUser.Github = github
			}
			if wallet != "" {
				existingUser.WalletAddress = wallet
			}
			if wechat != "" {
				existingUser.Wechat = wechat
			}
			if telegram != "" {
				existingUser.Telegram = telegram
			}
			if existingProjects != "" {
				existingUser.ExistingProjects = existingProjects
				if len(existingProjects) > 30 {
					existingUser.ProjectsRaw = existingProjects
					existingUser.ProjectsCleaned = false
				}
			}
			if intro != "" {
				existingUser.Intro = intro
			}
			if monadExperience != "" {
				existingUser.MonadExperience = monadExperience
			}
			// 确保 CSV 导入的用户 role 为 member（防止 GORM default:admin 污染）
			if existingUser.Role != "admin" && existingUser.Role != "super_admin" {
				existingUser.Role = "member"
			}
			// 更新 first_joined_at：取最早时间
			if joinedAt != nil {
				if existingUser.FirstJoinedAt == nil || joinedAt.Before(*existingUser.FirstJoinedAt) {
					existingUser.FirstJoinedAt = joinedAt
				}
			}
			models.UpdateUser(existingUser)
			userID = existingUser.ID
			merged++
		} else {
			// Create new user
			newUser := models.User{
				Email:            email,
				Username:         username,
				Github:           github,
				WalletAddress:    wallet,
				Wechat:           wechat,
				Telegram:         telegram,
				ExistingProjects: existingProjects,
				Intro:            intro,
				MonadExperience:  monadExperience,
				Role:             "member",
				FirstJoinedAt:    joinedAt,
			}
			if len(existingProjects) > 30 {
				newUser.ProjectsRaw = existingProjects
				newUser.ProjectsCleaned = false
			}
			if err := models.CreateUser(&newUser); err != nil {
				log.Printf("[ImportCSV] CreateUser failed for email=%s github=%s: %v", email, github, err)
				continue
			}
			userID = newUser.ID
			created++
		}

		// Collect extra fields not in standard mapping (for activity record)
		standardFields := map[string]bool{
			"email": true, "username": true, "first_name": true, "last_name": true,
			"github": true, "wallet_address": true, "award": true, "role": true,
			"status": true, "wechat": true, "telegram": true, "existing_projects": true,
			"intro": true, "monad_experience": true, "joined_at": true,
		}
		extraData := make(map[string]string)
		for field, col := range fieldMapping {
			if !standardFields[field] {
				idx, ok := colIndex[col]
				if ok && idx < len(row) {
					extraData[field] = strings.TrimSpace(row[idx])
				}
			}
		}
		extraJSON, _ := json.Marshal(extraData)

		// Build extra_csv_data: ALL columns not covered by standard mapping (including unmapped headers)
		// Key = original CSV column header, value = cell content
		mappedCols := make(map[string]bool) // CSV column names that map to standard fields
		for field, col := range fieldMapping {
			if standardFields[field] {
				mappedCols[col] = true
			}
		}
		extraCSV := make(map[string]string)
		for _, h := range headers {
			if !mappedCols[h] {
				idx, ok := colIndex[h]
				if ok && idx < len(row) {
					v := strings.TrimSpace(row[idx])
					if v != "" {
						extraCSV[h] = v
					}
				}
			}
		}
		extraCSVJSON, _ := json.Marshal(extraCSV)

		// Persist extra_csv_data to user record (merge with existing)
		if len(extraCSV) > 0 {
			if existingUser != nil {
				// Merge: existing extra_csv_data + new values (new wins on conflict)
				merged_extra := make(map[string]string)
				if len(existingUser.ExtraCSVData) > 0 {
					_ = json.Unmarshal(existingUser.ExtraCSVData, &merged_extra)
				}
				for k, v := range extraCSV {
					if v != "" {
						merged_extra[k] = v
					}
				}
				if b, err := json.Marshal(merged_extra); err == nil {
					models.UpdateUserExtraCSVData(userID, b)
				}
			} else {
				models.UpdateUserExtraCSVData(userID, extraCSVJSON)
			}
		}

		record := models.ActivityRecord{
			UserID:    userID,
			EventID:   uint(eventID),
			Award:     award,
			Role:      role,
			Status:    status,
			ExtraData: extraJSON,
		}
		wasCreated, _ := models.UpsertActivityRecord(&record)
		if wasCreated {
			recordCreated++
		} else {
			recordUpdated++
		}

		if github != "" {
			githubLogins = append(githubLogins, github)
		}
	}

	// Async trigger Web3Insight analysis for all imported users with GitHub accounts
	web3insightTriggered := len(githubLogins) > 0
	if web3insightTriggered {
		go func(logins []string) {
			taskID, err := utils.TriggerWeb3InsightAnalysis(logins)
			if err != nil {
				log.Printf("Web3Insight analysis trigger failed: %v", err)
			} else {
				log.Printf("Web3Insight analysis triggered, task_id: %s", taskID)
			}
		}(githubLogins)
	}

	// Async trigger project cleaning for any newly marked users
	go workers.CleanProjects()

	utils.SuccessResponse(c, http.StatusOK, "Import complete", gin.H{
		"created":               created,
		"merged":                merged,
		"record_created":        recordCreated,
		"record_updated":        recordUpdated,
		"web3insight_triggered": web3insightTriggered,
	})
}

// GetEventRecords GET /v1/events/:id/records
func GetEventRecords(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")
	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	records, total, err := models.GetRecordsByEventID(uint(id), page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch records", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"records":   records,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// SuggestFieldMapping POST /v1/suggest-mapping
func SuggestFieldMapping(c *gin.Context) {
	var req SuggestMappingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request", err.Error())
		return
	}
	if len(req.Columns) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "columns is required", nil)
		return
	}

	columnsJSON, _ := json.Marshal(req.Columns)
	systemPrompt := `你是一个数据导入助手。请将 CSV 文件的列名映射到以下系统字段。

系统字段说明：
- email: 邮箱地址（主键，用于去重）
- last_name: 姓
- first_name: 名
- username: 完整姓名
- github: GitHub 用户名或链接
- wallet_address: 钱包地址（0x开头）
- twitter: Twitter/X 用户名
- wechat: 微信号
- telegram: Telegram 用户名
- existing_projects: 已有项目名称
- intro: 个人简介/描述
- monad_experience: Monad/Web3 经验描述
- award: 获奖情况
- role: 参与角色
- status: 参与状态`
	userPrompt := "CSV 列名列表：" + string(columnsJSON) + "\n\n严格按以下格式返回 JSON，key 必须是英文系统字段名，value 必须是对应的 CSV 列名原文。找不到对应的字段不要包含。只返回 JSON 对象，不要任何其他文字：\n{\"email\": \"对应的CSV列名\", \"github\": \"对应的CSV列名\", ...}"

	content, err := utils.CallKimi(systemPrompt, userPrompt)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "AI service error", err.Error())
		return
	}

	// Extract JSON from response (AI might wrap in ```json ... ```)
	jsonStr := content
	if idx := strings.Index(content, "{"); idx >= 0 {
		if end := strings.LastIndex(content, "}"); end > idx {
			jsonStr = content[idx : end+1]
		}
	}

	var mapping map[string]string
	if err := json.Unmarshal([]byte(jsonStr), &mapping); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to parse AI response", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", mapping)
}

// GetUserActivity GET /v1/users/:id/activity
func GetUserActivity(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	records, err := models.GetRecordsByUserID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch activity", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", records)
}

// AnalyzeEvent GET /v1/events/:id/analysis
// 对单个活动生成 AI 分析报告：参与人数、获奖分布、角色分布、开发者画像摘要等
func AnalyzeEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	// 获取参与记录（最多 500 条，够 AI 分析）
	records, _, err := models.GetRecordsByEventID(uint(id), 1, 500)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch records", err.Error())
		return
	}

	totalCount := len(records)

	// 没有参与数据，直接返回提示，不走 AI
	if totalCount == 0 {
		utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
			"event_id":      event.ID,
			"event_name":    event.Name,
			"total_count":   0,
			"awarded_count": 0,
			"role_dist":     map[string]int{},
			"award_dist":    map[string]int{},
			"report":        "该活动暂无参与数据，无法生成分析报告。请先导入参与者数据后再试。",
		})
		return
	}

	// 统计角色分布
	roleMap := map[string]int{}
	awardMap := map[string]int{}
	awardedCount := 0
	for _, r := range records {
		if r.Role != "" {
			roleMap[r.Role]++
		}
		if r.Award != "" {
			awardMap[r.Award]++
			awardedCount++
		}
	}

	signals := buildEventAnalysisSignals(records)

	// 构建 AI 分析 prompt
	var sb strings.Builder
	sb.WriteString("活动名称：" + event.Name + "\n")
	sb.WriteString("活动类型：" + event.Type + "\n")
	sb.WriteString("活动平台：" + event.Platform + "\n")
	sb.WriteString("时间：" + event.StartDate.Format("2006-01-02") + " 至 " + event.EndDate.Format("2006-01-02") + "\n")
	sb.WriteString("活动描述：" + event.Description + "\n\n")
	sb.WriteString("参与人数：" + strconv.Itoa(totalCount) + "\n")
	sb.WriteString("获奖人数：" + strconv.Itoa(awardedCount) + "\n\n")

	if len(roleMap) > 0 {
		sb.WriteString("角色分布：\n")
		for role, cnt := range roleMap {
			sb.WriteString("  " + role + ": " + strconv.Itoa(cnt) + "人\n")
		}
		sb.WriteString("\n")
	}

	if len(awardMap) > 0 {
		sb.WriteString("获奖情况：\n")
		for award, cnt := range awardMap {
			sb.WriteString("  " + award + ": " + strconv.Itoa(cnt) + "人\n")
		}
		sb.WriteString("\n")
	}

	sb.WriteString("数据覆盖：\n")
	sb.WriteString(fmt.Sprintf("  GitHub:%d，GitHub统计:%d，Web3Insight:%d，简介:%d，Monad经验:%d，已有项目:%d，用户CSV补充:%d，活动补充字段:%d\n\n",
		signals.GithubCount, signals.GithubStatsCount, signals.Web3InsightCount, signals.IntroCount, signals.MonadExperienceCount, signals.ProjectCount, signals.UserExtraCount, signals.RecordExtraCount))
	if len(signals.PersonaCounts) > 0 {
		sb.WriteString("初步人群标签：" + compactCountMap(signals.PersonaCounts) + "\n")
	}
	if len(signals.SkillCounts) > 0 {
		sb.WriteString("技能/项目信号：" + compactCountMap(signals.SkillCounts) + "\n")
	}
	if len(signals.GitHubHighlights) > 0 {
		sb.WriteString("GitHub亮点：" + strings.Join(signals.GitHubHighlights, "；") + "\n")
	}
	if len(signals.Web3InsightHighlights) > 0 {
		sb.WriteString("Web3Insight生态/profile信号：" + strings.Join(signals.Web3InsightHighlights, "；") + "\n")
	}
	if len(signals.CollaborationHints) > 0 {
		sb.WriteString("可撮合方向：" + strings.Join(signals.CollaborationHints, "；") + "\n")
	}
	sb.WriteString("\n参与者原始字段样本（来自 User intro/monad_experience/existing_projects/extra_csv_data/github_stats/web3insight_data 与 ActivityRecord extra_data，最多60条）：\n")
	for _, sample := range signals.Samples {
		sb.WriteString("- " + sample + "\n")
	}
	if len(signals.MissingDataHints) > 0 {
		sb.WriteString("\n缺失/质量问题：" + strings.Join(signals.MissingDataHints, "；") + "\n")
	}

	systemPrompt := `你是 Monad 生态开发者运营分析师。直接输出中文分析报告，不要有任何思考过程或前言。

报告格式（Markdown，严格按此输出）：
## 活动概览
（1-2句话）

## 参与数据
（关键数字，bullet list）

## 角色与获奖分布
（简要分析，不超过50字）

## 人群与技能信号
（概括用户经验、角色/persona聚类、项目/技能亮点，不超过100字）

## 协作机会
（2-3条可执行撮合/跟进建议，每条一句话）

## 数据质量
（指出缺失字段和下一步补数建议）

要求：总字数不超过420字，必须基于给定原始字段，不编造具体姓名或项目；直接给结论，不废话。`

	report, err := utils.AnalyzeEvent(systemPrompt, sb.String())
	if err != nil {
		report = fallbackEventAnalysis(event.Name, totalCount, awardedCount, roleMap, awardMap, signals)
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"event_id":      event.ID,
		"event_name":    event.Name,
		"total_count":   totalCount,
		"awarded_count": awardedCount,
		"role_dist":     roleMap,
		"award_dist":    awardMap,
		"report":        report,
	})
}

type eventAnalysisSignals struct {
	GithubCount           int
	GithubStatsCount      int
	Web3InsightCount      int
	IntroCount            int
	MonadExperienceCount  int
	ProjectCount          int
	UserExtraCount        int
	RecordExtraCount      int
	PersonaCounts         map[string]int
	SkillCounts           map[string]int
	Samples               []string
	GitHubHighlights      []string
	Web3InsightHighlights []string
	CollaborationHints    []string
	MissingDataHints      []string
	UsersWithStrongSignal int
}

func buildEventAnalysisSignals(records []models.ActivityRecord) eventAnalysisSignals {
	signals := eventAnalysisSignals{
		PersonaCounts: make(map[string]int),
		SkillCounts:   make(map[string]int),
	}
	githubHighlights := make(map[string]bool)
	web3InsightHighlights := make(map[string]bool)
	collaborationHints := make(map[string]bool)

	for _, r := range records {
		u := r.User
		userExtra := rawJSONMap(u.ExtraCSVData)
		recordExtra := rawJSONMap([]byte(r.ExtraData))
		web3InsightData := rawJSONMap(u.Web3InsightData)

		if strings.TrimSpace(u.Github) != "" {
			signals.GithubCount++
		}
		if hasJSONContent(u.GithubStats) {
			signals.GithubStatsCount++
		}
		if hasWeb3InsightContent(u.Web3InsightData) {
			signals.Web3InsightCount++
		}
		if strings.TrimSpace(u.Intro) != "" {
			signals.IntroCount++
		}
		if strings.TrimSpace(u.MonadExperience) != "" {
			signals.MonadExperienceCount++
		}
		if strings.TrimSpace(u.ExistingProjects) != "" {
			signals.ProjectCount++
		}
		if len(userExtra) > 0 {
			signals.UserExtraCount++
		}
		if len(recordExtra) > 0 {
			signals.RecordExtraCount++
		}

		rawText := strings.Join([]string{
			u.Username, u.Intro, u.MonadExperience, u.ExistingProjects, r.Role, r.Award, r.Status,
			joinMapValues(userExtra), joinMapValues(recordExtra), githubStatsText(u.GithubStats), web3InsightText(u.Web3InsightData),
		}, " ")
		if strings.TrimSpace(rawText) != "" {
			signals.UsersWithStrongSignal++
		}

		for _, persona := range classifyPersonas(rawText, r.Role) {
			signals.PersonaCounts[persona]++
		}
		for _, skill := range classifySkills(rawText) {
			signals.SkillCounts[skill]++
		}

		if gh := githubSummary(u.GithubStats); gh != "" {
			githubHighlights[gh] = true
		}
		if w3 := web3InsightSummary(u.Web3InsightData); w3 != "" {
			web3InsightHighlights[w3] = true
		}
		for _, hint := range collaborationFor(rawText) {
			collaborationHints[hint] = true
		}
		if len(signals.Samples) < 60 {
			if sample := participantAnalysisSample(u, r, userExtra, recordExtra, web3InsightData); sample != "" {
				signals.Samples = append(signals.Samples, sample)
			}
		}
	}

	signals.GitHubHighlights = sortedMapKeys(githubHighlights, 6)
	signals.Web3InsightHighlights = sortedMapKeys(web3InsightHighlights, 6)
	signals.CollaborationHints = sortedMapKeys(collaborationHints, 6)
	signals.MissingDataHints = missingEventDataHints(len(records), signals)
	return signals
}

func fallbackEventAnalysis(eventName string, totalCount, awardedCount int, roleMap, awardMap map[string]int, signals eventAnalysisSignals) string {
	var sb strings.Builder
	awardRate := 0.0
	if totalCount > 0 {
		awardRate = float64(awardedCount) * 100 / float64(totalCount)
	}

	sb.WriteString("## 活动概览\n")
	sb.WriteString(eventName + " 已导入 " + strconv.Itoa(totalCount) + " 位参与者，可用于基础运营复盘。\n\n")

	sb.WriteString("## 参与数据\n")
	sb.WriteString("- 参与人数：" + strconv.Itoa(totalCount) + "\n")
	sb.WriteString("- 获奖人数：" + strconv.Itoa(awardedCount) + "\n")
	sb.WriteString("- 获奖率：" + fmt.Sprintf("%.1f%%", awardRate) + "\n\n")

	sb.WriteString("## 角色与获奖分布\n")
	if len(roleMap) == 0 && len(awardMap) == 0 {
		sb.WriteString("当前数据缺少角色或获奖字段，建议补齐后再做细分分析。\n\n")
	} else {
		if len(roleMap) > 0 {
			sb.WriteString("角色分布：" + compactCountMap(roleMap) + "。")
		}
		if len(awardMap) > 0 {
			sb.WriteString("获奖分布：" + compactCountMap(awardMap) + "。")
		}
		sb.WriteString("\n\n")
	}

	sb.WriteString("## 人群与技能信号\n")
	sb.WriteString(fmt.Sprintf("原始字段覆盖：GitHub %d人、GitHub统计 %d人、Web3Insight %d人、简介 %d人、Monad经验 %d人、已有项目 %d人。",
		signals.GithubCount, signals.GithubStatsCount, signals.Web3InsightCount, signals.IntroCount, signals.MonadExperienceCount, signals.ProjectCount))
	if len(signals.PersonaCounts) > 0 {
		sb.WriteString("人群标签以 " + compactTopCountMap(signals.PersonaCounts, 4) + " 为主。")
	}
	if len(signals.SkillCounts) > 0 {
		sb.WriteString("技能信号集中在 " + compactTopCountMap(signals.SkillCounts, 5) + "。")
	}
	if len(signals.Web3InsightHighlights) > 0 {
		sb.WriteString("Web3Insight 生态信号：" + strings.Join(signals.Web3InsightHighlights, "；") + "。")
	}
	sb.WriteString("\n\n")

	sb.WriteString("## 协作机会\n")
	if len(signals.CollaborationHints) == 0 {
		sb.WriteString("- 优先按角色、项目和 GitHub 活跃度做二次分层，找出可孵化对象。\n")
	} else {
		for _, hint := range signals.CollaborationHints {
			sb.WriteString("- " + hint + "。\n")
		}
	}
	if len(signals.GitHubHighlights) > 0 {
		sb.WriteString("- GitHub 亮点：" + strings.Join(signals.GitHubHighlights, "；") + "。\n")
	}
	if len(signals.Web3InsightHighlights) > 0 {
		sb.WriteString("- Web3Insight 覆盖可用于补充生态贡献、profile 标签和活跃度分层。\n")
	}

	sb.WriteString("\n## 数据质量\n")
	if len(signals.MissingDataHints) == 0 {
		sb.WriteString("核心字段覆盖较完整，可继续补充项目进展、技能栈和后续转化状态。")
	} else {
		sb.WriteString(strings.Join(signals.MissingDataHints, "；") + "。")
	}
	return sb.String()
}

func compactCountMap(m map[string]int) string {
	parts := make([]string, 0, len(m))
	for k, v := range m {
		if strings.TrimSpace(k) == "" {
			continue
		}
		parts = append(parts, k+":"+strconv.Itoa(v))
	}
	sort.Strings(parts)
	return strings.Join(parts, "、")
}

func compactTopCountMap(m map[string]int, limit int) string {
	type kv struct {
		Key   string
		Value int
	}
	items := make([]kv, 0, len(m))
	for k, v := range m {
		if strings.TrimSpace(k) != "" && v > 0 {
			items = append(items, kv{k, v})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Value == items[j].Value {
			return items[i].Key < items[j].Key
		}
		return items[i].Value > items[j].Value
	})
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, item.Key+":"+strconv.Itoa(item.Value))
	}
	return strings.Join(parts, "、")
}

func rawJSONMap(raw []byte) map[string]string {
	result := make(map[string]string)
	if !hasJSONContent(raw) {
		return result
	}
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return result
	}
	for k, v := range data {
		value := strings.TrimSpace(fmt.Sprint(v))
		if value != "" && value != "<nil>" {
			result[strings.TrimSpace(k)] = value
		}
	}
	return result
}

func hasJSONContent(raw []byte) bool {
	s := strings.TrimSpace(string(raw))
	return s != "" && s != "null" && s != "{}"
}

func joinMapValues(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	values := make([]string, 0, len(m))
	for k, v := range m {
		if strings.TrimSpace(v) != "" {
			values = append(values, k+":"+v)
		}
	}
	sort.Strings(values)
	return strings.Join(values, " ")
}

func participantAnalysisSample(u models.User, r models.ActivityRecord, userExtra, recordExtra, web3InsightData map[string]string) string {
	parts := []string{}
	if u.Username != "" {
		parts = append(parts, "用户:"+truncateText(u.Username, 24))
	}
	if u.Github != "" {
		parts = append(parts, "GitHub:"+truncateText(u.Github, 32))
	}
	if r.Role != "" {
		parts = append(parts, "角色:"+truncateText(r.Role, 20))
	}
	if r.Award != "" {
		parts = append(parts, "获奖:"+truncateText(r.Award, 24))
	}
	if u.Intro != "" {
		parts = append(parts, "简介:"+truncateText(u.Intro, 90))
	}
	if u.MonadExperience != "" {
		parts = append(parts, "Monad经验:"+truncateText(u.MonadExperience, 90))
	}
	if u.ExistingProjects != "" {
		parts = append(parts, "已有项目:"+truncateText(u.ExistingProjects, 90))
	}
	if gh := githubSummary(u.GithubStats); gh != "" {
		parts = append(parts, "GitHub统计:"+gh)
	}
	if w3 := web3InsightSummary(u.Web3InsightData); w3 != "" {
		parts = append(parts, "Web3Insight:"+w3)
	} else if len(web3InsightData) > 0 {
		parts = append(parts, "Web3Insight:"+truncateText(joinMapValues(web3InsightData), 120))
	}
	if len(userExtra) > 0 {
		parts = append(parts, "CSV:"+truncateText(joinMapValues(userExtra), 120))
	}
	if len(recordExtra) > 0 {
		parts = append(parts, "活动补充:"+truncateText(joinMapValues(recordExtra), 100))
	}
	return strings.Join(parts, "；")
}

func githubStatsText(raw []byte) string {
	if !hasJSONContent(raw) {
		return ""
	}
	var gs map[string]interface{}
	if err := json.Unmarshal(raw, &gs); err != nil {
		return ""
	}
	return joinMapValues(mapInterfaceToStrings(gs))
}

func githubSummary(raw []byte) string {
	if !hasJSONContent(raw) {
		return ""
	}
	var gs map[string]interface{}
	if err := json.Unmarshal(raw, &gs); err != nil {
		return ""
	}
	parts := []string{}
	if v := numberFromMap(gs, "public_repos"); v > 0 {
		parts = append(parts, fmt.Sprintf("仓库%.0f", v))
	}
	if v := numberFromMap(gs, "followers"); v > 0 {
		parts = append(parts, fmt.Sprintf("粉丝%.0f", v))
	}
	if v := numberFromMap(gs, "total_commits_30d"); v > 0 {
		parts = append(parts, fmt.Sprintf("近30天commit %.0f", v))
	}
	if v := numberFromMap(gs, "monad_commits"); v > 0 {
		parts = append(parts, fmt.Sprintf("Monad commit %.0f", v))
	}
	if langs, ok := gs["languages"].([]interface{}); ok && len(langs) > 0 {
		langParts := []string{}
		for i, lang := range langs {
			if i >= 4 {
				break
			}
			if s := strings.TrimSpace(fmt.Sprint(lang)); s != "" {
				langParts = append(langParts, s)
			}
		}
		if len(langParts) > 0 {
			parts = append(parts, "语言"+strings.Join(langParts, "/"))
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "、")
}

func hasWeb3InsightContent(raw []byte) bool {
	if !hasJSONContent(raw) {
		return false
	}
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return true
	}
	status := strings.TrimSpace(fmt.Sprint(data["status"]))
	return status != "not_found" && status != "invalid_github"
}

func web3InsightText(raw []byte) string {
	if !hasWeb3InsightContent(raw) {
		return ""
	}
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return ""
	}
	return joinMapValues(flattenInsightMap(data, 0))
}

func web3InsightSummary(raw []byte) string {
	if !hasWeb3InsightContent(raw) {
		return ""
	}
	var data map[string]interface{}
	if err := json.Unmarshal(raw, &data); err != nil {
		return ""
	}
	flat := flattenInsightMap(data, 0)
	parts := []string{}
	for _, key := range []string{"profile", "persona", "role", "category", "ecosystem", "ecosystems", "tags", "skills", "score", "rank", "eco_contributions", "weekly_activity", "total_commits"} {
		if value := strings.TrimSpace(flat[key]); value != "" && value != "<nil>" {
			parts = append(parts, key+":"+truncateText(value, 40))
		}
	}
	if len(parts) == 0 {
		for k, v := range flat {
			lk := strings.ToLower(k)
			if containsAny(lk, "ecosystem", "profile", "persona", "tag", "skill", "score", "rank", "contribution", "activity") && strings.TrimSpace(v) != "" {
				parts = append(parts, k+":"+truncateText(v, 40))
			}
			if len(parts) >= 5 {
				break
			}
		}
	}
	if len(parts) == 0 {
		return ""
	}
	sort.Strings(parts)
	if len(parts) > 5 {
		parts = parts[:5]
	}
	return strings.Join(parts, "、")
}

func flattenInsightMap(data map[string]interface{}, depth int) map[string]string {
	out := make(map[string]string)
	if depth > 2 {
		return out
	}
	for k, v := range data {
		key := strings.TrimSpace(k)
		switch typed := v.(type) {
		case map[string]interface{}:
			for childKey, childValue := range flattenInsightMap(typed, depth+1) {
				out[childKey] = childValue
				if key != "" {
					out[key+"."+childKey] = childValue
				}
			}
		case []interface{}:
			items := make([]string, 0, len(typed))
			for _, item := range typed {
				switch itemMap := item.(type) {
				case map[string]interface{}:
					items = append(items, joinMapValues(flattenInsightMap(itemMap, depth+1)))
				default:
					items = append(items, fmt.Sprint(item))
				}
			}
			out[key] = strings.Join(items, ",")
		default:
			out[key] = fmt.Sprint(v)
		}
	}
	return out
}

func mapInterfaceToStrings(m map[string]interface{}) map[string]string {
	out := make(map[string]string)
	for k, v := range m {
		switch typed := v.(type) {
		case []interface{}:
			items := make([]string, 0, len(typed))
			for _, item := range typed {
				items = append(items, fmt.Sprint(item))
			}
			out[k] = strings.Join(items, ",")
		default:
			out[k] = fmt.Sprint(v)
		}
	}
	return out
}

func numberFromMap(m map[string]interface{}, key string) float64 {
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

func classifyPersonas(rawText, role string) []string {
	text := strings.ToLower(rawText + " " + role)
	personas := []string{}
	add := func(label string, keywords ...string) {
		for _, kw := range keywords {
			if strings.Contains(text, strings.ToLower(kw)) {
				personas = append(personas, label)
				return
			}
		}
	}
	add("智能合约/协议开发者", "solidity", "smart contract", "智能合约", "合约", "defi", "协议", "protocol")
	add("全栈/应用开发者", "full stack", "fullstack", "全栈", "backend", "后端", "frontend", "前端", "react", "next.js", "node", "golang")
	add("产品/创业者", "founder", "创始", "产品", "pm", "startup", "创业", "商业化")
	add("社区/运营/BD", "community", "社区", "运营", "bd", "growth", "marketing", "kol", "ambassador")
	add("研究/内容贡献者", "research", "研究", "writer", "内容", "分析", "教程", "媒体")
	add("Monad生态高关联", "monad", "monad commit", "monad经验")
	if len(personas) == 0 && strings.TrimSpace(rawText) != "" {
		personas = append(personas, "待细分参与者")
	}
	return uniqueStrings(personas)
}

func classifySkills(rawText string) []string {
	text := strings.ToLower(rawText)
	skills := []string{}
	keywords := map[string][]string{
		"Solidity/合约": {"solidity", "smart contract", "智能合约", "合约"},
		"前端":          {"frontend", "前端", "react", "vue", "next.js", "typescript"},
		"后端":          {"backend", "后端", "golang", "go ", "rust", "python", "node"},
		"DeFi":        {"defi", "dex", "swap", "staking", "lending", "yield"},
		"NFT/GameFi":  {"nft", "gamefi", "游戏", "gaming"},
		"数据/AI":       {"data", "数据", "ai", "agent", "llm", "机器学习"},
		"钱包/基础设施":     {"wallet", "钱包", "infra", "基础设施", "rpc", "indexer"},
		"开源":          {"open source", "opensource", "开源", "github"},
	}
	for label, kws := range keywords {
		for _, kw := range kws {
			if strings.Contains(text, kw) {
				skills = append(skills, label)
				break
			}
		}
	}
	return uniqueStrings(skills)
}

func collaborationFor(rawText string) []string {
	text := strings.ToLower(rawText)
	hints := []string{}
	if containsAny(text, "solidity", "智能合约", "合约", "protocol", "defi") && containsAny(text, "react", "frontend", "前端", "产品", "用户") {
		hints = append(hints, "将合约/协议开发者与前端或产品型参与者配对，推进可演示 Demo")
	}
	if containsAny(text, "founder", "创始", "startup", "创业", "existing_projects", "已有项目") {
		hints = append(hints, "对已有项目或创业背景参与者做单独访谈，筛选 Monad 迁移和孵化线索")
	}
	if containsAny(text, "community", "社区", "运营", "bd", "kol", "ambassador") {
		hints = append(hints, "让社区/运营型参与者承接活动复盘、内容传播和本地社群触达")
	}
	if containsAny(text, "monad") {
		hints = append(hints, "优先跟进 Monad 经验明确的人，邀请参与生态任务、测试网或开发者小组")
	}
	return uniqueStrings(hints)
}

func missingEventDataHints(total int, signals eventAnalysisSignals) []string {
	hints := []string{}
	if total == 0 {
		return hints
	}
	if signals.GithubCount*100/total < 60 {
		hints = append(hints, "GitHub 覆盖不足，影响开发能力判断")
	}
	if signals.GithubStatsCount*100/total < 40 {
		hints = append(hints, "GitHub 统计缺失较多，建议补跑抓取任务")
	}
	if signals.Web3InsightCount*100/total < 30 {
		hints = append(hints, "Web3Insight 覆盖不足，生态贡献和 profile 信号需要补跑同步")
	}
	if signals.IntroCount*100/total < 50 {
		hints = append(hints, "个人简介不足，难以判断经验背景")
	}
	if signals.MonadExperienceCount*100/total < 50 {
		hints = append(hints, "Monad 经验字段不足，生态关联度需要补问")
	}
	if signals.ProjectCount*100/total < 40 {
		hints = append(hints, "已有项目字段偏少，后续孵化线索不完整")
	}
	if signals.UserExtraCount == 0 && signals.RecordExtraCount == 0 {
		hints = append(hints, "导入表单补充字段为空，建议保留技能栈、城市、公司、项目阶段等原始列")
	}
	return hints
}

func containsAny(text string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(text, strings.ToLower(kw)) {
			return true
		}
	}
	return false
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool)
	out := []string{}
	for _, v := range values {
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func sortedMapKeys(m map[string]bool, limit int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if limit > 0 && len(keys) > limit {
		keys = keys[:limit]
	}
	return keys
}

func truncateText(s string, limit int) string {
	s = strings.Join(strings.Fields(s), " ")
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit]) + "..."
}
