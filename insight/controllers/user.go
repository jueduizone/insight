package controllers

import (
	"encoding/json"
	"insight/models"
	"insight/utils"
	"net/http"
	"strconv"

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

	// 转换分页参数
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}

	// 查询用户列表
	var filter models.UserQueryFilter
	filter.Page = page
	filter.PageSize = pageSize
	filter.Username = username
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

// SyncUserWeb3Insight POST /v1/users/:id/sync-web3insight
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

	data, err := utils.FetchWeb3InsightUser(user.Github)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch Web3Insight data", err.Error())
		return
	}

	statsJSON, err := json.Marshal(data)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to marshal stats", err.Error())
		return
	}

	user.GithubStats = statsJSON

	// Update web3insight_id if present in the response
	if w3id, ok := data["web3insight_id"].(string); ok && w3id != "" {
		user.Web3InsightId = w3id
	}

	if err := models.UpdateUser(user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Sync successful", gin.H{
		"github_stats": data,
	})
}
