package controllers

import (
	"errors"
	"insight/models"
	"insight/utils"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type adminUserResponse struct {
	ID        uint   `json:"id"`
	CreatedAt string `json:"created_at"`
	Email     string `json:"email"`
	Username  string `json:"username"`
	Role      string `json:"role"`
}

func toAdminUserResponse(user *models.User) adminUserResponse {
	return adminUserResponse{
		ID:        user.ID,
		CreatedAt: user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		Email:     user.Email,
		Username:  user.Username,
		Role:      user.Role,
	}
}

// HandleLogin POST /v1/login
func HandleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	user, err := models.GetUserByEmail(req.Email)
	if err != nil {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid email or password", nil)
		return
	}

	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid email or password", nil)
		return
	}

	token, err := utils.GenerateToken(user.ID, user.Email, user.Avatar, user.Username, user.Github, []string{user.Role})
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Login successful", LoginResponse{
		User:        *user,
		Permissions: []string{user.Role},
		Token:       token,
	})
}

// CreateAdminUser POST /v1/admin/users - Super Admin only
func CreateAdminUser(c *gin.Context) {
	if !requireSuperAdmin(c) {
		utils.ErrorResponse(c, http.StatusForbidden, "Permission denied", nil)
		return
	}

	var req AdminCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to hash password", err.Error())
		return
	}

	existingUser, err := models.GetUserByEmail(req.Email)
	if err == nil {
		if existingUser.Role == "admin" || existingUser.Role == "super_admin" {
			utils.ErrorResponse(c, http.StatusConflict, "Admin user already exists", nil)
			return
		}

		// Developers imported from event/project lists may later become operators.
		// Promote the existing record instead of creating a duplicate account.
		existingUser.Username = req.Username
		existingUser.PasswordHash = hash
		existingUser.Role = "admin"
		if err := models.UpdateUser(existingUser); err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to promote user", err.Error())
			return
		}
		utils.SuccessResponse(c, http.StatusOK, "Existing developer promoted to admin", toAdminUserResponse(existingUser))
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check existing user", err.Error())
		return
	}

	user := models.User{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hash,
		Role:         "admin",
	}

	if err := models.CreateUser(&user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Admin user created", toAdminUserResponse(&user))
}

// UpdateAdminUser PUT /v1/admin/users/:id - Super Admin only
func UpdateAdminUser(c *gin.Context) {
	currentUser, ok := getSuperAdmin(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusForbidden, "Permission denied", nil)
		return
	}

	userID, ok := parseUserIDParam(c)
	if !ok {
		return
	}

	var req AdminUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	targetUser, err := models.GetUserById(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
		return
	}
	if targetUser.Role != "admin" && targetUser.Role != "super_admin" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Only admin accounts can be edited here", nil)
		return
	}
	if currentUser.ID == targetUser.ID && req.Role != "super_admin" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Cannot remove your own super_admin role", nil)
		return
	}
	if targetUser.Role == "super_admin" && req.Role != "super_admin" {
		total, err := models.CountUsersByRole("super_admin")
		if err != nil {
			utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to verify super admin count", err.Error())
			return
		}
		if total <= 1 {
			utils.ErrorResponse(c, http.StatusBadRequest, "At least one super_admin is required", nil)
			return
		}
	}

	if existingUser, err := models.GetUserByEmail(req.Email); err == nil && existingUser.ID != targetUser.ID {
		utils.ErrorResponse(c, http.StatusConflict, "Email already exists", nil)
		return
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check existing email", err.Error())
		return
	}

	targetUser.Email = req.Email
	targetUser.Username = req.Username
	targetUser.Role = req.Role
	if err := models.UpdateUser(targetUser); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update admin user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Admin user updated", toAdminUserResponse(targetUser))
}

// ResetAdminPassword PUT /v1/admin/users/:id/password - Super Admin only
func ResetAdminPassword(c *gin.Context) {
	if !requireSuperAdmin(c) {
		utils.ErrorResponse(c, http.StatusForbidden, "Permission denied", nil)
		return
	}

	userID, ok := parseUserIDParam(c)
	if !ok {
		return
	}

	var req AdminResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	targetUser, err := models.GetUserById(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "User not found", nil)
		return
	}
	if targetUser.Role != "admin" && targetUser.Role != "super_admin" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Only admin account passwords can be reset here", nil)
		return
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to hash password", err.Error())
		return
	}
	targetUser.PasswordHash = hash
	if err := models.UpdateUser(targetUser); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to reset password", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Password reset successfully", nil)
}

func requireSuperAdmin(c *gin.Context) bool {
	_, ok := getSuperAdmin(c)
	return ok
}

func getSuperAdmin(c *gin.Context) (*models.User, bool) {
	uidValue, exists := c.Get("uid")
	if !exists {
		return nil, false
	}
	uid, ok := uidValue.(uint)
	if !ok {
		return nil, false
	}
	currentUser, err := models.GetUserById(uid)
	if err != nil || currentUser.Role != "super_admin" {
		return nil, false
	}
	return currentUser, true
}

func parseUserIDParam(c *gin.Context) (uint, bool) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 64)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid user ID", nil)
		return 0, false
	}
	return uint(id), true
}
