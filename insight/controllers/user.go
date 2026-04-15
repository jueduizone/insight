package controllers

import (
	"encoding/json"
	"fmt"
	"insight/models"
	"insight/utils"
	"insight/workers"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func GetUser(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	user, err := models.GetUserById(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid Article", nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "success", user)
}

func CreateUser(c *gin.Context) {
	var req UserCreateRequest

	// 绑定并验证请求参数
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	// 检查邮箱是否已存在
	_, err := models.GetUserByEmail(req.Email)
	if err == nil {
		utils.ErrorResponse(c, http.StatusConflict, "Email already exists", nil)
		return
	}

	// 创建用户模型
	user := models.User{
		Email:    req.Email,
		Username: req.Username,
		Avatar:   req.Avatar,
		Github:   req.Github,
		Twitter:  req.Twitter,
	}

	// 保存到数据库
	if err := models.CreateUser(&user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "User created successfully", user)
}

// GetUsers 查询用户列表（带分页和筛选）
func QueryUsers(c *gin.Context) {
	// 获取查询参数
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")
	username := c.Query("username")
	sortBy := c.DefaultQuery("sort_by", "activity_score")
	order := c.DefaultQuery("order", "desc")
	group := c.Query("group")

	// 转换分页参数
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}

	// 解析 has_github bool 参数
	var hasGithub *bool
	if hg := c.Query("has_github"); hg != "" {
		val, err := strconv.ParseBool(hg)
		if err == nil {
			hasGithub = &val
		}
	}

	// 解析 has_profile bool 参数
	var hasProfile *bool
	if hp := c.Query("has_profile"); hp != "" {
		val, err := strconv.ParseBool(hp)
		if err == nil {
			hasProfile = &val
		}
	}

	// 解析 event_id 参数
	var eventID *uint
	if eid := c.Query("event_id"); eid != "" {
		val, err := strconv.ParseUint(eid, 10, 64)
		if err == nil {
			uid := uint(val)
			eventID = &uid
		}
	}

	// 查询用户列表
	var filter models.UserQueryFilter
	filter.Page = page
	filter.PageSize = pageSize
	filter.Username = username
	filter.SortBy = sortBy
	filter.Order = order
	filter.Group = group
	filter.HasGithub = hasGithub
	filter.HasProfile = hasProfile
	filter.EventID = eventID
	users, total, err := models.QueryUsers(filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch users", err.Error())
		return
	}

	// 构建列表响应
	response := UserListResponse{
		Users:    users,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", response)
}

// ChangePassword PUT /v1/users/me/password
func ChangePassword(c *gin.Context) {
	uid, _ := c.Get("uid")

	user, err := models.GetUserById(uid.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	if !utils.CheckPasswordHash(req.OldPassword, user.PasswordHash) {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Old password is incorrect", nil)
		return
	}

	hash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to hash password", err.Error())
		return
	}

	user.PasswordHash = hash
	if err := models.UpdateUser(user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update password", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Password changed successfully", nil)
}

// GenerateUserProfile POST /v1/users/:id/generate-profile
func GenerateUserProfile(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	user, err := models.GetUserById(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
		return
	}

	records, err := models.GetRecordsByUserID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch activity", err.Error())
		return
	}

	// If user has no meaningful data, skip AI call
	if user.Github == "" && user.Intro == "" && user.MonadExperience == "" &&
		user.ExistingProjects == "" && len(records) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "用户数据不足，无法生成画像", nil)
		return
	}

	// Build prompt from user info + activity records
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("开发者信息：\n用户名: %s\n邮箱: %s\n", user.Username, user.Email))
	if user.Github != "" {
		sb.WriteString(fmt.Sprintf("GitHub: %s\n", user.Github))
	}
	if user.Intro != "" {
		sb.WriteString(fmt.Sprintf("简介: %s\n", user.Intro))
	}
	if user.MonadExperience != "" {
		sb.WriteString(fmt.Sprintf("Monad经验: %s\n", user.MonadExperience))
	}
	if user.ExistingProjects != "" {
		sb.WriteString(fmt.Sprintf("已有项目: %s\n", user.ExistingProjects))
	}

	if len(records) > 0 {
		sb.WriteString("\n参与活动记录：\n")
		for _, r := range records {
			sb.WriteString(fmt.Sprintf("- 活动: %s, 角色: %s, 奖项: %s, 状态: %s\n",
				r.Event.Name, r.Role, r.Award, r.Status))
			if len(r.ExtraData) > 0 {
				var extra map[string]interface{}
				if json.Unmarshal(r.ExtraData, &extra) == nil {
					for k, v := range extra {
						sb.WriteString(fmt.Sprintf("  %s: %v\n", k, v))
					}
				}
			}
		}
	}

	profile, err := utils.GenerateProfile(sb.String())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate profile", err.Error())
		return
	}

	user.Notes = profile
	if err := models.UpdateUser(user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to save profile", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Profile generated", gin.H{"notes": profile})
}

// SyncUserWeb3Insight POST /v1/users/:id/sync-web3insight
// Syncs both GitHub stats and Web3Insight data for a user.
func SyncUserWeb3Insight(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	user, err := models.GetUserById(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
		return
	}

	if user.Github == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "User has no GitHub account linked", nil)
		return
	}

	// Extract raw login from full GitHub URL if needed
	login := user.Github
	if idx := strings.LastIndex(login, "/"); idx >= 0 {
		login = login[idx+1:]
	}
	login = strings.TrimSpace(login)

	result := gin.H{}
	synced := false

	// 1. Fetch GitHub stats directly
	if ghStats, ghErr := workers.FetchGitHubUser(login); ghErr == nil && ghStats != nil {
		if statsJSON, mErr := json.Marshal(ghStats); mErr == nil {
			if dbErr := models.UpdateUserGithubStats(uint(id), statsJSON); dbErr == nil {
				result["github_stats"] = ghStats
				synced = true
			}
		}
	}

	// 2. Fetch Web3Insight data (best-effort, don't fail if unavailable)
	if w3data, w3err := utils.FetchWeb3InsightUser(login); w3err == nil && len(w3data) > 0 {
		if w3id, ok := w3data["web3insight_id"].(string); ok && w3id != "" {
			user.Web3InsightId = w3id
			models.UpdateUser(user)
		}
		result["web3insight"] = w3data
		synced = true
	}

	if !synced {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch data from GitHub or Web3Insight", nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Sync successful", result)
}
